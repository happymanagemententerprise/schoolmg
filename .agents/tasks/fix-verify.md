# Fix Verification — 2026-10-02

## What was run
- `npm run build` — Vite production build — **PASSED** (exit 0, zero errors, 5 warnings pre-existing)
- Manual code inspection of each changed file against the fix plan

## Fix 1 — People tab selection
- **Changed**: `index.html` `#people-tabs` Alpine `x-data` attribute — replaced bare `renderPeopleTab(...)` calls with `switchTab(t)` component method that uses `window.renderPeopleTab?.(t)` (optional chaining guards against race).
- **Status**: PASSED (build). Manual browser verify required: navigate to Admin › People, click Students tab before any prior navigation.

## Fix 2 — Grade 10 Pool: Name / Path / Decision
- **Changed**: `src/react/components/AdminProgression.jsx` — `ProgressionPool` component fully rewritten.
  - Table columns: Name (+ class name) | Path (student pick badge) | Decision (Approve + override buttons).
  - Uses `Progression.pathRequest(s.id)` to get chosen stream.
  - Decision buttons: if stream chosen → [Approve] [other two streams]; if no stream → [Science] [Arts] [Commercial].
  - Clicking any button calls `Progression.assignClass(...)` then `refresh()` and `toast(...)`.
  - Dead `streamOptions` helper removed.
- **Status**: PASSED (build). Manual verify: navigate to Admin › Progression › Grade 10 Pool.

## Fix 3 — Class sort: alphabetical everywhere
- **Changed**: `data.js` `Data.classes()` — added name as tertiary sort key using `localeCompare` with `{ numeric: true, sensitivity: 'base' }`. Propagates to all consumers automatically.
- **Status**: PASSED (build). Manual verify: two same-year classes should appear A before B.

## Fix 4a — Score entry: editable inputs
- **Changed**: `src/views/teacher.js` `renderSubjectScores()` → `draw()`:
  - Reads `Data.session().uploadOpen.test` (caOpen) and `.exam` (examOpen).
  - CA cells render as `<input type="number" max="40">` when caOpen, else display-only text.
  - Exam cells render as `<input type="number" max="60">` when examOpen, else display-only text.
  - When both closed, appends a "Score entry is currently closed" notice row.
  - Persistent delegated `change` listener on `<tbody>` calls `Data.saveGrade(...)` and toasts result.
- **Changed**: `index.html` — added "↑ Upload scores" button and hidden `st-scores-file-input` inside `#view-subject-scores`.
- **Changed**: `renderSubjectScores()` — wires the new upload button/input to `processScoreUpload`.
- **Status**: PASSED (build). Manual verify: open a CA/Exam window from Admin dashboard, visit Teacher › Scores, edit a cell.

## Fix 4b — XLSX upload: async DEFLATE decompression
- **Changed**: `src/views/teacher.js` `_parseXlsxRows` — now `async`, `zipEntry` now `async`.
  - Reads compression method from bytes 8–9 of each ZIP local file header.
  - Stored (method=0): decodes directly via TextDecoder.
  - DEFLATE (method=8): decompresses via `DecompressionStream('deflate-raw')` (no new dependency).
  - If `DecompressionStream` not available: throws with descriptive message.
  - `processScoreUpload` now `await`s `_parseXlsxRows` and catches the new DecompressionStream error with a user-friendly message.
- **Status**: PASSED (build). Manual verify: download score sheet as .xlsx, fill in scores, upload.

## Skipped / not verified
- No automated tests exist in this project (confirmed: no test script in package.json).
- All manual browser verification steps require a running dev server and real data.

## Build output
- `npm run build`: ✓ 128 modules, built in ~30s, exit 0, zero errors.
- Warnings are all pre-existing dynamic-import notices, not caused by these changes.
