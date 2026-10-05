# Auth Migration Investigation — Happy Man Academy

**Date:** 2025  
**Project:** `https://erlhyrswcqpqpqzbgmgb.supabase.co`  
**Scope:** Migrate from custom SHA-256 password auth to Supabase Auth (GoTrue), add real server-side RLS

---

## Summary Answers (TL;DR)

1. **Every single table** is loaded with `SELECT *` (no user filter) on startup into `_cache`. The browser holds the entire school database in memory.
2. **Must be per-user filtered:** `grades`, `students`, `attendance_weekly`, `attendance_daily`, `remarks`, `lms_attempts`, `parent_students`, `commendations`, `portfolio_artifacts`, `parent_engagements`. **Can stay school-wide:** `subjects`, `classes`, `sessions`, `terms`, `time_slots`, `timetables`, `events`, `assignments`, `teacher_subjects`, `teacher_classes`, `departments`, `weekly_topics`, `lms_lessons`, `lms_quizzes`, `lms_questions`, `lms_discussions`.
3. **currentUser fields needed:** `id`, `name`, `initials`, `email`, `role`, `tone`, `phone`, `isMentor`, `mentorSubject`, `mentorBio`, `studentId`, `childIds`, `adminTier` — 13 fields total.
4. **Minimal migration path:** Add `auth_user_id uuid` to `public.users`, create Supabase Auth accounts for all users, replace `loginWithPassword()` call with `supabase.auth.signInWithPassword()`, then swap `app_user_id()` stub for `auth.uid()` in RLS policies.
5. **Yes**, `auth_user_id uuid REFERENCES auth.users(id)` must be added to `public.users` to link the two identity systems.
6. **RLS for grades:** student sees own rows (`student_id = (SELECT id FROM students WHERE user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid()))`), teacher sees their class rows, admin sees all.

---

## 1. Current Auth Flow

### Bootstrap (`src/main.js`)
On `DOMContentLoaded`, `main.js` calls `window.loadFromSupabase()` which runs **all** `_sources` queries in parallel (`Promise.allSettled`), loads every row of every table into `_cache`, then re-enables the login button. Session restore reads `localStorage.getItem('hma_currentUser')` and calls `Data.userByEmail(saved.email)` to find the user record in the already-loaded cache.

### Login (`src/auth.js` → `data.js`)
`initLogin()` wires the login form. On submit it calls:
```js
const { user, error } = await Data.loginWithPassword({ email, password });
```
`Data.loginWithPassword` (data.js line ~1388) does a **live database query** to fetch `id, password_hash, password_salt` for that email, computes `sha256(salt + typed_password)`, and compares. If it matches it returns the matching record from `_cache.users` (which was already loaded). 

The login Edge Function at `supabase/functions/login/index.ts` does the same thing using the service_role key. Both paths exist, but `auth.js` calls the **direct DB path** (`loginWithPassword`), not the Edge Function.

### Session persistence
On success, `login(user)` in `auth.js` stores only `{ email: user.email }` in `localStorage`. On next page load, `main.js` does `Data.userByEmail(saved.email)` — no password re-check, just a lookup in the in-memory cache. **This is the primary security problem**: a user can open DevTools, call `login(Data.userByEmail('anyadmin@school.com'))` and bypass login entirely.

### Logout
`logout()` calls `setCurrentUser(null)`, clears localStorage, hides the app shell. **No server-side session invalidation** occurs — the Supabase `anon` key is always active.

---

## 2. How `currentUser` Is Used Across the App

### Fields accessed (verified by grep across `src/**/*.js`)

| Field | Used in |
|---|---|
| `id` | All views — filtering own content, writing `teacherId`/`userId`/`decidedBy` on mutations |
| `name` | Dashboard welcome headers, sidebar, topbar |
| `initials` | Sidebar avatar, topbar avatar |
| `email` | Session restore (`DB.get('currentUser').email`) |
| `role` | `isAdmin()`, `isTeacher()`, `isStudent()`, `isParent()` — gates every view |
| `tone` | Avatar CSS class |
| `phone` | Mentor modal display |
| `isMentor` | Teacher dashboard mentor stat |
| `mentorSubject` | Mentor modal |
| `mentorBio` | Mentor modal |
| `studentId` | Every student view (`renderStudentDashboard`, `renderStudentResults`, etc.) — maps to `Data.student(currentUser.studentId)` |
| `childIds` | Parent views — `currentUser.childIds.map(id => Data.student(id))` |
| `adminTier` | Admin approval gates (`vice_principal` must request, `principal`/null approves) |

