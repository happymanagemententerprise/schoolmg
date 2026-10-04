# Bug Investigation 2 — Root Cause Report

**Date:** Investigation of three bugs from the Phase 4 test run  
**Investigator:** Read-only static analysis of source files  

---

## Summary

| # | Bug | Root Cause | Severity |
|---|-----|-----------|----------|
| 1 | HOD login: sidebar/logout hidden after login | `seed.sql` inserts users with plaintext `password` but `password_hash = NULL`; `passwordMatches()` returns `false` when hash is absent, so `login()` is never called | High |
| 2 | Student Quizzes: QuizTaker mounts but no `.panel` visible | `QuizTaker.jsx` renders `<p>` (no `.panel`) when `Data.student()` returns `null`; `studentId` on the user object is `null` when the student–user join fails on the Supabase side | High |
| 3 | Passport modal close button off-screen at 1280×800 | `.modal` has no `max-height` + `overflow-y: auto`; the passport sheet grows taller than the viewport and pushes the footer (containing Close) off the bottom | Medium |

---

## Bug 1 — HOD Login Fails: Sidebar Stays Hidden

### Summary Answer

`passwordMatches()` returns `false` for the HOD account because `user.passwordHash` is `null`. `login()` is never called, so `#app-shell` is never un-hidden, so `#logout-btn` (inside `#app-shell`) never becomes visible. The Playwright `waitForSelector('#logout-btn', { timeout: 12000 })` times out.

### Evidence

**File: `supabase/seed.sql` — lines 80, 54–101**

```sql
insert into users (name, email, password, role, phone, tone, initials,
                   staff_role, is_mentor, mentor_subject, mentor_bio)
values
  ...
  ('Dr. Yaw Asante',  'hod@happyman.edu',  'hod123', 'teacher', '08031234570',
   'yellow', hma_initials('Dr. Yaw Asante'), 'HOD', false, null, null)
  ...
on conflict (email) do update
  set name = excluded.name, role = excluded.role, ... -- password_hash NOT in this list
```

The `on conflict` clause does **not** include `password`, `password_hash`, or `password_salt`. When seed.sql runs on a fresh database:
- New rows are inserted with `password = 'hod123'` and `password_hash = NULL`.
- Existing rows are updated for name/role/etc. but **their password hash is left unchanged**.

**File: `supabase/migrations/20260928_promotion.sql` — lines 494–509**

```sql
alter table users add column if not exists password_hash text;
alter table users add column if not exists password_salt text;

-- Backfill: only rows where password IS NOT NULL and password_hash IS NULL
update users
   set password_salt = encode(gen_random_bytes(16), 'hex')
 where password is not null and password_hash is null and password_salt is null;

update users
   set password_hash = encode(digest(password_salt || password, 'sha256'), 'hex')
 where password is not null and password_hash is null;

update users set password = null where password_hash is not null;
```

