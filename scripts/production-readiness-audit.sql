-- Read-only production/staging comparison. Run this file separately against
-- each Supabase project, then compare the returned rows. It performs no DDL or
-- DML and is intended to close the per-object gaps in TODO.md.

-- 1) Table and view grants by relation, role, and privilege.
SELECT table_name, grantee, privilege_type, is_grantable
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type;

-- 2) Column-specific grants (important for protected fields such as
-- users.auth_user_id and students.residence_status).
SELECT table_name, column_name, grantee, privilege_type, is_grantable
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_name, column_name, grantee, privilege_type;

-- 3) View security mode and direct grants.
SELECT c.relname AS view_name,
       coalesce(c.reloptions, ARRAY[]::text[]) AS options,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
       has_table_privilege('service_role', c.oid, 'SELECT') AS service_role_select,
       pg_get_viewdef(c.oid, true) AS definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
ORDER BY c.relname;

-- 4) Public routine identities, security mode, effective execute grants, and
-- configured function settings (including search_path).
SELECT p.proname,
       p.prokind,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       p.prosecdef AS security_definer,
       coalesce(p.proconfig, ARRAY[]::text[]) AS settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- 5) Default privileges for future objects. Compare owners separately because
-- Supabase projects can use different migration/object owners.
SELECT coalesce(n.nspname, '<all schemas>') AS schema_name,
       owner_role.rolname AS object_owner,
       d.defaclobjtype,
       d.defaclacl::text AS default_acl
FROM pg_default_acl d
JOIN pg_roles owner_role ON owner_role.oid = d.defaclrole
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public' OR d.defaclnamespace = 0
ORDER BY schema_name, object_owner, d.defaclobjtype;

-- 6) Existing tenancy-table columns, defaults, constraints, and indexes.
SELECT table_name, column_name, data_type, is_nullable, column_default, is_identity
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('organizations', 'schools', 'organization_memberships', 'school_memberships')
ORDER BY table_name, ordinal_position;

SELECT c.relname AS table_name,
       con.conname AS constraint_name,
       con.contype AS constraint_type,
       con.convalidated AS validated,
       pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('organizations', 'schools', 'organization_memberships', 'school_memberships')
ORDER BY c.relname, con.conname;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('organizations', 'schools', 'organization_memberships', 'school_memberships')
ORDER BY tablename, indexname;

-- 7) Current role values and duplicate membership keys. These identify data
-- conditions a forward migration must preserve or resolve explicitly.
SELECT role, count(*) AS user_count
FROM public.users
GROUP BY role
ORDER BY role;

SELECT school_id, user_id, count(*) AS duplicate_count
FROM public.school_memberships
GROUP BY school_id, user_id
HAVING count(*) > 1
ORDER BY school_id, user_id;

-- 8) Complete RLS policy signatures. Run on both projects and compare by
-- (table_name, policy_name); comparing only counts or policy names misses
-- differences in roles, commands, USING, and WITH CHECK expressions.
SELECT tablename AS table_name,
       policyname AS policy_name,
       permissive,
       roles,
       cmd,
       qual AS using_expression,
       with_check AS check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 9) Approximate table size for planning the tenancy school_id backfill and
-- its index creation. reltuples is a planner estimate, not an exact row count.
SELECT c.relname AS table_name,
       greatest(c.reltuples, 0)::bigint AS estimated_rows,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY pg_total_relation_size(c.oid) DESC, c.relname;

-- 10) Private tenancy authorization helpers. These routines are intentionally
-- outside the public routine inventory above, but their security mode, fixed
-- search_path, body predicates, schema access, and execute grants determine
-- whether membership revocation and tenant reads are safe. Run on both DBs.
SELECT n.nspname AS schema_name,
       p.proname AS routine_name,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       p.prosecdef AS security_definer,
       coalesce(p.proconfig, ARRAY[]::text[]) AS settings,
       has_schema_privilege('anon', n.oid, 'USAGE') AS anon_schema_usage,
       has_schema_privilege('authenticated', n.oid, 'USAGE') AS authenticated_schema_usage,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'private'
  AND p.proname IN ('has_org_access', 'has_school_access')
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);
