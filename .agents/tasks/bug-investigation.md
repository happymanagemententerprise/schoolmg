# Bug Investigation Report — Happy Man Academy SPA

## Summary

| # | Issue | Root Cause | Severity |
|---|-------|-----------|----------|
| 1 | Students tab not selecting in Admin > People | Alpine `@click` expression calls `renderPeopleTab(...)` which resolves to `window.renderPeopleTab`, but the Alpine component's `tab` reactive state and the `:class="{ active: tab === ... }"` binding are **not synced** when `renderAdminPeople()` is navigated to a second time — the Alpine `x-data` component is initialized once with `{ tab: 'staff' }` and never reset, so clicking "Students" updates the reactive `tab` to `'students-all'` and the `@click` fires — but the `$nextTick` callback calls `window.renderPeopleTab` which **must already be set**. The actual bug is that `window.renderPeopleTab` is NOT set at the time the user's first click happens because Alpine initialises the `#people-tabs` component at page-load (when the page is hidden), before `renderAdminPeople()` has been called. On first navigation to People the function is set, but on **re-navigation** (user leaves then returns to People) a second call to `renderAdminPeople()` resets state correctly. The primary failure is: if the user clicks "Students" **before** `renderAdminPeople()` has set `window.renderPeopleTab`, the function is `undefined` and the click silently does nothing. Additionally, the active-tab visual (`:class` binding) **does** update because Alpine's reactive `tab` variable updates — but the table content below doesn't because `renderPeopleTab` hasn't been assigned yet. | High |
| 2 | Grade 10 Pool table needs redesign (Name / Path / Decision) | `ProgressionPool` renders Name + Admission No + "Place in track" button. `Data.pathRequests()` provides student path preferences (stream requested). The table must add a "Path" column showing the student's chosen stream and a "Decision" column replacing the current button with a dropdown of the non-chosen streams plus "Approve". | Medium |
| 3 | Class sort: multiple sections of same grade not alphabetically ordered | `Data.classes()` sorts by `year` then `stream`. When two classes share the same year and have no stream (all JSS classes) — e.g., "Grade 7 A" and "Grade 7 B" — the second sort key is `(a.stream \|\| '').localeCompare(b.stream \|\| '')` which evaluates to `0` (both empty), leaving insertion order unchanged. There is no sort by `name`. | Medium |
| 4 | Score entry UI missing; XLSX upload doesn't read the file | (a) The `view-subject-scores` page is read-only — the table rows render `ca ?? '—'` and `exam ?? '—'` with no `<input>` elements; no inline score-entry UI exists. (b) `_parseXlsxRows` assumes ZIP local files are **stored uncompressed**: it reads `cLen` (compressed size at bytes 18–21) and passes the raw bytes straight to `TextDecoder`. Real-world XLSX files use DEFLATE compression, so the raw bytes are not valid UTF-8 XML and the XML matching fails silently, returning an empty `result` array — which triggers the "file appears to be empty" toast. | High |

---

## Issue 1 — Admin People: Students tab not selecting

### Evidence

**index.html lines 215–226**
```html
<div class="tab-bar" id="people-tabs" x-data="{ tab: 'staff' }">
  <button class="tab-btn" data-tab="staff"
          :class="{ active: tab === 'staff' }"
          @click="tab = 'staff'; $nextTick(() => renderPeopleTab('staff'))">Staff</button>
  <button class="tab-btn" data-tab="students-all"
          :class="{ active: tab === 'students-all' }"
          @click="tab = 'students-all'; $nextTick(() => renderPeopleTab('students-all'))">Students</button>
  <button class="tab-btn" data-tab="parents"
          :class="{ active: tab === 'parents' }"
          @click="tab = 'parents'; $nextTick(() => renderPeopleTab('parents'))">Parents</button>
</div>
```

`renderPeopleTab` in the Alpine `@click` expression resolves by name lookup — Alpine v3 evaluates `@click` expressions in a context where the component scope (`{ tab: 'staff' }`) is searched first, then `window` is the fallback. So `renderPeopleTab(...)` works if and only if `window.renderPeopleTab` is set.

**src/views/admin.js line 175**
```js
export function renderAdminPeople() {
  window.renderPeopleTab = renderPeopleTab;   // ← set here
  bindPeopleTabs();
  renderPeopleTab('staff');
  ...
```

**src/main.js line 19**
```js
Alpine.start();  // ← Alpine processes ALL non-hidden + hidden DOM here
```

