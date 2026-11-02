# Offensive Security Assessment — Node/Express Campus API

Source ref: `4eac11e7b02cd5821c62328553a10368aa345a8a` (clean worktree)
Mode: source-first, read-only (no execution, no live probing)
Author: offensive audit subagent (workflow `wf_97f01cd2cecce4e8`)

---

## 1. Scope

Files read in full for the attack surface:

Primary (server-side / deployment):
- `server/index.js` — the Node/Express campus API under audit (full file, all routes + schedulers)
- `server/package.json`, `server/.env.example`
- `app.js` — confirmed to be frontend SPA logic (DOM helpers, view router, XLSX/PDF export), not a server entry; read for completeness, no server-side trust boundary
- `compose.yaml`, `Dockerfile`
- `wrangler.toml` (Cloudflare Pages config — frontend only; no Worker)
- `scripts/provision-auth-users.js`, `scripts/provision-staging-demo-auth.js`, `scripts/reset-demo-passwords.js`, `scripts/production-readiness-audit.sql`

Reference / comparison (server-side code outside the `server/` tree, used to establish the *intended* model):
- `supabase/functions/campus-api/index.ts` — the Edge Function twin of the Node API (read in full)
- `supabase/functions/login/index.ts`, `supabase/functions/verify-password/index.ts` — both retired (HTTP 410)
- `supabase/migrations/20261021103948_multi_school_tenancy.sql` (tenancy + `has_school_access`), `supabase/migrations/20261021163930_active_school_membership_access.sql`, `supabase/production/staging_tenant_security_hardening.sql`

Secondary (context on what the server protects):
- `data.js` root data layer (frontend local-mode), `src/campus-api.js` (client → server request shape)

Secrets handling: `.env.example` / `server/.env.example` read for key names only. `.env.production` was NOT opened for values.

---

## 2. Attack surface map

**Entry points (Node server, `server/index.js`):** `GET /api/health` (anon), `GET /api/push/vapid-public-key` (anon), `POST|DELETE /api/push/subscribe` (auth), `GET /api/campus/events` SSE (auth, admin/teacher/security_guard/hostel_staff), `GET /api/campus/roster` (admin/security_guard), `GET|POST /api/hostels`, `POST /api/hostels/:id/staff`, `POST /api/users/campus-staff`, `POST /api/users`, `POST /api/users/:id/password` (admin/teacher), `POST /api/students/:id/residence`, `GET /api/timetable-swaps`, `GET /api/teacher/periods`, `POST /api/timetable-swaps`, `POST /api/timetable-swaps/:id/decision`, `POST /api/period-attendance`, `POST /api/gate/pickup-pin` (admin/parent), `POST /api/gate/events` (admin/security_guard), `GET /api/hostel/dashboard`, `POST /api/hostel/presence`. Two `setInterval` schedulers run in-process.

**Auth model:** `authenticate()` (lines 50–60) reads the `Authorization: Bearer` token and validates it with Supabase Auth (`db.auth.getUser(token)`, line 53) — Supabase verifies signature + expiry server-side. It then maps the JWT `sub` to a `public.users` row by `auth_user_id` (lines 55–56) and stores `req.schoolUser = { ...user, role }`. Role gating is `requireRoles(...)` (line 61). The client (`src/campus-api.js`) also sends an `X-School-ID` header on every campus request.

**What is protected (per `data.js`/migrations):** grades, credentials (Supabase Auth identities + pickup PINs), campus data (gate events with vehicle plates / dropoff persons, hostel rosters + presence, teacher periods, timetable swaps, period attendance), parent PII (names, phones used for SMS), and child-safety flows (the pickup PIN gates a `non_parent` gate pickup).

