# Phase 1 ES Module Split — Semantic Review

The change splits a monolithic `app.js` into an ES module tree under `src/`. Eleven new files cover state, utilities, authentication, routing, five role views, a shared view utility layer, a data re-export shim, and a bootstrap entry point. `index.html` now loads `data.js` and `src/main.js` as `type="module"` scripts; `app.js` is no longer loaded. The primary goal — eliminating runtime globals and static circular imports through `admin.js ↔ student.js ↔ parent.js` — is structurally achieved. The new `shared.js` file breaks the cross-view cycle by hosting the 11 functions that were the roots of the static cycles.

**Watch for:** (1) `src/data/index.js` exports `undefined` if `window.Data` is not yet set, and the guard that is supposed to catch this fires *after* the exports are already bound — so the guard is too late to prevent silent `undefined` references spreading through every import. (2) `parent.js/_renderTimetableFor` bypasses the ES module import of `Timetable` and reaches directly into `window.Timetable`, creating an invisible dependency on the global that the module system cannot verify. (3) `shared.js` imports `openModal` from `router.js`, making `shared.js → router.js → views/admin.js → shared.js` a live module-evaluation cycle (see detail below).

**Verdict**: NEEDS_CHANGES

---

## High-level view

The import graph has been substantially cleaned up. `state.js` and `utils.js` have no imports from auth, router, or views. `auth.js` uses a lazy `import('./router.js')` to avoid a static cycle between auth and router. Every cross-role function that was driving static cycles (`renderEventsList`, `timetableTable`, `renderStudentGrowth`, `attendanceGridHTML`, etc.) now lives in `shared.js` and is imported by all consumers, not re-exported peer-to-peer.

`src/data/index.js` snapshots `window.Data` into module-level `const` bindings. The assumption is that `data.js` finishes its top-level synchronous assignment before any `src/` module is evaluated — confirmed true at the current data.js structure. The guard that throws when `window.Data` is undefined fires correctly at module evaluation time, but it fires *after* the const bindings are already set, so a missing `window.Data` will produce silent `undefined` exports plus a thrown error rather than a clean fail-fast.

`parent.js` contains one private function, `_renderTimetableFor`, that destructures `Timetable` from `window` rather than from the module-level import. This is a holdover from before the refactor. The module imports `Timetable` from `../data/index.js` but the function ignores it and goes directly to `window`. Every other file in `src/` uses the import correctly.

`shared.js` imports `openModal` from `router.js`, and `router.js` statically imports from `views/admin.js`, which statically imports from `shared.js`. This creates a static circular import involving `shared.js → router.js → admin.js → shared.js`. JavaScript ES modules handle this via live bindings, so it does not necessarily break at runtime, but it is still a structural cycle that violates the stated goal of "no circular imports."

---

<details>
<summary>Issues (4)</summary>

1. **Data guard fires too late** — `src/data/index.js` assigns `export const Data = window.Data` before checking `!window.Data`. If `window.Data` is undefined, every module that imports `Data` gets a silent `undefined` binding before the guard throws. Move the guard above the exports, or restructure as: check first, then export.

2. **`window.Timetable` bypass in parent.js** — `_renderTimetableFor` (line 145 of parent.js) reads `const { Timetable: T } = window` instead of using the `Timetable` already imported at the top of the file. If `window.Timetable` is ever undefined (e.g., after a data-layer refactor), this path silently produces empty timetables rather than throwing. Replace with the module-level import.

3. **Static cycle: shared.js → router.js → admin.js → shared.js** — `shared.js` statically imports `openModal` from `router.js`; `router.js` statically imports from `views/admin.js`; `admin.js` statically imports from `shared.js`. This is a live circular dependency. Break it by moving `openModal`/`closeModal` to a thin `modals.js` helper that has no view imports, then import from there in both `shared.js` and the view files.

4. **`_sensitiveRun` live-binding inconsistency** — `_sensitiveRun` is exported as a raw `let` from state.js alongside a `set_sensitiveRun` setter. Every other piece of mutable state in the module follows the getter/setter pattern (`getCurrentUser` / `setCurrentUser`). If a consumer captures `_sensitiveRun` at import time rather than re-reading it per invocation, it will always see the initial `null`. Add a `getSensitiveRun()` getter and stop exposing the raw binding. LOW priority; the current usage in admin.js re-reads it on each handler invocation and is not broken.

