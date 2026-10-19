-- The staging project was created with automatic Data API grants disabled.
-- Grant authenticated only the table operations represented by its RLS
-- policies. Policies continue to decide which rows each user can access.
-- Tables that are intentionally RPC-only or backend-only have no policies
-- for authenticated and receive no table grants here.

GRANT USAGE ON SCHEMA public TO authenticated;

DO $migration$
DECLARE
  v_table record;
  v_privileges text;
  v_sequence record;
BEGIN
  FOR v_table IN
    SELECT p.tablename,
           bool_or(p.cmd IN ('SELECT', 'ALL')) AS can_select,
           bool_or(p.cmd IN ('INSERT', 'ALL')) AS can_insert,
           bool_or(p.cmd IN ('UPDATE', 'ALL')) AS can_update,
           bool_or(p.cmd IN ('DELETE', 'ALL')) AS can_delete
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND 'authenticated' = ANY (p.roles)
     GROUP BY p.tablename
  LOOP
    v_privileges := concat_ws(', ',
      CASE WHEN v_table.can_select AND v_table.tablename <> 'lms_questions' THEN 'SELECT' END,
      CASE WHEN v_table.can_insert THEN 'INSERT' END,
      CASE WHEN v_table.can_update AND v_table.tablename <> 'users' THEN 'UPDATE' END,
      CASE WHEN v_table.can_delete THEN 'DELETE' END
    );

    IF v_privileges <> '' THEN
      EXECUTE format('GRANT %s ON TABLE public.%I TO authenticated', v_privileges, v_table.tablename);
    END IF;
  END LOOP;

  -- Inserts that use serial/identity defaults also need sequence privileges.
  -- Limit these grants to sequences owned by tables with authenticated INSERT
  -- policies; backend-only sequences remain private.
  FOR v_sequence IN
    SELECT DISTINCT seq_ns.nspname AS sequence_schema, seq.relname AS sequence_name
      FROM pg_class seq
      JOIN pg_namespace seq_ns ON seq_ns.oid = seq.relnamespace
      JOIN pg_depend dep ON dep.objid = seq.oid AND dep.deptype IN ('a', 'i')
      JOIN pg_class tbl ON tbl.oid = dep.refobjid
      JOIN pg_namespace tbl_ns ON tbl_ns.oid = tbl.relnamespace
      JOIN pg_policies p ON p.schemaname = tbl_ns.nspname
                       AND p.tablename = tbl.relname
                       AND p.cmd IN ('INSERT', 'ALL')
                       AND 'authenticated' = ANY (p.roles)
     WHERE seq.relkind = 'S'
       AND seq_ns.nspname = 'public'
       AND tbl_ns.nspname = 'public'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I.%I TO authenticated',
                   v_sequence.sequence_schema, v_sequence.sequence_name);
  END LOOP;
END;
$migration$;

-- This table intentionally exposes question content through a security
-- definer RPC so students cannot fetch correct answers from the base table.
REVOKE SELECT ON public.lms_questions FROM PUBLIC, anon, authenticated;

-- User profiles are readable through row policies. Updates remain limited to
-- the explicitly granted profile columns from the security-hardening migration.
REVOKE UPDATE ON public.users FROM PUBLIC, anon, authenticated;
GRANT UPDATE (name, phone, initials, tone, mentor_subject, mentor_bio)
  ON public.users TO authenticated;
