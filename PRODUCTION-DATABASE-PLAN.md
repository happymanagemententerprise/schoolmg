# Production database migration plan

**Primary project:** `happyman-academy` (`erlhyrswcqpqpqzbgmgb`)
**Staging project:** `fxakrqtybwlrjwlnylhq`
**Original audit date:** 2026-10-21
**Last verified update:** 2026-10-24

## Release-readiness continuation — 2026-10-25

- The owner explicitly instructed **do not clean the database**. Production data was
  preserved. The production database currently has one school and 12 students.
- Production schema has `schools.id uuid`, 54 application `school_id` columns of type
  `uuid`, and the active-membership predicate is already present in
  `private.has_school_access(uuid)`. Its migration ledger still contains only four
  differently named entries, so do not run `supabase db push` or replay migrations
  1–22 blindly. Migration 22's UUID helper is already effective in production but is
  incompatible with staging's `schools.id bigint` schema.
- Staging was brought to default-deny for anonymous table/sequence access through the
  SQL Editor. Verification returned zero anon table grants, zero anon sequence grants,
  no direct `lms_questions` SELECT privilege or SELECT policy, and no anon EXECUTE on
  `student_positions`. Its subject-scoped grade-write policy remained intact.
- Production was updated through a guarded SQL Editor transaction after data preflight:
  all existing CA/exam values fit 40/60, attendance statuses were valid, and there is
  one school. The change added nullable `grades.midterm_score` (0–20), constrained CA
  to 0–40, added nullable `attendance_daily.attendance_date`, and checked status values.
  It also revoked PUBLIC/anon table and sequence access, set postgres future-object
  defaults to deny PUBLIC/anon access, removed direct quiz-question reads, installed
  subject-scoped grade policies, and changed `student_positions` to SECURITY INVOKER
  with an empty search path and authenticated-only execution. No records were deleted.
- Production verification returned zero anon table grants and sequence grants; no
  direct authenticated/anon SELECT grants or SELECT policy on `lms_questions`;
  `student_positions` is not SECURITY DEFINER, uses an empty search path, denies anon
  execution, and allows authenticated execution; grade writes call
  `teacher_can_write_grade(class_id, subject_id)`; the active-school helper checks
  `school_memberships.is_active`; the production count remains one school and 12
  students. The SQL Editor changes are not yet represented by a matching local
  timestamped migration entry. Reconcile migration history before any future CLI push.
- Production scheduler recheck: `campus-scheduler-tick` is active once per minute,
  both required Vault secret names are present, and the three latest HTTP calls all
  returned 204 without timeout or error.
- Cloudflare Pages `happyman-academy` is connected to GitHub repository
  `happymanagemententerprise/schoolmg`, builds `npm run build` to `dist` from repository
  root, and deploys `main`. The production variable `VITE_CAMPUS_API_URL` is already set
  to the live Supabase `campus-api` URL. VAPID private key is configured as an encrypted
  Cloudflare secret and is not Vite-prefixed; no service-role or Twilio secret appeared
  among the Pages variables inspected. Supabase Edge Function secrets include the
  scheduler secret and VAPID keys, while Twilio credentials were not present in the
  custom-secret inventory; SMS therefore still needs Twilio setup before it can be
  offered as an active feature. `.env.production` now supplies the same public
  endpoint in Vite production builds and `.gitignore` explicitly allows that public
  config file.
- Backend tenant isolation is still **not complete**. Browser Supabase queries scope
  tables to the selected school and RLS policies have a restrictive school boundary,
  but `server/index.js` and `supabase/functions/campus-api/index.ts` still use the
  service-role client, bypass RLS, and do not carry/validate the active school on each
  request. Do not onboard a second school or claim full School A/School B isolation
  until these service-role routes are refactored and tested with two schools.
- A production Vite build was attempted but esbuild could not read the workspace's
  ancestor directory in the Windows sandbox (`Access is denied` while loading
  `vite.config.js`). This is an environment limitation, not a source diagnostic. The
  local bundle and release commit therefore still need validation outside this sandbox.
- The Oct 24 backup's archive checks passed, but its restore rehearsal and external-drive
  copy verification remain outstanding. No production deployment or live role workflow
  was performed in this continuation.

## Ship-readiness check — 2026-10-24

- A fresh project-by-project comparison confirms production `happyman-academy`
  (`erlhyrswcqpqpqzbgmgb`) is PostgreSQL 17.6 with `schools.id uuid` and the SaaS
  subscription/platform tables and dashboard view present. Staging `happyman-academy-staging`
  (`fxakrqtybwlrjwlnylhq`) is PostgreSQL 17.11 with `schools.id bigint`,
  `organizations.id bigint`, and 52 application `school_id` columns of type `bigint`; it has
  none of `platform_memberships`, `school_subscriptions`, `subscription_plans`, or
  `platform_school_dashboard`. It is not safe to replay the UUID production migration there.
  Staging contains one organization, one school, 36 school memberships, 36 user profiles, and 12
  students; preserve these records while aligning the school key types.
