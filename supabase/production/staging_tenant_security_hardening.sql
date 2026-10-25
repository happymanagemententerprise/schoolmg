-- REVIEWED STAGING PATCH ONLY — do not run on production.
-- Adds a restrictive active-school guard to every public table with school_id
-- and removes table privileges that bypass RLS or allow schema-level changes.
-- The transaction aborts if schools.id, a school_id column, and the existing
-- private.has_school_access helper do not have compatible types.

BEGIN;

DO $tenant_hardening$
DECLARE
  v_school_id_type oid;
  v_school_id_type_name text;
  v_table record;
BEGIN
  SELECT a.atttypid, format_type(a.atttypid, a.atttypmod)
    INTO STRICT v_school_id_type, v_school_id_type_name
  FROM pg_attribute AS a
  WHERE a.attrelid = 'public.schools'::regclass
    AND a.attname = 'id'
    AND NOT a.attisdropped;

  IF v_school_id_type_name NOT IN ('bigint', 'uuid') THEN
    RAISE EXCEPTION 'Unsupported schools.id type: %', v_school_id_type_name;
  END IF;

  IF to_regprocedure(format('private.has_school_access(%s)', v_school_id_type_name)) IS NULL THEN
    RAISE EXCEPTION 'Missing private.has_school_access(%) helper; no changes applied.', v_school_id_type_name;
  END IF;

  FOR v_table IN
    SELECT c.relname AS table_name, a.atttypid AS school_id_type, c.relrowsecurity AS rls_enabled
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    JOIN pg_attribute AS a ON a.attrelid = c.oid AND a.attname = 'school_id' AND NOT a.attisdropped
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  LOOP
    IF v_table.school_id_type <> v_school_id_type THEN
      RAISE EXCEPTION 'public.%.school_id type does not match public.schools.id; no changes applied.', v_table.table_name;
    END IF;
    IF NOT v_table.rls_enabled THEN
      RAISE EXCEPTION 'RLS is not enabled on public.%; no changes applied.', v_table.table_name;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS hma_active_school_scope ON public.%I', v_table.table_name);
    EXECUTE format(
      'CREATE POLICY hma_active_school_scope ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (private.has_school_access(school_id)) WITH CHECK (private.has_school_access(school_id))',
      v_table.table_name
    );
  END LOOP;
END;
$tenant_hardening$;

-- These privileges bypass row policies or let API roles alter table behavior.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public
  FROM PUBLIC, anon, authenticated;

-- Prevent PostgreSQL-owned future public tables from inheriting these grants.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM PUBLIC, anon, authenticated;

COMMIT;
