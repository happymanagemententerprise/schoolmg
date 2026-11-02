# Security Audit — `src/` Focused Review (frontend SPA)

**Repo:** schoolmg (HMA — multi-tenant school management SaaS)
**Source ref:** `4eac11e7b02cd5821c62328553a10368aa345a8a` (clean worktree)
**Scope:** ONLY files under `src/` (see Scope below)
**Profile:** scoped, source-only (no execution)
**Date:** 2026-10

---

## 1. Scope

Reviewed every file under `c:\Users\Happy\Documents\Happy Management\schoolmg\schoolmg\src\`:

- Top-level: `auth.js`, `campus-api.js`, `main.js`, `modals.js`, `pwa.js`, `router.js`, `state.js`, `styles.css`, `utils.js`
- `context/AppContext.jsx`
- `data/index.js`, `data/prevSessionCache.js`
- `react/mount.js` and `react/components/` (`AdminProgression.jsx`, `ClassAttendance.jsx`, `ClassOverview.jsx`, `PreviousSessionPanel.jsx`, `QuizManager.jsx`, `QuizTaker.jsx`, `SessionSelector.jsx`, `StudentReportDrawer.jsx`, `StudentResults.jsx`)
- `views/` (`admin.js`, `campus.js`, `parent.js`, `platform.js`, `reports.js`, `sessionHistory.js`, `shared.js`, `student.js`, `teacher.js`)
- `src/modules/` exists but is **empty** (no files).

Out of scope but read for context only (to assess exploitability of `src/` sinks):
`index.html` (input-element source for enum constraints), `data.js` (Supabase client/storage config and how `initials`/`tone` are sourced). No findings are reported about these files; they only inform whether a `src/` sink is reachable.

---

## 2. Methodology

Source-first, read-only. For each client-side attack class in the companion catalogue I traced a controllable **source** to an executing/disclosing **sink** and required a real trust-boundary crossing with a concrete affected principal.

What I looked for, and how:

- **XSS**: enumerated every DOM-string sink — Alpine `x-html`, React `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, string-evaluating APIs — then traced each user-influencedable field (student/parent/staff names, discussion post bodies, lesson content, quiz question text/options, assignment titles/notes, weekly topics, remarks, event titles/notes, artifact titles/notes, commendation notes, cover-request reasons, pathway notes, server error strings) back to its source and checked whether `esc()` (utils.js) or React's default text escaping is applied. I specifically tested the prior-recon concern that `esc()` is bypassable or unused.
- **Token / session handling**: located where the Supabase session and access token live and how they are attached; checked whether the publishable anon key vs. a service-role key is exposed; checked the separately-constructed client in `prevSessionCache.js` for whether it is truly anonymous.
- **Service worker**: reviewed `pwa.js` registration and scope; `sw.js` itself is outside `src/` and could not be reviewed (see Coverage).
- **campus-api trust**: reviewed Bearer/`X-School-ID` attachment, URL/path construction, and how server responses (including error strings) are rendered.
- **Client-side authz**: reviewed every role-gated branch (`showView`, `renderCampus`, React role snapshots) as UX-only gating and confirmed the data/campus layers are the real gate.
- **Cross-cutting classes**: searched for `postMessage` listeners, open-redirect sinks (`location` assignment), `eval`/`new Function`, and prototype-pollution-prone merges (`Object.assign`/`structuredClone` of user data).

Searches performed (ripgrep): `dangerouslySetInnerHTML`, `innerHTML|outerHTML|insertAdjacentHTML|document\.write`, `postMessage|window\.location|eval|new Function|\.assign\(`, `x-html|x-text`, `levelTag\(|streamTag\(`, `remark|chip-\$\{|avatar-\$\{`, `a\.kind|initials\}`, plus full reads of every file.

---

## 3. Confirmed findings

**None.** No vulnerability meeting the evidence bar (a lower-trust principal crossing a trust boundary to an affected principal/resource, confirmable from source with a concrete observable result) was confirmed in `src/`.

The headline reason, verified across all view and React modules: **every user-controllable free-text field that reaches the DOM is escaped** — either by `esc()` for hand-built HTML strings or by React's default text escaping for JSX. The only unescaped interpolations into HTML are bound to values that a lower-trust principal cannot control: fixed-palette colors, enum `select` values, 2-character-derived initials, server primary keys, or system-defined badge icons. Each is documented in §5 with the reason it is not exploitable.

This directly answers the prior-recon concern: `esc()` is **not** broadly bypassed. It is applied consistently to discussion posts, lesson content, quiz text/options, assignment titles/notes, remarks, event titles/notes, artifact titles/notes, commendation notes, cover reasons, pathway notes, names, admission numbers, phone numbers, and campus API error strings. The remaining unescaped sinks are enumerated and cleared in §5.

