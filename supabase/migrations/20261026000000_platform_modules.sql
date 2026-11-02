-- ============================================================
--  Happy Man Academy — Platform modules (schema + DB logic)
--
--  Adds the missing tables/columns and DB-side logic for:
--    1. Tenant (schools) branding + add-on feature toggles
--    2. Staff roles (Bursar, Librarian) + RBAC helpers
--    3. Principal approval workflow (VP action interception + execute)
--    4. Dynamic grading structures + calculation engine
--    5. Fee structures, student fees, payment transactions (+ record RPC)
--    6. Parent-student links (already exist — skipped)
--    7. Student date_of_birth + school_level
--    8. Mobile push device tokens (FCM/APNs)
--
--  Skipped because they already exist: approval_requests (extended here),
--  parent_students, class_schedules (= timetables + time_slots),
--  push_subscriptions (web push; user_device_tokens added for mobile).
--
--  External to this repo (campus API / future Edge Functions) and NOT
--  implemented here: real gateway checkout + webhook HTTP endpoints
--  (Paystack/Flutterwave/Interswitch), real FCM/APNs push dispatch, email
--  send. This migration provides the DB surface those services call.
--
--  Idempotent. SQL is not executed by this repo's build — apply and test
--  on the target Supabase project.
-- ============================================================

-- ── 1. Students: date_of_birth + school_level ────────────────
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS school_level text
  CHECK (school_level IS NULL OR school_level IN ('JSS','SS','SSS'));

-- ── 2. Tenants (schools): branding + add-on feature toggles ──
-- subscription_tier is NOT added as a redundant enum: the active plan comes
-- from school_subscriptions.plan_code (see 20261025000000_plan_tiers.sql).
-- enabled_features is the A-la-carte add-on list layered on top of the tier.
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS primary_color text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS additional_colors jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS enabled_features jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.schools ALTER COLUMN enabled_features SET DEFAULT '{}'::jsonb;
-- normalize any array-typed defaults from an earlier run to an empty object
UPDATE public.schools SET enabled_features = '{}'::jsonb WHERE jsonb_typeof(enabled_features) = 'array';

-- ── 3. Staff roles: Bursar + Librarian ───────────────────────
-- Roles are modeled on users.role (+ staff_role / admin_tier hierarchy),
-- not a separate staff_roles table, matching the existing design.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin','teacher','student','parent','security_guard','hostel_staff','bursar','librarian'));

ALTER TABLE public.school_memberships DROP CONSTRAINT IF EXISTS school_memberships_role_check;
ALTER TABLE public.school_memberships ADD CONSTRAINT school_memberships_role_check
  CHECK (role IN ('admin','teacher','student','parent','security_guard','hostel_staff','bursar','librarian','school_admin'));

-- ── 4. Approval workflow: extend action_type + execute RPC ──
-- Add the Vice-Principal → Principal high-impact actions to the existing
-- approval_requests.action_type enum.
ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_action_type_check;
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_action_type_check
  CHECK (action_type IN (
    'pool_placement','results_publish','end_of_session_run','pool_close',
    'reclassify','reactivate',
    'open_exam_portal','publish_results','change_term'));

-- A request is locked (status='pending') until the Principal approves it.
-- On approval this function executes the underlying action in one transaction.
CREATE OR REPLACE FUNCTION public.principal_decide_request(
  p_request_id bigint,
  p_approve    boolean,
  p_note       text DEFAULT NULL
)
RETURNS public.approval_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row     public.approval_requests%ROWTYPE;
  v_actor   bigint;
  v_term_id bigint;
  v_session record;
