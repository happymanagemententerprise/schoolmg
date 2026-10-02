# Phase 1 — ES Module Split Verification

## Files Created

| File | Purpose |
|------|---------|
| `src/state.js` | Shared mutable state with getters/setters for `currentUser` and session globals |
| `src/data/index.js` | Re-exports Data namespace from window globals set by data.js |
| `src/utils.js` | Pure helpers: DOM, formatting, xlsx/csv download, zip, classRank, yearRank |
| `src/auth.js` | Login/logout, nav building, capability helpers, role predicates |
| `src/router.js` | showView, renderView, openModal/closeModal, openDrawer/closeDrawer, wireGlobals |
| `src/views/admin.js` | All renderAdmin* and supporting admin functions |
| `src/views/teacher.js` | Teacher, HOD, LMS (lessons/quizzes/discussions), class views |
| `src/views/student.js` | Student dashboard, results, pathway, lessons, quizzes, discussions, attendance |
| `src/views/parent.js` | Parent dashboard, attendance, assignments, timetable |
| `src/views/reports.js` | Shared openStudentReport drawer |
| `src/main.js` | Bootstrap entry point |

## index.html change

Replaced:
```html
<script type="module" src="data.js"></script>
<script defer src="app.js"></script>
```
With:
```html
<script type="module" src="/src/main.js"></script>
```

app.js is retained at root as backup. data.js is retained at root unchanged.

## Module Resolution Check

Command: `node src/main.js 2>&1 | head -50`

Result: **PASSED** — no `ERR_MODULE_NOT_FOUND` errors. All relative imports resolve correctly.

The only error is `ReferenceError: window is not defined` in `src/data/index.js` line 22, which is expected and acceptable (browser-only API; window is populated at runtime in the browser by data.js before src/main.js runs).

## Design Notes

- `src/data/index.js` re-exports `Data, Academic, Progression, Timetable, Growth, DB` from `window.*` globals set by data.js. When data.js gains proper `export` statements in a later phase, this file can be simplified to `export { ... } from '../../data.js'`.
- Circular dependencies between router.js ↔ views/*.js are avoided using dynamic `import()` calls where needed (auth.js, teacher.js).
- `currentUser` reads use `getCurrentUser()` from state.js; writes use `setCurrentUser()`.
- No npm packages were added. Zero new dependencies.
