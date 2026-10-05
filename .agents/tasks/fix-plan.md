# Implementation Plan — Supabase Auth Security Fixes

> Generated from direct migration file inspection. All table names, column names, and line
> numbers verified against the actual source files.

---

## Schema facts confirmed before planning

All tables listed in the task prompt exist in the migrations. Confirmed column names:

| Table | Relevant columns |
|---|---|
| `attendance_weekly` | `student_id`, `term_id`, `week_number` (no `class_id`) |
| `attendance_daily` | `student_id`, `term_id`, `week_number`, `day_index` |
| `remarks` | `student_id`, `term_id` |
| `lms_attempts` | `quiz_id`, `student_id` |
| `lms_quizzes` | `class_id`, `teacher_id` |
| `lms_lessons` | `class_id`, `teacher_id` |
| `lms_discussions` | `class_id`, `teacher_id` |
| `lms_posts` | `user_id`, `discussion_id` |
| `parent_students` | `parent_id`, `student_id` |
| `portfolio_artifacts` | `student_id`, `created_by`, `verified_by` |
| `commendations` | `student_id`, `teacher_id` |
| `parent_engagements` | `parent_id` |
| `promotion_overrides` | `student_id`, `session_id`, `set_by` |
| `teacher_recognitions` | `teacher_id` |
| `teacher_classes` | `teacher_id`, `class_id` |
| `teacher_subjects` | `teacher_id`, `subject_id`, `class_id` |

**Note on `attendance_weekly`**: This table has no `class_id` column directly. The class must be
resolved via `students.class_id` (i.e. `student_id = current_student_id()` or join to `students`
for teacher access). The plan uses this join pattern.

**Note on `attendance` (original)**: Created in `20260926_initial_schema.sql` with an `anon_all`
policy. It is separate from `attendance_daily` and `attendance_weekly`. It must also be locked
down. The task prompt called it `attendance_daily` in its sensitive list — both `attendance` and
`attendance_daily` need per-user policies.

**Tables with no `anon_all` to drop**: `sessions`, `terms`, `classes`, `subjects`, `rooms`,
`time_slots` — all still have open `anon_all` policies and need authenticated-only open-read.
Also `events`, `departments`, `timetables`, `timetable_settings`, `assignments`, `score_uploads`,
`weekly_topics`, `subject_selection_rules`, `approval_requests`, `student_transfers`,
`path_requests`, `subject_selections`, `lms_questions`, `teacher_classes`, `teacher_subjects`,
`teacher_recognitions`, `promotions` (locked only for grades/students/users/promotions —
but `promotions` already has full per-user policy in `20261005`, so skip it).

---

## Fix 1 — Drop all remaining `anon_all` policies and add authenticated-only policies

**Decision**: Write a new follow-on migration file `20261006_rls_lockdown.sql`. Do not edit
`20261005_supabase_auth.sql` because it may already be applied to the live database. A new file
applies cleanly on top and is re-runnable via `DROP POLICY IF EXISTS`.

### Breakdown of tables and policy shape

#### Group A — Sensitive: per-user filtered SELECT (no INSERT/UPDATE from these policies)

These tables contain personal data. SELECT is filtered. INSERT/UPDATE is admin-or-owner-only.

1. **`attendance_weekly`** — student sees own; teacher sees their class (via `students` join);
   parent sees children; admin sees all.
   - `student_id = current_student_id()`
   - `EXISTS(SELECT 1 FROM students s WHERE s.id = attendance_weekly.student_id AND s.class_id = ANY(teacher_class_ids()))`
   - `student_id = ANY(parent_student_ids())`
   - `is_admin_user()`
   - INSERT/UPDATE: `EXISTS(SELECT 1 FROM students s WHERE s.id = attendance_weekly.student_id AND s.class_id = ANY(teacher_class_ids())) OR is_admin_user()`

2. **`attendance`** (original table) — same pattern as `attendance_weekly`:
   - Same USING expression as above.
   - INSERT/UPDATE: teacher for their class OR admin.

3. **`attendance_daily`** — same pattern as `attendance_weekly` (same columns: `student_id`, `term_id`):
   - Same USING expression.
   - INSERT/UPDATE: teacher for their class OR admin.

4. **`remarks`** — student sees own; teacher sees class; parent sees children; admin sees all.
   - `student_id = current_student_id()`
   - `EXISTS(SELECT 1 FROM students s WHERE s.id = remarks.student_id AND s.class_id = ANY(teacher_class_ids()))`
   - `student_id = ANY(parent_student_ids())`
   - `is_admin_user()`
   - INSERT/UPDATE: teacher or admin only.