**Count of `getCurrentUser()` call sites:** 30+ across `src/views/teacher.js`, `src/views/student.js`, `src/views/parent.js`, `src/views/admin.js`, `src/views/shared.js`, `src/auth.js`.

### Data access pattern: ALL client-side filtering
None of the `_sources` queries use a `WHERE user_id = current_user` filter. Every table is loaded in full. Views then filter in JavaScript:
- Teacher: `Data.lmsLessons().filter(l => l.teacherId === currentUser.id)`
- Student: `Data.student(currentUser.studentId)` — resolves from full student list
- Parent: `(currentUser.childIds || []).map(id => Data.student(id))`

**This means a student in DevTools can call `Data.scores` and see every other student's grades.**

---

## 3. Tables Loaded with SELECT * (No User Filter)

All of these are in `_sources` in `data.js` (lines 66–100). Only `session` has a `.eq('is_current', true)` filter. Everything else is unfiltered:

### Sensitive per-user data (MUST be filtered after migration)
| Table | Sensitivity |
|---|---|
| `grades` | Student scores — the core breach target |
| `students` | Personal info: admission no, gender, status, mentor assignment |
| `attendance_weekly` | Per-student days present |
| `attendance_daily` | Per-student daily P/L/A status |
| `remarks` | Teacher and principal written remarks on each student |
| `lms_attempts` | Student quiz scores and answers |
| `parent_students` | Parent ↔ student links (family data) |
| `portfolio_artifacts` | Student portfolio work, status |
| `commendations` | Teacher notes about individual students |
| `parent_engagements` | Parent login timestamps, acknowledgements |
| `promotions` | End-of-year promotion decisions per student |
| `promotion_overrides` | Admin manual promotion decisions |
| `path_requests` | Student stream change requests |
| `subject_selections` | Student subject choices |
| `approval_requests` | Privileged action requests including student data |
| `student_transfers` | Class reclassification records |
| `score_uploads` | Upload coverage per teacher/class/subject |

### School-wide shared data (safe to keep as SELECT *)
| Table | Notes |
|---|---|
| `subjects` | Curriculum — all users need this |
| `classes` | Class list — all users need this |
| `sessions` | Academic calendar |
| `terms` | Term dates |
| `time_slots` | Timetable slots |
| `timetables` | Generated timetable — all users need their own class |
| `events` | School events calendar |
| `assignments` | Homework — students need to see all in their class |
| `teacher_subjects` | Who teaches what |
| `teacher_classes` | Class teacher assignments |
| `departments` | Department structure |
| `weekly_topics` | Topics covered per class/subject |
| `lms_lessons` | Lessons published to a class |
| `lms_quizzes` | Quizzes published to a class |
| `lms_questions` | Quiz questions |
| `lms_discussions` | Discussion threads per class |
| `lms_posts` | Discussion replies |
| `timetable_settings` | School day structure |
| `teacher_recognitions` | Staff recognition awards (aggregate, not personal) |

---

## 4. Supabase Project Auth Capabilities

`supabase/config.toml` has `[auth] enabled = true` with email/password auth fully configured:
- `enable_signup = true`, `enable_confirmations = false` (no email confirm required)
- `minimum_password_length = 6`
- `enable_anonymous_sign_ins = false`

**Supabase Auth is available and configured** — no infra work needed. The hosted project at `erlhyrswcqpqpqzbgmgb.supabase.co` also has Auth by default.

---

## 5. Current `public.users` Table Structure

The schema evolves across four migration files:

**`20260926_initial_schema.sql`** — base schema:
```sql
users (id bigint, name text, email text unique, password text NOT NULL, 
       role text, phone text, created_at timestamptz)
```

**`20260927_school_upgrade.sql`** — adds:
```sql
tone text, initials text, staff_role text CHECK(staff_role IN ('Class Teacher','Subject Teacher','HOD')),
is_mentor boolean DEFAULT false, mentor_subject text, mentor_bio text
```