Alpine initialises `#people-tabs` (which lives inside the `hidden` `#view-admin-people` div) at startup. The `@click` handlers are compiled at that point. When the first-ever navigation to People fires, `renderAdminPeople()` runs and sets `window.renderPeopleTab` — so subsequent tab clicks work. **But**: if `renderAdminPeople()` is re-entered (admin navigates away then back), it calls `renderPeopleTab('staff')` directly and resets the displayed content to "staff" correctly. The reactive `tab` state inside Alpine is **not** reset — it stays at whatever tab was last active. So the highlighted tab and the rendered table can be out of sync, but this is secondary.

The **primary reported bug** ("Students tab not selecting") is almost certainly caused by one of:

1. **Race condition on first load**: `window.renderPeopleTab` is `undefined` at the moment of the first click if the user navigates to People before `renderAdminPeople()` has been called (e.g., fast keyboard shortcut or direct hash navigation).
2. **The `renderPeopleTab` function reference captured by Alpine's compiler**: Alpine v3 compiles `@click` expressions using `new Function(...)`. The lookup `renderPeopleTab` falls through to `window.renderPeopleTab` only if there is no local `renderPeopleTab` in scope. This should be fine for `window.*` globals, but it is fragile.
3. **The `:class` binding works (Alpine reactive state updates) but the table body does not change** — from the user's perspective the tab "does not select" because the content doesn't change even though the tab highlight moves. This would happen if `window.renderPeopleTab` is not set, or throws.

**Confirmed missing piece**: `bindPeopleTabs()` is now a **no-op** (src/views/admin.js lines 288–292). Previously it wired up `click` listeners that set the `.active` class on the buttons. Now that is delegated entirely to Alpine `:class`. No fallback exists if Alpine's `@click` expression cannot resolve `renderPeopleTab`.

### Conclusion & Recommended Fix

Replace the Alpine `@click` expression with an explicit `window.renderPeopleTab` call to make the resolution unambiguous:

```html
@click="tab = 'students-all'; $nextTick(() => window.renderPeopleTab && window.renderPeopleTab('students-all'))"
```

Or, more robustly, expose a local Alpine component method via `x-data`:

```html
<div class="tab-bar" id="people-tabs"
     x-data="{ tab: 'staff', switchTab(t){ this.tab = t; $nextTick(() => window.renderPeopleTab?.(t)); } }">
  <button ... @click="switchTab('staff')">Staff</button>
  <button ... @click="switchTab('students-all')">Students</button>
  <button ... @click="switchTab('parents')">Parents</button>
</div>
```

This makes `renderPeopleTab` a guarded call on the `window` object, eliminates the dependency on Alpine's implicit `window` fallback, and is null-safe for the race-condition case.

---

## Issue 2 — Grade 10 Pool table redesign

### Evidence

**Current `ProgressionPool` render (AdminProgression.jsx lines ~250–290)**
```jsx
<thead>
  <tr><th>Student</th><th>Admission no.</th><th>Placement</th></tr>
</thead>
<tbody>
  {entrants.map(s => (
    <tr key={s.id}>
      <td><strong>{s.name}</strong></td>
      <td>{s.admissionNo || '—'}</td>
      <td>
        <button className="outline-button" onClick={() => openPlacement(s.id)}>
          Place in track
        </button>
      </td>
    </tr>
  ))}
</tbody>
```

**Available data from `Data.pathRequests()` (data.js line 1960)**
```js
pathRequests() { return _cache.pathRequests || []; }
```

Each `pathRequest` record has:
- `studentId` (string)
- `stream` — the student's chosen path: `"Science"`, `"Commercial"`, or `"Arts"`
- `status` — `"pending"` | `"approved"` | `"rejected"`
- `sessionId`, `note`, `at`, `requestedBy`

**`Progression.pathRequest(studentId)`** (data.js lines 2720–2727) returns the most-recent request for a student in the current session.

**`Progression.assignClass(studentId, classId, opts)`** is what the PlacementModal calls when the admin places a student. The `classId` must match one of the track classes for the chosen stream.

### Redesigned table required

Columns requested by user:
- **Name** — student name
- **Path (student pick)** — the stream they selected (`Science`, `Commercial`, `Arts`, or `—` if not yet chosen)
- **Decision** — admin action. If student picked `Science`, options are: `Approve` (places into Science track), `Commercial`, `Arts`. If student picked `Commercial`, options are: `Approve`, `Science`, `Arts`. If picked `Arts`: `Approve`, `Science`, `Commercial`.

