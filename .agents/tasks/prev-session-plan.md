# Implementation Plan — Previous Session Data

## Codebase Findings (used to ground every item)

- **Build**: `npm run build` (`vite build`) — no test runner; verification is a clean build.
- **`_sb` is module-private** in `data.js` and NOT exposed on `window`. `prevSessionCache.js` must create its own `createClient` instance using the same public anon credentials (`https://erlhyrswcqpqpqzbgmgb.supabase.co` / `sb_publishable_khuN_STEq5Pi5VqpfpqYzw_FvHQAgPj`). This is safe — it is an anon/publishable key by design.
- **`mount()` signature**: `mount(containerId: string, Component, props)` — takes a container ID string, not a DOM element. Step 6 must call `_reactMount('react-student-results', StudentResults, {})`, NOT `mount(document.getElementById(...))`.
- **`resultsLockedNote`**: exported from `src/views/shared.js` at line 144 — name confirmed.
- **`Data.session().terms`** gives the current session's term list; for past sessions, terms come from the fetched cache.
- **Existing `renderStudentResults`** in `src/views/student.js` (lines ~105–158): uses DOM ids `std-results-term`, `std-results-thead`, `std-results-table`, `std-results-meta`. All four must be replaced by `<div id="react-student-results">` in `index.html`.
- **`StudentReportDrawer.jsx`**: currently imports `useEffect` only from React. Will need `useState` added.
- **`index.html` `#view-student-results`** (line 939–955): contains `<section class="welcome-row">` with the heading, `<select id="std-results-term">`, and a `.panel` with `<thead id="std-results-thead">` / `<tbody id="std-results-table">`. The welcome-row heading section stays; only the select and the panel are replaced.
- **CSS**: `.tab-btn` / `.tab-btn.active` already exist (line 715). `.stat-card` already exists (line 417). New CSS goes near line 435 (after stat-card rules) or near line 762 (modal section).

---

## Step 1 — Create `src/data/prevSessionCache.js`

Create the data-layer module. Because `_sb` is private to `data.js`, this module instantiates its own Supabase client using the same public credentials. LRU eviction: track insertion order in a `Map`; when size exceeds 50 drop `cache.keys().next().value`. Cache key: `` `${studentId}:${sessionId}` ``. `gradesByTerm` keyed by term number (1/2/3) derived by matching each grade row's `term_id` against the fetched `terms` array. `attendanceByTerm` similarly.

```
getSessionsWithData(studentId):
  1. Fetch all sessions WHERE is_current=false AND is_closed=true, ORDER BY created_at DESC.
  2. For each session: fetch termIds for that session from `terms`.
  3. For each session: count grades WHERE term_id IN termIds AND student_id = studentId.
  4. Return sessions where count > 0.

fetchPrevSession(studentId, sessionId):
  1. Check cache for key `${studentId}:${sessionId}` — return if found (move to end of Map for LRU).
  2. Fetch terms WHERE session_id = sessionId.
  3. Fetch grades WHERE term_id IN termIds AND student_id = studentId.
  4. Fetch attendance_weekly WHERE term_id IN termIds AND student_id = studentId.
  5. Build gradesByTerm: { 1: [{subject_id, test, exam}], 2: [...], 3: [...] }
     by matching term._id (the DB id) → term.term (1/2/3) for each grade row.
  6. Build attendanceByTerm: { 1: {W1: days, W2: days...}, 2: {...}, 3: {...} }.
  7. Store in cache; evict LRU if size > 50. Return payload.

clearPrevSessionCache(): cache.clear()
```

**Files**: `src/data/prevSessionCache.js` (create)

**Verify**: `npm run build` — no errors.

---

## Step 2 — Create `src/react/components/SessionSelector.jsx`

Thin component. Props: `{ studentId, currentSessionName, selectedSessionId, onSelect }`. `useState([])` for `pastSessions`, `useState(true)` for `loading`. `useEffect` on `studentId` calls `getSessionsWithData(studentId)`.

