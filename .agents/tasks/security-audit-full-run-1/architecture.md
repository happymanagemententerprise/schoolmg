# Happy Man Academy — Security Architecture

## 1. Product, Principals, Normal Authority, and Protected Resources

**Product**: Happy Man Academy (HMA) is a multi-tenant school management SaaS for Nigerian secondary schools (JSS/SS levels). A SaaS owner onboards customer schools; each school has its own staff, students, parents, and operational records.

**Principals** (lowest to highest trust):
- **Anonymous / unauthenticated**: No school access post-RLS migration; Supabase anon key used for auth handshake only.
- **Parent**: Read own linked students' attendance, assignments, timetable; set and use a 6-digit gate pickup PIN.
- **Student**: Read own results, attendance, timetable; submit quiz attempts and discussion posts.
- **Subject Teacher**: Enter scores for assigned subjects/classes; author lessons, quizzes, discussions.
- **Class Teacher**: Everything above + class attendance, reports, feedback for own class; reset student passwords.
- **HOD**: Everything above + department-wide oversight and reporting.
- **Administrator**: Full school management — create/archive users, manage classes, subjects, timetable, promotions, campus safety, hostel assignments; reachable via campus API with service-role key.
- **Security Guard / Hostel Supervisor**: Operational campus roles with narrow write access (gate events, hostel presence) via the private campus API.
- **SaaS Owner**: Platform-level console: onboard schools, view cross-school dashboard. Independent `platform_memberships` table, not in `public.users`.

**Protected resources**: student academic records (grades, promotions, attendance), user credentials (Supabase Auth passwords), parent pickup PINs (scrypt hashed), push-notification subscriptions, school subscription/billing data, multi-tenant isolation between schools.

## 2. Comparable Software Baseline

HMA is structurally comparable to SchoolDirectory/Schoology-class tools: a Supabase-backed SPA with a thin private Express API. Key trade-offs from that class: Supabase's anon key is public by design and RLS is the primary data-isolation control; RLS bypass is trivial if policies are misconfigured. Prior work on open-source school portals (e.g. Schoology, Google Classroom) shows that row-level isolation mismatches (cross-student grade reads, cross-tenant data leaks) are the dominant confirmed class of vulnerability.

## 3. Tech Stack, Deployment Paths, and Build/Test Limits

- **Frontend**: Vanilla JS (app.js) + React (src/) + Alpine.js, built with Vite 5.4.11 to `dist/`. Deployed to Cloudflare Pages via `wrangler.toml` (`pages_build_output_dir = "dist"`).
- **Private API**: Node.js 24 / Express 5.1.0 at `server/index.js`; also mirrored as Supabase Edge Function at `supabase/functions/campus-api/`. Deployed as Docker container (`compose.yaml`, port 8000) or as an Edge Function.
- **Database**: Supabase (PostgreSQL 17, project `erlhyrswcqpqpqzbgmgb`). RLS enabled on all sensitive tables (migration chain 20261004–20261021). Supabase Auth handles session tokens (JWT, 1-hour expiry, refresh rotation).
- **Edge Functions**: `campus-api` (active), `login` (retired 410), `verify-password` (retired 410).
- **Offline build/test limits**: Playwright E2E tests available (`button-audit.spec.js`), but require a live Supabase backend. No unit tests for server routes or RLS policies beyond `grade_scoping.test.sql` stub. Cannot run migrations or test RLS policies offline without local Supabase Docker.

## 4. Entry Surfaces and Important Source-to-Sink Paths

- **Supabase REST API (anon key)**: Browser → `_sb.from(table).select/insert/update/delete` → Supabase PostgREST → RLS policies → tables. Anon key is hardcoded in `data.js` line 23 and committed in `.env.production`.
- **Supabase Auth**: `Data.signIn()` → `_sb.auth.signInWithPassword()` → Supabase GoTrue → JWT issued to browser. Password reset via `Data.requestPasswordReset()` → email link.
- **Campus API (private)**: Browser → `fetch('/api/*')` → Vite proxy → `server/index.js` (Express) or Edge Function → service-role Supabase client → school-scoped DB writes. Auth: `Authorization: Bearer <JWT>` verified via `db.auth.getUser()`.
- **SSE event stream**: `GET /api/campus/events` → long-lived connection → Supabase Realtime → school-filtered broadcast.
- **Supabase Realtime**: Browser `_sb.channel().on('postgres_changes')` subscriptions directly from the SPA.
- **Pickup PIN**: Browser → `POST /api/gate/pickup-pin` → scrypt hash stored; `POST /api/gate/events` with PIN → constant-time compare in Node.
- **Demo mode**: `Data.startDemoMode()` → swaps `_sb.from` proxy to a no-op stub; edits cannot reach live DB.
- **Push notifications**: `POST /api/push/subscribe` → stores WebPush subscription → `deliverPush()` sends notifications.