**Tenancy model (migrations):** a single shared Supabase project holds all schools. `schools` / `school_memberships` / `organization_memberships` exist; a `school_id uuid` column was added to **every** application table including `users` and `students` (`20261021103948_multi_school_tenancy.sql`). Per-school isolation is enforced by RLS via `private.has_school_access(school_id)` (`SECURITY DEFINER`, checks the caller's `auth.uid()` against memberships) plus a restrictive `hma_active_school_scope` policy on every `school_id`-bearing table (`staging_tenant_security_hardening.sql`). **RLS applies to the `authenticated` role — the `service_role` key bypasses RLS entirely.**

**The central question:** does the Node server validate that the JWT's user belongs to the school named in `X-School-ID`? **No.** The Node `authenticate()` never reads `X-School-ID` (grep for `x-school-id`/`school_id`/`schoolId` across `server/` returns zero matches), and the Supabase client is built with the `SUPABASE_SERVICE_ROLE_KEY` (line 29–31), so every query runs as the service role with RLS disabled and **no application-level `school_id` filter**. The Edge Function twin (`supabase/functions/campus-api/index.ts`) is the proof of intent: it validates `X-School-ID` against `school_memberships`, then wraps every query in a Proxy that stamps `school_id` on inserts/upserts and `eq('school_id', …)` on select/update/delete, and refuses unclassified tables. The Node server is that same API with the entire scoping layer deleted.

---

## 3. Confirmed exploits

### Finding S-1 — Node campus API has no school isolation: any tenant's admin reads/writes every other tenant's data and resets arbitrary cross-tenant passwords

**Severity: HIGH.** (The actor is authenticated, which caps this below the "unauthenticated" critical anchor; the demonstrated result is full cross-tenant read and write plus cross-tenant credential reset, which fully defeats the per-school isolation control — the textbook HIGH case "cross-tenant read or write." The password-reset chain reaches critical-tier *impact* — takeover of arbitrary accounts across tenants — but entry requires an authenticated tenant admin.)

**Attacker profile:** an administrator (lowest cost) or teacher/security_guard of School A — a real but lower-trust principal relative to School B's users, parents, and children, and relative to the SaaS owner. The attack crosses the school tenancy boundary.

**Root cause (single):**
- `server/index.js` line 31 — `const db = createClient(publicUrl, serviceKey, …)` where `serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY` (line 29). Service role bypasses RLS.
- `authenticate()` lines 50–60 validates the JWT and loads the caller's `users` row, but never reads `X-School-ID` and never checks `school_memberships`. No `req.schoolId` / `req.db` is ever created.
- Every route then queries `db.from(<table>)…` directly with no `school_id` filter and no membership check. Inserts/upserts never stamp `school_id`.

Contrast with the Edge Function (`supabase/functions/campus-api/index.ts`), where `authenticate()` reads `X-School-ID`, verifies an **active** `school_memberships` row for `(requestedSchoolId, user.id)` and an **active** `schools.status`, sets `req.schoolId`/`req.db = createSchoolDb(req.schoolId)`, and `scopeCampusQuery()` stamps `school_id` on writes and appends `.eq('school_id', schoolId)` to every read/update/delete. The Node server has none of this.

**Exploit chains (all from the same root cause):**

#### S-1a — Cross-tenant password reset → arbitrary account takeover / lockout
`POST /api/users/:id/password` (line 352), roles `admin` or `teacher`.

```js
// server/index.js:355-360
const { data: user, error } = await db.from('users').select('id,auth_user_id,role')
  .eq('id', userId).maybeSingle();            // service role, NO school_id filter
...
if (req.schoolUser.role !== 'admin') { /* teacher→own-class checks, skipped for admin */ }
const { error: updateError } = await db.auth.admin.updateUserById(user.auth_user_id, { password });
```

A School A admin supplies `:id` = a School B user's numeric `users.id`. The lookup finds that row across all schools; the admin branch skips the teacher/own-class guard; `updateUserById` resets the Supabase Auth password (Supabase Auth identities are global, not school-scoped). Outcome: the attacker changes School B's admin/teacher/student/parent password to a chosen value → either full sign-in takeover (the attacker knows or recovers the victim email, e.g. from the known demo email patterns or roster guardian ids→names) or forced lockout of arbitrary accounts in any tenant. This is a credential/identity boundary crossing harming the victim principal.

#### S-1b — Cross-tenant mass PII read
`GET /api/campus/roster` (line 245), roles `admin`/`security_guard`.

```js
// server/index.js:246-247
const { data, error } = await db.from('students').select('id,admission_no,class_id,residence_status,status,users!students_user_id_fkey(name),classes(class_name)')
  .eq('residence_status', 'DAY_STUDENT').neq('status', 'archived').order('admission_no');
```

No `school_id` filter. Returns every day student across all schools with names, admission numbers, guardians (names), and the latest `gate_events` row per student — which includes `vehicle_color`, `vehicle_model`, `vehicle_plate`, `dropoff_person_name`, `notification_message`, `parent_sms_status` (line ~268–270). A School A admin/guard harvests every other school's student roster, vehicle/dropoff PII, and gate history. The Edge Function scopes the identical query with `req.db` (per-school). Same pattern in `GET /api/hostel/dashboard` (admin sees all schools' boarder rosters + presence), `GET /api/hostels` (admin — all hostels), `GET /api/timetable-swaps` (admin — all swaps), `GET /api/teacher/periods` (admin — all periods).