- If `loading`: render nothing (or a spinner `<span className="muted-cell">…</span>`).
- If `!loading && pastSessions.length === 0`: render `<p className="eyebrow session-eyebrow">{currentSessionName}</p>`.
- Else: render `<select className="select-inline session-select">` with `value={selectedSessionId ?? 'current'}` and `onChange` calling `onSelect(value === 'current' ? null : value)`. Options: current first (`value="current"`, label `{currentSessionName} (Current)`), then each past session.

Import `getSessionsWithData` from `../../data/prevSessionCache.js`.

**Files**: `src/react/components/SessionSelector.jsx` (create)

**Verify**: `npm run build` — no errors.

---

## Step 3 — Create `src/react/components/PreviousSessionPanel.jsx`

Full past-session view. Props: `{ studentId, sessionId, sessionName, onDownload }`. All sub-components defined in the same file.

**State**: `data/null`, `loading/true`, `error/null`, `activeTerm/null`.

**Fetch effect** on `[studentId, sessionId]`: call `fetchPrevSession`, set `data`, default `activeTerm` to highest term number that has any grade row (i.e. `data.gradesByTerm[t]?.length > 0`), default to 3 then 2 then 1. On error set `error`.

**Loading state**: `<div className="prev-session-loading">Loading…</div>`.

**Error state**: `<div className="prev-session-error">{error}</div>` — keep showing `SessionSelector` is caller's responsibility; this component just shows the error body.

**`scoresForTerm(data, termNum, subjects)`** pure helper — maps `data.gradesByTerm[termNum]` rows to `{ ...sub, ca: r.test, exam: r.exam, score: ca+exam or null }` for subjects that have a row with at least one non-null value.

**`SessionSummaryCards`**: 4 stat cards — Term 1 avg%, Term 2 avg%, Term 3 avg%, Session avg%. Wrapped in `<div className="session-summary-row">`. Uses `<div className="stat-card">`.

**`TermTabs`**: renders only terms with data (`data.gradesByTerm[t]?.length > 0`). Uses `<button className={"tab-btn" + (activeTerm===t ? " active" : "")} onClick={()=>setActiveTerm(t)}>Term {t}</button>`. Wrapped in `<div className="term-tabs">`.

**`ScoreTable`**: for T1/T2 — columns: Subject | Type | CA (40) | Exam (60) | Total | Grade | Pass/Fail. For T3 — same prefix + T2 Total | T1 Total | 3-Term Avg | Grade | Pass/Fail. Grade and Pass/Fail for T3 based on 3-term avg. Use `gradeLabel` and `passMark` imported from `../../utils.js`. No edit controls.

**`AttendanceSummary`**: 3 stat cards (T1 attendance%, T2 attendance%, T3 attendance%). Wrapped in `<div className="panel mt16">`. Computes pct as `sum(days) / (weeks * 5) * 100`.

**`GrowthSnapshot`**: uses `Data.artifacts()`, `Data.commendations()`, `Data.promotionsFor(studentId)` — all imported from `../../data/index.js` (never `window.*` in JSX). Filters by `sessionId`. Shows verified artifact count, commendation count, promotion outcome.

**`onDownload`** button: disabled while `loading`. Calls `onDownload(data)`. The actual `downloadXlsx` call is constructed by the caller (Step 4 / Step 5) so this component stays decoupled from file naming.

Import `fetchPrevSession` from `../../data/prevSessionCache.js`. Import `Data` from `../../data/index.js`. Import `gradeLabel`, `passMark` from `../../utils.js`.

**Files**: `src/react/components/PreviousSessionPanel.jsx` (create)

**Verify**: `npm run build` — no errors.

---

## Step 4 — Wire `SessionSelector` + `PreviousSessionPanel` into `StudentReportDrawer.jsx`