## 5. Trust Boundaries and Strongest Source-Visible Control

| Boundary | Strongest source-visible control |
|---|---|
| Anon → authenticated Supabase rows | RLS policies (20261006_rls_lockdown.sql + later migrations); `authenticated` role required |
| Browser → campus API | JWT verification in `authenticate()` middleware + `requireRoles()` + school membership check (`x-school-id` header verified against `school_memberships`) |
| Cross-school data isolation | `scopeSchoolQuery()` proxy stamps every write/read with `school_id`; `private.has_school_access()` checks membership |
| Admin-only operations | `requireRoles('admin')` middleware on destructive campus-API routes |
| Password reset | `Data.updateOwnPassword()` → `_sb.auth.updateUser()` → Supabase Auth session required |
| Pickup PIN | scrypt + timing-safe compare; 5-attempt lockout (15 min) tracked in DB and in-memory Map |
| Platform owner console | Separate `platform_memberships` table; `private.*` functions check `pm.platform_role = 'saas_owner'` |
| Edge Function JWT bypass | `[functions.campus-api] verify_jwt = false` — JWT validation delegated to the function's own `authenticate()` |

## 6. Repository-Relative Starting Paths

- Auth/login: `src/auth.js`, `data.js` (lines ~1380–1420, ~3580–3620)
- Campus API (Node): `server/index.js`
- Campus API (Edge Function): `supabase/functions/campus-api/index.ts`
- RLS policies: `supabase/migrations/20261004_rls_policies.sql`, `20261005_supabase_auth.sql`, `20261006_rls_lockdown.sql`, `20261021163930_active_school_membership_access.sql`
- Multi-tenancy: `supabase/migrations/20261021103948_multi_school_tenancy.sql`
- Platform console: `supabase/migrations/20261023230532_platform_owner_console.sql`, `20261024011813_secure_platform_school_dashboard.sql`, `20261024044308_platform_school_onboarding.sql`
- Data layer: `data.js`, `src/data/index.js`
- Supply chain: `package.json`, `package-lock.json`, `server/package.json`
- Deployment: `Dockerfile`, `compose.yaml`, `wrangler.toml`, `.env.production`, `supabase/config.toml`

## 7. Prior Coverage, Gaps, and Exclusions

**Prior run files found**: `security-plan.md`, `security-review.json`, `security-review.md` (all in `.agents/tasks/`). These document a prior informal code review — not a structured coverage-ledger run. Key findings from prior review:

1. `loginWithPassword()` hash comparison still in browser (fetches `password_hash`/`password_salt` from Supabase REST — visible in DevTools). The `security-review.md` confirmed this at source level.
2. `users_update` RLS policy: `USING (true) WITH CHECK (true)` — any anon caller can overwrite any user row including `role` and `password_hash`.
3. Migration `20261004_rls_policies.sql` not yet applied to live DB (PROJECT-STATUS.md: "Migration pending").

**Current source state**: Examining `src/auth.js`, the login flow now uses `Data.signIn()` → `_sb.auth.signInWithPassword()` (Supabase Auth), not the old client-side hash path. The prior issues are **changed source** — the auth path has been substantially rewritten since the prior review. The `users_update` policy gap (USING(true)/WITH CHECK(true)) is still present in `20261004_rls_policies.sql`. The multi-school tenancy migration (20261021) adds `school_memberships` and `private.has_school_access()` but the RLS policies on most tables do not appear to have been updated to require school-scoped membership — this is an unresolved gap. No prior `coverage-ledger.json` exists, so all units carry `prior_status: "none"`.

## 8. Companion File Selection

| Companion | Reason (source-visible boundary) |
|---|---|
| `WEB-PROTOCOL-AND-AUTH.md` | Supabase Auth JWT flows, password recovery link trust, session invalidation, cookie-less SPA auth, campus-API Bearer token verification |
| `CLIENT-SIDE.md` | React + Alpine SPA: DOM rendering of user-supplied data (`esc()` usage), browser storage (localStorage session persistence), service worker (`sw.js`), Alpine store state |
| `DATA-ISOLATION-AND-LIFECYCLE.md` | Multi-tenant RLS (school_id scoping), cross-student grade access, export/CSV/XLSX of school data, soft-delete/archive lifecycle on students/users |
| `CLOUD-AND-DEPLOYMENT.md` | Supabase Edge Function (`verify_jwt = false`), Cloudflare Pages deployment, Docker container, service-role key exposure, Supabase Realtime channel authorization |
| `SUPPLY-CHAIN-AND-RELEASE.md` | npm dependency resolution (package-lock.json), Vite build pipeline, Cloudflare Pages CI/CD via wrangler.toml |
| `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md` | Unbounded SSE client accumulation, pickup-PIN in-memory rate-limit Map, unauthenticated `/api/health` endpoint, no request rate limits on campus API routes |
