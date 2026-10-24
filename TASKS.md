# Tasks

## Active

- [ ] **Finish Happy Man Academy release readiness** - target Saturday, October 24, 2026; use Sunday as buffer. Track evidence and detailed release gates in [TODO.md](TODO.md).
  - Restore signed-in Supabase dashboard access without changing MCP configuration; complete the live production/staging diff and confirm a recoverable backup.
  - Validate the pending migration and reviewed changes on staging, then reconcile production only after review and backup evidence.
  - Verify the matching app deployment and smoke-check administrator, teacher, student, parent, attendance, scheduler, and push flows.

## Waiting On

- [ ] **Restore Supabase access for release checks** - Work browser control is disabled and CLI reports `AccessTokenRequiredError`; network requests to the Supabase API are also blocked from this workspace. Re-enable the existing signed-in dashboard/browser access or provide an authorized scoped CLI access path. No MCP changes are needed.
  - Local DB validation is also unavailable because Docker and Podman are not installed/on PATH; remote staging validation is the fastest route.

## Someday

## Done

- [x] ~~Build the local production bundle and fix the unresolved print watermark asset path.~~ (Oct 21, 2026)

## 30-task work split (Oct 22–24)

The task IDs below give each of the three project chats one focused workstream. Evidence and blockers should be reported back into this tracker. Production writes/deploys remain on hold until the read-only diff, validated backup, and staging checks are complete and a final go decision is made.

### Chat 1 — Continue Supabase scheduler setup: production readiness

- [x] **01.** Restore the existing authorized Supabase dashboard/browser or scoped CLI access; do not change MCP configuration. **Evidence (Oct 22):** signed-in dashboard access works for both production and staging; no MCP configuration changed.
- [x] **02.** Refresh read-only production and staging inventories (tables, columns, migrations, functions, views, policies, grants). **Evidence (Oct 22, read-only queries):** production has 53 public base tables, 419 public columns, 53 RLS-enabled tables, 123 policies, 15 public routines, and 1 table with `school_id`; staging has 54, 491, 54, 127, 15, and 52. Latest migrations differ substantially.
- [ ] **03.** Complete the object-by-object schema and policy diff; identify intended state for each difference.
- [ ] **04.** Compare production and staging relation-level and column-level grants, including default ACLs.
- [ ] **05.** Review RLS policy/helper differences, prioritizing student data and teacher subject scope.
- [ ] **06.** Review exposed routines and views, prioritizing `student_positions`, `class_subjects`, and anon/authenticated execute/select access.
- [ ] **07.** Review the phase 1–4 production SQL drafts against the fresh live state and write preconditions/rollback steps; do not apply them yet.
- [ ] **08.** Validate the scheduler error-propagation fix on staging and confirm failed writes cannot return a false success.
- [ ] **09.** Prepare a migration-history reconciliation and ordered, reversible rollout plan from the live production baseline.
- [ ] **10.** Once earlier gates pass, gather production evidence for Auth, admin/teacher/student/parent access, attendance, scheduler, and push; make a documented ship/hold recommendation.

### Chat 2 — adding more than one school (2): multi-school foundation

- [ ] **11.** Review the phase-one multi-school migration and list every production/staging schema assumption it makes.
- [ ] **12.** Reconcile the existing `organizations`, `schools`, and `school_memberships` shapes, keys, and role constraints with the app and staging.
- [ ] **13.** Define the safe single-school backfill mapping for existing records and check for missing/ambiguous school ownership.
- [ ] **14.** Recheck the 27 unlinked teacher/student profiles and distinguish profiles that need login from profiles that do not.
- [ ] **15.** For accounts the owner confirms need access, provision Auth identities only for real, reachable emails; do not invent addresses.
- [ ] **16.** Link confirmed Auth identities to profiles by normalized email and check for duplicates or mismatches.
- [ ] **17.** Validate the phase-one migration on staging, including rerun safety, membership constraints, and existing-school behavior.
- [ ] **18.** Design and implement the signed-in user's active-school context and school selection in the app.
- [ ] **19.** Implement tenant-scoped RLS and membership checks only after the active-school context and required accounts are ready.
- [ ] **20.** Verify that admin, teacher, student, and parent access stays within the selected school and rejects cross-school reads/writes.

