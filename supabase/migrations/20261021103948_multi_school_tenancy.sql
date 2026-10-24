-- Multi-school tenancy foundation.
-- This migration preserves the current single-school app while introducing
-- organization, school, and membership records and backfilling existing data.
-- Do not provision a second school until the app's active-school context and
-- tenant RLS policies are deployed in the follow-up rollout.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.organization_memberships (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'operator', 'support')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.school_memberships (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL
);

CREATE INDEX IF NOT EXISTS schools_organization_id_idx
  ON public.schools (organization_id);
CREATE INDEX IF NOT EXISTS organization_memberships_user_id_idx
  ON public.organization_memberships (user_id, is_active);
CREATE INDEX IF NOT EXISTS school_memberships_user_id_idx
  ON public.school_memberships (user_id, is_active);

-- Create the initial tenant if the existing tenant tables are empty. The
-- migration deliberately stops later if multiple schools exist, because the
-- legacy rows cannot then be assigned safely without an explicit mapping.
INSERT INTO public.organizations (name)
SELECT 'Happy Management Enterprise'
WHERE NOT EXISTS (
  SELECT 1 FROM public.organizations WHERE name = 'Happy Management Enterprise'
);

INSERT INTO public.schools (organization_id, name)
SELECT o.id, 'Happy Man Academy'
FROM public.organizations o
WHERE o.name = 'Happy Management Enterprise'
  AND NOT EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.organization_id = o.id AND s.name = 'Happy Man Academy'
  )
ORDER BY o.id
LIMIT 1;

-- Add the school key to every existing application table and associate all
-- existing records with the current school. Nullable remains intentional in
-- this foundation migration so existing app writes continue during rollout.
DO $migration$
DECLARE
  v_table record;
  v_school_id uuid;
BEGIN
  IF (SELECT count(*) FROM public.schools) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one school before legacy-data backfill; inspect public.schools and map records explicitly.';
  END IF;
  SELECT id INTO STRICT v_school_id FROM public.schools;

  FOR v_table IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname NOT IN (
        'organizations', 'schools', 'organization_memberships', 'school_memberships'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id)',
      v_table.table_name
    );
    EXECUTE format(
      'UPDATE public.%I SET school_id = $1 WHERE school_id IS NULL',
      v_table.table_name
    ) USING v_school_id;
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (school_id)',
      left(v_table.table_name || '_school_id_idx', 63),
      v_table.table_name
    );
  END LOOP;
END;
$migration$;

-- Existing accounts retain their current app role inside the bootstrapped school.
INSERT INTO public.school_memberships (school_id, user_id, role)
SELECT s.id, u.id, u.role
FROM public.schools s
CROSS JOIN public.users u
WHERE u.role IN ('admin', 'teacher', 'student', 'parent', 'security_guard', 'hostel_staff')
  AND NOT EXISTS (
    SELECT 1 FROM public.school_memberships sm
    WHERE sm.school_id = s.id AND sm.user_id = u.id
  );

CREATE OR REPLACE FUNCTION private.has_org_access(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      JOIN public.users u ON u.id = om.user_id
      WHERE om.organization_id = p_organization_id
        AND om.is_active
        AND u.auth_user_id = (SELECT auth.uid())
    );
$function$;

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

REVOKE ALL ON FUNCTION private.has_org_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_school_access(uuid) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_org_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_school_access(uuid) TO authenticated;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_read_member ON public.organizations;
CREATE POLICY organizations_read_member ON public.organizations
  FOR SELECT TO authenticated
  USING (private.has_org_access(id));

DROP POLICY IF EXISTS schools_read_member ON public.schools;
CREATE POLICY schools_read_member ON public.schools
  FOR SELECT TO authenticated
  USING (private.has_school_access(id));

DROP POLICY IF EXISTS organization_memberships_read_member ON public.organization_memberships;
CREATE POLICY organization_memberships_read_member ON public.organization_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = public.public_user_id()
    OR private.has_org_access(organization_id)
  );

DROP POLICY IF EXISTS school_memberships_read_member ON public.school_memberships;
CREATE POLICY school_memberships_read_member ON public.school_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = public.public_user_id()
    OR private.has_school_access(school_id)
  );

GRANT SELECT ON public.organizations, public.schools,
  public.organization_memberships, public.school_memberships TO authenticated;

-- This owner-facing summary is protected by the same membership check, and
-- security_invoker keeps underlying row policies in force.
CREATE OR REPLACE VIEW public.school_student_counts
WITH (security_invoker = true)
AS
SELECT s.id AS school_id,
       s.organization_id,
       s.name AS school_name,
       s.status AS school_status,
       count(st.id)::bigint AS student_count
FROM public.schools s
LEFT JOIN public.students st ON st.school_id = s.id
WHERE private.has_school_access(s.id)
GROUP BY s.id, s.organization_id, s.name, s.status;

REVOKE ALL ON public.school_student_counts FROM PUBLIC, anon;
GRANT SELECT ON public.school_student_counts TO authenticated;

COMMENT ON TABLE public.organizations IS
  'Business or operator tenancy; one organization may manage multiple schools.';
COMMENT ON TABLE public.schools IS
  'Individual school tenants owned by an organization.';
COMMENT ON TABLE public.organization_memberships IS
  'Business-level access for owners and platform operators.';
COMMENT ON TABLE public.school_memberships IS
  'School-level access and role for each account.';
COMMENT ON VIEW public.school_student_counts IS
  'Student totals per school, visible only to members of that school or its organization.';
