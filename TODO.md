# Production release checklist

Production launch is blocked until its live database objects, Auth setup, access policies, deployment variables, and app behavior are reconciled with the reviewed staging release.

## Finish target: Saturday, October 24, 2026

Treat Saturday evening as the release cutoff, with Sunday as buffer. Do not count a gate as done without evidence.

- [x] **Wed Oct 21:** finish the local release audit and isolate user-dependent access steps. Tightened phase-four FK preconditions and produced a successful local production bundle, including the corrected print watermark path. No automated tests or production SQL were run.
- [ ] **Thu Oct 22 (in progress):** dashboard access has been restored without MCP changes and fresh read-only counts/routine/view/scheduler checks completed. The owner confirmed the manual backup came from production; complete its object-list comparison and isolated restore rehearsal, then finish the schema diff and stage-validate drafts.
- [ ] **Fri Oct 23:** reconcile the migration-history plan, apply only reviewed and explicitly approved production changes using the supported migration workflow, then verify data/policies/grants and deploy the matching app build.
- [ ] **Sat Oct 24:** smoke-check real production sign-in and administrator, teacher, student, linked-parent, attendance, scheduler, and push flows; fix launch blockers and make the ship/hold decision.
- [ ] If Supabase access, staging validation, or a recoverable backup is unavailable by Thursday, keep production changes on hold and use Saturday for a safe, tested local/staging release candidate instead of claiming production readiness.

### Scheduler evidence

- Live production query on Oct 21: `cron.job` contains active job ID 1, `campus-scheduler-tick`, schedule `* * * * *`.
- Live production query on Oct 21: latest ten `net._http_response` entries are HTTP 204, `timed_out = false`, at consecutive one-minute intervals. This proves repeated successful HTTP responses, not end-to-end notification delivery or every scheduled business action.
- **Oct 22 refresh (read-only, production):** latest ten `net._http_response` rows (IDs 1533–1524) all show status 204, `error_msg = NULL`, and `timed_out = false`, at one-minute intervals from 05:28 to 05:37 UTC. This confirms the scheduler endpoint is still responding successfully. A separate query returning “Success. No rows returned” only means that query found no matching rows; it is not itself a scheduler failure signal.
- Static review found the scheduler ignored errors from hostel auto-checkout event inserts and daily summary upserts, allowing false 204 success. Both the Edge Function and mirrored Node API now throw on those write failures; this local fix still needs review, staging validation, and deployment before it changes production behavior. Push provider failures remain best-effort and require device-level delivery verification.
- Live staging/production snapshots on Oct 21 reconfirmed staging at 21 migrations / 54 public tables / 491 public columns / 127 policies / 15 routines / 52 tables with `school_id`, and production at 1 migration / 53 public tables / 419 columns / 123 policies / 13 routines / 1 table with `school_id`. The new local migration 22 was created after this snapshot and remains unapplied.
- The dashboard was signed in for these read-only queries. Work browser control then became unavailable before the policy export could be captured and compared; no production changes were made. Re-enable browser control in Work settings to continue the live policy/staging comparison. No MCP configuration change is needed.
- Oct 22 update: browser control is working again. Both Supabase project pages report Healthy, and read-only SQL queries succeeded. Supabase displayed a service-incident banner during the session.
- A read-only request to the production health endpoint from this workspace was blocked by OS/network socket permissions on Oct 21; no live state was changed. Continue from the existing dashboard session when browser control is available.
- The local production build now succeeds via `node node_modules/vite/bin/vite.js build` when workspace package-path access is available. It bundles the print watermark after fixing its CSS path; the npm launcher itself still lacks `npm-cli.js`.
- The local Supabase CLI cannot inspect or start the database because neither Docker nor Podman is installed/on PATH. Database migration tests therefore still require the signed-in remote staging dashboard or a container runtime.

## In progress

