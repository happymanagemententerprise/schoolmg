-- Fix: make platform_school_dashboard use SECURITY INVOKER
-- Prevents the view from bypassing RLS by running as the view creator

BEGIN;

DROP VIEW IF EXISTS public.platform_school_dashboard;

CREATE VIEW public.platform_school_dashboard
WITH (security_invoker = true)
AS
 SELECT s.id AS school_id,
    s.name AS school_name,
    s.status AS school_status,
    count(st.id) AS student_count,
    COALESCE(p.name, sub.plan_code) AS plan,
    sub.status AS subscription_status,
    sub.price_per_student_per_term,
    sub.prepaid_terms,
    sub.discount_percent
   FROM (((schools s
     LEFT JOIN students st ON ((st.school_id = s.id)))
     LEFT JOIN LATERAL ( SELECT ss.plan_code,
            ss.status,
            ss.price_per_student_per_term,
            ss.prepaid_terms,
            ss.discount_percent
           FROM school_subscriptions ss
          WHERE (ss.school_id = s.id)
          ORDER BY
                CASE
                    WHEN (ss.status = ANY (ARRAY['active'::text, 'trialing'::text, 'past_due'::text])) THEN 0
                    ELSE 1
                END, ss.starts_on DESC NULLS LAST, ss.created_at DESC
          LIMIT 1) sub ON (true))
     LEFT JOIN subscription_plans p ON ((p.code = sub.plan_code)))
  WHERE (EXISTS ( SELECT 1
           FROM platform_memberships pm
          WHERE ((pm.auth_user_id = ( SELECT auth.uid() AS uid)) AND (pm.platform_role = 'saas_owner'::text) AND pm.is_active)))
  GROUP BY s.id, s.name, s.status, p.name, sub.plan_code, sub.status, sub.price_per_student_per_term, sub.prepaid_terms, sub.discount_percent;

-- Tighten access
REVOKE ALL ON public.platform_school_dashboard FROM PUBLIC, anon;
GRANT SELECT ON public.platform_school_dashboard TO authenticated;

COMMIT;
