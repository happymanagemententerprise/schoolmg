-- Give Happy Management Enterprise a separate platform-owner identity.
-- This role is independent of public.users, school_memberships, and
-- organization_memberships used by customer schools.

CREATE TABLE IF NOT EXISTS public.platform_memberships (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  platform_role text NOT NULL DEFAULT 'saas_owner'
    CHECK (platform_role = 'saas_owner'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_memberships FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_memberships TO authenticated;

DROP POLICY IF EXISTS platform_memberships_read_self ON public.platform_memberships;
CREATE POLICY platform_memberships_read_self
  ON public.platform_memberships
  FOR SELECT TO authenticated
  USING (auth_user_id = (SELECT auth.uid()));

-- The private helper exposes only school-level summary data and checks the
-- caller's active SaaS-owner membership. Keep the privileged function outside
-- the Data API schema; the public view runs as the caller.
CREATE OR REPLACE FUNCTION private.platform_school_dashboard_rows()
RETURNS TABLE (
  school_id uuid,
  school_name text,
  school_status text,
  student_count bigint,
  plan text,
  subscription_status text,
  price_per_student_per_term bigint,
  prepaid_terms smallint,
  discount_percent smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    s.id,
    s.name,
    s.status,
    count(st.id)::bigint,
    COALESCE(p.name, sub.plan_code),
    sub.status,
    sub.price_per_student_per_term,
    sub.prepaid_terms,
    sub.discount_percent
  FROM public.schools AS s
  LEFT JOIN public.students AS st ON st.school_id = s.id
  LEFT JOIN LATERAL (
    SELECT
      ss.plan_code,
      ss.status,
      ss.price_per_student_per_term,
      ss.prepaid_terms,
      ss.discount_percent
    FROM public.school_subscriptions AS ss
    WHERE ss.school_id = s.id
    ORDER BY
      CASE WHEN ss.status IN ('active', 'trialing', 'past_due') THEN 0 ELSE 1 END,
      ss.starts_on DESC NULLS LAST,
      ss.created_at DESC
    LIMIT 1
  ) AS sub ON true
  LEFT JOIN public.subscription_plans AS p ON p.code = sub.plan_code
  WHERE EXISTS (
    SELECT 1
    FROM public.platform_memberships AS pm
    WHERE pm.auth_user_id = (SELECT auth.uid())
      AND pm.platform_role = 'saas_owner'
      AND pm.is_active
  )
  GROUP BY
    s.id, s.name, s.status, p.name, sub.plan_code, sub.status,
    sub.price_per_student_per_term, sub.prepaid_terms, sub.discount_percent;
$function$;

REVOKE ALL ON FUNCTION private.platform_school_dashboard_rows()
  FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.platform_school_dashboard_rows()
  TO authenticated;

CREATE OR REPLACE VIEW public.platform_school_dashboard
WITH (security_invoker = true, security_barrier = true)
AS
SELECT * FROM private.platform_school_dashboard_rows();

REVOKE ALL ON public.platform_school_dashboard FROM PUBLIC, anon;
GRANT SELECT ON public.platform_school_dashboard TO authenticated;

COMMENT ON TABLE public.platform_memberships IS
  'SaaS platform owners, separate from customer-school and organization roles.';
COMMENT ON VIEW public.platform_school_dashboard IS
  'Cross-school summary for active SaaS-owner accounts only.';