---

## 4. Needs-validation findings

These are source-grounded boundary hypotheses where the security outcome depends on a control **outside `src/`** (a server component or the service worker). No severity is assigned, per the evidence policy.

### NV-1 — Client-supplied `X-School-ID` is the only tenant identifier on campus requests; cross-tenant authorization is enforced solely by the out-of-scope campus API

- **Lower-trust principal:** any authenticated school member (parent/student/teacher/admin) — the header is set from client state.
- **Accepted input/action:** the `X-School-ID` header value, derived from `Data.activeSchool().id` but fully client-controlled (a modified client can set any value).
- **Intended control:** the Node/Express campus API must validate that the Bearer token's user belongs to the school named by `X-School-ID` before acting on the request.
- **Crossed boundary:** tenant boundary between schools — if the campus API trusts `X-School-ID` without binding it to the token, a user of school A can read/mutate school B's campus data.
- **Affected principal/resource:** other tenants' gate events, hostel presence/rosters, teacher periods, timetable-swap decisions, and hostel setup (all served by `/api/*` campus routes).
- **Concrete result (hypothesis):** a user in school A, sending `X-School-ID: <school B id>` with their own valid Bearer token, receives school B's roster/periods/swaps and can post gate/hostel/swap events into school B.
- **Source evidence:** `src/campus-api.js` lines 6-10 —
  ```js
  const school = Data.activeSchool();
  if (!school?.id) throw new Error('Select an active school before using campus services.');
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'X-School-ID': String(school.id), ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  ```
  Every campus route (`/api/campus/roster`, `/api/gate/events`, `/api/hostel/*`, `/api/teacher/periods`, `/api/timetable-swaps/*`, `/api/push/*`) flows through this helper, so all inherit the same dependency.
- **Blocker:** the campus API's school-membership authorization check is outside `src/` and could not be inspected. The `src/` client is doing the expected thing (sending the active school context); the defect, if any, is server-side.
- **Safe reproduction:** in a local build with two seeded schools and a user enrolled only in school A, open devtools and force `X-School-ID` to school B's id on a campus request (e.g., `fetch` override or Network override); observe whether school B's roster/periods are returned or a gate event is accepted. Use only local/dummy tenants.

### (No other needs-validation items)

The other prior-recon candidates (prevSessionCache "anon client", service worker) were either resolved by source evidence (§5) or are unreviewed components rather than source-grounded hypotheses (§6).

---

## 5. Not a finding (rejected) — checked and cleared

Recorded so the prior-recon concerns are explicitly closed with reasoning.

### 5.1 Unescaped `initials` in avatar `<div>`/`<span>` — not exploitable (2-char derived)

`initials` is interpolated without `esc()` into avatar text content in several places, e.g.:
- `src/views/shared.js:123` — `<span class="student-avatar ${toneClass(row.student.tone)}">${row.student.initials}</span>`
- `src/views/shared.js:272` — `<div class="avatar ${toneClass(s.tone)}">${s.initials}</div>`
- `src/views/student.js:125` — `<div class="mentor-avatar avatar-${mentor.tone}">${mentor.initials}</div>`

**Cleared because:** `initials` is derived to at most two characters. `avatarInitials` (`src/utils.js:58-60`) is `name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()` — each element is a single character and the result is ≤2 chars. Two characters cannot form a complete, executable HTML tag (e.g., `<img onerror=…>`), so there is no XSS payload shape that survives this transform. `data.js` (context only) sets `initials: u.initials || avatarInitials(u.name)`; the client always sends the 2-char form on person creation (no free-text initials field exists in the admin form). Names themselves are always rendered via `esc()` (e.g., `${esc(s.name)}`). Residual dependency on the server storing only the client-supplied 2-char value is a server-side concern outside `src/`; no lower-trust principal can plant an arbitrary `initials` through the client.

### 5.2 Unescaped `a.kind` in `renderPassport` — not exploitable (enum-constrained)

- `src/views/shared.js:301` — `<div class="p-card"><strong>${a.kind}</strong><span>${esc(a.title)}</span><small>${esc(a.note || '')}</small></div>`

`a.kind` is escaped everywhere else (`shared.js:222` uses `${esc(a.kind)}`), so this is a genuine escaping inconsistency. **Cleared because** `a.kind` is bound to a fixed `<select>` (`index.html:1078-1084`: `code`/`debate`/`sport`/`leadership`/`other`) — all safe enum values with no quotes or markup. No lower-trust principal can submit an arbitrary `kind` through the client (`Growth.addArtifact` is fed `$('std-art-kind').value` from that select). Defense-in-depth: this should still be `${esc(a.kind)}` for consistency, but it is not an exploitable XSS.

