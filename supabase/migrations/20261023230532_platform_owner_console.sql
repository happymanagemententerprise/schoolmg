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

-- The view exposes only school-level summary data. It uses the view owner's
-- table privileges for cross-school aggregation, but every request is gated
-- by the caller's own active SaaS-owner membership.
CREATE OR REPLACE VIEW public.platform_school_dashboard
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  s.id AS school_id,
  s.name AS school_name,
  s.status AS school_status,
  count(st.id)::bigint AS student_count,
  sub.plan,
  sub.status AS subscription_status,
  sub.price_per_student_per_term,
  sub.prepaid_terms,
  sub.discount_percent
FROM public.schools AS s
LEFT JOIN public.students AS st ON st.school_id = s.id
LEFT JOIN LATERAL (
  SELECT
    ss.plan,
    ss.status,
    ss.price_per_student_per_term,
    ss.prepaid_terms,
    ss.discount_percent
  FROM public.school_subscriptions AS ss
  WHERE ss.school_id = s.id
  ORDER BY CASE WHEN ss.status IN ('active', 'trialing', 'past_due') THEN 0 ELSE 1 END
  LIMIT 1
) AS sub ON true
WHERE EXISTS (
  SELECT 1
  FROM public.platform_memberships AS pm
  WHERE pm.auth_user_id = (SELECT auth.uid())
    AND pm.platform_role = 'saas_owner'
    AND pm.is_active
)
GROUP BY s.id, s.name, s.status, sub.plan, sub.status,
         sub.price_per_student_per_term, sub.prepaid_terms, sub.discount_percent;

REVOKE ALL ON public.platform_school_dashboard FROM PUBLIC, anon;
GRANT SELECT ON public.platform_school_dashboard TO authenticated;

COMMENT ON TABLE public.platform_memberships IS
  'SaaS platform owners, separate from customer-school and organization roles.';
COMMENT ON VIEW public.platform_school_dashboard IS
  'Cross-school summary for active SaaS-owner accounts only.';