</details>

---

<details>
<summary>Details</summary>

### Data guard ordering in src/data/index.js

The module reads:

```js
export const Data       = window.Data;
export const Academic   = window.Academic;
// ...
if (typeof window !== 'undefined' && !window.Data) {
  throw new Error('...');
}
```

ES module evaluation is sequential: the `export const` lines execute first and snapshot whatever `window.Data` holds at that moment. If `window.Data` is `undefined`, the six named exports are all bound to `undefined`. The guard then throws, but the error is thrown *after* the broken bindings have been established. Any importing module that was already partially evaluated will hold `undefined` references.

The fix is to run the guard before the exports:

```js
if (typeof window !== 'undefined' && !window.Data) {
  throw new Error('...');
}
export const Data = window.Data;
// ...
```

This is confirmed as a real issue, not a theoretical one: because `data.js` is loaded as a `<script type="module">` before `src/main.js`, and both are top-level modules, the browser guarantees evaluation order only within the import graph — not between independent `<script>` tags unless one is guaranteed to finish before the other is evaluated. In practice data.js will almost always finish first, but the guard exists precisely to catch the case where it doesn't.

### window.Timetable bypass in parent.js

`parent.js` imports `Timetable` from `../data/index.js` at the top of the file, but the private `_renderTimetableFor` function (line 145) destructures `window` instead:

```js
function _renderTimetableFor(classId, containerId) {
  const { Timetable: T } = window;
  const all = T ? T.generateAll() : { schedules: [] };
```

`student.js` has the identical function and correctly uses the module-level import:
```js
// student.js
const all = Timetable.generateAll();
```

The `parent.js` version silently produces empty timetables if `window.Timetable` is not set — for example, if `data.js` is ever refactored to use proper exports instead of window assignments. Replace the destructure with the already-imported `Timetable` binding and remove the `T ?` fallback guard.

### Static circular import chain through shared.js

The concern chain is:

```
shared.js
  → openModal from router.js
      → renderAdminOverview ... from views/admin.js
          → timetableTable, askSensitiveConfirm ... from shared.js
```

All three are static top-level imports. JavaScript ES modules resolve this via live bindings and the "module is partially initialized" rule, so it will not throw a `ReferenceError` at load time — but it does mean `shared.js`'s own exports are not fully initialized when `admin.js` first imports them at module evaluation time. Functions are hoisted in the live binding sense, so in practice this works, but it violates the stated "no circular imports" goal and creates a fragile dependency on the order in which the cycle is entered.

The cleanest fix is a thin `src/modals.js` file that exports only `openModal` and `closeModal`, with no imports from any view layer. `shared.js`, `router.js`, and the view files all import from `modals.js`. This breaks the cycle entirely.

</details>

---

<details>
<summary>File map</summary>

| File | What changed |
|---|---|
| `src/state.js` | New file — all mutable shared state with getter/setter exports; no upstream imports |
| `src/utils.js` | New file — DOM helpers, formatters, CSV/XLSX/ZIP utilities; imports only from data/index.js |
| `src/auth.js` | New file — login/logout, nav building, capability helpers; lazy-imports router.js to avoid static cycle |
| `src/router.js` | New file — view switching, modal/drawer helpers, global event wiring; statically imports all view modules |
| `src/data/index.js` | New file — snapshots window.* namespaces as named ES module exports; includes timing guard (ordering issue: see findings) |
| `src/main.js` | New file — DOMContentLoaded bootstrap only; calls wireGlobals, initLogin, initAdminModals |
| `src/views/admin.js` | Split from app.js — administrator views plus initAdminModals aggregator; dynamic import for teacher.js to avoid cycle |
| `src/views/teacher.js` | Split from app.js — teacher views; lazy imports router.js showView/renderView |
| `src/views/student.js` | Split from app.js — student views; imports shared functions from shared.js |
| `src/views/parent.js` | Split from app.js — parent views; one remaining window.Timetable access (see finding #2) |
| `src/views/reports.js` | Split from app.js — shared student report drawer |
| `src/views/shared.js` | New file — 11 functions moved from admin.js and student.js to break static cycles; imports openModal from router.js (introduces new cycle: see finding #3) |
| `index.html` | Script tags updated to `/data.js` and `/src/main.js` as type="module"; app.js and legacy data.js not loaded |

Full diff: `git diff main -- src/ index.html`

</details>
