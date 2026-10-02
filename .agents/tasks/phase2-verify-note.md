# Phase 2 Verification Note — Iteration 2 (Review Findings Fix)

This document describes the changes made in the second iteration of Phase 2 to address
the four findings in `phase2-review.json`.

---

## Finding fixes

### `upload-label-dual-write` (HIGH) — FIXED

**File:** `src/views/admin.js`

Removed the `forEach` DOM-write block from `updateUploadLabels` that was setting
`.textContent` and `.className` directly on `#upload-test-label` and `#upload-exam-label`.
Those elements are owned by Alpine `x-text` and `:class`. The function now only mutates
`Alpine.$data(setupForm)` (the `testOpen`/`examOpen` properties), and Alpine drives the
DOM from there. Also removed the now-redundant duplicated Alpine `$data` mutation blocks
from the two toggle `onclick` handlers in `renderAdminSetup` — `updateUploadLabels` does
that work now.

### `bindPeopleTabs-double-listener` (MEDIUM) — FIXED

**Files:** `src/views/admin.js`, `index.html`

`bindPeopleTabs` is now a no-op. The accumulating `addEventListener` calls are gone.

`renderPeopleTab` is exposed on `window` at the start of `renderAdminPeople()`. The
Alpine `@click` expressions on each tab button in `#people-tabs` now call
`$nextTick(() => renderPeopleTab('tabname'))` alongside the Alpine state assignment
(`tab = 'tabname'`). `$nextTick` ensures Alpine's reactive DOM update (the `:class`
binding) commits before the render function reads `.active` via the selector.

This means tab switching has exactly one render call per click regardless of how many
times the People view has been visited.

### `student-search-dead-alpine-state` (MEDIUM) — FIXED

**Files:** `index.html`, `src/views/admin.js`

Added `@input="renderAdminStudentTable(query)"` to the `#admin-student-search` input.
`renderAdminStudentTable` is exposed on `window` in `renderAdminOverview()`. Removed the
imperative `$('admin-student-search').oninput = ...` from `renderAdminOverview`. Alpine
now owns both the state (`x-model="query"`) and the side-effect (`@input`).

### `people-tab-active-class-selector` (LOW) — NOT CHANGED

`saveUserFromForm` and `renderAdminStudentTable` continue to read the active tab via
`$q('#people-tabs .tab-btn.active')?.dataset.tab || 'staff'`. With `$nextTick` used in
the `@click` expression, Alpine's class update is committed before any subsequent
synchronous DOM read, so the `.active` selector remains reliable in all current code paths.
No behaviour change was needed or made.

---

## Files changed in this iteration

| File | Change |
|---|---|
| `src/views/admin.js` | `updateUploadLabels`: removed `forEach` DOM-write block; `renderAdminPeople`: exposes `renderPeopleTab` on `window`, `bindPeopleTabs` made no-op; `renderAdminOverview`: removed `oninput` handler, exposes `renderAdminStudentTable` on `window`; toggle `onclick` handlers: removed redundant Alpine `$data` mutations |
| `index.html` | `#people-tabs` `@click` expressions: added `$nextTick(() => renderPeopleTab('tabname'))` call; `#admin-student-search` input: added `@input="renderAdminStudentTable(query)"` |

---

## Summary of full Phase 2 state (all files)

| File | Change |
|---|---|
| `index.html` | Alpine CDN `<script defer>` in `<head>`; login password toggle with `x-data`/`:type`/`@click`; `#login-error` with `x-show`/`x-text`; `#toast` with `x-data`/`x-show`/`x-transition`/`:class`/`x-text`; all 13 modal overlays with `x-data`/`x-show` (no `hidden`); `#people-tabs` with `x-data`/`:class`/`@click`+`renderPeopleTab`; upload label spans with `x-text`/`:class`; subject filter row with `x-data`/`x-model`; student search with `x-data`/`x-model`/`@input`; attendance bar with `x-data`/`x-model`; `#stu-path-body` with `x-data` |
| `src/main.js` | `alpine:init` block before `DOMContentLoaded`; three stores registered |
| `src/auth.js` | `#login-error` DOM writes → `Alpine.store('loginError', ...)`; password toggle listener removed |
| `src/utils.js` | `toast()` → `Alpine.store('toast', ...)` with `window._toastTimer` |
| `src/modals.js` | `openModal`/`closeModal` → set `Alpine.store('modals')[id]` with fallback |
| `src/views/admin.js` | `bindPeopleTabs` → no-op; `updateUploadLabels` → Alpine-only; `oninput` on search removed; `renderPeopleTab` and `renderAdminStudentTable` exposed on `window` |
| `src/views/student.js` | Path cards: Alpine `:class`/`@click`; `Alpine.initTree(box)` + `Alpine.$data` after innerHTML; imperative click handler removed; save handler reads from Alpine `$data` |
