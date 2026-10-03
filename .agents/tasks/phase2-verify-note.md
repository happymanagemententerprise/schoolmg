# Phase 2 Verification Note -- Iteration 3 (Review Findings Fix)

This document describes the changes made in the third iteration of Phase 2 to address
the three findings in `phase2-review.json` (iteration 2 review).

---

## Finding fixes (Iteration 3)

### `subject-filter-xmodel-vestigial` (MEDIUM) -- FIXED

**Files:** `index.html`, `src/views/admin.js`

Added `@change="renderAdminSubjects()"` to both `#as-filter-level` and `#as-filter-group`
selects. `renderAdminSubjects` is now exposed on `window` at the top of its own body:
`window.renderAdminSubjects = renderAdminSubjects`. Alpine now owns the side-effect:
when a select changes, Alpine calls `renderAdminSubjects()`, which re-closes over
`draw()` and calls it immediately. The `x-model` bindings are no longer vestigial --
they maintain Alpine's `level`/`group` state alongside the function call.

### `subject-filter-onchange-not-removed` (MEDIUM) -- FIXED

**File:** `src/views/admin.js`

Removed `$('as-filter-level').onchange = draw` and `$('as-filter-group').onchange = draw`
from `renderAdminSubjects()`. Alpine's `@change` is now the sole trigger. A comment
marks the removal.

### `toast-missing-x-transition` (LOW) -- FIXED

**File:** `index.html`

Added `x-transition` to the `#toast` element. The toast now fades in and out using
Alpine's default transition instead of blinking on/off.

---

## Files changed in Iteration 3

| File | Change |
|---|---|
| `index.html` | `#toast`: added `x-transition`; subject filter selects: added `@change="renderAdminSubjects()"` to both |
| `src/views/admin.js` | `renderAdminSubjects`: exposes itself on `window`; removed `.onchange = draw` for both filter selects |

---

## Summary of full Phase 2 state (all files)

| File | Change |
|---|---|
| `index.html` | Alpine CDN `<script defer>` in `<head>`; login password toggle with `x-data`/`:type`/`@click`; `#login-error` with `x-show`/`x-text`; `#toast` with `x-data`/`x-show`/`x-transition`/`:class`/`x-text`; all 13 modal overlays with `x-data`/`x-show` (no `hidden`); `#people-tabs` with `x-data`/`:class`/`@click`+`renderPeopleTab`; upload label spans with `x-text`/`:class`; subject filter row with `x-data`/`x-model`/`@change`; student search with `x-data`/`x-model`/`@input`; attendance bar with `x-data`/`x-model`; `#stu-path-body` with `x-data` |
| `src/main.js` | `alpine:init` block before `DOMContentLoaded`; three stores registered |
| `src/auth.js` | `#login-error` DOM writes replaced with `Alpine.store('loginError', ...)`; password toggle listener removed |
| `src/utils.js` | `toast()` uses `Alpine.store('toast', ...)` with `window._toastTimer` auto-hide |
| `src/modals.js` | `openModal`/`closeModal` set `Alpine.store('modals')[id]` with DOM fallback |
| `src/views/admin.js` | `bindPeopleTabs` no-op; `updateUploadLabels` Alpine-only; `oninput` on search removed; `renderPeopleTab`, `renderAdminStudentTable`, and `renderAdminSubjects` exposed on `window`; subject filter `.onchange` handlers removed |
| `src/views/student.js` | Path cards use Alpine `:class`/`@click`; `Alpine.initTree(box)` + `Alpine.$data` after innerHTML; imperative click handler removed; save handler reads from Alpine `$data` |

---

## Prior iteration fixes (Iteration 2)

### `upload-label-dual-write` (HIGH) -- FIXED

`updateUploadLabels` was rewritten to only mutate `Alpine.$data(setupForm)` --
no more direct `.textContent`/`.className` writes.

### `bindPeopleTabs-double-listener` (MEDIUM) -- FIXED

`bindPeopleTabs` is a no-op. `renderPeopleTab` exposed on `window`. Tab buttons use
`@click="tab = 'name'; $nextTick(() => renderPeopleTab('name'))"`.

### `student-search-dead-alpine-state` (MEDIUM) -- FIXED

`@input="renderAdminStudentTable(query)"` added to `#admin-student-search`. Imperative
`oninput` handler removed. `renderAdminStudentTable` exposed on `window`.

### `people-tab-active-class-selector` (LOW) -- NOT CHANGED (no behavior change needed)

The `.active` selector used in `saveUserFromForm`/`renderAdminStudentTable` remains
reliable because `$nextTick` in the `@click` expression ensures Alpine's class update
commits before any synchronous DOM read.