### Chat 3 — Access GitHub repository: backup and release artifact

- [x] **21.** Confirm the manually created backup targets production project `erlhyrswcqpqpqzbgmgb` and record its timestamp, format, and location (never record credentials). **Evidence:** owner confirms it came from production `happyman-academy` (`erlhyrswcqpqpqzbgmgb`) and reports copying it to an external hard drive. `%USERPROFILE%\Downloads\happyman-academy-backup.dump` exists (283,750 bytes; modified 22 Oct 2026 03:22 local); custom-format archive. The dump itself does not encode its project ref, so provenance is owner-confirmed rather than independently proven from archive metadata.
- [x] **22.** Check backup completeness and integrity with a non-destructive inspection appropriate to its format. **Evidence (Oct 22):** `C:\Program Files\PostgreSQL\17\bin\pg_restore.exe --list` exits 0; full stream extraction (`pg_restore --file=- ...`, output discarded) also exited 0. Latest archive header: PostgreSQL 17.6 source / pg_dump 17.11; **668 TOC entries** (supersedes earlier 662 count); 53 public tables/data entries, 15 public functions, 1 view (`class_subjects`), 123 policies, and 47 sequence values. The coordinator-provided read-only live production inventory was reconciled by name: all 53 tables, all 15 routines, the view, and all 123 policy names match; no table-name differences. No auth, storage, or private-schema objects are listed in the archive. Exact archive names and comparison evidence are in [BACKUP-ARCHIVE-OBJECTS.txt](BACKUP-ARCHIVE-OBJECTS.txt). This verifies archive stream integrity and object-name parity; it does not prove definitions, grants/ACLs, or row data are current or identical to production. Restore rehearsal remains task 23.
- [ ] **23.** Document and, if a safe isolated target is available, rehearse restoring the backup without overwriting production. **Evidence/blocker:** safe isolated restore steps documented in [BACKUP-RECOVERY.md](BACKUP-RECOVERY.md); no isolated empty target/credentials were available, so no restore was run.
- [x] **24.** Write a concise recovery runbook listing the restore sequence and the access prerequisites, without secrets. See [BACKUP-RECOVERY.md](BACKUP-RECOVERY.md).
- [x] **25.** Verify the GitHub remote, current branch, and worktree state; report what is committed versus local-only. **Evidence:** `origin` is `https://github.com/happymanagemententerprise/schoolmg.git`; local `main` tracks `origin/main` at `1d3f3a135e72f49aed9c1813d1394bece3f6fe89` (`Teacher Alert`). Worktree has tracked edits in `.impeccable/config.json`, `PROJECT-STATUS.md`, `README.md`, `data.js`, `server/index.js`, `src/styles.css`, `src/views/teacher.js`, `supabase/functions/campus-api/index.ts`, `supabase/seed.sql`, `supabase/tests/grade_scope_rls.test.sql`, and multiple untracked planning/migration artifacts. These are local-only and uncommitted.
- [ ] **26.** Identify the exact source commit for the intended release candidate and record how local fixes map to it. **Evidence:** base commit is `1d3f3a135e72f49aed9c1813d1394bece3f6fe89`, identical to `origin/main`; there is no release-candidate commit yet. Local fixes are the worktree files listed under task 25; intended release candidate remains uncommitted.
- [x] **27.** Rebuild the frontend after approved local fixes and confirm the emitted assets (including the print watermark) are present. **Evidence (Oct 22):** `vite v5.4.11` production build succeeded after the upload-marker fix; `dist/index.html` and `dist/assets/hma-watermark-BX2IJXcv.svg` were emitted. Vite reports non-fatal mixed dynamic/static import chunk warnings.
- [ ] **28.** Read-only check the Cloudflare Pages project, production Supabase URL/API variables, and deployed build identity. **Evidence/blocker:** local `wrangler.toml` names Pages project `happyman-academy` and output directory `dist`; Wrangler is not installed/on PATH, no Cloudflare/WRANGLER environment variables are present, and signed-in dashboard/browser control is unavailable. Production variables and deployed commit/assets need owner dashboard access.
- [ ] **29.** Run the teacher workbook smoke check: download, edit CSV/XLSX, upload, review unmatched rows, and verify saved marks. **Evidence:** live constraints in both production and staging confirm `score_uploads.kind` only permits `ca` and `exam`, while the workbook importer passed `kind: 'both'` to the marker writer. Updated the shared writer to atomically record CA and exam markers separately and made the teacher UI report when status recording fails. Static source change only; no live workbook round trip has been run yet.
- [x] **30.** Consolidate backup, source, deployment, and workbook evidence into this tracker and report remaining ship blockers. This workstream report is captured in tasks 21–29 and [BACKUP-RECOVERY.md](BACKUP-RECOVERY.md).

