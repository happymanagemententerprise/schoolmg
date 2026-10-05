# Supabase Auth Migration — Verification Notes

**Date:** 2026-10-05  
**Task:** Migrate from custom SHA-256 password auth to Supabase Auth (GoTrue) with per-user RLS policies

---

## Changes Made

### PART 1 — Database migration
**File:** `supabase/migrations/20261005_supabase_auth.sql` (created)
- Adds `auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL` column to `public.users`
- Creates index `users_auth_user_id_idx` on `public.users(auth_user_id)`
- Creates helper functions: `public_user_id()`, `current_student_id()`, `teacher_class_ids()`, `parent_student_ids()`, `is_admin_user()`
- Drops all open `USING (true)` policies on `grades`, `students`, `users`, `promotions`
- Creates per-user RLS policies scoped to `authenticated` role using the helpers

### PART 2 — Provisioning script
**File:** `scripts/provision-auth-users.js` (created)
- One-time script to create Supabase Auth accounts for all existing `public.users`
- Uses `SUPABASE_SERVICE_KEY` from environment variable (never hardcoded)
- Links `auth_user_id` back to `public.users` after creating each auth account

### PART 3 — data.js auth methods
**File:** `data.js` (modified)
- Added `signIn({ email, password })` — calls `_sb.auth.signInWithPassword()`
- Added `signOut()` — calls `_sb.auth.signOut()`
- Added `getSession()` — calls `_sb.auth.getSession()`

### PART 4 — src/auth.js
**File:** `src/auth.js` (modified)
- **4a:** Replaced `Data.loginWithPassword(...)` submit handler with `Data.signIn(...)` using the Supabase session
- **4b:** Added `await Data.signOut()` as the first statement in `logout()`
- **4c:** Removed `DB.set('currentUser', ...)` from `login()`, removed `DB.set('currentUser', null)` from `logout()`
- Made `logout()` async to support `await Data.signOut()`

### PART 5 — src/main.js
**File:** `src/main.js` (modified)
- Replaced `DB.get('currentUser')` session restore with `await Data.getSession()`
- Session is now restored from Supabase Auth (cookie/localStorage managed by Supabase client)
- Added `!Data.accountBlocked(fresh)` check on restore (security improvement)

### PART 6 — PROJECT-STATUS.md
**File:** `PROJECT-STATUS.md` (appended)
- Added Supabase Auth section with instructions to run the provision script

---

## Verification Results

| Check | Result |
|---|---|
| `npm run build` exit code | ✅ 0 (success) |
| `loginWithPassword` absent from `src/auth.js` | ✅ Confirmed |
| `signIn` present in `data.js` | ✅ Confirmed |
| `signOut` present in `data.js` | ✅ Confirmed |
| `getSession` present in `data.js` | ✅ Confirmed |
| `supabase/migrations/20261005_supabase_auth.sql` exists | ✅ Confirmed |
| `scripts/provision-auth-users.js` exists | ✅ Confirmed |
| No hardcoded service key in provision script | ✅ Confirmed |
| `src/main.js` uses `Data.getSession()` | ✅ Confirmed |
| `src/main.js` no longer uses `DB.get('currentUser')` | ✅ Confirmed |

---

## Build Output Summary
- Build tool: Vite 5.4.11
- Exit code: 0
- Warnings: pre-existing dynamic import warnings (not related to this change)
- Output: 8 bundles generated successfully

---

## Next Steps (requires manual action)
1. Apply `supabase/migrations/20261005_supabase_auth.sql` to the live database via Supabase dashboard SQL editor or `npx supabase db push`
2. Run `SUPABASE_SERVICE_KEY=<service_role_key> node scripts/provision-auth-users.js` to create auth accounts for all existing users
3. Communicate temporary passwords to users: `HMA@<first4charsOfEmail>2026`
4. Implement a password-reset flow so users can set their own passwords on first login
