-- ============================================================
--  Happy Man Academy — Fix pre-class push for PWA (Web Push / VAPID)
--
--  The platform is a PWA installed via the browser, not a native app.
--  Push notifications use the Web Push Protocol (VAPID), not FCM HTTP v1.
--  The existing push_subscriptions table already stores browser endpoints.
--  This migration:
--    1. Drops the mobile-shaped push_outbox (device_token / platform columns)
--       and recreates it with the web-push shape (subscription_id -> push_subscriptions).
--    2. Replaces preclass_push_scan() to read push_subscriptions, not user_device_tokens.
--    3. Drops user_device_tokens (unused for a PWA; safe if nothing references it).
--  Idempotent. Not executed by this repo's build.
-- ============================================================

-- ── 1. Rebuild push_outbox for web push ─────────────────────
DROP TABLE IF EXISTS public.push_outbox CASCADE;

CREATE TABLE public.push_outbox (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id       uuid   NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id         bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subscription_id bigint NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  -- full subscription object needed by the web-push sender
  endpoint        text   NOT NULL,
  subscription    jsonb  NOT NULL,
  priority        text   NOT NULL DEFAULT 'high',
  payload         jsonb  NOT NULL DEFAULT '{}',
  status          text   NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
CREATE INDEX push_outbox_pending_idx ON public.push_outbox (status, created_at);
ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_outbox_admin ON public.push_outbox;
CREATE POLICY push_outbox_admin ON public.push_outbox
  FOR SELECT TO authenticated USING (public.is_admin_user());

-- ── 2. Rewrite preclass_push_scan to use push_subscriptions ──
CREATE OR REPLACE FUNCTION public.preclass_push_scan()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_day    text := trim(to_char(now(), 'Day'));
  v_now    time := now()::time;
  v_thresh int;
  v_window time;
BEGIN
  FOREACH v_thresh IN ARRAY ARRAY[15, 10, 5] LOOP
    v_window := v_now + make_interval(mins => v_thresh);

    -- Write one outbox row per push subscription the teacher has, per threshold.
    INSERT INTO public.push_outbox
      (school_id, user_id, subscription_id, endpoint, subscription, priority, payload)
    SELECT DISTINCT
      tt.school_id,
      tt.teacher_id,
      ps.id,
      ps.endpoint,
      ps.subscription,
      'high',
      jsonb_build_object(
        'title', 'Class Alert',
        'body',  subj.name || ' for ' || c.class_name
                 || ' starts in ' || v_thresh || ' minutes'
                 || CASE WHEN r.room_name IS NOT NULL THEN ' in ' || r.room_name ELSE '' END,
        'threshold_minutes', v_thresh,
        'subject',    subj.name,
        'class',      c.class_name,
        'room',       COALESCE(r.room_name, ''),
        'start_time', ts.start_time
      )
    FROM public.timetables tt
    JOIN public.time_slots  ts   ON ts.id = tt.time_slot_id
    JOIN public.classes     c    ON c.id  = tt.class_id
    JOIN public.subjects    subj ON subj.id = tt.subject_id
    LEFT JOIN public.rooms  r    ON r.id  = tt.room_id
    -- web push subscriptions stored for this teacher
    JOIN public.push_subscriptions ps ON ps.user_id = tt.teacher_id
    WHERE ts.day_of_week = v_day
      AND ts.start_time BETWEEN
            v_window - make_interval(secs => 30)
        AND v_window + make_interval(secs => 30)
      AND tt.school_id IS NOT NULL
      -- dedup: skip if this teacher already got an alert for this slot + threshold today
      AND NOT EXISTS (
        SELECT 1 FROM public.notification_dispatches d
        WHERE d.dispatch_key =
          'preclass:' || tt.teacher_id || ':' || tt.class_id
          || ':' || v_thresh || ':' || current_date
      );

    -- Record dedup keys so the same alert isn't queued again.
    INSERT INTO public.notification_dispatches (dispatch_key, user_id, notification_type)
    SELECT DISTINCT
      'preclass:' || tt.teacher_id || ':' || tt.class_id || ':' || v_thresh || ':' || current_date,
      tt.teacher_id,
      'preclass_push'
    FROM public.timetables tt
    JOIN public.time_slots ts ON ts.id = tt.time_slot_id
    WHERE ts.day_of_week = v_day
      AND ts.start_time BETWEEN
            v_window - make_interval(secs => 30)
        AND v_window + make_interval(secs => 30)
    ON CONFLICT (dispatch_key) DO NOTHING;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.preclass_push_scan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preclass_push_scan() TO authenticated;

-- ── 3. Drop user_device_tokens (PWA uses push_subscriptions) ─
-- Only drops if nothing else references it. If you get a dependency error,
-- skip this statement — the table is inert for a PWA.
DROP TABLE IF EXISTS public.user_device_tokens CASCADE;
