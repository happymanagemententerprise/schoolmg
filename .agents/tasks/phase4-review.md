# Phase 4 React Migration — Happy Man Academy SPA

The migration converts six vanilla-JS views (StudentReportDrawer, ClassAttendance, AdminProgression, QuizManager, QuizTaker, ClassOverview) into React 18 components mounted via a shared idempotent helper. The build passes with zero errors. The central correctness concern is a startup crash introduced by `bindProgressionModals` calling `bindDayStructureForm`, which attempts to attach event listeners to DOM elements that were removed when the admin progression view was replaced with a React mount point.

Watch for: **(confirmed)** `bindProgressionModals()` → `bindDayStructureForm()` fires on every page load via `initAdminModals()` in `main.js` and will throw `TypeError: Cannot read properties of null (reading 'addEventListener')` because `dstr-reset-breaks` and `save-day-structure-btn` no longer exist in `index.html`.

**Verdict**: CHANGES_REQUESTED

---

## High-level view

AppContext reads the in-memory `getCurrentUser()` from `state.js`, which is exactly where `auth.js` writes it after login. The auth chain is correct.

The mount helper uses a `Map` keyed by container ID to guarantee at most one `createRoot` call per container, and re-renders on subsequent calls to the same ID. All six mount point IDs are present in `index.html`, and all six vanilla render functions in `teacher.js`, `student.js`, `admin.js`, and `reports.js` delegate to `mount()`.

StudentReportDrawer reproduces the locked/full render paths. Data is read synchronously at component render time. A single `useEffect` fires `openDrawer()` after mount — this is the one permitted side-effect use. The prop rename from `termOverride` to `term` is handled correctly at the call site in `reports.js`.

ClassAttendance covers all three attendance states, week/day selectors, the heatmap, a weekly rollup sub-component, and the save flow. Data is loaded synchronously in `buildDraft` at `useState` initialisation time. The `v` counter pattern triggers `WeeklySummary` to re-read persisted data after a save.

AdminProgression covers all required sub-views: ProgressionDecisions with override and clear buttons, ProgressionPool with close-pool action, PublishPanel, PositionsPanel, ApprovalsPanel, DayStructurePanel, SensitiveConfirmModal, and PlacementModal. The `SensitiveConfirmModal` is React-internal state; it does not use the Alpine `sensitive-confirm-modal` in `index.html`. The Alpine progression modals in `index.html` are now dead HTML — this is consistent with the plan.

The `bindProgressionModals` no-op comment correctly describes the intent but its body still calls `bindDayStructureForm()`, which targets the removed `dstr-*` DOM elements. This is a confirmed startup crash.

PositionsPanel is the only component with a `useEffect` that fetches data — `Progression.positions()` is async, so this is the one place where async data loading was explicitly permitted by the plan.

QuizManager covers the combo select, create flow, quiz list with publish/delete/results actions, the question editor with MC (4-option) and T/F types, and the results panel. QuizTaker covers list, taker, and result modes with question-by-question radio navigation and a submit handler that calls `Data.submitQuizAttempt`.

ClassOverview covers stat cards, the student table with attendance-focus and password-reset buttons, the at-risk support list, and the approvals panel. Data is all synchronous. Navigation to other views uses lazy `import()` of `router.js` to avoid circular dependencies.

The Alpine-managed elements — toast, modals store, login error, password toggle — are untouched. React components call `toast()` directly from event handlers and do not interact with Alpine modal state. The old Alpine `x-data` on `att-daily-bar` is gone because the entire attendance view inner HTML was replaced.

CSS class names broadly match the existing vocabulary (`btn-primary`, `outline-button`, `status promoted/review/repeat`, `stat-card`, `panel`, etc.), but inline `style` props appear throughout for layout adjustments — `margin: 0`, `paddingLeft: 32`, `fontSize: 9`, `textAlign: 'center'`, `flex: 1` — in violation of constraint 16. Some of these mirror inline styles from the original vanilla templates, but the constraint requires stylesheet classes.

---

<details>
<summary>Issues (3)</summary>

1. **`bindDayStructureForm` crash on startup** — `bindProgressionModals()` calls `bindDayStructureForm()`, which calls `$('dstr-reset-breaks').addEventListener(...)`. `dstr-reset-breaks` and `save-day-structure-btn` were removed from `index.html` when the progression view was replaced with a React mount point. `$()` returns `null`; the `.addEventListener` call throws `TypeError` on every page load, breaking the entire bootstrap sequence. Fix: make `bindDayStructureForm` a no-op in the same way `bindProgressionModals` describes intent but currently does not deliver.

2. **`renderStudentQuizzes` uses dynamic import instead of static** — `renderStudentQuizzes` in `student.js` resolves `mount` and `QuizTaker` via chained dynamic `import()` rather than static top-level imports (unlike `renderClassAttendance`, `renderTeacherQuizzes`, and `renderClassOverview` which use static imports). This means the quiz view will render asynchronously after the nav click — there will be a brief blank frame before content appears. This asymmetry also defeats tree-shaking for `QuizTaker`. Fix: add static imports at the top of `student.js` as done in `teacher.js`.

