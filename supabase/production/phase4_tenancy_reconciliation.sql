-- PRODUCTION ROLLOUT DRAFT — REVIEW BEFORE EXECUTION.
-- Target: happyman-academy (erlhyrswcqpqpqzbgmgb)
-- STALE / DO NOT RUN AS WRITTEN (rechecked 2026-10-24): production already has
-- one organization, one school, 34 school memberships, one organization
-- membership, and school_id on all 50 application data tables. The empty-table
-- preconditions below will abort. Replace this bootstrap with a narrow,
-- current-shape reconciliation only if the app requires missing metadata.
-- Do not create a second school until active-school context is implemented.
-- No SQL in this file has been applied to production.
--
-- This adapts production's existing empty, partial tenancy tables to the
-- schema already present in staging. It intentionally creates one school and
-- backfills existing public application rows to that school. It does NOT add
-- active-school UI context or tenant-scoped policies; do not create a second
-- school until those are implemented and separately reviewed.
--
-- Current-state preconditions checked on 2026-10-21:
--   * organizations, schools, and school_memberships are empty
--   * organization_memberships is absent
--   * no other relation has a foreign key referencing school_memberships' PK
--   * production users should have only app role values listed below
--
-- Before execution, recheck row counts and estimated relation sizes, confirm
-- user roles, take a backup, and schedule the all-table school_id backfill.

BEGIN;

-- Abort instead of making assumptions if tenant rows or unexpected app roles
-- have appeared since the read-only inventory.
DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM public.organizations)
     OR EXISTS (SELECT 1 FROM public.schools)
     OR EXISTS (SELECT 1 FROM public.school_memberships) THEN
    RAISE EXCEPTION 'Tenancy preflight failed: production tenant tables are no longer empty.';
  END IF;

  IF to_regclass('public.organization_memberships') IS NOT NULL THEN
    RAISE EXCEPTION 'Tenancy preflight failed: organization_memberships already exists; inspect its shape first.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users
     WHERE role IS NULL
        OR role NOT IN ('admin', 'teacher', 'student', 'parent', 'security_guard', 'hostel_staff')
  ) THEN
    RAISE EXCEPTION 'Tenancy preflight failed: users contains a null or unsupported app role.';
  END IF;
END;
$preflight$;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;

-- Repair production's partial organization/school tables in place.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.schools
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN name SET NOT NULL;

-- Replace the old school_memberships composite key and legacy school_admin
-- role check. This table was confirmed empty and the old PK has no dependents.
ALTER TABLE public.school_memberships
  ADD COLUMN IF NOT EXISTS id bigint GENERATED ALWAYS AS IDENTITY,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.school_memberships
  ALTER COLUMN school_id SET NOT NULL,
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN role SET NOT NULL;

DO $constraints$
DECLARE v_name text;
BEGIN
  FOR v_name IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.school_memberships'::regclass AND contype = 'p'
  LOOP
    EXECUTE format('ALTER TABLE public.school_memberships DROP CONSTRAINT %I', v_name);
  END LOOP;

  FOR v_name IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.school_memberships'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.school_memberships DROP CONSTRAINT %I', v_name);
  END LOOP;
END;
$constraints$;

ALTER TABLE public.school_memberships
  ADD CONSTRAINT school_memberships_pkey PRIMARY KEY (id),
  ADD CONSTRAINT school_memberships_role_check CHECK (role IN (
    'admin', 'teacher', 'student', 'parent', 'security_guard', 'hostel_staff'
  ));

-- Ensure existing partial-table foreign keys match the staged delete behavior.
-- If a matching FK exists with a different action, stop for a manual review
-- rather than installing a second, conflicting constraint.
DO $foreign_keys$
DECLARE
  v_column smallint;
  v_ref_column smallint;
  v_wrong_action boolean;
  v_wrong_shape boolean;