5. **`lms_attempts`** — student sees own; teacher sees attempts for their class's quizzes; parent sees children's; admin sees all.
   - `student_id = current_student_id()`
   - `EXISTS(SELECT 1 FROM lms_quizzes q WHERE q.id = lms_attempts.quiz_id AND q.class_id = ANY(teacher_class_ids()))`
   - `student_id = ANY(parent_student_ids())`
   - `is_admin_user()`
   - INSERT: student inserts own (`student_id = current_student_id()`).
   - UPDATE: student updates own (`student_id = current_student_id()`).

6. **`parent_students`** — parent sees own links; admin sees all; teacher does not need to read this table directly.
   - `parent_id = public_user_id() OR is_admin_user()`
   - INSERT/UPDATE: admin only.

7. **`portfolio_artifacts`** — student sees own; teacher who is `created_by` or `verified_by` sees it; admin sees all.
   - `student_id = current_student_id()`
   - `EXISTS(SELECT 1 FROM students s WHERE s.id = portfolio_artifacts.student_id AND s.class_id = ANY(teacher_class_ids()))`
   - `student_id = ANY(parent_student_ids())`
   - `is_admin_user()`
   - INSERT: student (`student_id = current_student_id()`) or admin.
   - UPDATE: teacher (verified_by) or admin.

8. **`commendations`** — student sees own; teacher who wrote it (`teacher_id = public_user_id()`) sees it; parent sees children's; admin sees all.
   - `student_id = current_student_id()`
   - `teacher_id = public_user_id()`
   - `student_id = ANY(parent_student_ids())`
   - `is_admin_user()`
   - INSERT: teacher (`teacher_id = public_user_id()`) or admin.

9. **`parent_engagements`** — parent sees own; admin sees all.
   - `parent_id = public_user_id() OR is_admin_user()`
   - INSERT: own record (`parent_id = public_user_id()`) or admin.

10. **`promotion_overrides`** — student sees own; parent sees children's; admin sees all; teacher sees students in their class.
    - `student_id = current_student_id()`
    - `EXISTS(SELECT 1 FROM students s WHERE s.id = promotion_overrides.student_id AND s.class_id = ANY(teacher_class_ids()))`
    - `student_id = ANY(parent_student_ids())`
    - `is_admin_user()`
    - INSERT/UPDATE/DELETE: admin only.

11. **`teacher_recognitions`** — teacher sees own; admin sees all.
    - `teacher_id = public_user_id() OR is_admin_user()`
    - INSERT: admin only.

#### Group B — School-wide lookup: open SELECT for any authenticated user; writes restricted to admin/teacher

These tables are school configuration or teaching content. Any authenticated user may read them.

Tables: `sessions`, `terms`, `classes`, `subjects`, `rooms`, `time_slots`, `events`,
`departments`, `timetables`, `timetable_settings`, `assignments`, `score_uploads`, `weekly_topics`,
`subject_selection_rules`, `subject_selections`, `path_requests`, `student_transfers`,
`approval_requests`, `teacher_classes`, `teacher_subjects`, `lms_lessons`, `lms_quizzes`,
`lms_questions`, `lms_discussions`, `lms_posts`.

Policy pattern for SELECT: `TO authenticated USING (true)` — no USING filter.

For INSERT/UPDATE on write-capable tables, use `is_admin_user()` as a minimum gate. Some
tables have more natural write rules:
- `lms_lessons`, `lms_quizzes`, `lms_questions`, `lms_discussions`: teachers can insert/update
  for their own class (`class_id = ANY(teacher_class_ids()) OR is_admin_user()`).
- `lms_posts`: any authenticated user can insert their own post (`user_id = public_user_id()`);
  delete own post.
- `weekly_topics`: teacher for their class or admin.
- `score_uploads`: teacher for their class or admin.
- `assignments`: teacher for their class or admin.
- `subject_selections`: student selects own or admin; teacher approves for their class.
- `path_requests`: student requests own or admin; teacher/admin approves.
- `student_transfers`, `approval_requests`: admin only.
- `timetable_settings`, `subject_selection_rules`: admin only (single-row tables).
- `sessions`, `terms`, `classes`, `subjects`, `rooms`, `time_slots`, `events`, `departments`,
  `teacher_classes`, `teacher_subjects`: admin only for writes.

### Files to create/modify

- **Create**: `supabase/migrations/20261006_rls_lockdown.sql`

### Exact migration structure