#### S-1c — Cross-tenant write: residence, hostels, attendance, timetable, and a fraudulent child pickup
Writes take an id from the request and look it up with no school filter, so a School A admin mutates School B rows:
- `POST /api/students/:id/residence` (admin) — `db.from('students').update(...).eq('id', studentId)` (no school filter) reassigns a School B student's boarding/day status and hostel.
- `POST /api/hostels/:id/staff` (admin) — looks up the target `users.id` cross-tenant and upserts a `hostel_staff_assignments` row with no `school_id`.
- `POST /api/period-attendance`, `POST /api/timetable-swaps/:id/decision`, `POST /api/hostel/presence` — admin paths operate on any id across tenants.

**Child-safety chain (S-1c-pickup), highest-impact write:**
1. `POST /api/gate/pickup-pin` (line 418, roles `admin`/`parent`): as admin, send `{ userId: <School B parent's users.id>, pin: "123456" }`. The admin branch sets `userId = req.body.userId` (line 420); the parent lookup `db.from('users').select('id,role').eq('id', userId)` (line ~426) has no school filter; `parent_pickup_pins` is upserted with the attacker-chosen PIN hash and no `school_id`. School B parent's pickup PIN is now `123456`.
2. `POST /api/gate/events` (line 432, roles `admin`/`security_guard`): send `{ studentId: <School B student>, eventType: 'pickup', dropoffByType: 'non_parent', parentId: <School B parent id>, pickupPin: '123456', vehicleColor/model/plate, idempotencyKey }`. The student lookup (line 450) `db.from('students').select(...).eq('id', studentId)` finds the School B student (no school filter); `linkedParents(studentId)` returns School B parents; `selectedParent` matches; `verifyPickupPin(parentId, '123456', req.ip)` (no school filter in the PIN lookup) returns `ok`. A `gate_events` row is created with `recorded_by = <School A actor>` and **no `school_id`**, and an SMS + push notification is sent to School B parents: *"\<School B child\> picked up by \<caregiverName\> on behalf of \<parent\> in \<vehicle\> with number plate \<plate\> at \<time\>."*

Result: a School A actor manufactures a fraudulent pickup record for a School B child and triggers a deceptive "your child was picked up" SMS/push to that child's parents. This crosses the school boundary into another tenant's child-safety flow.

#### S-1d — Cross-tenant realtime data leak over SSE
The realtime broadcast layer (`server/index.js` lines 197–222) forwards Postgres changes to every SSE client by role with **no `school_id` comparison** — the Edge Function guards each handler with `String(payload.new?.school_id) === client.schoolId`; the Node server does not.

```js
// server/index.js:207-208  (gate_events) — broadcasts to ALL admin/security_guard clients, any school
.on('postgres_changes', { event: '*', schema: 'public', table: 'gate_events' }, payload => {
  for (const client of campusEventClients) if (['admin', 'security_guard'].includes(client.role))
    client.res.write(`event: gate-event\ndata: ${JSON.stringify({ studentId: payload.new?.student_id, eventType: payload.new?.event_type, eventAt: payload.new?.event_at })}\n\n`);
})
```

The same omission applies to `students` (residence/hostel updates, line 201), `hostel_presence_events` (line 213), and `timetable_swaps` (line 219). A School A admin/guard subscribed to `/api/campus/events` receives a live stream of every other school's gate, hostel, residence, and swap events (student ids, event types, timestamps). Continuous cross-tenant PII disclosure.

