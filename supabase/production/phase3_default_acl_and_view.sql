-- PRODUCTION ROLLOUT DRAFT — REVIEW BEFORE EXECUTION.
-- Target: happyman-academy (erlhyrswcqpqpqzbgmgb)
-- The class_subjects view statements below were applied on 2026-10-24.
-- The ALTER DEFAULT PRIVILEGES statements remain unapplied.
--
-- Live inventory confirms postgres-created public defaults currently grant
-- anon/authenticated/service_role broad table access, sequence USAGE/SELECT,
-- and function EXECUTE. Staging's postgres defaults already omit these grants.
-- This makes future migrations default-deny; each app table/function must
-- receive deliberate explicit grants in its migration.

BEGIN;

-- The class_subjects view is not referenced in the checked-in browser or
-- server source. Stop anonymous access and make underlying-table privileges
-- and RLS apply if it is intentionally granted in a later migration.
ALTER VIEW public.class_subjects SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON TABLE public.class_subjects
  FROM PUBLIC, anon, authenticated, service_role;

-- Match and strengthen staging's future-object posture for objects created by
-- postgres in public. Explicit grants in reviewed migrations remain the path
-- for app API access and service operations.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

COMMIT;

-- Verify future-default rows in pg_default_acl and view reloptions after
-- approval. Existing function EXECUTE grants are intentionally handled by the
-- separate routine inventory/reconciliation, not changed by default-ACL DDL.