**`20260928_promotion.sql`** — adds:
```sql
admin_tier text CHECK(admin_tier IN ('principal','vice_principal')),
password_hash text,
password_salt text
-- password column made nullable and cleared after backfill
```

**`20261004_rls_policies.sql`** — adds column-level security:
```sql
REVOKE SELECT (password_hash, password_salt) ON public.users FROM anon;
```

### Current complete `users` schema (after all migrations):
```
id             bigint IDENTITY PK
name           text NOT NULL
email          text NOT NULL UNIQUE
password       text (nullable after hash backfill — legacy only)
password_hash  text  ← blocked from anon SELECT
password_salt  text  ← blocked from anon SELECT
role           text CHECK(admin|teacher|student|parent)
phone          text
tone           text DEFAULT 'blue'
initials       text
staff_role     text CHECK(Class Teacher|Subject Teacher|HOD)
is_mentor      boolean DEFAULT false
mentor_subject text
mentor_bio     text
admin_tier     text CHECK(principal|vice_principal)
created_at     timestamptz
```

**`auth_user_id` does NOT exist yet.** There is no link between `public.users` and `auth.users`. The `app_user_id()` function in `20261004_rls_policies.sql` is a placeholder that reads a GUC setting — it is not wired to real auth:
```sql
CREATE OR REPLACE FUNCTION app_user_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT current_setting('app.user_id', true) $$;
```

---

## 6. RLS Current State

### What exists (`20261004_rls_policies.sql`)
RLS is enabled on `grades`, `students`, `users`, `promotions`. The policies are **completely open** — they give anon full SELECT/INSERT/UPDATE:
```sql
CREATE POLICY grades_select  ON public.grades FOR SELECT TO anon USING (true);
CREATE POLICY grades_insert  ON public.grades FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY grades_update  ON public.grades FOR UPDATE TO anon USING (true) WITH CHECK (true);
-- same pattern for students, users, promotions
```

The initial schema (`20260926_initial_schema.sql`) also created `anon_all` policies on all other tables with `USING (true)`. RLS is enabled everywhere but universally permissive.

### What proper per-user RLS would look like after migration

After adding `auth_user_id uuid` to `public.users`:

```sql
-- Helper: get the public.users.id for the logged-in auth user
CREATE OR REPLACE FUNCTION public_user_id() RETURNS bigint
  LANGUAGE sql STABLE SECURITY DEFINER
  AS $$ 
    SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1 
  $$;

-- Helper: get the students.id for the logged-in student
CREATE OR REPLACE FUNCTION current_student_id() RETURNS bigint
  LANGUAGE sql STABLE SECURITY DEFINER
  AS $$
    SELECT id FROM public.students WHERE user_id = public_user_id() LIMIT 1
  $$;

-- Helper: get class ids taught by the logged-in teacher
CREATE OR REPLACE FUNCTION teacher_class_ids() RETURNS bigint[]
  LANGUAGE sql STABLE SECURITY DEFINER
  AS $$
    SELECT ARRAY(SELECT class_id FROM teacher_subjects WHERE teacher_id = public_user_id())
  $$;

-- GRADES: student sees own, teacher sees their class, admin sees all
DROP POLICY IF EXISTS grades_select ON public.grades;
CREATE POLICY grades_select ON public.grades FOR SELECT
  TO authenticated
  USING (
    -- student: only own rows
    student_id = current_student_id()
    OR
    -- teacher/HOD: rows in any class they teach
    EXISTS (
      SELECT 1 FROM teacher_subjects ts
      WHERE ts.teacher_id = public_user_id()
        AND ts.class_id = (SELECT class_id FROM students WHERE id = grades.student_id)
        AND ts.subject_id = grades.subject_id
    )
    OR
    -- admin: all rows
    EXISTS (SELECT 1 FROM users WHERE id = public_user_id() AND role = 'admin')
    OR
    -- parent: children's rows
    EXISTS (
      SELECT 1 FROM parent_students ps
      WHERE ps.parent_id = public_user_id()
        AND ps.student_id = grades.student_id
    )
  );

-- STUDENTS: same four-way pattern
DROP POLICY IF EXISTS students_select ON public.students;
CREATE POLICY students_select ON public.students FOR SELECT
  TO authenticated
  USING (
    id = current_student_id()                              -- own record
    OR class_id = ANY(teacher_class_ids())                 -- teacher's class
    OR EXISTS (SELECT 1 FROM users WHERE id = public_user_id() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM parent_students ps WHERE ps.parent_id = public_user_id() AND ps.student_id = students.id)
  );

-- ATTENDANCE: same logic, reference attendance.student_id
-- REMARKS: same logic
-- LMS_ATTEMPTS: student sees own, teacher sees class, admin sees all
-- PARENT_STUDENTS: parent sees own rows, admin sees all
```

