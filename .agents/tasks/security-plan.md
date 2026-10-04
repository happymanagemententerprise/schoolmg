# Implementation Plan — Security Fixes (Happy Man Academy)

## Context

Exploration findings:
- `data.js` line ~1378: `passwordMatches()` checks `user.passwordHash`/`user.passwordSalt` which are never
  populated in `_cache.users` (the `_sources.users` SELECT deliberately excludes those columns). It always
  returns `false` — login is broken on the live backend.
- `data.js` line ~1395: `loginWithEdgeFunction()` and `verifyPassword()` already exist and call Supabase
  Edge Functions — but no Edge Functions are deployed yet, so those also fail.
- `src/auth.js` `initLogin()` still calls the OLD path: `Data.userByEmail()` → `Data.passwordMatches()`.
- `hashPassword(plain, salt)` is a plain `_sha256Hex(salt + plain)` helper already in `data.js` (line ~3420)
  and is available in the same scope as `loginWithPassword()` will be added to.
- `supabase/config.toml` exists; `npx supabase` is available (v2.119.0).
- Existing migrations: 20260926 through 20261003. The next migration should be dated 20261004.
- `PROJECT-STATUS.md` exists and needs a Security section.
- No `security-plan.md` exists yet in `.agents/tasks/`.

---

- [ ] 1. Add `loginWithPassword()` to the Data object in `data.js`.
      Insert the new method immediately after `passwordMatches()` (around line 1389, before
      `generateTempPassword`). The method performs a targeted Supabase query for only
      `id, password_hash, password_salt` for the given email — it does NOT broadcast all hashes.
      It then re-hashes the typed password with the stored salt using the existing `hashPassword()`
      helper and compares. On success it looks up the full user from `_cache.users` by id and returns
      `{ user }`. On any failure it returns `{ error: string }`.

      Exact code to insert (after the closing `},` of `passwordMatches`):

      ```js
      async loginWithPassword({ email, password }) {
        // Fetch hash/salt for this email only — targeted query, not a broadcast of all hashes
        try {
          const { data, error } = await _sb
            .from('users')
            .select('id, password_hash, password_salt')
            .eq('email', email.toLowerCase())
            .single();
          if (error || !data) return { error: 'No account found with that email.' };
          if (!data.password_hash || !data.password_salt) return { error: 'Account has no password set. Contact admin.' };
          const hash = hashPassword(password, data.password_salt);
          if (hash !== data.password_hash) return { error: 'Incorrect password — please try again.' };
          // Password correct — find full cached user
          const user = _cache.users.find(u => u.id === String(data.id));
          if (!user) return { error: 'Account not loaded. Reload the page and try again.' };
          return { user };
        } catch (e) {
          return { error: 'Could not reach the server. Check your connection.' };
        }
      },
      ```

      Files: `data.js`
      Verify: Open the app in a browser (via `python -m http.server 8000`), open DevTools console,
      and confirm no syntax errors are thrown on page load.

- [ ] 2. Replace `passwordMatches()` body in `data.js` with a deprecated no-op.
      The current body (lines ~1380–1383) reads `user.passwordHash` / `user.passwordSalt`, which are
      never populated — it already always returns `false`. Replace it with a warning comment so any
      future caller gets a clear developer signal instead of a silent wrong result.

      Replace the current body of `passwordMatches(user, typed)` with:

      ```js
      passwordMatches(user, typed) {
        // Password hashes are no longer fetched to the browser.
        // Use Data.loginWithPassword() for login, or Data.verifyPassword() for re-auth.
        console.warn('[HMA] passwordMatches() is deprecated — use loginWithPassword() or verifyPassword()');
        return false;
      },
      ```

      Files: `data.js`
      Verify: Same page-load check as item 1 (no new errors).

- [ ] 3. Fix `initLogin()` in `src/auth.js` to use the new `loginWithPassword()`.
      The current submit handler (lines ~107–123) calls the synchronous broken path. The handler is
      already `async e => { ... }` so `await` is valid. Replace the entire block from
      `const user = Data.userByEmail(email);` through `login(user);` with:

      ```js
      const { user, error } = await Data.loginWithPassword({ email, password });
      if (!user) {
        Alpine.store('loginError', error || 'Incorrect email or password.');
        return;
      }
      if (Data.accountBlocked(user)) {
        Alpine.store('loginError', 'This account has been archived and can no longer sign in. Contact the school office.');
        return;
      }
      login(user);
      ```

      Note: keep the existing `Alpine.store('loginError', '');` line just above (it resets the error
      before each attempt) — only replace the user-lookup and password-check block below it.

      Files: `src/auth.js`
      Verify: Start the server (`python -m http.server 8000`), navigate to the login screen, sign in
      with `admin@happyman.edu` / `admin123`. The app shell must appear (no "Incorrect password" error,
      no console error). Also verify a wrong password shows the error message.

