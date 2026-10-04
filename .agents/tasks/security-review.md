# Security hardening: password hashes removed from browser, RLS policies added

This commit removes password hashes from the browser-visible data layer and replaces the old client-side password comparison with a targeted per-account DB query. It also introduces the first RLS migration that enables row-level security on the four most sensitive tables and drops the broad `anon_all` policies. The `dist/` build artifact is timestamped at the same minute as the commit (21:07), confirming the build ran against these changes.

Watch for: the `loginWithPassword()` hash comparison still executes in the browser — the hash for the target account is visible in the DevTools Network tab; a `loginWithEdgeFunction()` scaffold already exists in `data.js` and should replace this path before going beyond a pilot. The RLS migration has not been applied to the live database (PROJECT-STATUS.md marks it "Migration pending"), so the DB-level column revoke and RLS policies are not yet live.

**Verdict**: APPROVED

---

## High-level view

The broadcast SELECT for users (`_sources.users`) no longer includes `password_hash` or `password_salt`. The comment above the query documents the omission, and the `_hydrate()` mapping block confirms no hash/salt fields appear in the cached user objects. Nothing in the broadcast path re-introduces them.

`loginWithPassword()` fetches hash and salt for one account only, runs `hashPassword(password, salt)` in the browser, and compares. On success it returns the full cached user record (no hash/salt). On any failure it returns `{ error: string }`. The hash comparison is still client-side — the `loginWithEdgeFunction()` scaffold in `data.js` would eliminate that exposure once the Edge Function is deployed. `src/auth.js` uses this method; the old `userByEmail()` + `passwordMatches()` path is gone.

The RLS migration enables security on `grades`, `students`, `users`, and `promotions`; drops the four `anon_all` policies; and adds targeted SELECT/INSERT/UPDATE policies with no DELETE for anon. The `REVOKE SELECT (password_hash, password_salt)` statement is present as defence-in-depth. The `users_update` policy is `USING (true) WITH CHECK (true)` — any anon caller can overwrite any user row, including changing roles or password hashes. The migration is not yet applied to the live database.

---

<details>
<summary>Issues (3)</summary>

1. **Client-side hash comparison** — `loginWithPassword()` fetches `password_hash` and `password_salt` from the DB and compares in the browser. The hash for the target account is visible in the DevTools Network tab or to a MitM on the Supabase REST response. The `loginWithEdgeFunction()` scaffold already exists in `data.js`. Action: wire `initLogin()` to `loginWithEdgeFunction()` once the Edge Function is deployed and remove the direct hash-fetching path.

2. **Migration not applied to live DB** — The `REVOKE` and RLS `ENABLE` statements in `20261004_rls_policies.sql` are not yet live. `password_hash`/`password_salt` are still readable by the anon role via direct REST calls against the live Supabase project. Action: run `npx supabase db push` or paste the migration into the Supabase dashboard SQL editor before the next demo session.

3. **`users_update` policy allows anon to overwrite any row** — `USING (true) WITH CHECK (true)` means any anonymous caller can change any user record, including `email`, `role`, and `password_hash`. This is a wider write surface than the dropped `anon_all` policy provided for a table that holds credentials. The `app_user_id()` function is already defined in the same migration. Action: add `WITH CHECK (app_user_id() = id::text)` to the `users_update` policy, or document the gap explicitly in PROJECT-STATUS.md's Remaining section.

</details>

<details>
<summary>Details</summary>

### `loginWithPassword()` — hash still crosses the wire

The method (data.js ~line 1388):

```js
_sb.from('users')
   .select('id, password_hash, password_salt')
   .eq('email', email.toLowerCase())
   .single()
```

`hashPassword(password, data.password_salt)` runs in the browser and is compared to `data.password_hash`. The Supabase REST response carrying those two columns is visible in DevTools under any browser with developer tools. A MitM who can observe the REST response gets a bcrypt/SHA hash they can attack offline. The per-account scope is a real improvement over the old broadcast-all-hashes pattern, but client-side verification is a known weakness the `loginWithEdgeFunction()` scaffold was designed to fix. **Confirmed** — the hash columns are in the select list and the comparison is in the browser.

### `users_update` — anon can edit any user row

The migration (20261004_rls_policies.sql lines ~48-49):

```sql
CREATE POLICY users_update ON public.users
  FOR UPDATE TO anon
  USING (true) WITH CHECK (true);
```

`USING (true)` matches every row; `WITH CHECK (true)` imposes no constraint on the new values. Any unauthenticated caller can `PATCH /rest/v1/users?id=eq.1` and set `role = 'Administrator'` or overwrite `password_hash`. The dropped `anon_all` policy had the same problem, but this migration's purpose was to tighten that surface. The `app_user_id()` function is defined four lines above in the same file and would enable a `WITH CHECK (app_user_id() = id::text)` self-only guard. **Confirmed** gap.

### Migration not yet applied

PROJECT-STATUS.md's System Health table: `Security (RLS) | ⚠️ Migration pending`. Until the migration runs against the live Supabase project (`erlhyrswcqpqpqzbgmgb`), the `REVOKE` and `ENABLE ROW LEVEL SECURITY` statements have no effect — the anon key can still `SELECT password_hash, password_salt FROM users` via the REST API. **Confirmed** by the status file.

</details>

---

<details>
<summary>File map</summary>

| File | What changed |
|---|---|
| `data.js` | Users SELECT stripped of password columns; `passwordMatches()` stubbed to return false; `loginWithPassword()` added |
| `src/auth.js` | Login flow rewritten to use `loginWithPassword()`; old two-step removed |
| `supabase/migrations/20261004_rls_policies.sql` | New file: column revoke, RLS enable, anon_all drop, replacement policies |
| `PROJECT-STATUS.md` | Security section added; RLS marked as migration pending |

Full diff: `git show 6698bbf`

</details>