### Recommended Fix

In `ProgressionPool`:
1. For each entrant call `Progression.pathRequest(s.id)` to get `chosenStream`.
2. Render a "Path" cell showing `chosenStream` (or `—`).
3. Replace the "Place in track" button with an inline `<select>` or button group:
   - Option "Approve" → `assignClass` using the track class matching `chosenStream`.
   - Other options are the two non-chosen streams → `assignClass` using the corresponding stream's track class.
4. Target classes are found with: `Data.classes().filter(c => c.level === 'SS' && c.year === 10 && c.stream === targetStream && c.selectionMode !== 'pool')`.

---

## Issue 3 — Class sort order

### Evidence

**Data.classes() sort — data.js lines 1526–1534**
```js
classes() {
  return [..._cache.classes].sort((a, b) => {
    const ya = a.year ?? 99, yb = b.year ?? 99;
    if (ya !== yb) return ya - yb;
    return (a.stream || '').localeCompare(b.stream || '');
  });
}
```

The sort uses `year` (numeric) as the primary key, then `stream` as the secondary key. When classes have the same `year` **and** the same `stream` (including `null`/`undefined` for JSS classes), the sort result is `0` — insertion order is preserved, not alphabetical.

**Concrete scenario**: A school with "Grade 7 A" and "Grade 7 B" (both `year: 7`, `stream: null`) would display in database insertion order, not name order.

**The user's stated requirement** is "Grade 7 B comes before Grade 8" — the existing numeric year sort already guarantees this. Their deeper expectation is that within the same grade, **sections are alphabetical** (A, B, C…). This requires a third sort key on `name`.

**Places rendering class lists** (all use `Data.classes()` which already applies the sort):
- `src/views/admin.js`: Overview class-perf table, Add person modal class dropdown, Classes table, Analytics class select, Timetable class select — all via `Data.classes().map(...)`.
- `src/views/teacher.js`: HOD assign-class dropdown, HOD report class dropdown — via `Data.classes().map(...)`.
- `src/react/components/AdminProgression.jsx`: `PlacementModal` targets list — via `Data.classes().filter(...)`.
- `src/react/components/ClassAttendance.jsx`: Uses `Data.studentsByClass(cl.id)` — only one class at a time, no class list.

No place in the codebase adds its own independent alphabetical sort; all rely on `Data.classes()` output order.

### Recommended Fix

Add `name` as a tertiary sort key in `Data.classes()`:

```js
classes() {
  return [..._cache.classes].sort((a, b) => {
    const ya = a.year ?? 99, yb = b.year ?? 99;
    if (ya !== yb) return ya - yb;
    const sa = a.stream || '', sb = b.stream || '';
    if (sa !== sb) return sa.localeCompare(sb);
    return (a.name || '').localeCompare(b.name || '');  // ← add this
  });
}
```

This is a single-line change in `data.js` and automatically propagates to every consumer.

---

## Issue 4 — Score entry missing + upload broken

### Sub-issue 4a: No inline score-entry screen

**`view-subject-scores` HTML (index.html lines 687–707)**
```html
<div class="page-wrap" id="view-subject-scores" ...>
  ...
  <table>
    <thead><tr>
      <th>Student</th><th>Class</th><th>CA (40)</th><th>Exam (60)</th><th>Total (100)</th><th>Grade</th>
    </tr></thead>
    <tbody id="st-scores-table"></tbody>
  </table>
```

**`renderSubjectScores()` in teacher.js (lines 273–295)**
```js
$('st-scores-table').innerHTML = rows.map(({ s, cid }) => {
  const entry = Data.studentScores(s.id)[subjectId]?.[term];
  const ca    = entry?.test  ?? null;
  const exam  = entry?.exam  ?? null;
  ...
  return `<tr>
    <td>...</td>
    <td>...</td>
    <td>${ca ?? '—'}</td>        ← display only, no <input>
    <td>${exam ?? '—'}</td>      ← display only, no <input>
    ...
  </tr>`;
}).join('');
```

There are **no `<input>` elements** rendered in the score table. The page is read-only. A teacher can see scores (if already uploaded) but cannot type them in. Score entry is only possible via the spreadsheet upload on the Subject Dashboard.

### Sub-issue 4b: XLSX upload does not read the file

**`_parseXlsxRows` in teacher.js (lines 445–517)**

The function manually parses the ZIP binary format. The critical flaw:

