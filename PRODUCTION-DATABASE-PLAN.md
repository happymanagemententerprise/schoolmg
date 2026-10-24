# Production database migration plan

**Primary project:** `happyman-academy` (`erlhyrswcqpqpqzbgmgb`)
**Staging project:** `fxakrqtybwlrjwlnylhq`
**Audit date:** 2026-10-21

This is a read-only pre-deployment audit. No production SQL or data was changed.

**Current connection note (2026-10-21):** no Supabase MCP tools are exposed, and no MCP
configuration was changed. A signed-in dashboard session was available for read-only checks on
Oct 21: production scheduler job and latest ten HTTP responses, and fresh production/staging schema
snapshots were verified. Work browser control then became unavailable before exporting/comparing
the complete staging and production policy signatures or validating drafts on staging. Restore
browser control in Work settings to continue; no dashboard credentials need to be reconfigured.
The local Supabase CLI also cannot inspect the database because neither Docker nor Podman is
installed/on PATH. A fresh static scan of `server/index.js` on Oct 21 confirms every referenced
table and operation is present in the phase-two service-role grant draft; staging execution and
runtime verification remain required.

## Findings

- The frontend's default Supabase URL points to the primary project. The staging project is separate.
- The repository contains 22 migration files. The primary database's migration ledger records only
  `20261020214425 enable_pg_cron_scheduler`; none of the 22 local files use that migration version.
- The primary project has 53 public tables, 419 public columns, and 123 public RLS policies. RLS is
  enabled on all 53 tables. Staging has 54 tables, 491 columns, and 127 policies.
- Staging includes `organization_memberships`, slug/settings fields, and school IDs on application
  tables. Production has only partial tenancy tables: `organizations` (id/name), `schools`
  (id/organization_id/name/status/created_at), and `school_memberships` (user_id/school_id/role).
  These tables are empty in production; `organization_memberships` and the other 51 application
  `school_id` columns are absent. Production's existing `school_memberships` has an old composite
  primary key and a `school_admin` role check, unlike staging's identity key and app role values.
  Do not replay the tenancy migration unchanged: its `CREATE TABLE IF NOT EXISTS` statements do not
  repair these existing shapes, and the bootstrap insert of `admin` will fail the production check.
  Do not provision a second school before active-school context and tenant-scoped policies exist.
- Production directly grants anon broad operations on 49–51 public relations by privilege; staging
  grants anon no SELECT/INSERT/UPDATE/DELETE. The exact per-role relation and column grant summary
  was compared live on 2026-10-21. Production's `class_subjects` view lacks `security_invoker` and is
  granted to anon; local source search found no frontend/server use of that view.
- Production's table grants are broad for the other API roles too: anon and authenticated each have
  full privileges on 48 public relations, with partial grants on `users`, `lms_questions`, and
  `lms_attempts`; service_role has full privileges on all 54 relations. Staging grants authenticated
  table operations per RLS policy, and full service_role table privileges only on its 10 backend
  tables, plus SELECT and column-limited profile linking on `users`.
- Production's `postgres` default ACLs give anon, authenticated, and service_role all table
  operations plus sequence access and function EXECUTE on future public objects. Staging's
  `postgres` defaults omit SELECT/INSERT/UPDATE/DELETE, sequence privileges, and function EXECUTE
  for those roles, but still retain TRUNCATE/REFERENCES/TRIGGER/MAINTAIN table grants. The broad
  `supabase_admin` defaults are the same in both projects, so reconcile the `postgres` defaults
  first and don't change `supabase_admin` without a separate reason. Prefer revoking anon access
  entirely and explicitly granting only required authenticated/service_role privileges.
- Production `student_positions(bigint,bigint)` is `SECURITY DEFINER`, uses `search_path=public`,
  and is executable by anon and authenticated. Its body returns school-wide student identifiers,
  ranks, and score averages without an admin check. This was re-verified in the live production
  catalog on 2026-10-21. The staged local migration `20261019094328_grade_subject_access.sql`
  contains a `SECURITY INVOKER` implementation with an admin check and revokes anon/PUBLIC execute.
  Staging was also re-checked live: the routine has an empty search path, filters to admins, and
  denies anon execute. This is the highest-priority production fix.
- A routine-level live comparison confirms `student_positions` is the only public SECURITY DEFINER
  function currently executable by anon in production that returns school data. Other app SECURITY
  DEFINER routines deny anon and allow authenticated; both projects still expose a few
  non-definer helpers to anon by the default PUBLIC execute grant (for example `app_user_id`,
  `app_user_role`, and `hma_initials`). Future default EXECUTE hardening is drafted separately in
  `supabase/production/phase3_default_acl_and_view.sql`.
- Production grade SELECT/INSERT/UPDATE policies also remain broader than staging: any teacher class
  ID grants access across subjects. Staging's `teacher_can_read_grade` and `teacher_can_write_grade`
  functions limit subject teachers to their assigned subjects and preserve class-teacher read access.