Read the full file first (already done). Changes:

1. Add `useState` to the React import.
2. Add `import SessionSelector from './SessionSelector.jsx'` and `import PreviousSessionPanel from './PreviousSessionPanel.jsx'`.
3. Add `import { downloadXlsxMulti } from '../../utils.js'` (already has `downloadXlsx`; add `downloadXlsxMulti` for multi-sheet past-session export).
4. Add `const [selectedSessionId, setSelectedSessionId] = useState(null)` at the top of the component body.
5. Add a `useEffect(() => { setSelectedSessionId(null); }, [studentId])` to reset on student change.
6. As the very first JSX element inside `<div className="drawer-content">`, insert:
   ```jsx
   <SessionSelector
     studentId={studentId}
     currentSessionName={Data.session().name}
     selectedSessionId={selectedSessionId}
     onSelect={setSelectedSessionId}
   />
   ```
7. Wrap the existing body in `{selectedSessionId ? (<PreviousSessionPanel ... />) : (<existing content>)}`.
8. `onDownload` prop builds a 3-sheet xlsx: one sheet per term, using the same column logic as the existing `handleDownload` but for all 3 terms. Filename: `` `report_${s.name.replace(/\s+/g,'_')}_session_${sessionName.replace(/\s+/g,'_')}.xlsx` ``. The `sessionName` comes from the past sessions list — pass it as a prop too; `StudentReportDrawer` can look it up from the `pastSessions` state by listening to what `SessionSelector` tells us, OR simpler: add a `selectedSessionName` state alongside `selectedSessionId` and pass both from `onSelect` by changing `onSelect` to accept `(id, name)`. Update `SessionSelector` to call `onSelect(id, name)` in its `onChange`. This keeps `PreviousSessionPanel`'s `sessionName` prop always populated.

**Files**: `src/react/components/StudentReportDrawer.jsx` (modify), `src/react/components/SessionSelector.jsx` (minor update to pass name in callback)

**Verify**: `npm run build` — no errors.

---

## Step 5 — Create `src/react/components/StudentResults.jsx`

New React component that replaces the vanilla `renderStudentResults` logic.

**State**: `selectedSessionId/null`, `selectedSessionName/null`, `activeTerm/currentTerm()`.

**`getCurrentUser`** imported from `../../state.js` to get `currentUser.studentId`.

**Current session branch** (when `selectedSessionId === null`):
- Mirrors the existing vanilla `draw()` logic from `student.js`, now as JSX.
- Computes `visibleTerms` from `Data.session().terms` filtered by `t.term <= currentTerm() && Data.published(t.term)`.
- If no visible terms: show `resultsLockedNote` message in a table row.
- Term selector: `<select>` for visible terms, `value={activeTerm}`, `onChange` updates `activeTerm`.
- Score table: T1/T2 columns = Subject | Type | CA | Exam | Total | Grade | Status. T3 adds T2 Total | T1 Total | 3-Term Avg.
- Meta line below table.

**Past session branch** (when `selectedSessionId !== null`): render `<PreviousSessionPanel>` with `onDownload` that builds and triggers a multi-sheet xlsx for all 3 terms.

**`SessionSelector`** renders above the term selector / panel with `onSelect={(id, name) => { setSelectedSessionId(id); setSelectedSessionName(name); }}`.

Import `resultsLockedNote` from `../../views/shared.js` (confirmed export at line 144).
Import `Data`, `Academic` from `../../data/index.js`.
Import `gradeLabel`, `passMark`, `currentTerm`, `subjectChip`, `esc`, `downloadXlsxMulti` from `../../utils.js`.

**Files**: `src/react/components/StudentResults.jsx` (create)

**Verify**: `npm run build` — no errors.

---

## Step 6 — Update `src/views/student.js` — replace `renderStudentResults` body