BEGIN
  SELECT * INTO v_row FROM public.approval_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approval request not found.' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'Request already decided.' USING ERRCODE = '55006'; END IF;

  -- Caller must be a Principal with access to the request's school.
  SELECT u.id INTO v_actor FROM public.users u
    WHERE u.auth_user_id = (SELECT auth.uid());
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_actor AND u.admin_tier = 'principal'
      AND private.has_school_access(v_row.school_id)
  ) THEN
    RAISE EXCEPTION 'Only the school Principal can decide this request.' USING ERRCODE = '42501';
  END IF;

  IF p_approve THEN
    -- Execute the underlying high-impact action.
    CASE v_row.action_type
      WHEN 'open_exam_portal' THEN
        UPDATE public.sessions
          SET upload_open = COALESCE(upload_open,'{}'::jsonb) || jsonb_build_object('exam', true)
          WHERE id = COALESCE((v_row.payload->>'session_id')::bigint,
            (SELECT s.id FROM public.sessions s WHERE s.school_id = v_row.school_id AND s.is_current LIMIT 1));
      WHEN 'publish_results' THEN
        v_term_id := NULLIF(v_row.payload->>'term_id','')::bigint;
        IF v_term_id IS NULL THEN RAISE EXCEPTION 'publish_results needs payload.term_id'; END IF;
        UPDATE public.terms SET results_published = true WHERE id = v_term_id;
      WHEN 'change_term' THEN
        v_term_id := NULLIF(v_row.payload->>'term_id','')::bigint;
        IF v_term_id IS NULL THEN RAISE EXCEPTION 'change_term needs payload.term_id'; END IF;
        UPDATE public.terms SET is_current = (id = v_term_id)
          WHERE session_id = (SELECT session_id FROM public.terms WHERE id = v_term_id);
      ELSE
        RAISE EXCEPTION 'Action % is not auto-executable here.', v_row.action_type;
    END CASE;
    v_row.status := 'approved';
  ELSE
    v_row.status := 'rejected';
  END IF;

  v_row.decided_by := v_actor;
  v_row.decision_note := p_note;
  v_row.decided_at := now();

  UPDATE public.approval_requests
    SET status = v_row.status, decided_by = v_actor, decision_note = p_note, decided_at = now()
    WHERE id = p_request_id
    RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.principal_decide_request(bigint, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.principal_decide_request(bigint, boolean, text) TO authenticated;

-- ── 5. Grading structures + calculation engine ─────────────
CREATE TABLE IF NOT EXISTS public.grading_structures (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id   uuid   NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  school_level text  NOT NULL CHECK (school_level IN ('JSS','SS','SSS')),
  -- components: [{"key":"ca1","label":"CA 1","max":30}, {"key":"exam","label":"Exam","max":70}]
  components  jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, school_level)
);
CREATE INDEX IF NOT EXISTS grading_structures_school_idx ON public.grading_structures (school_id);

-- Calculation engine. components_max = [{"max":N},...] ; scores = [{"score":X},...]
-- If sum(max) == 100 → final = sum(score). If sum(max) > 100 → final = sum(score) / count.
CREATE OR REPLACE FUNCTION public.grading_compute(
  p_components_max jsonb,
  p_scores jsonb
)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  WITH m AS (
    SELECT (elem->>'max')::numeric AS max_val
    FROM jsonb_array_elements(p_components_max) AS t(elem)
  ), s AS (
    SELECT (elem->>'score')::numeric AS score_val
    FROM jsonb_array_elements(p_scores) AS t(elem)
  ), agg AS (
    SELECT
      COALESCE((SELECT sum(max_val) FROM m), 0) AS total_max,
      COALESCE((SELECT sum(score_val) FROM s), 0) AS total_score,
      COALESCE((SELECT count(*) FROM m), 0) AS component_count
  )
  SELECT CASE
    WHEN total_max = 100 THEN total_score
    WHEN total_max > 100 AND component_count > 0 THEN round(total_score / component_count, 2)
    WHEN total_max > 0 THEN round(total_score * 100 / total_max, 2)  -- generic scale-to-100 fallback
    ELSE 0
  END
  FROM agg;
