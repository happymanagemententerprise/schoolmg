# Supabase Auth migration replacing custom SHA-256 password check

This change replaces the browser-side SHA-256 password verification with Supabase GoTrue auth. Previously, `loginWithPassword` fetched the hash/salt pair for one account and compared them client-side; any user who could read network responses or DevTools memory could extract session data for other users because all data was loaded into the browser cache under the `anon` role. The new approach signs users in via `_sb.auth.signInWithPassword()`, gets a Supabase JWT, and all subsequent database calls run as `authenticated` with per-user RLS policies. Session restore in `main.js` now calls `Data.getSession()` instead of reading `DB.get('currentUser')` from localStorage.

Watch for: **(confirmed)** `teacher_class_ids()` is built from `teacher_subjects`, not `teacher_classes` — a class-only teacher with no subject assignments gets an empty array and is silently locked out of grades. **(confirmed)** Roughly 20 tables (`attendance_weekly`, `lms_lessons`, `assignments`, `timetables`, `sessions`, `terms`, etc.) still carry `USING (true)` open `anon` policies from prior migrations — the new migration only locks down four tables. **(confirmed)** `loginWithPassword` is not removed from `data.js` and is still reachable from the console/devtools. **(confirmed)** The temporary password algorithm `HMA@<first4chars>2026` is deterministic from the email address; anyone who knows the scheme can brute-force accounts.

**Verdict**: NEEDS_CHANGES

---

## High-level view

The four tables that mattered most — `grades`, `students`, `users`, `promotions` — now have real per-user RLS policies. The JWT flows from login to session restore cleanly: `signIn` produces a Supabase session, `main.js` restores it via `getSession()`, and `logout` calls `signOut()` so Supabase clears the token. No hardcoded service key appears anywhere in the browser bundle; the provision script reads it from env and guards on startup.

The coverage gap is large: every other table in the schema (`attendance_weekly`, `attendance_daily`, `assignments`, `remarks`, `lms_*`, `timetables`, `sessions`, `terms`, `teacher_classes`, `teacher_subjects`, `parent_students`, `rooms`, `time_slots`, `portfolio_artifacts`, `commendations`, `parent_engagements`, `teacher_recognitions`, `promotion_overrides`, `score_uploads`, `transfers`, `path_requests`, `approval_requests`) still has a blanket `anon_all USING (true)` policy from prior migrations. An unauthenticated request with the public anon key can read all attendance, LMS content, weekly topics, and growth records without a JWT. The new migration documents that it drops `anon_all` on four tables; it does not touch the other ~20.

