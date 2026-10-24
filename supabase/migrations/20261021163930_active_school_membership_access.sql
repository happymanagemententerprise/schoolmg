-- Revoked school memberships must stop granting data access immediately.
-- The original tenancy migration omitted this predicate when joining
-- school_memberships, even though the table includes an is_active flag.
CREATE OR REPLACE FUNCTION private.has_school_access(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.school_memberships sm
        JOIN public.users u ON u.id = sm.user_id
        WHERE sm.school_id = p_school_id
          AND sm.is_active
          AND u.auth_user_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.schools s
        JOIN public.organization_memberships om
          ON om.organization_id = s.organization_id
        JOIN public.users u ON u.id = om.user_id
        WHERE s.id = p_school_id
          AND om.is_active
          AND u.auth_user_id = (SELECT auth.uid())
      )
    );
$function$;