---

## 7. Conclusions & Recommendations

### Root cause of the security problem
The app uses the `anon` Supabase key for every request. There is no authenticated session — every browser tab has the same anonymous access level. Client-side `role` checks in JavaScript are the only gate. A developer can bypass them trivially via DevTools.

### Recommended migration path (minimal, no breaking changes)

**Phase 1 — Add the link column (one migration):**
```sql
ALTER TABLE public.users 
  ADD COLUMN auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
```
No app changes needed yet. This column is null for all existing users.

**Phase 2 — Provision Supabase Auth accounts (one-time backfill):**
Run a script (service_role key) that calls `supabase.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true })` for every row in `public.users`, then writes the returned `auth_user.id` back to `public.users.auth_user_id`. Send all users a password-reset email, or use the school's own password reset flow to migrate credentials.

**Phase 3 — Swap the login call (`src/auth.js` + `data.js`):**
Replace `Data.loginWithPassword({ email, password })` with `supabase.auth.signInWithPassword({ email, password })`. The returned `session.user` has the `auth.uid()`. Then look up `Data.userByEmail(session.user.email)` to get the app profile (all 13 fields). This is one line change in `initLogin()` in `src/auth.js`.

```js
// Before
const { user, error } = await Data.loginWithPassword({ email, password });

// After
const { data: { session }, error } = await _sb.auth.signInWithPassword({ email, password });
if (!session) { /* show error */ return; }
const user = Data.userByEmail(session.user.email);
```

Session restore in `main.js` changes from `DB.get('currentUser')` to `_sb.auth.getSession()` — Supabase handles cookie/localStorage automatically.

**Phase 4 — Tighten RLS (one migration, after Phase 3 is deployed):**
Replace all `USING (true)` policies with the per-user policies shown in section 6. The `authenticated` role (set automatically when `signInWithPassword` succeeds) can call `auth.uid()`, which the helper functions map to `public.users.id`. The `anon` role gets SELECT only on the school-wide shared tables listed in section 3.

**Phase 5 — Stop loading sensitive tables on startup for non-admin roles:**
After RLS is in place, the data layer can be simplified: student users only receive their own `grades`/`attendance` rows because the DB enforces it. The full bulk-load architecture can stay — RLS automatically scopes the results. No app-level query changes required if the DB-level policies are correct.

### What does NOT need to change
- `currentUser` object shape — all 13 fields come from `public.users`, not from `auth.users`. The lookup `Data.userByEmail(email)` already works.
- The `_cache` architecture — still valid, just the rows returned by Supabase will be scoped by RLS once the policies are tightened.
- The Edge Functions for `login` and `verify-password` — they can be retired once Supabase Auth is in use, or kept as fallback during migration.
- View code — no changes needed in any `src/views/*.js` file.

### One migration to add, one to modify
| File | Change |
|---|---|
| New migration `20261005_auth_migration.sql` | Add `auth_user_id uuid` column, update helper functions to use `auth.uid()`, replace open RLS policies with per-user policies |
| `src/auth.js` `initLogin()` | 3-line swap from `loginWithPassword` to `supabase.auth.signInWithPassword` |
| `src/main.js` session restore | Replace `DB.get('currentUser')` restore with `supabase.auth.getSession()` |
| `supabase/functions/login/` | Can be retired (optional) |

### Risk assessment
- **Low risk:** Adding `auth_user_id` column is additive — nothing breaks.
- **Medium risk:** Provisioning auth accounts requires a one-time backfill script; use service_role key, never commit it.
- **High risk if done wrong:** Tightening RLS policies. Must test each policy before deploying. Incorrect policies could lock teachers out of class data. Test with `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"<uuid>"}';` in psql.
- **The load-everything architecture means tightened RLS just narrows the rows returned** — the app does not need to know which queries to run differently, it just gets fewer rows. This is the safe migration order.