The `teacher_class_ids()` helper queries `teacher_subjects` to resolve which classes a teacher can see. Teachers who are registered in `teacher_classes` but have no rows in `teacher_subjects` (e.g. a class teacher who doesn't teach a subject in the system) get an empty array from that function, meaning the `grades_select` and `students_select` policies will silently return zero rows for their class.

The old `loginWithPassword` method is still present in `data.js` and not marked private or removed. It is no longer called by `src/auth.js`, but it is accessible from the browser console or any future accidental call. Its comment now points at itself as a deprecated alias, which is confusing.

The provisional password scheme (`HMA@<first4chars>2026`) is deterministic from the email address. Anyone who knows the pattern can compute the credential for any user before they reset it. The verify file notes that a reset flow is the "next step," but there is no enforcement at login time (no `password_changed` flag, no `force_reset` guard in the login handler).

---

<details>
<summary>Issues (4)</summary>

1. **Most tables still open to anon** — `attendance_weekly`, `attendance_daily`, `assignments`, `remarks`, `lms_lessons`, `lms_quizzes`, `lms_attempts`, `lms_discussions`, `timetables`, `sessions`, `terms`, `teacher_classes`, `teacher_subjects`, `parent_students`, `portfolio_artifacts`, `commendations`, `parent_engagements`, `teacher_recognitions`, `promotion_overrides` all still have `USING (true)` policies for the `anon` role. Extend `20261005_supabase_auth.sql` (or a follow-on migration) to drop those `anon_all` policies and add `authenticated`-only policies matching the role semantics already established for grades/students.

2. **`teacher_class_ids()` queries wrong table** — the helper selects from `teacher_subjects`, but the authoritative class-teacher relationship is `teacher_classes`. A class teacher with no subject rows gets an empty array, locking them out of all `grades` and `students` reads for their class. Because the app caches all students on load via `_sources.students`, this produces a silent data gap rather than a visible error. Change the helper to `UNION` both tables.

3. **`loginWithPassword` not removed** — the old SHA-256 method remains in `data.js` and is callable from the browser console. Remove it or convert it to a hard throw so it cannot be used as a fallback auth path.

4. **Deterministic temporary passwords without forced reset** — `HMA@<first4chars>2026` is computable from the email address, and the login handler has no `force_reset` guard. Add a `must_change_password` column (or Supabase custom claim) and redirect to a change-password screen on first login, or use Supabase's invite/magic-link flow to avoid issuing guessable credentials at all.

</details>

---

<details>
<summary>Details</summary>

## Open `anon` policies on ~20 tables

The new migration drops `anon_all` on exactly four tables: `grades`, `students`, `users`, `promotions`. The prior migrations (`20260926_initial_schema.sql`, `20260927_school_upgrade.sql`, `20260928_promotion.sql`, `20260929_lms.sql`, `20260930_attendance_daily.sql`, `20261003_growth.sql`) created `anon_all USING (true)` on every other table in the schema. After this migration runs, an HTTP request with only the anon key — no JWT at all — can still:

- Read every student's weekly and daily attendance records
- Read all LMS lessons, quiz questions, correct answers, and student quiz attempts
- Read all teacher remarks about students
- Read all class timetables, assignments, and subject allocations
- Read growth records (portfolio artifacts, commendations, parent engagement history)
- Read all school sessions and terms configuration

The four locked tables are the most sensitive (grades and student identity), but the remaining surface is substantial. This is a confirmed gap: the prior migration files are all visible in the repo, and `20261005_supabase_auth.sql` contains no `DROP POLICY` or `CREATE POLICY` statements for those tables.

## `teacher_class_ids()` — wrong source table

```sql
SELECT ARRAY(
  SELECT DISTINCT class_id FROM teacher_subjects
  WHERE teacher_id = public_user_id()
)
```

`teacher_subjects` maps a teacher to the subjects they teach in each class. `teacher_classes` maps a teacher to a class they manage. These are separate relationships. A class teacher who is not assigned any subject in `teacher_subjects` (perhaps because the school records class-teacher assignments separately from subject allocations) gets an empty array from this function. Every RLS policy on `grades` and `students` that checks `class_id = ANY(teacher_class_ids())` will return zero rows for that teacher, with no error.

The fix: read from `teacher_classes` as well —

```sql
SELECT ARRAY(
  SELECT DISTINCT class_id FROM teacher_subjects WHERE teacher_id = public_user_id()
  UNION
  SELECT class_id FROM teacher_classes WHERE teacher_id = public_user_id()
)
```

## `loginWithPassword` retained in `data.js`

Lines 1384–1420 of `data.js` still contain the full `async loginWithPassword({ email, password })` implementation. It is no longer called by `src/auth.js`, but `data.js` exports `Data` on `window`, making `Data.loginWithPassword(...)` callable from the browser console or any module that imports `Data`. The comment on `passwordMatches()` at line 1379 still points at `loginWithPassword()` as the migration target, which is now incorrect. The old method should be removed so there is no alternative auth path that bypasses GoTrue.

## Deterministic provisional passwords

The provisioning script generates `HMA@<first4chars>2026` for every user. For `ama.osei@happyman.edu` that is `HMA@ama.2026`. The pattern is public in the codebase comments. There is no `force_reset` guard in the login handler (`src/auth.js` lines 120–142) and no flag in the database schema to track whether a password has been changed. Until every user resets their password, any person who reads the provisioning script can compute valid credentials for any account. Supabase's admin API supports sending invite emails that bypass this problem entirely; the provision script could call `generateLink({ type: 'invite', email })` instead of setting a password.


</details>

---

<details>
<summary>File map</summary>

- `data.js` — added `signIn`, `signOut`, `getSession` methods at the bottom of the `Data` object; `loginWithPassword` retained (not removed)
- `src/auth.js` — login submit handler replaced with `Data.signIn`; `logout()` made async and calls `Data.signOut()`; no `DB.set('currentUser')` calls remain
- `src/main.js` — session restore uses `Data.getSession()` instead of `DB.get('currentUser')`
- `supabase/migrations/20261005_supabase_auth.sql` — adds `auth_user_id` column, five helper functions, per-user RLS on grades/students/users/promotions; drops `anon_all` on those four tables only
- `scripts/provision-auth-users.js` — one-time script to create GoTrue accounts for existing users; reads service key from env; links `auth_user_id` back to `public.users`

Full diff: `git diff main -- data.js src/auth.js src/main.js supabase/migrations/20261005_supabase_auth.sql scripts/provision-auth-users.js`

</details>