- The primary has the `users.auth_user_id` column and service-role permissions to read user profiles
  and update that link. That part of provisioning is already present.
- An exact live Data API privilege summary was run against both projects on 2026-10-21. Production
  grants anon CRUD on 49 relations, anon SELECT/DELETE on two more, and broad authenticated CRUD on
  essentially all app relations; staging grants anon no CRUD. Staging's authenticated CRUD grants
  follow its RLS policy commands (SELECT on 51 relations, INSERT on 37, UPDATE on 35, DELETE on 2),
  with special exceptions for `users` and `lms_questions`.
- **Correction to the initial least-privilege target:** staging currently grants `service_role` full
  CRUD on only 10 operational tables, plus SELECT and `UPDATE(auth_user_id)` on `users`. The
  checked-in Node API in `server/index.js` uses its service-role client on a wider set: it also reads
  `parent_students`, `students`, `classes`, `subjects`, `terms`, `teacher_classes`,
  `teacher_subjects`, `time_slots`, and `timetables`; creates `users`; updates only
  `students.residence_status`/`hostel_id`; and performs limited reads/writes on the 10 backend
  tables. Embedded PostgREST relationships require SELECT on joined tables too. Matching the
  current staging service-role grants alone would therefore break multiple API routes and account
  provisioning. The new `supabase/production/phase2_runtime_grants.sql` draft restores only the
  reviewed runtime operations after revoking production's blanket service-role grants; it has not
  been applied. Before changing production, either stage and verify this runtime-specific set or
  refactor the server to use caller-scoped JWT clients and RLS.
- The staging project does not grant anon or authenticated SELECT on `class_subjects`, and the
  checked-in app does not reference it. `phase3_default_acl_and_view.sql` makes it security-invoker,
  revokes its grants, and narrows future `postgres`-created public table, sequence, and function
  defaults. This draft has not been applied.
- The first tenancy migration's private `has_school_access` helper checks whether a user has a school
  membership but does not test `school_memberships.is_active`. Production's phase-four draft already
  does check that flag. The forward correction `20261021163930_active_school_membership_access.sql`
  now fixes staging/fresh installs; it is not yet applied or validated on staging. The read-only audit
  was extended to include private tenancy helper definitions and grants because the public routine
  inventory did not cover these authorization functions.

## Recommended rollout

1. Capture and verify a restorable production backup. The partial tenancy tables were empty in the
   live audit, but the phase-four draft rechecks that condition inside its transaction and aborts if
   it has changed.
2. Review and validate the forward SQL on staging first. The current four drafts are under
   `supabase/production/`; they are review scripts, not migration-history entries. Compose approved
   production migration(s) only after the catalog diff, staging validation, backup, and execution
   order are approved. The Supabase CLI wrapper at `node_modules/.bin/supabase.cmd` works with
   `SUPABASE_TELEMETRY_DISABLED=1` set for the process. A read-only `supabase projects list`
   returned `AccessTokenRequiredError`; no `SUPABASE_ACCESS_TOKEN` is set in this process. Do not
   log in with or request a broad token here; an authorized user can provide a scoped access path or
   use the signed-in dashboard after the full diff and backup are verified.
3. Apply the grading/rankings change from `phase1_grading_and_rankings.sql`: missing columns and
   constraints first, then the safer `student_positions` function and subject-scoped grade policies.
   Keep the four frontend RPCs available: `admin_update_user`, `lms_questions_for_current_user`,
   `student_positions`, and `submit_lms_quiz`.
4. Apply `phase3_default_acl_and_view.sql` before creating new production objects. This revokes
   anon/role defaults for future postgres-owned public tables, sequences, and functions and closes
   the unused `class_subjects` view.
5. Apply `phase4_tenancy_reconciliation.sql` only after checking estimated public table sizes and
   planning for its `school_id` backfill/indexes. It repairs the existing table shapes, keeps the
   tenant at one school, and leaves the field nullable as in staging.
6. Apply `phase2_runtime_grants.sql` only after confirming the live Node API uses the reviewed
   `server/index.js` contract. It removes anon table/sequence access and reduces service-role access
   to route-required tables/columns; authenticated grants still need a complete policy review.
7. After approval, verify anonymous denial, role-scoped reads/writes, the four frontend RPCs,
   backend API routes, scheduler, push, and normal login/app flows. Do not seed production.

Do not push all 22 files blindly: the primary schema already contains many of their objects, so
replaying the initial schema and older migrations may collide with existing objects or replace
policies without a verified need. Only repair migration history after confirming each migration's
effects are already present; `migration repair` changes history only and does not execute SQL.
Never run `supabase/seed.sql` on production.

## References

- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase database backups](https://supabase.com/docs/guides/platform/backups)