$function$;
REVOKE ALL ON FUNCTION public.grading_compute(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grading_compute(jsonb, jsonb) TO authenticated;

-- ── 6. Fees + payments ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fee_structures (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id  uuid   NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id   bigint REFERENCES public.classes(id) ON DELETE CASCADE,
  level      text,  -- JSS / SS / SSS (nullable = applies to whole school)
  label      text   NOT NULL,          -- e.g. "Tuition", "ICT", "Boarding"
  amount     numeric(12,2) NOT NULL CHECK (amount >= 0),
  is_termly  boolean NOT NULL DEFAULT true,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fee_structures_school_idx ON public.fee_structures (school_id);

CREATE TABLE IF NOT EXISTS public.student_fees (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id        uuid   NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id       bigint NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  fee_structure_id bigint NOT NULL REFERENCES public.fee_structures(id) ON DELETE CASCADE,
  term_id          bigint REFERENCES public.terms(id) ON DELETE CASCADE,
  amount_due       numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid      numeric(12,2) NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'unpaid'
    CHECK (status IN ('unpaid','part_paid','paid','overpaid')),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_fees_student_idx ON public.student_fees (student_id);

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id  uuid   NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id bigint REFERENCES public.students(id) ON DELETE SET NULL,
  parent_id  bigint REFERENCES public.users(id) ON DELETE SET NULL,
  amount     numeric(12,2) NOT NULL CHECK (amount >= 0),
  gateway    text   NOT NULL CHECK (gateway IN ('paystack','flutterwave','interswitch','cash')),
  reference  text   NOT NULL UNIQUE,
  status     text   NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','successful','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_transactions_school_idx ON public.payment_transactions (school_id);

-- Called by the external webhook after the gateway signature is verified.
-- Records the payment and reconciles the linked student_fees row.
CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_school_id  uuid,
  p_student_id bigint,
  p_amount     numeric,
  p_gateway    text,
  p_reference  text,
  p_parent_id  bigint DEFAULT NULL,
  p_status     text DEFAULT 'successful',
  p_fee_id     bigint DEFAULT NULL
)
RETURNS public.payment_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.payment_transactions%ROWTYPE;
  v_fee public.student_fees%ROWTYPE;
BEGIN
  IF p_status NOT IN ('pending','successful','failed') THEN
    RAISE EXCEPTION 'Invalid payment status.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.payment_transactions
    (school_id, student_id, parent_id, amount, gateway, reference, status)
  VALUES (p_school_id, p_student_id, p_parent_id, p_amount, p_gateway, p_reference, p_status)
  RETURNING * INTO v_row;

  IF p_status = 'successful' THEN
    IF p_fee_id IS NOT NULL THEN
      UPDATE public.student_fees
        SET amount_paid = amount_paid + p_amount,
            status = CASE WHEN amount_paid + p_amount >= amount_due THEN 'paid'
                          WHEN amount_paid + p_amount > 0 THEN 'part_paid' ELSE status END
        WHERE id = p_fee_id AND student_id = p_student_id
        RETURNING * INTO v_fee;
    ELSE
      -- Apply to the oldest outstanding fee for this student (FIFO).
      UPDATE public.student_fees
        SET amount_paid = amount_paid + p_amount,
            status = CASE WHEN amount_paid + p_amount >= amount_due THEN 'paid'
                          WHEN amount_paid + p_amount > 0 THEN 'part_paid' ELSE status END
        WHERE id = (
          SELECT id FROM public.student_fees
          WHERE student_id = p_student_id AND status IN ('unpaid','part_paid')
          ORDER BY created_at LIMIT 1
        );
    END IF;
  END IF;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_fee_payment(uuid, bigint, numeric, text, text, bigint, text, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_fee_payment(uuid, bigint, numeric, text, text, bigint, text, bigint)
  TO authenticated;

-- ── 7. Mobile push device tokens (FCM / APNs) ────────────────
CREATE TABLE IF NOT EXISTS public.user_device_tokens (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id    uuid   NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id      bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_token text   NOT NULL,
  platform     text   NOT NULL CHECK (platform IN ('ios','android')),
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_token)
);
CREATE INDEX IF NOT EXISTS user_device_tokens_user_idx ON public.user_device_tokens (user_id, is_active);

-- ── 8. In-app notification inbox (birthday digests etc.) ──
CREATE TABLE IF NOT EXISTS public.school_notifications (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id  uuid   NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id    bigint REFERENCES public.users(id) ON DELETE CASCADE,  -- recipient (NULL = school-wide)
  kind       text   NOT NULL,         -- birthday_digest | system | ...
  title      text   NOT NULL,
  body       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz
);
CREATE INDEX IF NOT EXISTS school_notifications_user_idx ON public.school_notifications (user_id, read_at);

-- ── 9. Branding storage bucket ──────────────────────────────
-- Public read so favicons / CSS logo URLs work for any browser; writes are
-- gated by a policy below to each school's own prefix.
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-assets', 'tenant-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ── 10. RLS on every new table ──────────────────────────────
ALTER TABLE public.grading_structures   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_structures        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_fees          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_device_tokens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_notifications  ENABLE ROW LEVEL SECURITY;

-- Tenant-bound tables: bound by school membership (has_school_access).
-- DROP IF EXISTS so this migration is re-runnable and coexists with 20261027000000.
DROP POLICY IF EXISTS grading_structures_read  ON public.grading_structures;
DROP POLICY IF EXISTS grading_structures_write ON public.grading_structures;
DROP POLICY IF EXISTS fee_structures_read      ON public.fee_structures;
DROP POLICY IF EXISTS fee_structures_write     ON public.fee_structures;
DROP POLICY IF EXISTS student_fees_read        ON public.student_fees;
DROP POLICY IF EXISTS student_fees_write       ON public.student_fees;
DROP POLICY IF EXISTS payment_transactions_read ON public.payment_transactions;
DROP POLICY IF EXISTS payment_transactions_write ON public.payment_transactions;
DROP POLICY IF EXISTS device_tokens_self      ON public.user_device_tokens;
DROP POLICY IF EXISTS notifications_read       ON public.school_notifications;
DROP POLICY IF EXISTS notifications_write_admin ON public.school_notifications;

CREATE POLICY grading_structures_read   ON public.grading_structures  FOR SELECT TO authenticated USING (private.has_school_access(school_id));
CREATE POLICY grading_structures_write  ON public.grading_structures  FOR ALL    TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY fee_structures_read        ON public.fee_structures       FOR SELECT TO authenticated USING (private.has_school_access(school_id));
CREATE POLICY fee_structures_write       ON public.fee_structures       FOR ALL    TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY student_fees_read          ON public.student_fees         FOR SELECT TO authenticated
  USING (private.has_school_access(school_id)
    OR student_id = public.current_student_id()
    OR student_id = ANY(public.parent_student_ids()));
CREATE POLICY student_fees_write         ON public.student_fees         FOR ALL    TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY payment_transactions_read  ON public.payment_transactions FOR SELECT TO authenticated
  USING (private.has_school_access(school_id)
    OR student_id = public.current_student_id()
    OR parent_id = public.public_user_id());
CREATE POLICY payment_transactions_write  ON public.payment_transactions FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY device_tokens_self         ON public.user_device_tokens   FOR ALL TO authenticated
  USING (user_id = public.public_user_id() OR public.is_admin_user())
  WITH CHECK (user_id = public.public_user_id());
CREATE POLICY notifications_read          ON public.school_notifications  FOR SELECT TO authenticated
  USING (user_id = public.public_user_id() OR (user_id IS NULL AND private.has_school_access(school_id)));
CREATE POLICY notifications_write_admin   ON public.school_notifications  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());

-- Storage: each authenticated user writes only under their school's prefix,
-- everyone can read (logos must be public for favicon/CSS injection).
DROP POLICY IF EXISTS tenant_assets_write_own ON storage.objects;
CREATE POLICY tenant_assets_write_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tenant-assets'
    AND (storage.foldername(name))[1] = (SELECT s.id::text FROM public.schools s WHERE private.has_school_access(s.id) LIMIT 1));

