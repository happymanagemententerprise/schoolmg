# Supabase Auth Security — Verification Notes

_Updated after implementing all four fixes._

---

## What was implemented

### Fix 1 + Fix 2 — `supabase/migrations/20261006_rls_lockdown.sql` (new file)

All remaining `anon_all` policies dropped and replaced with authenticated-only policies.

**`teacher_class_ids()` corrected** to UNION `teacher_subjects` + `teacher_classes`, so class
teachers who have no rows in `teacher_subjects` now pass every RLS check correctly.

**Group A (sensitive, per-user SELECT)**: `attendance`, `attendance_weekly`, `attendance_daily`,
`remarks`, `lms_attempts`, `parent_students`, `portfolio_artifacts`, `commendations`,
`parent_engagements`, `promotion_overrides`, `teacher_recognitions`.

**Group B (school-wide, authenticated open-read)**: `sessions`, `terms`, `classes`, `subjects`,
`rooms`, `time_slots`, `timetables`, `events`, `departments`, `assignments`, `score_uploads`,
`weekly_topics`, `teacher_classes`, `teacher_subjects`, `subject_selection_rules`,
`timetable_settings`, `lms_lessons`, `lms_quizzes`, `lms_questions`, `lms_discussions`,
`lms_posts`, `path_requests`, `subject_selections`, `student_transfers`, `approval_requests`.

### Fix 3 — `data.js`

`loginWithPassword()` replaced with a hard `throw new Error(...)` pointing callers to
`Data.signIn()`. `passwordMatches()` comment updated to remove reference to `loginWithPassword`.

### Fix 4 — `scripts/provision-auth-users.js`

`--demo` flag added. In normal (production) mode, the script calls
`sb.auth.admin.generateLink({ type: 'invite', email, ... })` — users receive an email invite
and set their own password; no temporary credential is created.
In `--demo` mode, falls back to `createUser` with password `HMA_Demo_2026!` and prints a
loud `⚠ DEMO MODE` warning. The existing "already registered" link-fallback is preserved in
both paths.

---

## Build verification

Command: `npm run build`
Directory: `c:\Users\Happy\Documents\Happy Management\schoolmg\schoolmg`
Result: **✓ built in 26.30s — exit code 0 — zero errors**

Warnings logged: pre-existing Vite dynamic/static import chunking notes (not errors, not
caused by these changes).

---

## Manual verification steps (to run against Supabase)

Apply the new migration:
```
npx supabase db push
```

**Verify anon is locked out** — run these in the Supabase SQL editor with the anon key:
```sql
SELECT count(*) FROM attendance_weekly;   -- must error or return 0
SELECT count(*) FROM lms_attempts;        -- must error or return 0
SELECT count(*) FROM remarks;             -- must error or return 0
SELECT count(*) FROM parent_students;     -- must error or return 0
```

**Verify teacher_class_ids()** — provision a teacher who has a row in `teacher_classes`
but no rows in `teacher_subjects`, sign in as that teacher, confirm `SELECT * FROM grades`
returns rows for their class.

**Verify invite flow** — run:
```
SUPABASE_SERVICE_KEY=<key> node scripts/provision-auth-users.js
```
Confirm Supabase sends invite emails and `auth_user_id` is populated in `public.users`.

**Verify loginWithPassword throws** — in browser devtools:
```js
Data.loginWithPassword({ email: 'x', password: 'y' })
// Should reject with: [HMA] loginWithPassword() has been removed. Call Data.signIn(...)
```