### 5.3 Unescaped `b.icon` in `renderPassport` — system-defined, not user-controlled

- `src/views/shared.js:304` — `<strong>${b.icon} ${esc(b.label)}</strong>`

Badge icons come from `Growth.badges()` and are system-defined strings, not user input. Not a finding.

### 5.4 Unescaped `color`/`tone`/`level`/`stream` in class attributes — bound to fixed palettes/enums

These class-attribute interpolations are not escaped, e.g.:
- `src/utils.js:65` `level-${(level || 'BOTH').toLowerCase()}` and `${map[level] || level || '—'}` (`levelTag`)
- `src/utils.js:69` `stream-${stream.toLowerCase()}` and `${stream}` (`streamTag`)
- `src/views/shared.js:38` `chip-${s.color || colors[di % colors.length]}`
- `src/views/student.js:99`, `src/views/student.js:158`, `src/views/teacher.js:78`/`152`, `src/views/shared.js:402` — `chip-${sub?.color || 'blue'}` / `chip-${subject.color}`
- `src/views/student.js:125` `avatar-${mentor.tone}`

**Cleared because every value is bound to a fixed set via the UI/data layer, so no `"` can be injected to break out of the class attribute:**
- **Subject color** is auto-assigned from a fixed palette — `src/views/admin.js:924-925`: `color: ['blue', 'coral', 'green', 'yellow'][Data.subjects().length % 4]` — and `subjectChip` additionally validates against a `Set` (`src/utils.js:73-74`). There is no free-text color input.
- **Tone** is defaulted (`data.js`: `tone: u.tone || 'blue'`; person form has no tone field) and `toneClass()` (`src/utils.js`) validates against a map, returning `'avatar-blue'` for anything unknown.
- **Level** comes from a fixed `<select>` (`index.html:1463-1466` `nc-level`: `JSS`/`SS`; `index.html:1530-1533` `ns-level`: `JSS`/`SS`).
- **Stream/group** comes from a fixed `<select>` (`index.html:1482-1485` `nc-stream`: `Science`/`Commercial`/`Arts`; `index.html:1538-1541` `ns-group`: `General`/`Science`/`Commercial`/`Arts`).
- Timetable period colors fall back to a fixed `colors` array (`shared.js:31`) or `Data.subject(...).color || 'blue'` (`teacher.js:1045`).

To plant a malicious value a principal would need to bypass the UI and write directly to the DB/API (high-trust/privileged planter) with the server accepting it — a server-side validation concern, not a `src/` finding, and not reachable by a lower-trust principal through the client.

### 5.5 Unescaped server IDs in `data-*` attributes — server primary keys, not user-typed

Throughout `campus.js`/`teacher.js`/`parent.js`/`student.js`, server IDs are placed in attributes unescaped, e.g. `data-student="${s.id}"`, `data-swap-id="${s.id}"`, `data-hostel="${h.id}"`. These are database primary keys (UUIDs/integers) returned by the campus API or data layer, not user-typed strings, and are never re-rendered as HTML without escaping elsewhere. Not a finding.

### 5.6 Hardcoded Supabase key in `prevSessionCache.js` — the publishable anon key, not a secret

- `src/data/prevSessionCache.js:11-14` and `data.js:22-23` embed a JWT with payload `{"role":"anon", ...}`.

This is the **publishable anon key** (designed to ship in client bundles; security is provided by RLS), not the service-role key. Not a finding.

### 5.7 `prevSessionCache.js` "separate anon client" is actually authenticated — not an anon-role data exposure

The prior-recon concern was that `prevSessionCache.js` constructs `createClient(supabaseUrl, supabaseAnonKey)` and queries `grades`/`attendance_weekly`/`terms`/`sessions` filtered by `student_id`, deferring authorization to RLS.

**Cleared:** both the main client (`data.js:24`) and the prevSessionCache client (`prevSessionCache.js:11-14`) are constructed with **default** options and the **same** `supabaseUrl`. supabase-js with default config persists/loads the session from `localStorage` under the shared key `sb-<project-ref>-auth-token`. The separately-constructed client therefore **auto-loads the user's JWT** from that shared storage and its queries are authenticated (carrying `auth.uid()`), not anon-role. RLS keyed on `auth.uid()` can scope the reads. The "anon key" constructor argument is merely the publishable key required to build any client; it does not make the client anonymous once a session is present. (Narrow race window where a query could fire before session hydration is not a `src/` defect and would simply return no rows under identity-scoped RLS.)

### 5.8 Demo pickup PIN in `localStorage` — demo-only, self-impact

