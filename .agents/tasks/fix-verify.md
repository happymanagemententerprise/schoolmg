# Fix verification — review findings iteration

## What was run
- `npm run build` — completed successfully, 0 errors, 128 modules transformed.

## Finding 1: `handleDecision` ignores `assignClass` return value
**Fixed in:** `src/react/components/AdminProgression.jsx`
**Change:** Captured the boolean return from `Progression.assignClass`. When `false`, shows an error toast ("Could not place student — they may already be in [class], or a connection error occurred.") and returns early without calling `refresh()` or the success toast. When `true`, proceeds with `refresh()` and success toast as before.
**Status:** Build-verified. Manual verification requires a browser with a configured Grade 10 pool.

## Finding 2: Listener accumulates on repeated `renderSubjectScores` calls
**Fixed in:** `src/views/teacher.js`
**Change:** Added a `dataset.listenerBound` flag on the `$('st-scores-table')` DOM element. The `addEventListener('change', ...)` call is now guarded — only executes when the flag is absent. After the first call it sets the flag so all subsequent calls to `renderSubjectScores` (from router navigation or after `processScoreUpload`) skip re-attachment. The listener itself is unchanged.
**Status:** Build-verified. Prevents double `saveGrade` calls and double "Score saved." toasts after file upload.

## Finding 3: `window.renderPeopleTab` assigned inside `renderAdminPeople()`, not at module load
**Fixed in:** `src/views/admin.js`
**Change:** Added `window.renderPeopleTab = renderPeopleTab;` at module level, placed immediately after the `renderPeopleTab` function definition (in the `// ── Password reset` section). The assignment inside `renderAdminPeople` is kept but updated to a no-op comment, so the window binding is unconditional from the moment the admin.js module loads — regardless of whether `renderAdminPeople` has been called yet.
**Status:** Build-verified. The Alpine optional-chain guard (`window.renderPeopleTab?.()`) now resolves immediately on any navigation path, not just after the first visit to Admin › People.

## Skipped
- Manual browser verification (no headless test harness; project has no automated tests per fix-plan.md).
