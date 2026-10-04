# People tab, Grade 10 pool table, class sort, and score entry

Four bug fixes: the Students tab doing nothing on first click, the Grade 10 pool missing its Name/Path/Decision layout, class lists not sorting alphabetically within a grade, and the score-entry screen having no editable inputs and a broken XLSX parser.

Watch for: The closed-window notice row renders even when `rows.length === 0`, appearing after the "No students" row rather than replacing it — **possible** visual stacking (two rows visible simultaneously when upload is closed and no students are enrolled).

**Verdict**: APPROVED

---

## High-level view

Fix 1 moves `window.renderPeopleTab` from inside `renderAdminPeople()` to module load, so the function is available before anyone navigates to People. The Alpine `@click` handlers are rewritten into a `switchTab()` method that calls `window.renderPeopleTab?.()` — the optional chain is the fail-safe if the module loads late.

Fix 2 replaces the old Placement modal button with three inline decision buttons: an Approve button that routes the student into the class matching their `pathRequest.stream`, and two override buttons for the other streams. When a student has no path request on record, all three stream buttons show without an Approve option. `handleDecision` now captures the `assignClass` return value and shows an error toast on `false`. The `currentUser` null guard ensures the function exits cleanly if auth has not yet resolved.

Fix 3 adds `name` as a tertiary sort key in `Data.classes()` using `localeCompare` with `numeric: true`. Since every dropdown and table in the app calls `Data.classes()` directly, the fix propagates everywhere automatically with no call-site changes.

Fix 4a adds editable CA and Exam inputs to the score table, gated behind `session.uploadOpen.test` and `session.uploadOpen.exam` respectively. A `dataset.listenerBound` guard prevents listener accumulation across repeated calls to `renderSubjectScores`. Fix 4b fixes the XLSX parser by detecting the compression method byte and routing DEFLATE entries through `DecompressionStream('deflate-raw')` instead of passing raw bytes to `TextDecoder`. An unsupported-browser path throws a named error and shows a specific toast directing the user to CSV.

---

<details>
<summary>Issues (1)</summary>

1. **Closed-notice double-row** — When `rows.length === 0` and both upload windows are closed, the `<tbody>` renders the "No students" row followed by the closed-window notice row, making both visible simultaneously. Suppress the notice when `rows.length === 0`, or fold the closed-window message into the "No students" cell. (possible — depends on whether a class with no enrolled students and a closed upload window is a state the school encounters in practice.)

</details>

---

<details>
<summary>Details</summary>

### Fix 1: `window.renderPeopleTab` assignment at module load

`window.renderPeopleTab` was only assigned inside `renderAdminPeople()`. Clicking the Students tab before navigating to Admin › People meant Alpine had no function to call — the click was silently lost. The fix adds `window.renderPeopleTab = renderPeopleTab` at module scope in `src/views/admin.js`, immediately after the function definition. The assignment inside `renderAdminPeople` stays as a harmless no-op comment. All three `@click` attributes now route through `switchTab(t)` on the Alpine component, which calls `window.renderPeopleTab?.()` via `$nextTick`.

### Fix 2: ProgressionPool table — Decision button logic

For each pool entrant, `Progression.pathRequest(s.id)` is called to get the student's chosen stream (`pr?.stream`). When a stream is set, the Decision cell renders Approve (routes to the student's own stream) and two override buttons for the other two streams. When `pr` is null, all three stream buttons appear with equal weight and no Approve. `handleDecision` looks up the target class with `allClasses.find(c => c.level === 'SS' && c.year === 10 && c.stream === chosenStream && c.selectionMode !== 'pool')` — the `selectionMode !== 'pool'` guard prevents the pool class itself from matching.

`handleClosePool` still accesses `currentUser.id` unconditionally without a null guard. This pre-existing pattern is out of scope here but is worth a future hardening pass.

### Fix 3: Alphabetical class sort

The plan called for a `sortedClasses()` helper in `src/data/index.js`; the implementation modified `Data.classes()` directly in `data.js`. That's the right call — all call sites benefit without any import changes. The name sort uses `localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })`, correctly ordering "Grade 7 A" before "Grade 7 B" and "Grade 9" before "Grade 10".

### Fix 4a: Inline score entry

`caOpen` and `examOpen` are read inside `draw()` on every render, so they stay in sync if an admin changes the flags mid-session. The `data-sid`, `data-sub`, `data-term`, and `data-type` attributes on each input carry everything the change listener needs to reconstruct the full grade call without re-querying the DOM.

When both upload windows are closed and the class has no enrolled students, the rendered `<tbody>` contains the "No students" row immediately followed by the closed-window notice row. Both are visible — a minor cosmetic issue (possible), not a data integrity concern.

### Fix 4b: XLSX DEFLATE parser

The original parser passed raw DEFLATE-compressed bytes to `TextDecoder`, producing garbage because DEFLATE output is not valid UTF-8. The fix reads the compression method from bytes 8–9 of the ZIP Local File Header: method `0` (stored) takes the direct path; method `8` (DEFLATE) pipes through `DecompressionStream('deflate-raw')`.

The output buffer is pre-allocated from `uLen` (bytes 22–25 of the local file header). When `uLen === 0` — written by ZIP tools that omit the uncompressed-size field — the buffer falls back to the sum of all decompressed chunk lengths, which is correct.

`processScoreUpload` catches any thrown error; when the message includes "DecompressionStream" it shows a browser-specific "save as CSV" message rather than the generic fallback, giving the user an actionable next step.

</details>

---

<details>
<summary>Files changed</summary>

| File | What changed |
|------|-------------|
| `index.html` | People tabs rewritten with `switchTab()` Alpine method; Upload scores button and file input added to score view |
| `src/views/admin.js` | `window.renderPeopleTab` assigned at module load |
| `src/react/components/AdminProgression.jsx` | ProgressionPool table redesigned (Name/Path/Decision); `handleDecision` captures assignClass return; `currentUser` null guard added |
| `data.js` | `Data.classes()` tertiary sort by name with `numeric: true` |
| `src/views/teacher.js` | Editable CA/Exam inputs; `dataset.listenerBound` guard; `_parseXlsxRows` made async with DEFLATE support; upload button wired in score view |

Full diff: `git diff 3e4d694..HEAD`

</details>
