-- ============================================================
--  Happy Man Academy — Scheduled jobs (pg_cron)
--
--  Daily birthday digest + per-minute pre-class push scan. The actual
--  delivery (email send, FCM/APNs push) is performed by the external campus
--  API; these jobs write the in-app digest and a push outbox for that service
--  to drain. Dedup keys live in notification_dispatches (already exists).
--
--  pg_cron is optional: the schedule block swallows errors so this migration
--  still applies on a project without the extension. SQL is not executed by
--  this repo's build.
-- ============================================================

-- Outbox the external push dispatcher drains (FCM / APNs).
CREATE TABLE IF NOT EXISTS public.push_outbox (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id    uuid   NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id      bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_token text   NOT NULL,
  platform     text   NOT NULL CHECK (platform IN ('ios','android')),
  priority     text   NOT NULL DEFAULT 'high',
  payload      jsonb  NOT NULL DEFAULT '{}'::jsonb,
  status       text   NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz
);
CREATE INDEX IF NOT EXISTS push_outbox_pending_idx ON public.push_outbox (status, created_at);
ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_outbox_admin ON public.push_outbox FOR SELECT TO authenticated
  USING (public.is_admin_user());

-- ── Birthday digest ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.birthday_digest()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_today date := current_date;
BEGIN
  -- For each student whose birthday falls on today, notify the school's
  -- administrators and the student's class teacher. Idempotent per (student, day).
  INSERT INTO public.school_notifications (school_id, user_id, kind, title, body)
  SELECT DISTINCT s.school_id, u.id, 'birthday_digest',
    'Birthday reminder',
    coalesce(st.name,'Student') || ' ('
      || coalesce(c.class_name, '?') || ') celebrates a birthday today.'
  FROM public.students st
  JOIN public.schools s   ON s.id = st.school_id
  LEFT JOIN public.classes c ON c.id = st.class_id
  LEFT JOIN public.teacher_classes tc ON tc.class_id = st.class_id
  LEFT JOIN public.users t  ON t.id = tc.teacher_id
  JOIN public.users u ON (u.id = t.id OR u.role = 'admin')
  WHERE st.date_of_birth IS NOT NULL
    AND extract(month from st.date_of_birth) = extract(month from v_today)
    AND extract(day   from st.date_of_birth) = extract(day   from v_today)
    AND NOT EXISTS (
      SELECT 1 FROM public.school_notifications n
      WHERE n.kind = 'birthday_digest' AND n.school_id = s.school_id
        AND n.body ILIKE coalesce(st.name,'Student') || '%'
        AND date_trunc('day', n.created_at) = v_today
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.birthday_digest() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.birthday_digest() TO authenticated;

-- ── Pre-class push scan (15 / 10 / 5 min windows) ───────────
CREATE OR REPLACE FUNCTION public.preclass_push_scan()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_day text := trim(to_char(now(), 'Day'));
  v_now time := (now()::time);
  v_thresh int;
  v_window time;
  v_key   text;
BEGIN
  FOREACH v_thresh IN ARRAY ARRAY[15, 10, 5] LOOP
    v_window := v_now + make_interval(mins => v_thresh);
    INSERT INTO public.push_outbox (school_id, user_id, device_token, platform, priority, payload)
    SELECT DISTINCT tt.school_id, tt.teacher_id, dt.device_token, dt.platform, 'high',
      jsonb_build_object(
        'title', 'Class Alert',
        'body', subj.name || ' for ' || c.class_name
          || ' starts in ' || v_thresh || ' minutes in ' || coalesce(r.room_name, '?'),
        'threshold_minutes', v_thresh,
        'subject', subj.name,
        'class', c.class_name,
        'room', r.room_name,
        'start_time', ts.start_time)
    FROM public.timetables tt
    JOIN public.time_slots ts  ON ts.id = tt.time_slot_id
    JOIN public.classes c      ON c.id = tt.class_id
    JOIN public.subjects subj  ON subj.id = tt.subject_id
    LEFT JOIN public.rooms r   ON r.id = tt.room_id
    JOIN public.user_device_tokens dt
      ON dt.user_id = tt.teacher_id AND dt.is_active
    WHERE ts.day_of_week = v_day
      AND ts.start_time BETWEEN v_window - make_interval(secs => 30)
                            AND v_window + make_interval(secs => 30)
      AND tt.school_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.notification_dispatches d
        WHERE d.dispatch_key = 'preclass:' || tt.teacher_id || ':' || tt.class_id || ':' || v_thresh || ':' || current_date
      );

    -- Record dedup keys for the rows just queued.
    INSERT INTO public.notification_dispatches (dispatch_key, user_id, notification_type)
    SELECT DISTINCT 'preclass:' || tt.teacher_id || ':' || tt.class_id || ':' || v_thresh || ':' || current_date,
      tt.teacher_id, 'preclass_push'
    FROM public.timetables tt
    JOIN public.time_slots ts ON ts.id = tt.time_slot_id
    WHERE ts.day_of_week = v_day
      AND ts.start_time BETWEEN v_window - make_interval(secs => 30)
                            AND v_window + make_interval(secs => 30)
    ON CONFLICT (dispatch_key) DO NOTHING;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.preclass_push_scan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preclass_push_scan() TO authenticated;

-- ── Schedule the jobs (best-effort; no-op if pg_cron missing) ──
DO $schedule$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('hma-birthday-daily', '0 6 * * *', $$SELECT public.birthday_digest();$$);
  PERFORM cron.schedule('hma-preclass-scan',  '* * * * *',   $$SELECT public.preclass_push_scan();$$);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END;
$schedule$;