BEGIN
  SELECT attnum INTO STRICT v_column FROM pg_attribute
   WHERE attrelid = 'public.schools'::regclass AND attname = 'organization_id' AND NOT attisdropped;
  SELECT attnum INTO STRICT v_ref_column FROM pg_attribute
   WHERE attrelid = 'public.organizations'::regclass AND attname = 'id' AND NOT attisdropped;
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.schools'::regclass AND c.contype = 'f'
       AND v_column = ANY (c.conkey)
       AND (c.confrelid <> 'public.organizations'::regclass
         OR c.conkey <> ARRAY[v_column]::smallint[]
         OR c.confkey <> ARRAY[v_ref_column]::smallint[])
  ) INTO v_wrong_shape;
  IF v_wrong_shape THEN
    RAISE EXCEPTION 'Tenancy preflight failed: schools.organization_id participates in an unexpected foreign key.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.schools'::regclass AND c.contype = 'f'
       AND c.confrelid = 'public.organizations'::regclass
       AND c.conkey = ARRAY[v_column]::smallint[]
       AND c.confkey = ARRAY[v_ref_column]::smallint[]
       AND (c.confdeltype <> 'r' OR NOT c.convalidated)
  ) INTO v_wrong_action;
  IF v_wrong_action THEN
    RAISE EXCEPTION 'Tenancy preflight failed: schools.organization_id FK delete action differs from RESTRICT.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.schools'::regclass AND c.contype = 'f'
       AND c.confrelid = 'public.organizations'::regclass
       AND c.conkey = ARRAY[v_column]::smallint[]
       AND c.confkey = ARRAY[v_ref_column]::smallint[]
       AND c.confdeltype = 'r' AND c.convalidated
  ) THEN
    ALTER TABLE public.schools ADD CONSTRAINT schools_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;
  END IF;

  SELECT attnum INTO STRICT v_column FROM pg_attribute
   WHERE attrelid = 'public.school_memberships'::regclass AND attname = 'school_id' AND NOT attisdropped;
  SELECT attnum INTO STRICT v_ref_column FROM pg_attribute
   WHERE attrelid = 'public.schools'::regclass AND attname = 'id' AND NOT attisdropped;
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.school_memberships'::regclass AND c.contype = 'f'
       AND v_column = ANY (c.conkey)
       AND (c.confrelid <> 'public.schools'::regclass
         OR c.conkey <> ARRAY[v_column]::smallint[]
         OR c.confkey <> ARRAY[v_ref_column]::smallint[])
  ) INTO v_wrong_shape;
  IF v_wrong_shape THEN
    RAISE EXCEPTION 'Tenancy preflight failed: school_memberships.school_id participates in an unexpected foreign key.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.school_memberships'::regclass AND c.contype = 'f'
       AND c.confrelid = 'public.schools'::regclass
       AND c.conkey = ARRAY[v_column]::smallint[]
       AND c.confkey = ARRAY[v_ref_column]::smallint[]
       AND (c.confdeltype <> 'c' OR NOT c.convalidated)
  ) INTO v_wrong_action;
  IF v_wrong_action THEN
    RAISE EXCEPTION 'Tenancy preflight failed: school_memberships.school_id FK delete action differs from CASCADE.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.school_memberships'::regclass AND c.contype = 'f'
       AND c.confrelid = 'public.schools'::regclass
       AND c.conkey = ARRAY[v_column]::smallint[]
       AND c.confkey = ARRAY[v_ref_column]::smallint[]
       AND c.confdeltype = 'c' AND c.convalidated
  ) THEN
    ALTER TABLE public.school_memberships ADD CONSTRAINT school_memberships_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;

  SELECT attnum INTO STRICT v_column FROM pg_attribute
   WHERE attrelid = 'public.school_memberships'::regclass AND attname = 'user_id' AND NOT attisdropped;
  SELECT attnum INTO STRICT v_ref_column FROM pg_attribute
   WHERE attrelid = 'public.users'::regclass AND attname = 'id' AND NOT attisdropped;
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.school_memberships'::regclass AND c.contype = 'f'
       AND v_column = ANY (c.conkey)
       AND (c.confrelid <> 'public.users'::regclass
         OR c.conkey <> ARRAY[v_column]::smallint[]
         OR c.confkey <> ARRAY[v_ref_column]::smallint[])
  ) INTO v_wrong_shape;
  IF v_wrong_shape THEN
    RAISE EXCEPTION 'Tenancy preflight failed: school_memberships.user_id participates in an unexpected foreign key.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.school_memberships'::regclass AND c.contype = 'f'
       AND c.confrelid = 'public.users'::regclass
       AND c.conkey = ARRAY[v_column]::smallint[]
       AND c.confkey = ARRAY[v_ref_column]::smallint[]
       AND (c.confdeltype <> 'c' OR NOT c.convalidated)
  ) INTO v_wrong_action;
  IF v_wrong_action THEN
    RAISE EXCEPTION 'Tenancy preflight failed: school_memberships.user_id FK delete action differs from CASCADE.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.school_memberships'::regclass AND c.contype = 'f'
       AND c.confrelid = 'public.users'::regclass
       AND c.conkey = ARRAY[v_column]::smallint[]
       AND c.confkey = ARRAY[v_ref_column]::smallint[]
       AND c.confdeltype = 'c' AND c.convalidated
  ) THEN
    ALTER TABLE public.school_memberships ADD CONSTRAINT school_memberships_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END;
$foreign_keys$;
CREATE UNIQUE INDEX IF NOT EXISTS school_memberships_school_user_key
  ON public.school_memberships (school_id, user_id);
CREATE INDEX IF NOT EXISTS school_memberships_user_id_idx
  ON public.school_memberships (user_id, is_active);