**Crossed boundary + affected principal:** the per-school tenancy boundary; harms every other school's admins/teachers/students/parents/children (data disclosure, unauthorized credential change, fraudulent campus records, deceptive notifications).

**Source evidence:** `server/index.js` lines 29–31 (service-role client), 50–60 (`authenticate`, no `X-School-ID`/membership), 355–360 (password reset, no school filter), 245–247 (roster, no school filter), 418–432 (pickup-pin / gate-events, no school filter), 197–222 (realtime, no `school_id` comparison). Reference impl: `supabase/functions/campus-api/index.ts` `authenticate()` (membership check + `createSchoolDb`), `scopeCampusQuery` (stamps + filters `school_id`), realtime handlers (each gated by `payload.new?.school_id === client.schoolId`). Schema: `supabase/migrations/20261021103948_multi_school_tenancy.sql` (`has_school_access`, `school_id` on all tables; service role bypasses RLS).

**Safe reproduction (local, non-production):** seed a local/test Supabase project with two schools (A, B), each with an admin and a few users, `school_memberships` linking users to their school, and `school_id` populated. Run the Node server against that project. As School A's admin, send:
```
curl -X POST $API/api/users/<schoolB-user-id>/password \
  -H "Authorization: Bearer <schoolA-admin-jwt>" -H "X-School-ID: <schoolA-id>" \
  -H "Content-Type: application/json" -d '{"password":"Attacker123!"}'
```
Observe `204` (the Edge Function returns `403 "You do not have active access to this school."` for the same call because School A's admin has no School B membership). Then sign in via Supabase Auth as the School B user with `Attacker123!` → success confirms cross-tenant account takeover. Separately, `GET $API/api/campus/roster` with School A's admin token returns School B students/gate history (vs. only School A's rows from the Edge Function). No production traffic is touched.

**Smallest effective fix:** port the Edge Function's scoping layer into the Node server verbatim:
1. In `authenticate()`, read `const requestedSchoolId = String(req.headers['x-school-id']||'').trim()`, reject empty/>64, then look up an **active** `school_memberships` row for `(requestedSchoolId, user.id)` and an **active** `schools` row; on miss return `403`. Set `req.schoolId` and `req.db = createSchoolDb(req.schoolId)`.
2. Add `createSchoolDb`/`scopeCampusQuery` (or equivalent) that stamps `school_id` on insert/upsert and appends `.eq('school_id', schoolId)` to select/update/delete, and refuses unclassified tables.
3. Replace every `db.from(...)` in routes with `req.db.from(...)` (the routes are already identical to the Edge Function otherwise).
4. In the realtime handlers, add `String(payload.new?.school_id) === client.schoolId` to every broadcast condition (and store `schoolId` on the SSE client), matching the Edge Function.

A regression test: the S-1a curl above must return `403`; `GET /api/campus/roster` as School A's admin must return zero School B rows.

---

### Finding S-2 — Unbounded SSE connection set with request timeout disabled (cross-tenant resource exhaustion)

**Severity: MEDIUM** (authenticated staff precondition; cross-tenant availability impact on the shared Node process; constrained by the auth gate).

**Attacker profile:** any authenticated staff member of one school (admin/teacher/security_guard/hostel_staff) — a lower-trust principal relative to the SaaS owner and to other tenants sharing the Node process.

**Source evidence:**
```js
// server/index.js:33
const campusEventClients = new Set();
// server/index.js:166  GET /api/campus/events — auth + role gate, then:
//   campusEventClients.add(client)   // line ~181
//   const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
//   res.on('close', () => { clearInterval(heartbeat); campusEventClients.delete(client); });
...
// server/index.js:653
httpServer.requestTimeout = 0;
```

There is no per-user, per-tenant, or aggregate cap on `campusEventClients`; `requestTimeout = 0` disables the server-side request deadline; each open SSE connection holds the `res` socket and a 25 s heartbeat interval indefinitely. `express.json({ limit: '64kb' })` does not bound SSE (no body). The client (`src/campus-api.js`) auto-reconnects every 2 s, so a scripted caller can open and hold arbitrarily many long-lived streams from one valid staff token.

**Attack chain:** a single school's staff member (or anyone who has compromised one staff account) opens N SSE connections to `/api/campus/events` and keeps them alive. Each consumes a socket + a timer + event-loop work on every realtime broadcast (the broadcast loops iterate the whole Set). With N large enough the shared Node process exhausts file descriptors / memory / event-loop capacity, denying the campus API to **every** school served by that process. Cross-tenant availability impact.

**Crossed boundary + affected principal:** the per-tenant resource boundary; harms all other schools' users (and the SaaS owner) by making the shared campus service unavailable.

**Safe reproduction (local):** run the Node server against a test project on loopback with a single staff JWT. Open a script that establishes M concurrent `GET /api/campus/events` streams and measures process RSS / open handles / event-loop lag at small M increments under explicit CPU/memory/wall-clock limits. Stop at the first point where the server stops accepting new connections or event-loop lag spikes; do not continue to crash and never test against a shared or production process. This establishes the missing bound locally.

**Smallest effective fix:** cap concurrent SSE clients — per user (e.g. reject a new stream when `campusEventClients` already has ≥ K entries for that `userId`) and a global ceiling with `503`/`429` once reached; set a finite `requestTimeout` (or a per-connection idle/heartbeat timeout that closes stalled streams); and ideally gate by the school-scoped fix in S-1 so connections are attributed to a tenant. No code change beyond adding these bounds is required.

---

## 4. Needs-validation (source-grounded hypotheses blocked by missing runtime confirmation — no severity)

### NV-1 — Known default demo password + production project URL + privileged demo email list committed in scripts
`scripts/reset-demo-passwords.js` hardcodes the production Supabase project URL (`https://erlhyrswcqpqpqzbgmgb.supabase.co`), a default password `HMA_Demo_2026!`, and a list of seven demo emails including `admin@happyman.edu`, `class@happyman.edu`, `subject@happyman.edu`, `hod@happyman.edu`, and `parent@happyman.edu`; the script unconditionally resets those accounts to that password via the service-role admin API. `scripts/provision-auth-users.js` re-uses the same project ref and the same `HMA_Demo_2026!` in its `--demo` branch (the comment warns "Do NOT run this on a live database").

If any of those demo accounts still exist in the **production** Supabase Auth user list carrying that default password (and an admin/hod role), an anonymous attacker who reads this committed recipe could sign in as an admin and pivot into the S-1 cross-tenant issues. The decisive fact — whether those accounts are live in production with the demo password — is a deployment/runtime state not visible in source, so this stays needs-validation rather than confirmed.

**Safe plan (no live login from the audit):** the owner lists production Supabase Auth users for these emails and confirms their roles and whether the demo password is still set (or simply attempts a controlled reset + removal of demo accounts). Do not attempt live sign-in as part of this audit. If the accounts exist with elevated roles and the demo password, treat as a confirmed credential-defaults finding and rotate/remove before exposure.

### NV-2 — Deployment topology: which campus API is actually serving traffic?
No manifest in the repo ties `server/index.js` to a running target: `wrangler.toml` is frontend-only Cloudflare Pages; `Dockerfile`/`compose.yaml` build the **frontend** (root `package.json` — vite, no server deps) and expose port 8000; `server/package.json` (port 8788) is not referenced by either. The Edge Function `supabase/functions/campus-api/` is the scoped twin. This does not weaken the S-1/S-2 findings (they are defects in the in-scope `server/` code the task named), but it scopes their *reach* to deployments that actually run the Node server. **Safe plan:** owner confirms which campus API target is deployed; if it is the Node server, S-1/S-2 are live; if only the Edge Function runs, S-1/S-2 are latent regressions in the dormant `server/` tree.

---

## 5. Cleared (attack paths examined and rejected)

- **JWT forgery / replay / cross-tenant reuse:** the only JWT validation is `db.auth.getUser(token)` (line 53) — Supabase verifies signature and expiry server-side; no `alg` confusion or decode-without-verify path exists. The cross-tenant vector is the unscoped `X-School-ID` handling (S-1), not the JWT itself. A token is not accepted across tenants via any header trick; it is the *data* scoping that fails.
- **SQL injection:** all data access uses the Supabase query builder (parameterized). The one interpolation, `.or(`requested_by.eq.${req.schoolUser.id},covering_teacher_id.eq.${req.schoolUser.id}`)` (line 386), interpolates the authenticated user's own numeric `users.id` (DB-derived, not request input) — not injectable. No raw SQL string building.
- **Command injection / path traversal / SSTI:** no `exec`/`spawn`, no filesystem reads/writes, no template rendering, no `eval`. None present.
- **SSRF:** the only outbound HTTP is Twilio (`sendSms`); the URL is built from env `TWILIO_ACCOUNT_SID` and the `To` is a parent phone from the DB — no user-controlled URL/host. No SSRF.
- **CORS / credential leakage:** origins are an explicit allowlist reflected with `Vary: Origin` (lines 14–20); the credential is a `Bearer` Authorization token, not an ambient cookie, so a reflected `Access-Control-Allow-Origin` cannot exfiltrate it. (Note: the Node server omits `X-School-ID` from `Access-Control-Allow-Headers` — a functional bug for cross-origin use, not a security boundary; the Edge Function includes it.)
- **IDOR beyond S-1:** routes scoped by `req.schoolUser.id` (teacher's own periods/swaps/attendance) are bounded by the global uniqueness of `users.id`, so a teacher cannot reach another teacher's data through those filters; the admin paths are the cross-tenant surface and are covered by S-1.
- **Pickup-PIN brute force:** `verifyPickupPin` enforces a 5-attempt / 15-minute lockout both in-memory and in `parent_pickup_pins.locked_until`; the `non_parent` path requires the PIN and is gated by that lockout. No standalone brute-force finding (the PIN *overwrite* issue is S-1c, not a PIN brute force).
- **Secrets in source:** `.env.example`/`server/.env.example` carry only key-name placeholders; the service-role key is read from env, never committed. The committed demo password is tracked under NV-1, not as a confirmed secret-in-source.
- **Edge Function scheduler timing:** `/internal/scheduler/tick` in the Edge Function short-circuits on `a.length !== b.length` before `timingSafeEqual`, leaking the secret *length* via timing — not meaningfully exploitable (long random secret) and not in the Node server (the Node server uses in-process `setInterval`, no such endpoint). Noted, not a finding.
- **"No rate limiting" as a standalone finding:** there is no rate-limit middleware anywhere in `server/`. Per the evidence bar a missing rate limit alone is hardening, not a finding; the only path where missing limits produce a boundary result is the SSE accumulation (S-2). Not elevated separately.

### Deployment defect noted, explicitly NOT a security finding
- **`Dockerfile` `CMD npm` (last line) + `compose.yaml`:** verified literally — `CMD npm` runs `npm` with no subcommand, which prints usage and exits, so the container never serves. This is a deployment/availability *self-impact* defect (the deployer's own frontend container fails to start) and does **not** cross a trust boundary or let a lower-trust principal harm another. Per the evidence bar it is not a security finding. The wave-1 "HIGH" label is not supported as a security severity; it is a broken-build bug to fix.

---

## 6. Coverage gaps

- **Runtime behavior unobserved:** execution policy required read-only source inspection; no server was started and no endpoints were probed. All findings are source-traced with safe local reproduction plans; none were executed here.
- **Which campus API is deployed:** unresolved from source (see NV-2). Findings S-1/S-2 are scoped to the in-scope `server/index.js` the task named.
- **Per-table RLS not exhaustively audited:** enough of the RLS/tenancy schema was read (`20261021103948_multi_school_tenancy.sql`, `staging_tenant_security_hardening.sql`, `20261021163930_active_school_membership_access.sql`) to confirm the school-scoped data model that the Node service-role client bypasses; a full per-table RLS policy audit was out of scope for a Node-server audit.
- **Frontend `src/` not re-audited:** the task states the SPA is already security-reviewed; only `src/campus-api.js` was read to confirm the client→server request shape (`Bearer` + `X-School-ID`).
- **`.env.production` not opened** for values (per policy); key names only were referenced from `.env.example`.
- **Supabase Auth configuration** (password policy, email-confirmation enforcement, MFA, JWT `aal` claims, rate limits at the GoTrue layer) is not in this repo and was not evaluated; the server derives role from `public.users` rather than the JWT role claim, which is sound, but provider-side auth hardening is outside source visibility.