### Shared handoff rule

Chats should report task IDs, evidence, and blockers here or back to this coordinating chat. Do not apply production SQL, change production data/policies, or deploy a release while the backup/diff/staging gates are open. If a task needs an owner decision (especially which staff/students need logins), state the exact decision needed and continue independent work.

### Chat 1 evidence notes (Oct 22)

- Production catalog query confirms `student_positions(bigint,bigint)` is `SECURITY DEFINER`, sets `search_path=public`, and is executable by `anon` and `authenticated`. Staging has the same signature in invoker mode with empty `search_path`, denies anon execution, and allows authenticated execution.
- Production `public.class_subjects` is owned by postgres, has no `security_invoker` option, and grants SELECT to anon and authenticated. Staging has no direct SELECT for either role. Its view definition returns only class/subject identifiers and names, levels, and streams. The production Advisor marks this view as a critical security finding; public intent and access still need an explicit decision.
- Production has four migration-history rows: scheduler plus `link_existing_users_to_supabase_auth`, `protect_school_user_auth_and_role_fields`, and `restrict_auth_trigger_function_execution`. Those three names are absent from the current local migration files, so reconcile their SQL/source and migration ledger before rollout. Staging's latest migration remains `20261021120000 service_role_api_grants`; migration `20261021163930_active_school_membership_access.sql` is not recorded there.
- Production and staging both displayed Healthy. Supabase also displayed a platform-incident banner while read-only queries succeeded.
- **Scheduler refresh (Oct 22, production, read-only):** the newest ten `net._http_response` rows (IDs 1533–1524) all returned HTTP 204 with no error and no timeout, at one-minute intervals through 05:37 UTC. This confirms endpoint responses, not device-level push delivery or the un-deployed scheduler error-propagation fix.
- **Scheduler fix review (Oct 22, static):** the Edge Function and Node mirror now check both hostel auto-checkout inserts and daily-summary upserts; thrown errors propagate through `asyncRoute` to the Edge adapter's 500 handler / Node error middleware, so those failures cannot produce a 204. Staging execution and deployment are still required before task 08 can close.
- **High-risk RLS comparison (Oct 22, live read-only queries):** production and staging both have `assignments_select` and `score_uploads_select` for `authenticated` with `USING (true)`, so every signed-in role can read every row in those tables. These tables have authenticated SELECT grants. Production grade SELECT/INSERT/UPDATE policies allow teacher class scope; staging uses `teacher_can_read_grade(class_id,subject_id)` and `teacher_can_write_grade(class_id,subject_id)` for subject-specific scope. Restricting assignment and upload reads needs an app-compatible role matrix and staging validation; no policies were changed.
- The owner confirms a manual backup from production and reports a copy on an external hard drive. Chat 3 confirms the custom-format archive passes `pg_restore --list` and stream-integrity checks, with 53 public tables / 668 TOC entries (latest inspection). Exact object-list comparison is complete; isolated restore rehearsal remains open. The production dashboard has no scheduled backup recorded.