- [x] Draft phase-one production SQL for grade/attendance compatibility, admin-only rankings, and subject-scoped teacher grade access in [`supabase/production/phase1_grading_and_rankings.sql`](supabase/production/phase1_grading_and_rankings.sql). This remains unapplied and needs final review/approval plus a backup before production execution.
- [x] Compare staging service-role grants with every checked-in `server/index.js` table call. Identified and drafted the missing runtime-specific rights in [`supabase/production/phase2_runtime_grants.sql`](supabase/production/phase2_runtime_grants.sql); it has not been applied and must be staged/verified before production privilege changes.
- [x] Re-scan the current Node API table operations on Oct 21 against phase two: all read, insert, update, upsert, and cleanup-delete operations are covered by the draft. This is static coverage only; validate on staging before use.
- [x] Compare public routine execute grants, security mode, and search paths in production and staging. `student_positions` is the user-data `SECURITY DEFINER` routine exposed to anon in production; staging makes it invoker-mode and admin-only. The routine fix is in phase one; future defaults and the unused view are drafted in [`supabase/production/phase3_default_acl_and_view.sql`](supabase/production/phase3_default_acl_and_view.sql).
- [x] Draft a forward repair for production's empty partial tenancy tables in [`supabase/production/phase4_tenancy_reconciliation.sql`](supabase/production/phase4_tenancy_reconciliation.sql). It aborts if the tables or app roles no longer match the audited preconditions, and backfills one school only; it remains unapplied.
- [ ] Finish the object-by-object production-versus-staging schema and policy diff. The read-only inventory found substantial drift (details below); no production schema changes have been made.
- [ ] Prepare a migration-by-migration rollout plan using the live schema as the baseline. Do not blindly replay migrations: production's migration history is incomplete and its current schema already contains some objects.
- [x] Compare production and staging table/column grants before changing production access. Production grants anon CRUD on 49–51 relations by privilege, authenticated CRUD on 49–51, and service_role CRUD on all 54. Staging has no anon CRUD; authenticated grants are SELECT on 51 / INSERT on 37 / UPDATE on 35 / DELETE on 2; service_role has CRUD on 10 backend tables and SELECT plus column-limited profile linking on `users`.
- [ ] Replace production's overbroad anon, authenticated, and service_role grants with reviewed least-privilege access. Anonymous access and service-role runtime privileges have draft SQL; authenticated table grants and default ACLs still require the complete policy/routine review.
- [x] Prepare a forward plan for production `postgres` default ACLs and the unused `class_subjects` view in [`supabase/production/phase3_default_acl_and_view.sql`](supabase/production/phase3_default_acl_and_view.sql). `supabase_admin` defaults are broad in both projects and are intentionally left unchanged.
- [ ] Reconcile the existing empty production tenancy tables before applying the tenancy foundation: production `school_memberships` has a composite `(user_id, school_id)` primary key and accepts `school_admin`, while staging uses an identity `id`, a unique `(school_id, user_id)` key, and the app's `admin` role. Production `organizations` and `schools` are currently empty but lack the newer slug/settings fields.
- [ ] Apply the reviewed grade-subject access policies to production. Production currently lets any teacher whose class appears in `teacher_class_ids()` read and write grades for every subject in that class. Staging limits subject-teacher reads/writes to assigned subjects and gives class teachers read access for their class.
- [ ] Add `grades.midterm_score` before deploying the staged `student_positions` definition, which reads that column; also reconcile the staging-only `attendance_daily.attendance_date` field.
- [ ] Validate and apply migration `20261021163930_active_school_membership_access.sql` on staging. It fixes the staged `private.has_school_access` helper to honor `school_memberships.is_active`; production's phase-four draft already includes this check.
- [x] Extend the read-only audit to compare private tenancy helper bodies, security settings, schema usage, and execute grants. Public routine inventory alone missed `private.has_school_access` and the inactive-membership gap.

## Release gates