- The same read-only check found zero anon SELECT/INSERT/UPDATE/DELETE table grants across
  staging's 56 public relations. Production has anon SELECT and INSERT on 52 relations, UPDATE
  on 51, and DELETE on 53 of 61 public relations. Production's `platform_school_dashboard`
  remains `security_invoker=false` but has no anon privileges. Production `student_positions`
  remains `SECURITY DEFINER` with `search_path=public` and anon EXECUTE. These permissions and
  function issues still need a staging-compatible validation plan before production changes.
- Source review found the browser app applies active-school filters, but both server API copies
  (`server/index.js` and `supabase/functions/campus-api/index.ts`) use a service-role client that
  bypasses RLS and do not validate or filter by an active school. This is a cross-school isolation
  blocker before provisioning a second school.
- Local demo smoke checks reached Administrator people (12 student demo records), Parent, Student
  results/attendance, Class Teacher class overview/attendance, and the subject leaderboard. They
  surfaced `NaN%` on the Parent combined-attendance card and the same string-to-number conversion
  in admin analytics and class overview; the app code now parses the percentage string explicitly.
  The production build succeeds after that change. These demo checks do not establish live Auth or
  database behavior.

- Production (`happyman-academy`, `erlhyrswcqpqpqzbgmgb`) is on the Supabase Free plan, which has
  no scheduled backups. The owner supplied a logical export at
  `C:\Users\HAPPY\Downloads\happyman-academy-backup.dump`. The Oct 24 file is 787,594 bytes;
  `pg_restore --list` exits 0 with 1,355 TOC entries, and full stream extraction exits 0. Its
  inventory has 58 public tables/data entries, 16 functions, 3 views, and 180 policies, matching
  the latest production catalog counts. The external-drive copy of this new file has not been
  independently verified. Its local restore rehearsal is still outstanding. The archive omits
  real Auth/Storage and other Supabase-managed services.
- A fresh production catalog query found 58 public tables, 16 functions, 3 views, 180 policies,
  `student_positions` as `SECURITY DEFINER` with `search_path=public` and anon EXECUTE, and
  `platform_school_dashboard` as `security_invoker=false`. Anon has broad CRUD grants on 51–53
  relations. These production risks remain open.
- A fresh staging catalog query verified `public.class_subjects` has
  `security_invoker=true` and no SELECT for anon, authenticated, or PUBLIC. Production's same
  view change was also previously verified on Oct 24.
- Staging still lacks `platform_memberships`, `school_subscriptions`, and `subscription_plans`,
  blocking staging validation of the SaaS-owner dashboard migration.
- The production build now succeeds with `pnpm run build` after restoring the declared dependencies.
  The bundle reports only chunk-splitting warnings. The local preview renders the login screen;
  the local Administrator demo opens the dashboard, lists all 12 demo students, and the Add person
  modal's X closes correctly. These are local demo checks, not authenticated production checks.
  Authenticated role flows and a Cloudflare release still need verification.
- Supabase continued to show its technical-issue banner during the check, but read-only SQL queries
  completed on both production and staging.

## Fresh production recheck — 2026-10-24

- The Oct 22 dump passed a restore rehearsal into an isolated PostgreSQL 17.11 cluster using
  local-only Auth stubs and synthetic IDs. The newer Oct 24 dump passed archive listing and full
  stream checks and matches live production object counts. A restore rehearsal for the new dump
  was attempted, but the Codex Windows sandbox could not start the local PostgreSQL server
  (`pg_ctl` restricted-token error); the temporary cluster was removed. Complete that rehearsal
  on a local PostgreSQL 17 installation outside this restricted environment before relying on the
  new dump for recovery. Neither archive contains real Auth identities, Storage, Edge Functions,
  or project settings.
- Current production counts: 1 organization, 1 school, 34 school memberships, 1 organization
  membership, 1 active platform membership, 0 school subscriptions, 3 plan rows, and 12 students.
  Prices are Basic 2,000 NGN, Standard 3,500 NGN, Premium 5,000 NGN. No plan is assigned to the
  existing school yet.
- `school_id` is non-null and has no default on all 50 application data tables checked. Each of
  those tables has RLS and a policy using the school-access helper. There is one school only.
  The app already loads the authenticated user's accessible schools, persists an active-school
  choice, scopes application queries by that school, and shows a selector when multiple schools
  are available. Cross-school runtime isolation still needs verification with a second school.
  The existing
  `phase4_tenancy_reconciliation.sql` is stale: its empty-table bootstrap assumptions are false.
  The organization `slug`/`status` and school `slug`/`settings` fields are absent; only reconcile
  these if the app requires them.
