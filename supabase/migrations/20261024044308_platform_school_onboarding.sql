-- SaaS-owner-only onboarding for a new customer school.
-- This creates the organization, school, first school-admin profile/memberships,
-- and subscription as one transaction. Auth invitation is a separate step.

CREATE OR REPLACE FUNCTION private.platform_available_plans()
RETURNS TABLE (
  code text,
  name text,
  price_per_student_per_term bigint,
  currency text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.code, p.name, p.price_per_student_per_term, p.currency
  FROM public.subscription_plans AS p
  WHERE p.is_available
    AND EXISTS (
      SELECT 1
      FROM public.platform_memberships AS pm
      WHERE pm.auth_user_id = (SELECT auth.uid())
        AND pm.platform_role = 'saas_owner'
        AND pm.is_active
    )
  ORDER BY p.price_per_student_per_term, p.name;
$function$;

REVOKE ALL ON FUNCTION private.platform_available_plans()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.platform_available_plans() TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_available_plans()
RETURNS TABLE (
  code text,
  name text,
  price_per_student_per_term bigint,
  currency text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.platform_available_plans();
$function$;
REVOKE ALL ON FUNCTION public.platform_available_plans() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_available_plans() TO authenticated;

CREATE OR REPLACE FUNCTION private.platform_onboard_school(
  p_organization_name text,
  p_school_name text,
  p_admin_name text,
  p_admin_email text,
  p_plan_code text,
  p_prepaid_terms smallint DEFAULT 1,
  p_discount_percent smallint DEFAULT 0
)
RETURNS TABLE (
  organization_id uuid,
  school_id uuid,
  admin_profile_id bigint,
  plan_price bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_org_id uuid;
  v_school_id uuid;
  v_admin_id bigint;
  v_plan public.subscription_plans%ROWTYPE;
  v_email text := lower(btrim(p_admin_email));
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.platform_memberships AS pm
    WHERE pm.auth_user_id = (SELECT auth.uid())
      AND pm.platform_role = 'saas_owner'
      AND pm.is_active
  ) THEN
    RAISE EXCEPTION 'Active SaaS-owner access is required.' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(p_organization_name)) NOT BETWEEN 2 AND 120
    OR length(btrim(p_school_name)) NOT BETWEEN 2 AND 120
    OR length(btrim(p_admin_name)) NOT BETWEEN 2 AND 120
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR p_prepaid_terms NOT BETWEEN 1 AND 3
    OR p_discount_percent NOT BETWEEN 0 AND 100
  THEN
    RAISE EXCEPTION 'Check the organization, school, administrator, email and prepaid values.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users AS u WHERE lower(btrim(u.email)) = v_email) THEN
    RAISE EXCEPTION 'An account profile already exists for this email. Use another administrator email.' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans AS p
  WHERE p.code = btrim(p_plan_code) AND p.is_available
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose an available subscription plan.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.organizations (name)
  VALUES (btrim(p_organization_name))
  RETURNING id INTO v_org_id;

  INSERT INTO public.schools (organization_id, name, status)
  VALUES (v_org_id, btrim(p_school_name), 'active')
  RETURNING id INTO v_school_id;

  INSERT INTO public.users (
    name, email, role, auth_user_id, staff_role, tone, initials, is_mentor
  ) VALUES (
    btrim(p_admin_name), v_email, 'admin', NULL, NULL, 'teal',
    upper(left(btrim(p_admin_name), 2)), false
  ) RETURNING id INTO v_admin_id;

  INSERT INTO public.organization_memberships (organization_id, user_id, role, is_active)
  VALUES (v_org_id, v_admin_id, 'owner', true);

  INSERT INTO public.school_memberships (school_id, user_id, role, is_active)
  VALUES (v_school_id, v_admin_id, 'school_admin', true);

  INSERT INTO public.school_subscriptions (
    school_id, plan_code, status, price_per_student_per_term,
    prepaid_terms, discount_percent, starts_on
  ) VALUES (
    v_school_id, v_plan.code, 'active', v_plan.price_per_student_per_term,
    p_prepaid_terms, p_discount_percent, CURRENT_DATE
  );

  RETURN QUERY SELECT v_org_id, v_school_id, v_admin_id, v_plan.price_per_student_per_term;
END;
$function$;

REVOKE ALL ON FUNCTION private.platform_onboard_school(text, text, text, text, text, smallint, smallint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.platform_onboard_school(text, text, text, text, text, smallint, smallint)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_onboard_school(
  p_organization_name text,
  p_school_name text,
  p_admin_name text,
  p_admin_email text,
  p_plan_code text,
  p_prepaid_terms smallint DEFAULT 1,
  p_discount_percent smallint DEFAULT 0
)
RETURNS TABLE (
  organization_id uuid,
  school_id uuid,
  admin_profile_id bigint,
  plan_price bigint
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.platform_onboard_school(
    p_organization_name, p_school_name, p_admin_name, p_admin_email,
    p_plan_code, p_prepaid_terms, p_discount_percent
  );
$function$;
REVOKE ALL ON FUNCTION public.platform_onboard_school(text, text, text, text, text, smallint, smallint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_onboard_school(text, text, text, text, text, smallint, smallint)
  TO authenticated;