3. **Inline styles in React components** — Multiple components use `style={{ ... }}` for layout adjustments (`margin: 0`, `width: auto`, `paddingLeft: 32`, `fontSize: 9`, `textAlign: 'center'`, `flex: 1`, `display: 'block'`) instead of utility classes from `src/styles.css`. This is a constraint violation (item 16). Fix: audit whether the original vanilla HTML used the same inline values or CSS classes, and replace inline styles with class names where the stylesheet already provides the equivalent rule.

</details>

---

<details>
<summary>Details</summary>

### `bindProgressionModals` → `bindDayStructureForm` startup crash

`initAdminModals()` in `src/views/admin.js` is called unconditionally during Alpine init in `main.js`. It calls `bindProgressionModals()`, whose body includes `bindDayStructureForm()`. That function accesses `$('dstr-reset-breaks')` and `$('save-day-structure-btn')` — both IDs were removed from `index.html` when `#view-admin-progression`'s inner HTML was replaced with `<div id="react-admin-progression">`. `$()` returns `null`; calling `.addEventListener` on `null` throws a `TypeError` that will abort the bootstrap sequence before login is functional.

The comment in `bindProgressionModals` says "DayStructureForm is also handled inside AdminProgression.jsx" — which is true — but the call to `bindDayStructureForm()` was not removed.

### `renderStudentQuizzes` dynamic import asymmetry

Every other React render function in this migration uses top-level static imports:

```js
// teacher.js (correct)
import { mount as _reactMount } from '../react/mount.js';
import _ClassAttendance from '../react/components/ClassAttendance.jsx';
export function renderClassAttendance(focusSid = null) {
  _reactMount('react-class-attendance', _ClassAttendance, { focusSid });
}
```

`renderStudentQuizzes` in `student.js` uses nested dynamic imports instead:

```js
export function renderStudentQuizzes() {
  import('../react/mount.js').then(({ mount }) => {
    import('../react/components/QuizTaker.jsx').then(({ default: QuizTaker }) => {
      mount('react-student-quizzes', QuizTaker, {});
    });
  });
}
```

The mount point will remain empty until both promises resolve, causing a blank flash on navigation. More critically, if either import fails at runtime (e.g. a bundling error specific to that chunk) there is no error surfacing — the view silently stays blank.

### Inline styles constraint

The constraint (item 16) is "all CSS class names from `src/styles.css`; no inline styles". The components use `style={{ margin: 0 }}` on buttons, `style={{ paddingLeft: 32, display: 'block', marginTop: 2 }}` on attendance cells, `style={{ fontSize: 9 }}` on status badges, `style={{ textAlign: 'center' }}` on table cells, and `style={{ flex: 1 }}` on approval rows. Several of these duplicate layout that the original vanilla templates expressed via the same inline style strings, so the visual output is identical — but the constraint is still violated. This is a medium concern given it affects maintainability and deviates from the stated rule.

### StudentReportDrawer prop rename

The plan names the prop `termOverride`; the component defines it as `term` (`{ studentId, term: termProp = null }`). The call site in `reports.js` passes `term: termOverride ?? null` — correct. Any future caller that passes `termOverride` directly will get `undefined` silently, reverting to `currentTerm()`. Worth documenting for callers outside this module.

### No test coverage

No tests were added for any of the seven React components or the updated mount/context infrastructure. This was not flagged as in-scope by the plan, but the lack of snapshot or integration tests means regressions in the visual structure of any component won't be caught automatically.

</details>

---

<details>
<summary>File map</summary>

| File | Change |
|---|---|
| `src/context/AppContext.jsx` | New — `AppProvider` + `useApp` wrapping `getCurrentUser()` |
| `src/react/mount.js` | New — idempotent `createRoot` wrapper with `roots` Map |
| `src/react/components/StudentReportDrawer.jsx` | New — locked + full report drawer, `useEffect` for `openDrawer()` |
| `src/react/components/ClassAttendance.jsx` | New — 3-state register, week/day selectors, heatmap, WeeklySummary |
| `src/react/components/AdminProgression.jsx` | New — all progression sub-panels, internal SensitiveConfirmModal + PlacementModal |
| `src/react/components/QuizManager.jsx` | New — combo select, create form, quiz list, QuizEditorPanel, QuizResultsPanel |
| `src/react/components/QuizTaker.jsx` | New — list/taker/result modes, radio form, submit |
| `src/react/components/ClassOverview.jsx` | New — stat cards, student table, support list, approvals panel |
| `src/views/reports.js` | Replaced `openStudentReport` body with React mount |
| `src/views/teacher.js` | Replaced `renderClassAttendance`, `renderClassOverview`, `renderTeacherQuizzes` with React mount; `renderClassApprovals` made no-op |
| `src/views/student.js` | Replaced `renderStudentQuizzes` with dynamic-import React mount |
| `src/views/admin.js` | Replaced `renderAdminProgression` with React mount; `bindProgressionModals` made no-op stub (but still calls `bindDayStructureForm`) |
| `index.html` | Mount point divs replacing inner HTML of all six migrated views; `att-daily-bar` Alpine block removed |
| `package.json` | Added `react`, `react-dom`, `@vitejs/plugin-react` |
| `vite.config.js` | Added React plugin, `react-vendor` manual chunk |
| `wrangler.toml` | Updated `pages_build_output_dir` from `"."` to `"dist"` |

Full diff: `git diff HEAD~1` (or compare the last commit against `main`).
</details>