- [ ] 4. Create the RLS hardening migration file.
      This is a pure SQL file — no JS changes. It must be the next migration in sequence after
      `20261003_growth.sql`, so it is dated `20261004`.

      Create `supabase/migrations/20261004_rls_policies.sql` with this exact content:

      ```sql
      -- ============================================================
      -- Happy Man Academy — RLS hardening (pilot security baseline)
      -- ============================================================

      -- 1. Revoke password columns from anon role at DB level
      --    (defence-in-depth: the JS query already excludes them)
      REVOKE SELECT (password_hash, password_salt) ON public.users FROM anon;

      -- 2. DB functions that return the current session's user id and role
      --    (set by the app via a Supabase RPC call after login — for future use)
      CREATE OR REPLACE FUNCTION app_user_id() RETURNS text
        LANGUAGE sql STABLE
        AS $$ SELECT current_setting('app.user_id', true) $$;

      CREATE OR REPLACE FUNCTION app_user_role() RETURNS text
        LANGUAGE sql STABLE
        AS $$ SELECT current_setting('app.user_role', true) $$;

      -- 3. Enable RLS on sensitive tables
      ALTER TABLE public.grades          ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.students        ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.promotions      ENABLE ROW LEVEL SECURITY;

      -- 4. Drop the broad anon_all policies on these tables
      DROP POLICY IF EXISTS anon_all ON public.grades;
      DROP POLICY IF EXISTS anon_all ON public.students;
      DROP POLICY IF EXISTS anon_all ON public.users;
      DROP POLICY IF EXISTS anon_all ON public.promotions;

      -- 5. Replacement policies: open SELECT/INSERT/UPDATE, block DELETE for anon

      -- grades
      CREATE POLICY grades_select ON public.grades FOR SELECT TO anon USING (true);
      CREATE POLICY grades_insert ON public.grades FOR INSERT TO anon WITH CHECK (true);
      CREATE POLICY grades_update ON public.grades FOR UPDATE TO anon USING (true) WITH CHECK (true);
      -- No DELETE policy = anon cannot delete grades

      -- students
      CREATE POLICY students_select ON public.students FOR SELECT TO anon USING (true);
      CREATE POLICY students_insert ON public.students FOR INSERT TO anon WITH CHECK (true);
      CREATE POLICY students_update ON public.students FOR UPDATE TO anon USING (true) WITH CHECK (true);
      -- No DELETE policy = anon cannot delete students

      -- users: anyone can read (password_hash/salt already revoked above), no DELETE, no INSERT
      CREATE POLICY users_select ON public.users FOR SELECT TO anon USING (true);
      CREATE POLICY users_update ON public.users FOR UPDATE TO anon USING (true) WITH CHECK (true);
      -- No INSERT or DELETE for anon on users (new accounts go through the admin UI)

      -- promotions
      CREATE POLICY promotions_select    ON public.promotions FOR SELECT TO anon USING (true);
      CREATE POLICY promotions_insert    ON public.promotions FOR INSERT TO anon WITH CHECK (true);
      CREATE POLICY promotions_update    ON public.promotions FOR UPDATE TO anon USING (true) WITH CHECK (true);
      -- No DELETE policy = anon cannot delete promotion records
      ```

      Files: `supabase/migrations/20261004_rls_policies.sql` (new file)
      Verify: File exists at that path. SQL can be applied to the live project via the Supabase SQL
      Editor (Dashboard → SQL Editor → paste and run) — confirm no errors. Alternatively run
      `npx supabase db push` if the local Supabase environment is linked to the remote project.

- [ ] 5. Add a Security section to `PROJECT-STATUS.md` and note migration instructions.
      Append a new `## 🔒 Security Status` section to `PROJECT-STATUS.md`. It must cover:
      - That password hashes/salts are excluded from the browser-side user SELECT.
      - That `loginWithPassword()` makes a targeted fetch of hash/salt per login attempt only.
      - That `passwordMatches()` is deprecated (always returns false, logs a console warning).
      - That RLS is enabled on `grades`, `students`, `users`, and `promotions`; DELETE is blocked
        for the anon role.
      - How to apply the migration: open the Supabase Dashboard → SQL Editor, paste the contents of
        `supabase/migrations/20261004_rls_policies.sql`, and run. Or run `npx supabase db push`.
      - A note that `npx supabase` v2.119.0 is available locally if the project is linked.

      Also update the `## 📊 System Health` table to add a "Security (RLS)" row with status
      "⚠️ Migration pending" (changes to "✅ Applied" once the migration is run).

      Files: `PROJECT-STATUS.md`
      Verify: File renders correctly in any Markdown viewer; no broken table rows.

---

## Dependency order

Items 1 and 2 are independent of each other but both must be done before item 3 (auth.js needs both
`loginWithPassword()` to exist and `passwordMatches()` to be deprecated). Item 4 (SQL migration) is
fully independent of items 1–3 and 5. Item 5 (PROJECT-STATUS.md) must come last as it summarises the
completed work.

## Notes on Supabase CLI

`npx supabase` v2.119.0 is available in the shell. `supabase/config.toml` exists. To push the new
migration to the remote project the implementer must ensure the project is linked:
```
npx supabase link --project-ref erlhyrswcqpqpqzbgmgb
npx supabase db push
```
If no local Docker environment is available, the safest path is to copy the SQL directly into the
Supabase Dashboard SQL Editor and run it there.

The `loginWithPassword()` approach (item 1) does a narrow per-login fetch of hash/salt and compares
client-side using the same `hashPassword()` helper already present in `data.js`. This is simpler and
more reliable than the Edge Function path (`loginWithEdgeFunction`) because no Edge Function deployment
is required. The Edge Function methods remain available for future server-side auth hardening.