- [x] Restore browser control for live checks. On Oct 22 the existing signed-in dashboard was reachable for both production and staging, with no MCP configuration changes. The complete object-level comparison and staging validation are still open below.
- [ ] Review the full schema, function, grant, and RLS policy diff; establish the intended production state for each difference.
- [ ] Prepare and review an ordered, reversible production rollout; then apply only the approved changes and record migration history consistently.
- [ ] Verify production Auth users and password flows, and confirm the retired `login` / `verify-password` handlers are not in use. Static source search on Oct 21 found no references to those endpoint paths; the browser uses `Data.signIn()` → Supabase `signInWithPassword()`. The legacy `Data.loginWithPassword()` compatibility stub rejects calls. The deployed handlers' 410 responses and real account flows still require live checks.
- [ ] Confirm Cloudflare Pages production variables point to the production Supabase project and API; verify the published build.
- [ ] Run production smoke checks for administrator, teacher, student, and linked-parent access, plus campus attendance, scheduler, and push alerts.
- [ ] Smoke-check the teacher score workbook path: download the class workbook, confirm headers stay on the first row on each sheet, upload edited CSV/XLSX, verify unmatched rows are reported, and confirm saved marks persist to the correct subject/term.
- **Oct 22 static fix:** production and staging both enforce `score_uploads.kind IN ('ca','exam')`, but the teacher importer sent `kind='both'`, so the upload-status marker could not be written. The shared data writer now records separate CA and exam markers in one upsert and replaces matching cache rows; the teacher UI reports marker-save failure. Live workbook round trip remains open.
- [ ] Check for demo accounts in production and remove or rotate them; keep demo credentials out of tracked documentation.

### Migration tooling access

- The checked-in Supabase CLI wrapper works with process-only `SUPABASE_TELEMETRY_DISABLED=1`. A read-only `supabase projects list` returned `AccessTokenRequiredError`; no `SUPABASE_ACCESS_TOKEN` is set. Migration push/history repair needs an authorized scoped access path or the signed-in dashboard after full diff and backup verification; do not work around this by adding or changing MCP configuration.

## Live database comparison (read-only)

### Fresh snapshot: Oct 22, 2026

| Inventory | Production | Staging |
|---|---:|---:|
| Recorded migrations returned by the live catalog query | 4 | 22 |
| Public base tables | 53 | 54 |
| Public columns (including views) | 419 | 491 |
| RLS-enabled public base tables | 53 | 54 |
| Public policies | 123 | 127 |
| Public routines | 15 | 15 |
| Tables containing `school_id` | 1 | 52 |

- Production migration history now includes `20261020214425 enable_pg_cron_scheduler` and three newer records: `20261021194712 link_existing_users_to_supabase_auth`, `20261021194722 protect_school_user_auth_and_role_fields`, and `20261021194740 restrict_auth_trigger_function_execution`. These three migration names are absent from the current local `supabase/migrations` files. Their SQL/source and ledger provenance need reconciliation before any production rollout.
- Staging's latest recorded migration is `20261021120000 service_role_api_grants`; local migration `20261021163930_active_school_membership_access.sql` is not recorded in staging.
- Live `student_positions(bigint,bigint)` differs materially: production is `SECURITY DEFINER`, has `search_path=public`, and is executable by `anon` and `authenticated`; staging is invoker-mode with an empty search path, denies anon EXECUTE, and allows authenticated EXECUTE.
- **Oct 22 policy diff (live, read-only):** production and staging both grant authenticated SELECT on `assignments` and `score_uploads`, and both `*_select` policies use `USING (true)`. Any signed-in role can therefore read all assignment rows and score-upload metadata across classes. Production grade teacher policies use broad class membership; staging instead checks `teacher_can_read_grade(class_id,subject_id)` and `teacher_can_write_grade(class_id,subject_id)`. Define the intended assignment/coverage role scope and validate a narrowing policy on staging before any production rollout. No policies were changed.
- Live `public.class_subjects` has `reloptions = NULL` in both databases. Production grants SELECT to anon/authenticated; staging grants neither. The view selects class ID/name/level/stream and subject ID/name. Supabase Advisor currently flags the production view as a critical Security Definer View issue. Decide whether this lookup data is intended to be public, then apply the appropriate restricted grants or `security_invoker` design in a reviewed migration.
- The owner confirms the manual backup came from production project `happyman-academy` (`erlhyrswcqpqpqzbgmgb`) and reports a copy on an external hard drive. Chat 3 reports the custom-format archive at `%USERPROFILE%\Downloads\happyman-academy-backup.dump` passes `pg_restore --list` and full stream-integrity checks (662 TOC entries, 53 public tables, 15 public functions). Exact archive-to-live object comparison and isolated restore rehearsal remain open. The Supabase dashboard says there is no scheduled backup; that does not negate the separate local manual export.
- No production SQL/data/policy changes were made during the Oct 22 read-only inventory.

