# Phase 2 Alpine.js Migration — Iteration 3 Review

Phase 2 wires Alpine.js reactivity across the Happy Man Academy SPA, replacing imperative DOM manipulation for the login error, toast, all modal overlays, people tabs, upload pills, subject filters, student search, attendance selectors, and student path cards. The approach keeps data in Alpine stores and component `x-data` state while JS logic stays in the existing view functions. Three findings from the iteration 2 review (subject-filter `@change` missing, subject-filter `.onchange` not removed, toast missing `x-transition`) were all addressed in iteration 3.

**Watch for:** One new LOW finding — the attendance bar selects have `x-model` but the imperative `.value = 1` / `.value = 0` initialization in `teacher.js` does not update Alpine's reactive data, leaving the Alpine model stale after init. No Alpine expression consumes that stale state so no visible bug exists today, but the model will silently diverge if any future Alpine expression on this component reads `week` or `day`.

**Verdict**: APPROVED

---

## High-level view

The Alpine CDN tag lands in `<head>` with `defer`, ahead of the module scripts, and all three global stores (`toast`, `modals`, `loginError`) are registered in the `alpine:init` listener that precedes `DOMContentLoaded` in `main.js`. Ordering is correct.

The login form, toast, all 13 modal overlays, and the filter/search/tab components all have complete Alpine attributes with no residual `hidden` attributes or imperative DOM writes. The three iteration 2 findings are confirmed fixed.

The attendance daily register bar is the only component where Alpine and imperative code create state inconsistency. `x-model` on the two selects keeps Alpine's local `week`/`day` state in sync with real browser change events, but `teacher.js` sets `.value = 1` / `.value = 0` directly at initialization, bypassing Alpine's reactivity. The Alpine model reads the string defaults `'1'`/`'0'` while the DOM happens to show the same values — safe by coincidence, not by design. No Alpine expression in the HTML depends on this state.

The `window.renderAdminStudentTable` / `window.renderPeopleTab` / `window.renderAdminSubjects` self-registration pattern is safe: each view render function is always called before the user can trigger the Alpine event that needs it.

---

<details>
<summary>Issues (1)</summary>

1. **Attendance selects: Alpine model stale after init** — `teacher.js` sets `$('ct-day-week').value = 1` and `$('ct-day-of-week').value = 0` imperatively, bypassing `x-model` reactivity. No Alpine expression currently reads `week` or `day`, so there is no visible bug today, but any future Alpine binding on this component will silently read stale values. Fix: remove the imperative `.value =` assignments and rely on the `x-data` defaults matching the `<option>` defaults, or add `@change="drawDay()"` in the HTML and remove `.onchange = drawDay` from `teacher.js`.

</details>

<details>
<summary>Details</summary>

### Attendance selects: stale Alpine model

The daily bar HTML is `<div class="att-daily-bar mt16" x-data="{ week: '1', day: '0' }">` with both selects carrying `x-model`. In `teacher.js`, `renderClassAttendance` sets:

```js
$('ct-day-week').onchange    = drawDay;
$('ct-day-of-week').onchange = drawDay;
$('ct-day-week').value       = 1;
$('ct-day-of-week').value    = 0;
```

The `.onchange` assignments are fine — they fire on browser change events and `drawDay` reads `.value` directly. The `.value = 1` / `.value = 0` assignments set the DOM without triggering Alpine's reactive setter, so Alpine's `week` stays `'1'` and `day` stays `'0'`. Those happen to be the same values the DOM now holds, so no mismatch is visible. The risk is latent: if someone adds `x-show` or `x-bind` logic that reads `week` or `day` in this component, it will read stale initial state instead of the current selection.

### Subject filters: iteration 3 fix confirmed

Both `#as-filter-level` and `#as-filter-group` carry `@change="renderAdminSubjects()"` alongside `x-model`. Inside `renderAdminSubjects()`, the first statement is `window.renderAdminSubjects = renderAdminSubjects` (self-registration) and the comment confirms `.onchange = draw` has been removed. The selects read their values imperatively via `$('as-filter-level').value` inside `draw()` — the `x-model` state is not consumed, but `@change` correctly triggers the redraw.

### Regression check

`router.js`, `state.js`, `src/data/index.js`, `src/views/shared.js`, `src/views/reports.js`, and `styles.css` are untouched. All callers of `openModal`, `closeModal`, and `toast` across the view files pass unchanged string IDs and message arguments. Score table, timetable, leaderboard, and progression render functions are unmodified.

</details>

---

## File map

<details>
<summary>Changed files</summary>

| File | What changed |
|---|---|
| `index.html` | Alpine CDN in `<head>`; Alpine directives on login form, `#login-error`, `#toast` (+ `x-transition`), all 13 modal overlays (no `hidden`), `#people-tabs`, upload label spans, subject filter selects (+ `@change`), admin student search, attendance daily bar, `#stu-path-body` |
| `src/main.js` | `alpine:init` listener registering three stores, placed before `DOMContentLoaded` |
| `src/auth.js` | All `#login-error` DOM writes replaced with `Alpine.store('loginError', ...)` calls; password toggle listener removed |
| `src/utils.js` | `toast()` drives `Alpine.store('toast', ...)` with auto-hide via `window._toastTimer` |
| `src/modals.js` | `openModal`/`closeModal` set `Alpine.store('modals')[id]`; DOM fallback retained for pre-Alpine initialization edge case |
| `src/views/admin.js` | `bindPeopleTabs` no-op; `updateUploadLabels` Alpine-only; subject filter `.onchange` handlers removed; `renderPeopleTab`, `renderAdminStudentTable`, `renderAdminSubjects` exposed on `window` |
| `src/views/student.js` | Path cards use Alpine `:class`/`@click`; `Alpine.initTree(box)` + `Alpine.$data` after innerHTML; save handler reads from Alpine `$data` with radio fallback |

</details>