Replace the entire body of `renderStudentResults()` with:
```js
import StudentResults from '../react/components/StudentResults.jsx';
// (add to top-level imports)

export function renderStudentResults() {
  _reactMount('react-student-results', StudentResults, {});
}
```

Remove the `draw()` inner function, `termSel` references, and the `termSel.onchange` assignment from the old body. Keep all other exports in the file untouched.

**Files**: `src/views/student.js` (modify)

**Verify**: `npm run build` — no errors.

---

## Step 7 — Update `index.html` — replace `#view-student-results` inner HTML

Replace the inner contents of `<div class="page-wrap" id="view-student-results" data-role="Student" hidden>` with a single React mount target. Keep the outer `page-wrap` div intact.

Before:
```html
<div class="page-wrap" id="view-student-results" data-role="Student" hidden>
  <section class="welcome-row">
    <div><p class="eyebrow">Academic record</p><h1 id="std-results-heading">My results</h1><p class="subcopy">…</p></div>
    <select id="std-results-term" class="select-inline">…</select>
  </section>
  <div class="panel mt16">
    <p class="role-muted" id="std-results-meta" style="margin-bottom:12px">—</p>
    <div class="table-wrap">
      <table>
        <thead id="std-results-thead">…</thead>
        <tbody id="std-results-table"></tbody>
      </table>
    </div>
  </div>
</div>
```

After:
```html
<div class="page-wrap" id="view-student-results" data-role="Student" hidden>
  <div id="react-student-results"></div>
</div>
```

Remove: `<select id="std-results-term">`, `<thead id="std-results-thead">`, `<tbody id="std-results-table">`, `<p id="std-results-meta">`. The `<section class="welcome-row">` heading is also removed — `StudentResults.jsx` renders its own heading if needed, or the existing drawer pattern is used.

**Files**: `index.html` (modify)

**Verify**: `npm run build` — no errors.

---

## Step 8 — Add `clearPrevSessionCache` to `src/auth.js` logout

In `logout()`, add the import at the top of `auth.js`:
```js
import { clearPrevSessionCache } from './data/prevSessionCache.js';
```
And inside `logout()`, after `DB.set('currentUser', null)`:
```js
clearPrevSessionCache();
```

**Files**: `src/auth.js` (modify)

**Verify**: `npm run build` — no errors.

---

## Step 9 — Add CSS to `src/styles.css`

Insert after the existing `.stat-card` block (around line 439) or immediately after the `.tab-btn.active` rule (line 721):

```css
/* ── Previous Session components ───────────────────────────── */
.session-selector-wrap { margin-bottom: 12px; }
.session-eyebrow { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 12px; }
.session-select { margin-bottom: 12px; }
.session-summary-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.term-tabs { display: flex; gap: 6px; margin-bottom: 16px; }
.prev-session-loading { padding: 32px 0; text-align: center; color: var(--muted); font-size: 13px; }
.prev-session-error { background: #fff0f0; border-radius: 8px; padding: 14px; color: var(--coral); font-size: 12px; margin-top: 12px; }
.growth-snapshot { display: flex; flex-direction: column; gap: 8px; }
.growth-badge-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--bg); border-radius: 20px; padding: 4px 10px; font-size: 11px; }
```

**Files**: `src/styles.css` (modify)

**Verify**: `npm run build` — no errors.

---

## Dependency order summary

```
Step 1 (prevSessionCache.js)
  → Step 2 (SessionSelector.jsx, imports Step 1)
    → Step 3 (PreviousSessionPanel.jsx, imports Step 1 + Data)
      → Step 4 (StudentReportDrawer.jsx wiring, imports Steps 2+3)
      → Step 5 (StudentResults.jsx, imports Steps 2+3)
        → Step 6 (student.js, mounts Step 5)
          → Step 7 (index.html, provides mount target for Step 6)
Step 8 (auth.js, imports Step 1) — independent of Steps 2-7
Step 9 (styles.css) — independent, can run any time
```