```sql
-- Drop all remaining anon_all policies (idempotent)
-- [one DROP per table listed above]

-- Enable RLS where not already enabled
-- [ALTER TABLE ... ENABLE ROW LEVEL SECURITY for any not yet covered]

-- Group A: per-user SELECT policies
-- [CREATE POLICY ... FOR SELECT TO authenticated USING (...) for each sensitive table]

-- Group A: per-user INSERT/UPDATE policies
-- [CREATE POLICY ... FOR INSERT/UPDATE TO authenticated WITH CHECK/USING (...)]

-- Group B: open authenticated SELECT
-- [CREATE POLICY ... FOR SELECT TO authenticated USING (true) for each lookup table]

-- Group B: authenticated writes
-- [CREATE POLICY ... FOR INSERT/UPDATE TO authenticated WITH CHECK (is_admin_user() [or teacher clause]) for each write-capable table]
```

All `CREATE POLICY` statements preceded by `DROP POLICY IF EXISTS` for idempotency.

### Verify

```sql
-- Run in Supabase SQL editor with anon key (no JWT):
-- Every query below should return 0 rows or error, not real data.
SELECT count(*) FROM attendance_weekly;
SELECT count(*) FROM lms_attempts;
SELECT count(*) FROM remarks;
-- Run same queries with a student JWT — should return only own rows.
```

Manual: Use Supabase Table Editor with anon role — confirm "Row Level Security is enabled" badge
appears and zero rows are returned on each sensitive table without a JWT.

---

## Fix 2 — `teacher_class_ids()` UNION with `teacher_classes`

**Decision**: Extend `20261005_supabase_auth.sql` by adding a `CREATE OR REPLACE FUNCTION`
block **or** add it at the top of the new `20261006_rls_lockdown.sql`. Since the lockdown
migration must exist anyway (Fix 1), add the function fix there so it is applied in the same
migration run. `CREATE OR REPLACE` is safe — it replaces the function regardless of whether
the old version exists.

### Change

In `supabase/migrations/20261006_rls_lockdown.sql`, at the top (before the policy statements),
replace `teacher_class_ids()`:

```sql
CREATE OR REPLACE FUNCTION teacher_class_ids() RETURNS bigint[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT ARRAY(
      SELECT DISTINCT class_id FROM teacher_subjects
      WHERE teacher_id = public_user_id()
      UNION
      SELECT class_id FROM teacher_classes
      WHERE teacher_id = public_user_id()
    )
  $$;
```

No RLS policy changes needed — all existing policies already call `teacher_class_ids()` so
they inherit the fix automatically once the function is replaced.

### Files to modify

- `supabase/migrations/20261006_rls_lockdown.sql` (new file, at top)

### Verify

Provision a test user as a class teacher in `teacher_classes` only (no rows in `teacher_subjects`).
Log in as that user. Confirm `SELECT * FROM grades` returns rows for their class (would return zero
rows before the fix).

---

## Fix 3 — Remove `loginWithPassword` from `data.js`

**Decision**: Replace the function body with a hard `throw` rather than deleting the property
entirely. Deletion would cause a silent `undefined is not a function` TypeError anywhere that
still calls it; a `throw` gives a clear message pointing developers to the correct method. The
`passwordMatches()` stub above it also needs its comment updated so it no longer points to
`loginWithPassword()`.

### Exact change in `data.js`

Lines 1384–1407 (the `loginWithPassword` method) — replace body with:

```js
// loginWithPassword — REMOVED. Use Data.signIn({ email, password }) instead.
// The old SHA-256 path is no longer supported.
async loginWithPassword() {
  throw new Error(
    '[HMA] loginWithPassword() has been removed. ' +
    'Call Data.signIn({ email, password }) to sign in via Supabase Auth.'
  );
},
```

Also update the `passwordMatches()` stub comment at line 1379 to remove the reference to
`loginWithPassword()`:

```js
// passwordMatches(user, typed) — REMOVED. No password hashes are available client-side.
passwordMatches(user, typed) {
  console.warn('[HMA] passwordMatches() is deprecated and always returns false.');
  return false;
},
```

### Files to modify

- `data.js` — lines ~1376–1407

### Verify

Open browser devtools console. Type `Data.loginWithPassword({email:'x', password:'y'})`.
The promise should reject with the error message above, not execute a Supabase query.
Confirm no `password_hash` or `password_salt` columns appear in any network request.

---

## Fix 4 — Switch provisioning script to `generateLink` invite flow

**Decision**: Replace `sb.auth.admin.createUser({ password: tempPassword })` with
`sb.auth.admin.generateLink({ type: 'invite', email })`. This emails the user a one-time invite
link that forces them to set their own password — no guessable credential is created.

Add a `--demo` flag (`process.argv.includes('--demo')`) that falls back to the old
`createUser({ password: tempPassword })` path for local dev environments where the email
service is not configured. The `--demo` flag must print a loud warning.

### Exact change in `scripts/provision-auth-users.js`