-- Add the organization-level membership table used by the staged helpers.
CREATE TABLE IF NOT EXISTS public.organization_memberships (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'operator', 'support')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_key
  ON public.organizations (slug);
CREATE UNIQUE INDEX IF NOT EXISTS schools_slug_key
  ON public.schools (slug);
CREATE UNIQUE INDEX IF NOT EXISTS schools_organization_id_name_key
  ON public.schools (organization_id, name);
CREATE INDEX IF NOT EXISTS schools_organization_id_idx
  ON public.schools (organization_id);
CREATE INDEX IF NOT EXISTS organization_memberships_user_id_idx
  ON public.organization_memberships (user_id, is_active);

-- Bootstrap the existing operator and its single school. This production
-- script asserts the source tenant tables are empty above, avoiding accidental
-- conflict resolution against a tenant created after the audit.
INSERT INTO public.organizations (name, slug)
VALUES ('Happy Management Enterprise', 'happy-management-enterprise');

INSERT INTO public.schools (organization_id, name, slug)
SELECT id, 'Happy Man Academy', 'happy-man-academy'
  FROM public.organizations
 WHERE slug = 'happy-management-enterprise';

ALTER TABLE public.organizations
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT organizations_status_check
    CHECK (status IN ('active', 'suspended', 'closed'));
ALTER TABLE public.schools
  ALTER COLUMN slug SET NOT NULL;

DO $school_status$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.schools'::regclass
       AND conname = 'schools_status_check'
  ) THEN
    ALTER TABLE public.schools
      ADD CONSTRAINT schools_status_check
      CHECK (status IN ('active', 'suspended', 'closed'));
  END IF;
END;
$school_status$;

-- Add and backfill a nullable school_id on each current public app table. The
-- nullable contract matches staging and preserves existing app insert flows.
DO $backfill$
DECLARE v_table record; v_school_id uuid;
BEGIN
  SELECT id INTO STRICT v_school_id
    FROM public.schools WHERE slug = 'happy-man-academy';

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
      left(v_table.table_name || '_school_id_idx', 63), v_table.table_name
    );
  END LOOP;
END;
$backfill$;

-- Every existing school user retains their current app role in the school.
INSERT INTO public.school_memberships (school_id, user_id, role)
SELECT s.id, u.id, u.role
  FROM public.schools s
 CROSS JOIN public.users u
 WHERE s.slug = 'happy-man-academy';

CREATE OR REPLACE FUNCTION private.has_org_access(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organization_memberships om
      JOIN public.users u ON u.id = om.user_id
      WHERE om.organization_id = p_organization_id AND om.is_active
        AND u.auth_user_id = (SELECT auth.uid())
    );
$function$;

CREATE OR REPLACE FUNCTION private.has_school_access(p_school_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.school_memberships sm
        JOIN public.users u ON u.id = sm.user_id
        WHERE sm.school_id = p_school_id AND sm.is_active
          AND u.auth_user_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.schools s
        JOIN public.organization_memberships om ON om.organization_id = s.organization_id
        JOIN public.users u ON u.id = om.user_id
        WHERE s.id = p_school_id AND om.is_active
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
CREATE POLICY organizations_read_member ON public.organizations FOR SELECT TO authenticated
  USING (private.has_org_access(id));
DROP POLICY IF EXISTS schools_read_member ON public.schools;
CREATE POLICY schools_read_member ON public.schools FOR SELECT TO authenticated
  USING (private.has_school_access(id));
DROP POLICY IF EXISTS organization_memberships_read_member ON public.organization_memberships;
CREATE POLICY organization_memberships_read_member ON public.organization_memberships
  FOR SELECT TO authenticated
  USING (user_id = public.public_user_id() OR private.has_org_access(organization_id));
DROP POLICY IF EXISTS school_memberships_read_member ON public.school_memberships;
CREATE POLICY school_memberships_read_member ON public.school_memberships FOR SELECT TO authenticated
  USING (user_id = public.public_user_id() OR private.has_school_access(school_id));

GRANT SELECT ON public.organizations, public.schools,
  public.organization_memberships, public.school_memberships TO authenticated;

CREATE OR REPLACE VIEW public.school_student_counts
WITH (security_invoker = true)
AS
SELECT s.id AS school_id, s.organization_id, s.name AS school_name,
       s.slug AS school_slug, s.status AS school_status,
       count(st.id)::bigint AS student_count
FROM public.schools s
LEFT JOIN public.students st ON st.school_id = s.id
WHERE private.has_school_access(s.id)
GROUP BY s.id, s.organization_id, s.name, s.slug, s.status;
REVOKE ALL ON public.school_student_counts FROM PUBLIC, anon;
GRANT SELECT ON public.school_student_counts TO authenticated;

COMMIT;

-- Backout plan: restore from the pre-change backup; do not drop school_id data
-- or restore the old memberships key after app writes have begun. No second
-- school should be created by this migration.