### Historical snapshot: Oct 21, 2026

| Inventory | Production | Staging |
|---|---:|---:|
| Recorded migrations | 1 (`20261020214425 enable_pg_cron_scheduler`) | 21 (matches the 21 local SQL migration filenames) |
| Public base tables | 53 | 54 |
| Public columns | 419 | 491 |
| RLS policies | 123 | 127 |
| Public routines | 13 | 15 |
| Tables with `school_id` | 1 | 52 |

- Staging has `organization_memberships`, which is absent from production.
- Staging has a `school_student_counts` view; views are not included in the base-table counts above.
- Staging has the four membership read policies `organizations_read_member`, `schools_read_member`, `organization_memberships_read_member`, and `school_memberships_read_member`. Production has none of these policies on those four tables.
- Staging has two additional public routines, `teacher_can_read_grade` and `teacher_can_write_grade`, defined in the local `20261019094328_grade_subject_access.sql` migration; they are absent from production's public routine inventory.
- The base-table column-count difference is fully accounted for by the local staging migrations: staging adds `school_id` to 51 existing tables; adds `attendance_date` to `attendance_daily` and `midterm_score` to `grades`; adds `organization_memberships` (six columns); and adds `slug`, `status`, and `created_at` on `organizations`, `id`, `is_active`, and `created_at` on `school_memberships`, and `slug` and `settings` on `schools`. The remaining six columns in the 72-column public total come from staging's `school_student_counts` view.
- The local multi-school tenancy migration creates the tenancy foundation and adds nullable `school_id` references to existing app tables. Its comments explicitly defer active-school app context and tenant RLS policies to a follow-up rollout.
- The production/staging policy signatures differ beyond the four additional membership policies: production's grade SELECT/INSERT/UPDATE policies still use the older broad class-ID checks. The staged `teacher_can_read_grade` and `teacher_can_write_grade` routines narrow subject-teacher access; this is a material student-record protection that needs a reviewed forward rollout.
- Production's `student_positions(bigint,bigint)` routine is currently `SECURITY DEFINER`, runs with `search_path=public`, and has effective EXECUTE for both anon and authenticated. Its definition returns school-wide student IDs, class/year ranks, and averages without an admin check. This was verified against the live production catalog. Staging was also checked live: it is `SECURITY INVOKER`, sets an empty search path, checks admin status, and denies anon execute. This is the highest-priority security fix.
- Production's tenancy tables are present only as empty partial tables: `organizations` (id/name), `schools` (id/organization_id/name/status/created_at), and `school_memberships` (user_id/school_id/role). Production `school_memberships` has a composite primary key and a role check for `school_admin`, `teacher`, `student`, and `parent`; staging uses an identity primary key, a unique school/user key, and roles matching the app (`admin`, `teacher`, `student`, `parent`, `security_guard`, `hostel_staff`). The current local tenancy migration's `CREATE TABLE IF NOT EXISTS` path will not reconcile these existing shapes, and its bootstrap insert of role `admin` would fail against production's current check. Production currently has zero organization, school, and school-membership rows, which gives a clean additive migration path, subject to final review.
- Neither project has anon-targeted RLS policies, and every public base table has RLS enabled. However, production directly grants `anon` DML and SELECT privileges on 51 public relations; staging grants anon no SELECT/INSERT/UPDATE/DELETE privileges. Production's `class_subjects` view has no `security_invoker` option and is granted to anon; it currently exposes class and subject lookup fields. Resolve the grant/view differences deliberately and confirm the app does not depend on anonymous access before changing production.
- Staging's `postgres` table defaults still grant `TRUNCATE`, `REFERENCES`, `TRIGGER`, and `MAINTAIN` to anon/authenticated/service_role, though they omit SELECT/INSERT/UPDATE/DELETE. Production grants all table operations by default. Treat the staged non-CRUD defaults as a remaining hardening opportunity; the production rollout should revoke anon table access and grant authenticated/service-role operations deliberately from the app's policies and backend migrations.
- The aggregate inventory reports `authenticated` grants on 53 staging relations vs 51 production relations, and `service_role` grants on 56 staging relations vs 54 production relations. Both show the same privilege names in aggregate; compare per-relation and column grants before rollout.
- Production `postgres` default ACLs grant anon/authenticated/service_role broad privileges on future public tables, sequences, and routines; staging narrows postgres-created table defaults and grants no sequence or function defaults to those roles. The `supabase_admin` default ACLs match between the two projects and should not be changed as part of this reconciliation without separate evidence.
- The browser app previously queried school tables before checking for an Auth session and could accept bundled demo records after a failed production load. The local bootstrap now checks Auth first, loads school records only for an authenticated session, requires the signed-in user's profile, tolerates empty RLS-scoped student/class/subject lists, and no longer creates an academic session as a side effect of page load. Review this behavior in the published build and smoke checks.
- Every public base table in both projects currently has RLS enabled. Policy coverage and behavior still differ and require review; RLS being enabled does not prove policies are equivalent or safe.
- Production already has some organization/school objects, so migration history alone cannot determine what is safe to apply. The production schema currently has only one migration history entry, which is not among the local migration filenames.
- These aggregate counts identify drift but are not a complete object-level diff. Production has not been modified.

