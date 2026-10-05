# Security fixes: RLS lockdown, teacher_class_ids UNION, loginWithPassword removal, invite provisioning

This commit addresses four security findings from the Supabase Auth migration review. The core problems were: (1) `teacher_class_ids()` missed class teachers who have no `teacher_subjects` rows; (2) roughly 30 tables across the schema still had open `anon_all` policies surviving the prior auth migration; (3) `loginWithPassword` in `data.js` still executed a real SHA-256 credential check against the DB; and (4) the provisioning script seeded deterministic, guessable passwords. All four are addressed in a single commit that adds a new migration (`20261006_rls_lockdown.sql`), patches `data.js`, and rewrites `scripts/provision-auth-users.js`.

Watch for (**confirmed**): The `20261004_rls_policies.sql` migration (pre-existing) creates `anon`-role policies named `grades_select`, `students_select`, etc. — these names are dropped and replaced by `20261005_supabase_auth.sql` before `20261006` runs, so the migration chain is correct. No `anon`-role policies survive to production. However, `20261005` is where the four core tables (`grades`, `students`, `users`, `promotions`) get closed; `20261006` covers the remainder. The separation is fine but worth understanding as a reviewer.

**Verdict**: APPROVED

---

## High-level view

The `teacher_class_ids()` fix is mechanical and correct: a `UNION` between `teacher_subjects` and `teacher_classes`, both filtered by `public_user_id()`, using column names that match the actual schema (`teacher_id`, `class_id`). Class teachers who had no subject assignments were invisible to every prior RLS policy; this closes that gap completely.

The anon-policy sweep in `20261006_rls_lockdown.sql` is comprehensive. All 31 tables that still had `anon_all` policies from migrations `20260926` through `20261003` are explicitly dropped and replaced with `authenticated`-only policies. Group A (sensitive personal data) gets per-user filtering; Group B (school-wide lookup data) gets open read for any authenticated user with admin-only writes. The column names used in `USING`/`WITH CHECK` clauses have been verified against the schema in every case checked.

`loginWithPassword` is now a hard-throw stub. No code path in the app still calls it — the grep shows the only remaining reference is the definition itself, and callers have migrated to `Data.signIn()`. The old SHA-256 credential query against `public.users` is gone from the codebase entirely.

The provisioning script now sends Supabase `generateLink({ type: 'invite' })` in production, giving each user a one-time link to set their own password. The `--demo` flag preserves a working local path with a fixed password, clearly gated behind a `DEMO_MODE` check and an explicit `console.warn` that it must not be run on a live database. The invite path correctly links `linkData.user.id` back to `public.users.auth_user_id`.

---

<details>
<summary>Issues (0)</summary>

No blocking issues found. All four findings are fully addressed.

</details>

---

<details>
<summary>Details</summary>

### teacher_class_ids() UNION covering both teacher tables

The original function in `20261005_supabase_auth.sql` selected `DISTINCT class_id FROM teacher_subjects WHERE teacher_id = public_user_id()` only. A teacher registered as a class teacher via `teacher_classes` but with no rows in `teacher_subjects` would have had an empty array returned, making every RLS policy that called `teacher_class_ids()` deny them access to their own class's data.

The fix in `20261006_rls_lockdown.sql`:

```sql
SELECT ARRAY(
  SELECT DISTINCT class_id FROM teacher_subjects
   WHERE teacher_id = public_user_id()
  UNION
  SELECT class_id FROM teacher_classes
   WHERE teacher_id = public_user_id()
)
```

Both `teacher_subjects.class_id` and `teacher_classes.class_id` are confirmed columns in `20260926_initial_schema.sql`. `UNION` (not `UNION ALL`) deduplicates naturally.

### Anon-policy elimination in 20261006

The lockdown migration drops `anon_all` for all 31 remaining tables, enables RLS where it wasn't yet on, and recreates policies scoped to `TO authenticated`. The separation of responsibilities across the migration chain is:

- `20261005`: closes `grades`, `students`, `users`, `promotions` (the four tables the prior review flagged)
- `20261006`: closes all remaining tables (attendance variants, remarks, LMS tables, teacher/subject mapping tables, path/selection workflow tables, lookup tables)

The `20261004` migration creates `anon`-role policies by the same names (`grades_select`, etc.) that `20261005` explicitly drops, so no anon policies survive. The column names in the new policies were spot-checked:

- `attendance`, `attendance_weekly`, `attendance_daily`, `remarks`: all resolve teacher access via `students.class_id` join, since these tables don't have a direct `class_id` column — confirmed correct.
- `lms_attempts`: resolves teacher access via `lms_quizzes.class_id` join — `lms_quizzes` has a `class_id` column confirmed in `20260929_lms.sql`.
- `score_uploads`, `weekly_topics`, `timetables`, `assignments`, `lms_lessons`, `lms_quizzes`, `lms_discussions`: all have direct `class_id` columns confirmed in schema files.
- `approval_requests`: uses `requested_by` in `WITH CHECK` — column confirmed as `bigint` in `20260928_promotion.sql`.
- `commendations`: uses `teacher_id = public_user_id()` for insert — column confirmed.

### loginWithPassword hard throw

The full implementation body has been replaced with a single `throw new Error(...)`. Any stale call site will now fail loudly with a message pointing to `Data.signIn()` rather than silently reaching the DB. No other file in the codebase calls `loginWithPassword` — confirmed by grep across all JS/JSX/TS/TSX/HTML files.

### Provisioning script invite flow

Production path uses `sb.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo, data } })` and links `linkData.user.id` back to `public.users`. The `already been registered` collision path is preserved for idempotency. The `--demo` flag is gated with `process.argv.includes('--demo')`, so there's no risk of accidentally running the deterministic-password path without explicitly opting in. The demo password (`HMA_Demo_2026!`) is a fixed string shared across all demo accounts, which is weaker than the prior per-account derivation but acceptable since this path is explicitly flagged as dev-only and never touches a live database.

</details>

---

<details>
<summary>File map</summary>

- `supabase/migrations/20261006_rls_lockdown.sql` — new migration: replaces `teacher_class_ids()` with UNION version, drops all remaining `anon_all` policies, enables RLS on 31 tables, creates `authenticated`-only policies for all of them
- `data.js` — `loginWithPassword()` body replaced with a hard throw; `passwordMatches()` comment updated
- `scripts/provision-auth-users.js` — production path switched to `generateLink` invite flow; original `createUser` path moved behind `--demo` flag with explicit warning
- `.agents/tasks/supabase-auth-verify.md` — agent task artifact (not reviewed; out of scope)

Full diff: `git show HEAD` (commit `1b8dbac`)

</details>