- `src/views/parent.js` `bindPickupPinForm` stores `localStorage.setItem('hma_demo_pickup_pin', pin)`; `src/views/campus.js` reads it in the local demo gate register (default `'123456'`).

This path runs only in local demo mode (campus.js comments: "Demo-only campus events live in memory. They are never submitted to Supabase"). It is not a production multi-tenant trust boundary and the PIN is the parent's own demo value. Not a finding.

### 5.9 Alpine store rendering uses `x-text`, not `x-html` — escaped

- `index.html:51-52` renders `$store.loginError` via `x-text`; `index.html:1666` renders `$store.toast.message` via `x-text`. A workspace-wide search found **no** `x-html` directive in `index.html` and none constructed in any `src/` view string. Alpine store messages (`toast()`, `loginError`) are therefore rendered as text. Not a finding.

### 5.10 No `postMessage`, open redirect, `eval`, or prototype-pollution merge

A workspace search for `postMessage`, `addEventListener('message'`, `window.location =`, `location.href =`, `location.assign|replace`, `eval(`, `new Function(`, and `Object.assign(`/`structuredClone` of user data returned **no matches** in `src/`. The only navigations are `window.location.reload()` (`react/mount.js`) and `window.history.replaceState(null,'',window.location.pathname)` (`auth.js`) — neither is an open redirect. No cross-window messaging, no eval-based sinks, no recursive user-data merges. These classes are absent in `src/`.

### 5.11 Client-side role gating is UX-only and does not itself mislead about authority

`showView`/`renderView` (`router.js`) and `renderCampus` (`campus.js`) hide/disable views by `navForUser(currentUser)`. This is standard client UX; it does not grant authority. All protected reads/writes flow through `Data.*` (user JWT + RLS) or `campusApi` (Bearer token + server authz). No `src/` code makes an authorization *decision* that the server does not also make; it only decides what to render. Not a finding.

---

## 6. Coverage notes — what could not be reviewed and why

- **`sw.js` (service worker):** registered by `src/pwa.js` (`navigator.serviceWorker.register('/sw.js')`) with default scope `/`. `sw.js` lives at the repo root, **outside `src/`**, and was not reviewed. Per the companion `CLIENT-SIDE.md` service-worker classes, the owner should confirm: (a) the final registered script URL, origin, and MIME; (b) whether it caches identity-bound responses (campus event stream, report data, auth-gated pages) and whether cache keys include account/tenant/auth state; (c) that cached personalized responses are evicted on logout (`auth.js` `logout()` dispatches `hma:logout`; verify the worker listens and clears). This is an unreviewed component, not a source-grounded hypothesis, so it is a coverage gap rather than a needs-validation finding.
- **`data.js` (root, out of scope):** owns the Supabase client, session storage (default `localStorage`), `getAccessToken`, `signIn`/`signOut`/`getSession`, and the RLS-dependent reads (`Data.student`, `Academic.*`, `Growth.*`, `Progression.*`). The session-storage mechanism and all RLS policies are server/data-layer concerns outside `src/`. I read `data.js` only to confirm the client config relevant to the `prevSessionCache` and `initials`/`tone` questions (§5.7, §5.4); no findings are claimed about it.
- **RLS policies (Supabase migrations):** entirely outside `src/`. All `src/` data access assumes RLS enforces per-user/tenant scoping; that assumption is the server's to satisfy.
- **campus API (Node/Express):** outside `src/`. NV-1 captures the one `src/`-originated dependency on it (the client-supplied `X-School-ID`).
- **`src/modules/`:** empty directory; nothing to review.
- **`styles.css`:** reviewed for selector usage only; no executable sinks. (One cosmetic double-encoding note: `xpBar` labels such as `'Co-curricular &amp; STEM …'` are passed through `esc()`, producing `&amp;amp;` in the DOM — display-only, not security.)

---

## 7. Summary

After reading every file under `src/`, **no confirmed vulnerability** meeting the evidence bar was found. The frontend is disciplined about output encoding: user-controlled free text is escaped with `esc()` (or React's default text escaping) at every DOM sink, and the handful of unescaped interpolations are constrained to fixed palettes, enum `select` values, ≤2-character initials, server primary keys, or system-defined icons — none controllable by a lower-trust principal through the client. The prior-recon concerns about `esc()` bypass, the "anon client" in `prevSessionCache.js`, and the hardcoded Supabase key are all cleared (the client is authenticated via a shared session; the key is the publishable anon key). The one actionable item is **NV-1**: confirm the out-of-scope campus API validates the client-supplied `X-School-ID` against the Bearer token to prevent cross-tenant campus-data access. The service worker (`sw.js`) and Supabase RLS are unreviewed components/policies outside `src/` and should be verified separately.