DROP POLICY IF EXISTS tenant_assets_read ON storage.objects;
CREATE POLICY tenant_assets_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tenant-assets');

-- ── 11. Unify tier + A-la-carte add-ons in school_has_feature ─
-- A feature is enabled if the school's plan includes it OR the school has
-- explicitly toggled it on in schools.enabled_features. Legacy (no plan)
-- stays full access.
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
      WHERE ss.school_id = p_school_id AND ss.status = 'active'
        AND (p.features ->> p_feature) = 'true'
    )
    OR EXISTS (
      SELECT 1 FROM public.schools AS s
      WHERE s.id = p_school_id AND (s.enabled_features ->> p_feature) = 'true'
    );
$function$;
REVOKE ALL ON FUNCTION private.school_has_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.school_has_feature(uuid, text) TO authenticated;

-- ── 12. school_entitlements: branding + merged plan/add-on features ──
-- Redefines the view from 20261025000000 to also expose logo/colors and to
-- merge subscription_plans.features with schools.enabled_features, so the
-- app's Data.hasFeature() honors both tier packages and A-la-carte toggles.
-- DROP first because CREATE OR REPLACE cannot change column order/names.
DROP VIEW IF EXISTS public.school_entitlements;
CREATE VIEW public.school_entitlements
WITH (security_invoker = true)
AS
SELECT s.id AS id,
       s.name AS name,
       s.status AS status,
       sub.plan_code AS plan_code,
       p.name AS plan_name,
       s.logo_url AS logo_url,
       s.primary_color AS primary_color,
       s.additional_colors AS additional_colors,
       COALESCE(p.features, '{}'::jsonb) || COALESCE(s.enabled_features, '{}'::jsonb) AS features
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