## Work completed

- [x] Read-only inventory of production and staging public schema object counts and table names.
- [x] Confirmed staging recorded all 21 local migration versions present at the time of the Oct 21 snapshot; migration 22 was added afterward and is pending.
- [x] Confirmed production migration history has one entry (`20261020214425 enable_pg_cron_scheduler`) and production has 53 public base tables.
- [x] Confirmed the production Campus API health endpoint reported `pushEnabled: true` and recent scheduler requests returned HTTP 204.
- [x] Confirmed `https://happyman-academy.pages.dev/` currently serves the login shell and enables the sign-in button after load; this does not verify Auth, school data, or the current local build is deployed.
- [x] Compared base-table column counts and identified the differences in the local grade and tenancy migrations.
- [x] Compared aggregate role grants and anonymous RLS policy counts in production and staging; confirmed production's broader anon grants and the `class_subjects` view configuration need security review.
- [x] Added a read-only SQL inventory for relation/column grants, view security options, routine execute grants, tenancy constraints/indexes, role values, and duplicate school memberships; run it against both projects and compare before preparing production SQL.
- [x] Removed demo passwords from `PROJECT-STATUS.md`; role-based demo account descriptions remain.
- [x] Built the production bundle locally on Oct 21 and fixed the print watermark asset path after Vite reported it unresolved. The corrected build emits `dist/assets/hma-watermark-*.svg`.
- [x] Rebuilt production bundle on Oct 22 after fixing score-upload status markers; build succeeded and emitted the watermark SVG. Vite still reports non-fatal mixed dynamic/static import chunk warnings.

## Validation limits

- `node --check` passed for `server/index.js` and `scripts/provision-staging-demo-auth.js` on Oct 21. Deno and Wrangler are unavailable on PATH, so the Supabase Edge Function has not been type-checked or deployed from this workspace.
- Cloudflare deployment cannot be inspected or triggered locally: no Wrangler binary is installed and no Cloudflare API token/account environment variables are present. `wrangler.toml` identifies the Pages project/output directory only; verify production variables, deployed commit, and assets in the signed-in Cloudflare dashboard.
- Static source review confirms score workbooks put bold headers on row one of each class sheet, and the XLSX importer reads each sheet and validates required score headers before its first write. Runtime upload, row matching, and persistence remain unverified until the teacher smoke check above can run.

- `npm`'s launcher is missing its `npm-cli.js`; use the local Vite executable directly for the production bundle when workspace package-path access is available. Vite still emits non-fatal mixed dynamic/static import chunk warnings.
- No production Auth/data/role smoke checks have been run as part of this checklist, and the published Pages assets have not been tied to the current local commit.