1. Add at the top after the `SERVICE_KEY` guard:
```js
const DEMO_MODE = process.argv.includes('--demo');
if (DEMO_MODE) {
  console.warn('⚠  DEMO MODE: Using deterministic passwords. Do NOT run this on a live database.');
}
```

2. Replace the `createUser` call block (currently lines ~30–56) with:
```js
if (DEMO_MODE) {
  // Dev/demo fallback: deterministic password (never for production)
  const tempPassword = `HMA@${u.email.slice(0, 4)}2026`;
  const { data: authData, error: authErr } = await sb.auth.admin.createUser({
    email: u.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name: u.name, role: u.role }
  });
  if (authErr) {
    // ... existing error/link handling unchanged
  } else {
    await sb.from('users').update({ auth_user_id: authData.user.id }).eq('id', u.id);
    console.log(`  Provisioned (demo): ${u.email} — temp password: ${tempPassword}`);
  }
} else {
  // Production: send invite email, user sets own password
  const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
    type: 'invite',
    email: u.email,
    options: { data: { name: u.name, role: u.role } }
  });
  if (linkErr) {
    if (linkErr.message?.includes('already been registered')) {
      // Same existing "find and link" fallback as before
      const { data: existing } = await sb.auth.admin.listUsers();
      const found = existing?.users?.find(au => au.email === u.email);
      if (found) {
        await sb.from('users').update({ auth_user_id: found.id }).eq('id', u.id);
        console.log(`  Linked existing auth user: ${u.email}`);
      } else {
        console.warn(`  Could not link: ${u.email}`);
      }
      continue;
    }
    console.error(`  ERROR for ${u.email}:`, linkErr.message);
    continue;
  }
  // Link auth_user_id back to public.users using the new auth user's id
  const { error: updateErr } = await sb
    .from('users')
    .update({ auth_user_id: linkData.user.id })
    .eq('id', u.id);
  if (updateErr) {
    console.error(`  Failed to link ${u.email}:`, updateErr.message);
  } else {
    console.log(`  Invite sent: ${u.email}`);
  }
}
```

3. Update the usage comment at the top of the file:
```
// Usage (production): SUPABASE_SERVICE_KEY=<key> node scripts/provision-auth-users.js
//         (dev only): SUPABASE_SERVICE_KEY=<key> node scripts/provision-auth-users.js --demo
```

### Files to modify

- `scripts/provision-auth-users.js`

### Verify

Run `node scripts/provision-auth-users.js --demo` against a local Supabase instance.
Confirm it prints `⚠  DEMO MODE` warning and creates users with the temp-password pattern.

Run without `--demo` against a staging project. Confirm Supabase sends invite emails and
`auth_user_id` is linked in `public.users`. No `HMA@...` password should appear in any log.

---

## Dependency order

| Step | Depends on | Reason |
|---|---|---|
| Fix 2 (`teacher_class_ids()`) | Must be in `20261006_rls_lockdown.sql` | Function used by Group A policies in the same file |
| Fix 1 (RLS lockdown) | Fix 2 must appear first in the file | Policies reference the corrected function |
| Fix 3 (`loginWithPassword`) | Independent | Pure JS change |
| Fix 4 (provision script) | Independent | Pure JS change |

Recommended execution order: **Fix 2 → Fix 1 (same file) → Fix 3 → Fix 4**.

---

## Build & test commands

```
npm run build     # must complete with zero errors after Fix 3/4
```

Supabase migration application:
```
npx supabase db push   # applies 20261006_rls_lockdown.sql
```

There are no automated tests. Verification is manual per section above.

---

## Caveats / open questions

1. **`attendance` (original table)**: The original `attendance` table from `20260926_initial_schema.sql`
   has an `anon_all` policy. The app's active attendance tables are `attendance_weekly` and
   `attendance_daily`, but the original table still exists and is open. The lockdown migration
   should cover it. It is included in Group A (per-user filter) since it has `student_id`.

2. **`lms_posts.user_id`**: This column is nullable (`references users(id) on delete set null`).
   The INSERT policy `user_id = public_user_id()` will work correctly because `public_user_id()`
   returns the authenticated user's id; the nullable FK is only for post-deletion cleanup, not for
   policy evaluation.

3. **`subject_selection_rules` and `timetable_settings`**: Both are single-row configuration
   tables. The SELECT policy is `TO authenticated USING (true)`. INSERT is not needed (rows
   seeded at migration time); UPDATE is admin-only.

4. **`parent_students` write-path**: The app creates parent-student links at user-creation time
   (admin action). INSERT/UPDATE should be admin-only. No self-service parent link creation
   is expected from reading the codebase.

5. **RLS on `departments`**: The `departments` table has a `subject_ids text[]` column, not
   foreign keys. No per-user filtering is needed — any authenticated user may read; only admin
   may write.