- Production still exposes `student_positions` as `SECURITY DEFINER` with `search_path=public` and
  anon EXECUTE. The platform dashboard view remains `security_invoker=false` (anon SELECT denied,
  authenticated SELECT allowed); its private-function replacement is not applied and cannot yet
  be tested on staging because the staging project lacks the SaaS tables.
- Production still directly grants anon CRUD on 51–53 relations (SELECT on 52, INSERT on 52,
  UPDATE on 51, DELETE on 53); authenticated has CRUD on 53–55 relations. Three RLS-enabled
  control tables have no policies: `organizations`, `organization_memberships`, and
  `platform_owner_invites`. The checked-in app does not query `platform_owner_invites`.
- Approximate public database size is 3.7 MB / 1,078 rows. This is a small backfill volume, but it
  does not remove the need to validate the partially reconciled tenant schema and API behavior.
- `pnpm run build` now succeeds after restoring the declared dependencies. Vite reports chunk
  splitting warnings, but emitted the production bundle. The local preview login screen renders;
  authenticated role flows and Cloudflare release checks remain open.

## Update — 2026-10-24

- The owner supplied a new local production dump after confirming Supabase Free has no scheduled
  backups. `pg_restore` 17.11 verified its PostgreSQL 17.6 custom archive, 1,355 TOC entries, and
  full stream extraction. Its 58 tables, 16 functions, 3 views, and 180 policies match current
  production inventory counts. A local restore rehearsal could not start because the Codex Windows
  sandbox denied PostgreSQL's restricted-token process launch; its temporary cluster was removed.
  The older Oct 22 archive had passed a local rehearsal. Verify the new archive with a local restore
  outside this sandbox before relying on it as a recovery point.

- In both production (`erlhyrswcqpqpqzbgmgb`) and staging (`fxakrqtybwlrjwlnylhq`),
  `public.class_subjects` now has `security_invoker=true`; SELECT was revoked from `PUBLIC`,
  `anon`, `authenticated`, and `service_role`. Production's resulting grants were verified, and
  source search found no app query dependency on this view. This was applied directly in each
  Supabase SQL editor; it is not yet recorded as an app migration.
- Production's `platform_school_dashboard` still uses a `SECURITY DEFINER` view. It has no anon or
  PUBLIC SELECT grant and filters rows to the caller's active `saas_owner` membership. A tested,
  rollback-only replacement using an invoker view and private membership-checked function is drafted
  in `supabase/migrations/20261024011813_secure_platform_school_dashboard.sql`; it is not applied.
- The staging project does not yet contain `platform_memberships`, `school_subscriptions`, or
  `subscription_plans`, so the SaaS-owner dashboard migration cannot be validated there until the
  subscription schema is migrated to staging.
- The production dashboard showed “No backups” in its latest-backup panel during this check. Confirm
  that a restorable backup exists before applying the remaining production SQL changes. The Oct 24
  Backups page check confirmed this is because the project is on the Free plan, which has no
  scheduled project backups.
- The production/staging differences and privilege findings below are the Oct 21 audit snapshot;
  refresh them after the subscription schema is synchronized.

The Oct 21 section below is a historical, read-only snapshot. The Oct 24 `class_subjects` view
change was applied to both live projects; no production data was changed. Other draft SQL noted
below has not been applied unless explicitly stated.

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
  was compared live on 2026-10-21. The `class_subjects` issue from that snapshot was fixed on Oct 24
  in both projects; the remaining broad grants still need a current re-check and remediation.
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
- The checked-in app does not reference `class_subjects`. Its view security and grants were fixed
  directly in both live projects on Oct 24. The remaining default-ACL statements in
  `phase3_default_acl_and_view.sql` narrow future `postgres`-created public table, sequence, and
  function defaults; those statements have not been applied.
- The first tenancy migration's private `has_school_access` helper checks whether a user has a school
  membership but does not test `school_memberships.is_active`. Production's phase-four draft already
  does check that flag. The forward correction `20261021163930_active_school_membership_access.sql`
  now fixes staging/fresh installs; it is not yet applied or validated on staging. The read-only audit
  was extended to include private tenancy helper definitions and grants because the public routine
  inventory did not cover these authorization functions.

## Recommended rollout

1. Capture and restore-test a fresh production backup. The Downloads dump passes a public-schema
   restore rehearsal but predates five live tables, two views, one function, and 57 policies; it is
   not a current recovery point for another production rollout.
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
4. Review the remaining default-ACL statements in `phase3_default_acl_and_view.sql` before creating
   new production objects. The `class_subjects` view statements in that file were already applied
   directly to both projects on Oct 24; do not treat them as pending work. Validate and apply only
   the unapplied default-ACL portion after reviewing the exact SQL.
5. Do not apply the current `phase4_tenancy_reconciliation.sql`; its empty-table bootstrap
   assumptions are false. Reconcile missing organization/school metadata only after confirming the
   app needs it. Keep one school until active-school context and tenant-scoped behavior are tested.
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
