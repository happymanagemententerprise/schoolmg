-- ============================================================
--  Happy Man Academy — Subscription plan tiers + feature gating
--
--  Adds the three client tiers (Basic / Pro / Premium) to the
--  subscription_plans catalog, exposes each school's active plan
--  and feature set to the app, and enforces feature access with a
--  RESTRICTIVE RLS overlay on the Pro/Premium-exclusive tables.
--
--  Prices are per student per term (NGN):
--    basic   2500   people, classes, subjects, timetable, attendance,
--                   grades, report cards, promotion, student/parent portals
--    pro     3000   + assignments, LMS (lessons/quizzes/discussions),
--                   analytics, leaderboards, parent attendance views, push
--    premium 5000   + campus gate check-in/out, security-guard workflows,
--                   parent pickup alerts, hostel presence tracking, priority
--
--  Backward compatible: a school with NO active subscription (the legacy
--  bootstrap school, created before onboarding existed) is treated as full
--  access so it is never locked out. Only schools onboarded through
--  platform_onboard_school — which always stamp a plan onto
--  school_subscriptions — are gated by tier.
--
--  Idempotent: every CREATE is preceded by DROP IF EXISTS / ADD COLUMN
--  IF NOT EXISTS / ON CONFLICT. SQL is not executed by this repo's build;
--  apply and test on the target Supabase project.
-- ============================================================

-- ── 1. Plan catalog shape ───────────────────────────────────
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS display_order int NOT NULL DEFAULT 0;

-- code is the join key used by platform_onboard_school and the dashboard
-- views; make it unique so the upsert below is safe.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_code_key
  ON public.subscription_plans (code);

-- ── 2. Seed the three tiers ──────────────────────────────────
-- features is a jsonb array of module keys. Pro inherits Basic, Premium
-- inherits Pro, so each tier lists the full cumulative feature set.
INSERT INTO public.subscription_plans
  (code, name, price_per_student_per_term, currency, is_available, display_order, features)
VALUES
  ('basic', 'Basic', 2500, 'NGN', true, 1,
    '["people","classes","subjects","timetable","attendance","grades","report_cards","promotion","student_portal","parent_portal"]'::jsonb),
  ('pro', 'Pro', 3000, 'NGN', true, 2,
    '["people","classes","subjects","timetable","attendance","grades","report_cards","promotion","student_portal","parent_portal","assignments","lms","analytics","leaderboards","parent_attendance","push"]'::jsonb),
  ('premium', 'Premium', 5000, 'NGN', true, 3,
    '["people","classes","subjects","timetable","attendance","grades","report_cards","promotion","student_portal","parent_portal","assignments","lms","analytics","leaderboards","parent_attendance","push","campus_gate","security_guard","pickup_alerts","hostel","priority_support"]'::jsonb)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  price_per_student_per_term = EXCLUDED.price_per_student_per_term,
  currency = EXCLUDED.currency,
  is_available = true,
  display_order = EXCLUDED.display_order,
  features = EXCLUDED.features;

-- ── 3. Feature predicate helper ─────────────────────────────
-- Returns true when the school may use p_feature. A school with no active
-- subscription is treated as full access (legacy/unlimited) so the
-- pre-onboarding bootstrap school is never locked out; schools created via
-- platform_onboard_school always carry a subscription and are gated by it.
-- SECURITY DEFINER so RLS policies can call it regardless of the caller's
-- table grants; it reads only the plan catalog and the school's own
-- subscription row.
CREATE OR REPLACE FUNCTION private.school_has_feature(
  p_school_id uuid,
  p_feature text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.school_subscriptions AS ss
      WHERE ss.school_id = p_school_id AND ss.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.school_subscriptions AS ss
      JOIN public.subscription_plans AS p ON p.code = ss.plan_code
      WHERE ss.school_id = p_school_id
        AND ss.status = 'active'
        AND p.features ? p_feature
    );
$function$;
REVOKE ALL ON FUNCTION private.school_has_feature(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.school_has_feature(uuid, text)
  TO authenticated;

-- ── 4. Active plan + features for the signed-in user ────────
-- security_invoker so the schools table's RLS (schools_read_member, which
-- already bounds the list to schools the caller can access) is honored. The
-- lateral join attaches the most recent active subscription's plan so the
-- app boot can cache planCode + features for the active school.
CREATE OR REPLACE VIEW public.school_entitlements
WITH (security_invoker = true)
AS
SELECT s.id AS id,
       s.name AS name,
       s.status AS status,
       sub.plan_code AS plan_code,
       p.name AS plan_name,
       p.features AS features
FROM public.schools AS s
LEFT JOIN LATERAL (
  SELECT ss.plan_code
  FROM public.school_subscriptions AS ss
  WHERE ss.school_id = s.id AND ss.status = 'active'
  ORDER BY ss.starts_on DESC NULLS LAST, ss.created_at DESC NULLS LAST
  LIMIT 1
) AS sub ON true
LEFT JOIN public.subscription_plans AS p ON p.code = sub.plan_code
WHERE private.has_school_access(s.id);
REVOKE ALL ON public.school_entitlements FROM PUBLIC, anon;
GRANT SELECT ON public.school_entitlements TO authenticated;

-- ── 5. Feature-gating RLS overlay (RESTRICTIVE) ─────────────
-- A RESTRICTIVE policy ANDs with the existing permissive (role-scoped)
-- policies without dropping them, so a Pro/Premium table is only reachable
-- when the row's school is on a plan that includes the feature. Legacy
-- no-subscription schools pass (school_has_feature returns true), so this
-- never reduces access for the bootstrap school. Tables that every tier uses
-- (users, classes, subjects, grades, attendance, sessions, terms, …) are
-- deliberately NOT gated here.
--
-- NOTE: this enforces tier access, not tenant isolation. Cross-school
-- isolation still rests on the per-table school_id policies; the broad
-- has_school_access overlay is deferred until school_memberships is
-- maintained for app-created users (currently the campus API's job, outside
-- this repo). See the migration header in production/staging_tenant_security_hardening.sql.
DO $feature_rls$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT t.tbl, t.feature
    FROM (VALUES
      -- Pro / LMS
      ('lms_lessons','lms'),
      ('lms_quizzes','lms'),
      ('lms_questions','lms'),
      ('lms_discussions','lms'),
      ('lms_posts','lms'),
      ('lms_attempts','lms'),
      -- Pro / assignments
      ('assignments','assignments'),
      -- Pro / push notifications
      ('push_subscriptions','push'),
      ('notification_dispatches','push'),
      -- Premium / campus gate + pickup alerts
      ('gate_events','campus_gate'),
      ('parent_pickup_pins','campus_gate'),
      -- Premium / hostel
      ('hostels','hostel'),
      ('rooms','hostel'),
      ('hostel_staff_assignments','hostel'),
      ('hostel_presence_events','hostel'),
      ('hostel_daily_summaries','hostel')
    ) AS t(tbl, feature)
  LOOP
    IF to_regclass(format('public.%I', v_row.tbl)) IS NULL THEN
      RAISE NOTICE 'skipping feature gate: public.% does not exist', v_row.tbl;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_row.tbl);
    EXECUTE format('DROP POLICY IF EXISTS hma_feature_scope ON public.%I', v_row.tbl);
    EXECUTE format(
      'CREATE POLICY hma_feature_scope ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (private.school_has_feature(school_id, %L)) WITH CHECK (private.school_has_feature(school_id, %L))',
      v_row.tbl, v_row.feature, v_row.feature
    );
  END LOOP;
END;
$feature_rls$;