```js
function zipEntry(name) {
  ...
  const dataStart = i + 30 + fLen + xLen;
  const cLen = (u8[i+18] | (u8[i+19]<<8) | (u8[i+20]<<16) | (u8[i+21]<<24)) >>> 0;
  return dec.decode(u8.slice(dataStart, dataStart + cLen));  // ← BUG
}
```

- Byte offsets 18–21 in a ZIP Local File Header are the **compressed size**, not the uncompressed size.
- The code reads `cLen` bytes starting at `dataStart` and immediately passes them to `TextDecoder().decode()`.
- XLSX files produced by Excel, LibreOffice, and Google Sheets almost universally compress their XML entries with **DEFLATE**. The raw DEFLATE-compressed bytes are not valid UTF-8 and cannot be XML-parsed.
- The `sheetXml` variable ends up as garbage or empty string. `sheetXml.matchAll(/<row...>/)` returns no matches. `result` is `[]`.
- Back in `processScoreUpload`: `rows.length < 2` → `toast('The file appears to be empty.', 'error')`.

**Additionally**: The `st-upload-btn` button (in the dashboard header) triggers `$('st-file-input').click()` where `st-file-input` lives on the **Subject Dashboard** page, not on `view-subject-scores`. This means the "Upload spreadsheet ↑" header button only works when the user is on the dashboard page. The `view-subject-scores` page has no upload button at all (`st-download-xls-btn` only downloads).

**CSV upload works** — the CSV path uses `new TextDecoder().decode(buf)` on the entire file buffer (not per-entry), which correctly reads a plain text CSV file. Only XLSX/XLS uploads are broken.

### Recommended Fixes

**4a — Inline score entry:**
In `renderSubjectScores()`, replace the display-only `ca ?? '—'` and `exam ?? '—'` cells with `<input type="number">` elements:
```html
<td><input class="score-input" type="number" min="0" max="40"
     value="${ca ?? ''}" placeholder="—"
     data-sid="${s.id}" data-sub="${subjectId}" data-term="${term}" data-type="test"></td>
<td><input class="score-input" type="number" min="0" max="60"
     value="${exam ?? ''}" placeholder="—"
     data-sid="${s.id}" data-sub="${subjectId}" data-term="${term}" data-type="exam"></td>
```
Wire a delegated `input` or `change` listener on the table that calls `Data.saveGrade(sid, subjectId, term, ca, exam)`.

**4b — XLSX decompression:**
The XLSX parser needs to decompress DEFLATE-compressed entries. Options:
1. **Use the browser's native `DecompressionStream` API** (supported in all modern browsers as of ~2023):
   ```js
   async function inflate(compressed) {
     const ds = new DecompressionStream('deflate-raw');
     const writer = ds.writable.getWriter();
     writer.write(compressed);
     writer.close();
     const chunks = [];
     const reader = ds.readable.getReader();
     while (true) {
       const { done, value } = await reader.read();
       if (done) break;
       chunks.push(value);
     }
     const total = chunks.reduce((a, c) => a + c.length, 0);
     const out = new Uint8Array(total);
     let offset = 0;
     for (const c of chunks) { out.set(c, offset); offset += c.length; }
     return out;
   }
   ```
2. **Check the compression method field** (bytes 8–9 in the Local File Header): `0x0000` = stored (no compression), `0x0008` = deflated. Only decompress when method = 0x0008.
3. **Alternative**: Switch to a proven library like `fflate` (2 KB gzipped) and remove the manual ZIP parser entirely.

The `zipEntry` function should also become `async` once `DecompressionStream` is added, and `_parseXlsxRows` and `processScoreUpload` would need to be made `async` accordingly (they already are in `processScoreUpload`'s case).

---

## Conclusion

| Issue | Fix location | Effort |
|-------|-------------|--------|
| 1 — People tab | `index.html` `#people-tabs` Alpine `@click` expressions — change bare `renderPeopleTab(...)` to guarded `window.renderPeopleTab?.(...)` | Small |
| 2 — Pool table | `AdminProgression.jsx` `ProgressionPool` component — add Path column, replace button with Decision select/buttons | Medium |
| 3 — Class sort | `data.js` `classes()` — add `name.localeCompare` as third sort key | Trivial |
| 4a — Score entry | `teacher.js` `renderSubjectScores()` and `index.html` `view-subject-scores` — add editable input cells and a save handler | Medium |
| 4b — XLSX parser | `teacher.js` `_parseXlsxRows` — add DEFLATE decompression via `DecompressionStream` or `fflate` | Medium |