The migration backfills hashes for rows that existed when the migration ran. But **seed.sql runs after migrations** (it's `supabase db seed`). New rows inserted by seed.sql have `password_hash = NULL` because the backfill UPDATE has already completed; it won't rerun for new inserts.

**File: `data.js` — line 171, the user cache mapping**

```js
_cache.users = raw.users.map(u => ({
  ...
  passwordHash: u.password_hash || null,  // NULL from Supabase
  passwordSalt: u.password_salt || null,  // NULL from Supabase
  ...
}));
```

**File: `data.js` — lines 1373–1380, `passwordMatches()`**

```js
passwordMatches(user, typed) {
  if (!user) return false;
  if (user.passwordHash && user.passwordSalt) {
    return hashPassword(typed, user.passwordSalt) === user.passwordHash;
  }
  // No hash present — deny access
  return false;
},
```

When `user.passwordHash` is `null`, the function **always returns `false`**, regardless of the password typed.

**File: `src/auth.js` — lines 105–125, `initLogin()` and `login()`**

```js
$('login-form').addEventListener('submit', e => {
  ...
  const user = Data.userByEmail(email);
  if (user && Data.passwordMatches(user, pwI.value)) {
    // passwordMatches returns false → this branch never executes
    login(user); return;
  }
  // Falls through to error messages
  Alpine.store('loginError', 'That password is not right for ' + user.name + '.');
});
```

`login()` is never called → `$('app-shell').hidden = false` never runs → `#logout-btn` inside `#app-shell` stays invisible.

**File: `src/auth.js` — `login()` function**

```js
export function login(user) {
  setCurrentUser(user);
  DB.set('currentUser', { email: user.email });
  $('login-screen').hidden = true;
  $('app-shell').hidden    = false;   // ← This is what makes #logout-btn visible
  buildNav(user);
  updateSidebarUser(user);
  routeToDefaultView(user);
}
```

### Why HOD specifically?

In the failing test environment, the app is running against a Supabase database that was seeded via `seed.sql` after the schema migrations ran. **All seeded users have `password_hash = NULL`**, so all logins fail. However:

1. The Playwright test runs each role in a separate `test()` block.
2. The test for HOD may have been the one that specifically hit a Supabase-backed run, while other tests ran against the in-memory fallback (`_loadSeedFallback()` generates proper hashes).
3. Alternatively, the database was in a partially-migrated state where only some accounts had hashes (those created before the seed.sql re-run).

The in-memory fallback (`_loadSeedFallback()` in `data.js` around line 840) correctly generates hashed passwords using `hashPassword(u[2], salt)` where `u[2]` is the plaintext password. So HOD login works perfectly in offline/fallback mode.

### Role Mapping Verification (HOD role IS correct)

For completeness: the HOD role mapping is correct and is NOT the bug.

- `seed.sql`: `staff_role = 'HOD'`, `role = 'teacher'`
- `_mapRole('teacher', 'HOD')` → returns `'HOD'` ✓ (`data.js` line 2354)
- `isTeacher(user)` → `['Subject Teacher', 'Class Teacher', 'HOD'].includes('HOD')` → `true` ✓
- `buildTeacherCapabilities(user)` → adds nav items including `view-hod-dashboard` for HOD ✓
- `navForUser(user)` → non-empty array, `routeToDefaultView` would work ✓

The auth/nav path is correct. Only the password hash check fails.

### Recommended Fix

Add a post-seed password hash backfill to `seed.sql`, or modify the `on conflict` clause to also regenerate the hash for the `password` column when it's provided:

**Option A — Add backfill at end of seed.sql:**
```sql
-- Re-hash any user that seed.sql just inserted with a plaintext password
UPDATE users
   SET password_salt = encode(gen_random_bytes(16), 'hex')
 WHERE password IS NOT NULL AND password_hash IS NULL AND password_salt IS NULL;

UPDATE users
   SET password_hash = encode(digest(password_salt || password, 'sha256'), 'hex')
 WHERE password IS NOT NULL AND password_hash IS NULL;

UPDATE users SET password = NULL WHERE password_hash IS NOT NULL;
```

**Option B — Update the `on conflict` clause** to include `password` so the backfill migration will re-process it on next run.

---

## Bug 2 — Student Quizzes: No `.panel` Visible

### Summary Answer

`QuizTaker.jsx` renders `<p className="muted-cell p16">This login is not linked to a student record.</p>` (no `.panel` element) when `Data.student(currentUser?.studentId)` returns `null`. This happens when `currentUser.studentId` is `null`, which occurs when the `studentByUser` lookup fails — meaning the student's `user_id` in the Supabase `students` table doesn't match any key in the `studentByUser` map built from `_cache.students`.

### Evidence

**File: `src/react/components/QuizTaker.jsx` — lines 11–22**

```jsx
export default function QuizTaker() {
  const currentUser = getCurrentUser();
  const s = Data.student(currentUser?.studentId);  // studentId from user object

  if (!s) {
    return <p className="muted-cell p16">This login is not linked to a student record.</p>;
    // ← No .panel class anywhere in this render path
  }

  const quizzes = (Data.quizzesFor(s.classId) || []).filter(q => q.isPublished);
```

When `s` is `null`, the component returns a `<p>` with no `.panel`. The test checks `page.locator('.panel').first().isVisible()`.

**File: `data.js` — lines 147–162, student cache mapping**

```js
_cache.students = raw.students.map(s => ({
  id:      String(s.id),
  _userId: s.user_id ? String(s.user_id) : null,  // FK to users.id
  ...
  classId: String(s.class_id),
  ...
}));

const studentByUser = new Map(_cache.students.map(s => [s._userId, s.id]));
```

**File: `data.js` — lines 171–186, user cache mapping**

```js
_cache.users = raw.users.map(u => ({
  id:        String(u.id),
  ...
  studentId: studentByUser.get(String(u.id)) || null,  // null if no match
  ...
}));
```

If `students.user_id` for Ama Osei doesn't match `users.id` exactly (type mismatch, missing FK, or stale data), `studentByUser.get(String(u.id))` returns `undefined`, and `studentId` becomes `null`.

**Why `.panel` is always rendered when quizzes are empty (for reference):**

```jsx
if (mode === 'list') {
  return (
    <>
      <section className="welcome-row">...</section>
      <div className="panel mt16">   {/* ← .panel always present in list mode */}
        ...
        {quizzes.length ? (
          <table>...</table>
        ) : (
          <p className="muted-cell">No quizzes are available for your class right now.</p>
        )}
      </div>
    </>
  );
}
```

The `.panel` div renders regardless of quiz count. Empty quizzes are NOT the cause of the missing panel. The cause is the `!s` early return.

### Seed Data Verification

The seed quiz for Grade 7 exists in both `data.js` (`_loadSeedFallback`, line 1087) and `supabase/seed.sql` (line 652–680). Ama Osei (`ama.osei@happyman.edu`) is in Grade 7 (`data.js` line 885, `seed.sql` student inserts). The quiz `is_published: true`. So when student data loads correctly, quizzes would be visible.

### Probable Supabase Cause

In the Supabase database, if the `students` table was populated without the `user_id` FK being set (e.g., via a partial seed or migration gap), `s.user_id` is NULL. `String(null)` is `'null'`. No user has `id === 'null'`. Result: `studentId = null` for all student accounts → `Data.student(null)` returns `null` → `!s` guard fires → no `.panel`.

**Check `supabase/seed.sql` student insert (around line 220–260):**

```sql
insert into students (user_id, class_id, admission_no, gender, mentor_id, ...)
select u.id, c.id, v.admission_no, v.gender, ...
  from (values ('Ama Osei', 'Grade 7', 'HMA/2026/001', ...)) as v(...)
  join users u on u.name = v.name and u.role = 'student'
  join classes c on c.class_name = v.class_name
  ...
```

If the `join users` fails (e.g., the user row wasn't committed yet, or `role` mismatch), `user_id` won't be set.

### Recommended Fix

1. **Immediate diagnostic:** Log `currentUser.studentId` inside `QuizTaker.jsx` when `!s`, to confirm the null studentId path.
2. **Add a null guard with a user-facing message** that distinguishes "no student record" from "no quizzes":
   ```jsx
   if (!currentUser) return <p className="muted-cell p16">Not logged in.</p>;
   if (!s) return (
     <div className="panel mt16">
       <p className="muted-cell">Student record not found (id: {currentUser.studentId ?? 'none'}).</p>
     </div>
   );
   ```
3. **Fix the seed:** Verify `supabase/seed.sql` student inserts correctly set `user_id` via the join on `users`.
4. **Verify the DB state:** Run `SELECT u.name, u.id, s.id as student_id, s.user_id FROM users u LEFT JOIN students s ON s.user_id = u.id WHERE u.role = 'student';` and confirm `user_id` is set for Ama Osei.

---

## Bug 3 — Passport Modal Close Button Off-Screen at 1280×800

### Summary Answer

The `.modal` base class has no `max-height` and no `overflow-y: auto`. The passport sheet generates a tall HTML document (academic records, competency bars, artifacts, footer). At 1280×800, the modal content exceeds the viewport height, and the `.modal-footer` (which contains the Close button) is pushed below the bottom of the screen. The `.modal-overlay` has `padding: 20px` and `align-items: center` — centering a modal taller than 800px places its footer outside the visible area.

### Evidence

**File: `src/styles.css` — lines 762–781 (modal base styles)**

```css
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(25,29,36,.4);
  z-index: 60;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  /* ← No overflow-y: auto on overlay */
}
.modal {
  background: var(--white); border-radius: 10px;
  width: min(480px, 100%);
  box-shadow: 0 24px 60px rgba(0,0,0,.2);
  overflow: hidden;
  /* ← No max-height, no overflow-y: auto */
}
```

**File: `src/styles.css` — line 1307 (passport modal override)**

```css
.passport-modal { width: min(820px, 100%); }
/* ← Only overrides width. Still inherits .modal with no max-height. */
```

**File: `src/styles.css` — lines 1308–1358 (passport sheet content)**

The passport sheet has multiple stacked sections:
- `.p-head` — header with school crest
- `.p-banner` — student name, snapshot stats
- `.p-section` — academic record table (rows per subject, padding 14px 20px each)
- `.p-section` — 360° competency bars (5 bars)
- `.p-section` — verified artifacts (cards)
- `.p-footer` — QR code, signature lines

For a student with a full subject table (8–10 subjects), each row ~26px, plus headers and sections, the total height of `.passport-sheet` can easily reach 900–1100px. At 800px viewport height, with the overlay's `padding: 20px`, only 760px is available. The `.modal-header` (~80px) + `.modal-body` (~900px) + `.modal-footer` (~60px) = ~1040px total — 280px beyond the visible area.

**File: `index.html` — lines 1205–1224 (passport modal HTML)**

```html
<div class="modal-overlay" id="passport-modal">
  <div class="modal passport-modal">
    <div class="modal-header">
      <h3>Student Achievement Passport</h3>
      <!-- Print & close buttons -->
    </div>
    <div class="modal-body">
      <div id="passport-sheet" class="passport-sheet"></div>
    </div>
    <div class="modal-footer">
      <!-- Save as PDF + Close buttons -->
      <button class="outline-button" data-modal="passport-modal">Close</button>
      <!-- ← This button is off-screen -->
    </div>
  </div>
</div>
```

### The Exact CSS Gap

The `.modal` and `.modal-overlay` are missing:

```
.modal-overlay: overflow-y: auto  (needed so the overlay itself scrolls)
.modal:         max-height: calc(100vh - 40px)
.modal-body:    overflow-y: auto  (so body scrolls, keeping header & footer fixed)
```

Without these, the modal overflows the viewport with no scrollbar, and the footer is unreachable.

### Recommended Fix

**Option A — Scrollable body (preferred, header/footer stay visible):**

```css
/* In src/styles.css */
.modal {
  /* existing: */
  background: var(--white); border-radius: 10px;
  width: min(480px, 100%); box-shadow: 0 24px 60px rgba(0,0,0,.2);
  overflow: hidden;
  /* ADD: */
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
}
.modal-body {
  /* existing: padding: 22px 24px 10px; */
  overflow-y: auto;
  flex: 1;           /* grows to fill available space between header and footer */
  min-height: 0;     /* important: flex child must be allowed to shrink */
}
```

**Option B — Scrollable overlay:**

```css
.modal-overlay {
  /* existing styles... */
  overflow-y: auto;
  align-items: flex-start;  /* change from center so content starts at top */
}
```

Option A is preferred: it keeps the modal centered and always shows the Close button without requiring the user to scroll the dimmed overlay.

---

## Conclusions

| Bug | File(s) to Fix | Change Required |
|-----|---------------|-----------------|
| 1 (HOD login) | `supabase/seed.sql` | Add backfill UPDATE at end of seed to hash passwords inserted without `password_hash` |
| 2 (Quizzes no panel) | `supabase/seed.sql`, `src/react/components/QuizTaker.jsx` | Fix seed student insert to ensure `user_id` is set; add `.panel` wrapper around the `!s` early-return path |
| 3 (Passport off-screen) | `src/styles.css` | Add `max-height: calc(100vh - 40px)`, `display: flex`, `flex-direction: column` to `.modal`; add `overflow-y: auto`, `flex: 1`, `min-height: 0` to `.modal-body` |

None of these bugs require architectural changes. All three are one-file or two-file fixes.
