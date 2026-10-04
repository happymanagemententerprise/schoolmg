# Implementation Plan — Happy Man Academy Bug Fixes

> Generated from direct code inspection. All line numbers and signatures verified in the source.

---

## Fix 1 — People tab: Students tab click does nothing

### Root cause (confirmed)
`index.html` `#people-tabs` Alpine `@click` expressions call `renderPeopleTab(...)` by bare
name. Alpine v3 falls back to `window.renderPeopleTab` only after it initialises the component
at page-load, but `window.renderPeopleTab` is not assigned until `renderAdminPeople()` runs
(admin.js line 175). If the user clicks the tab before navigating to People the first time,
or if `renderAdminPeople()` has not yet run in this page-load, the call is silently lost.

### Changes

**File: `index.html`** (lines 218–226 — the `#people-tabs` div)

Replace the `x-data` attribute and all three `@click` expressions:

```html
<!-- BEFORE -->
<div class="tab-bar" id="people-tabs" x-data="{ tab: 'staff' }">
  <button … @click="tab = 'staff'; $nextTick(() => renderPeopleTab('staff'))">Staff</button>
  <button … @click="tab = 'students-all'; $nextTick(() => renderPeopleTab('students-all'))">Students</button>
  <button … @click="tab = 'parents'; $nextTick(() => renderPeopleTab('parents'))">Parents</button>
</div>

<!-- AFTER -->
<div class="tab-bar" id="people-tabs"
     x-data="{ tab: 'staff', switchTab(t){ this.tab = t; $nextTick(() => window.renderPeopleTab?.(t)); } }">
  <button … @click="switchTab('staff')">Staff</button>
  <button … @click="switchTab('students-all')">Students</button>
  <button … @click="switchTab('parents')">Parents</button>
</div>
```

Key points:
- `window.renderPeopleTab?.()` uses optional chaining — silently no-ops if the function is not
  yet assigned (race-condition guard).
- Wrapping in a component method (`switchTab`) avoids Alpine's unreliable bare-name `window`
  fallback.
- The `:class="{ active: tab === … }"` bindings already exist on the buttons; keep them intact.

**File: `src/views/admin.js`** — no change needed. `window.renderPeopleTab = renderPeopleTab`
at line 175 continues to be set on every navigation to People.

### Verify
Open the app in a browser, navigate straight to Admin › People without any prior navigation.
Click "Students" — the student table should render. Click "Parents" — the parents table should
render. Navigate away and back; tabs must still switch correctly on return.

---

## Fix 2 — Grade 10 Pool: Name / Path / Decision table

### Confirmed field names (from data.js lines 332–342)

`Data.pathRequests()` returns an array of objects shaped:
```
{
  id:            string,
  studentId:     string,
  sessionId:     string,
  stream:        "Science" | "Commercial" | "Arts" | null,   ← the student's chosen path
  targetClassId: string | null,
  status:        "pending" | "approved" | "rejected",
  requestedBy:   string | null,
  decidedBy:     string | null,
  note:          string,
  at:            string | null
}
```

`Progression.pathRequest(studentId)` (data.js lines 2721–2727) returns the most-recent
`pathRequest` record for the student in the current session, or `null` if none.

### Confirmed `Progression.assignClass` signature (data.js line 2869)
```js
async assignClass(studentId, toClassId, { reason = 'stream_change', note = '', userId } = {})
```
Returns `false` if the student is already in `toClassId`. Writes to Supabase and updates
`_cache.students`.

### Logic for "target class" lookup
To find the class a student should go into when the admin picks a stream:
```js
Data.classes().find(c =>
  c.level === 'SS' &&
  c.year  === 10 &&
  c.stream === targetStream &&
  c.selectionMode !== 'pool'
)
```
If no such class exists for a stream, that stream option should be disabled.

### Changes

**File: `src/react/components/AdminProgression.jsx`** — `ProgressionPool` component (lines ~246–293)

1. Add a local `currentUser` ref at the top of the component (needed for `assignClass`'s `userId`).
2. Change `<thead>` from `Student | Admission no. | Placement` to `Name | Path (student pick) | Decision`.
3. In the `tbody`, for each `s` in `entrants`:
   a. Look up `const pr = Progression.pathRequest(s.id)` — `pr?.stream` is the chosen path (or `null`).
   b. Render the **Path** cell as `pr?.stream || '—'`.
   c. Render the **Decision** cell as a `<select>` with these options:
      - `<option value="">— Decide —</option>` (disabled placeholder)
      - `<option value="Approve">Approve</option>` (routes the student into the class matching `pr.stream`)
      - The two non-chosen streams as options (e.g. if `pr.stream === 'Science'`, add `Commercial` and `Arts`)
      - If `pr` is `null`, show all three streams without an "Approve" option (admin must pick one outright)
   d. On `onChange` of the select:
      - Determine `targetStream`: if `value === 'Approve'`, use `pr.stream`; else use the selected stream.
      - Find `targetClass` via the lookup above.
      - If no class found, `toast('No class configured for ' + targetStream, 'error')` and reset select.
      - Else call `await Progression.assignClass(s.id, targetClass.id, { reason: 'stream_placement', userId: currentUser.id })` then call `refresh()` and `toast(s.name + ' placed in ' + targetClass.name)`.
4. Remove the `PlacementModal` and `openPlacement` prop from `AdminProgression` root component and
   from the `ProgressionPool` call-site **only if** you fully replace its usage — otherwise keep
   `PlacementModal` as-is for backward compat and simply stop using it from `ProgressionPool`.
   Preferred: keep `PlacementModal` available (it may be used elsewhere), just remove the button
   from `ProgressionPool` rows.

### Verify
Navigate to Admin › Progression › Grade 10 Pool. Each pool student should show their requested
stream in the Path column. Selecting a stream from the Decision dropdown should move them to the
correct class and remove them from the pool list.

---

## Fix 3 — Class sort: alphabetical within same grade

### Confirmed current sort (data.js lines 1524–1532)
```js
classes() {
  return [..._cache.classes].sort((a, b) => {
    const ya = a.year ?? 99, yb = b.year ?? 99;
    if (ya !== yb) return ya - yb;
    return (a.stream || '').localeCompare(b.stream || '');
  });
}
```
When `year` and `stream` are both equal (e.g. two JSS classes, both `year: 7, stream: null`),
the comparator returns `0` and insertion order is preserved — not alphabetical.

### Change

**File: `data.js`** — `Data.classes()` (line ~1524)

Add `name` as a tertiary sort key:

```js
classes() {
  return [..._cache.classes].sort((a, b) => {
    const ya = a.year ?? 99, yb = b.year ?? 99;
    if (ya !== yb) return ya - yb;
    const sa = a.stream || '', sb = b.stream || '';
    if (sa !== sb) return sa.localeCompare(sb);
    return (a.name || '').localeCompare(b.name || '');   // ← NEW
  });
}
```

This is a single-line addition. Because every dropdown and table that lists classes calls
`Data.classes()` (confirmed: admin.js, teacher.js, AdminProgression.jsx all consume this
method's return value directly), the fix propagates automatically.

**No other files need changes for Fix 3.**

### Verify
Add two classes in the same grade with names "Grade 7 B" and "Grade 7 A" (if not already
present). Navigate to Admin › Classes — Grade 7 A must appear before Grade 7 B, and Grade 7
must appear before Grade 8.

---

## Fix 4a — Score entry: add editable CA / Exam inputs

### Confirmed current state (teacher.js lines ~268–290)
`renderSubjectScores()` builds the `st-scores-table` rows with static text:
```js
<td>${ca ?? '—'}</td>      // CA — display only
<td>${exam ?? '—'}</td>    // Exam — display only
```
No `<input>` elements exist. The page is read-only.

### Confirmed `Data.saveGrade` signature (data.js line 1645)
```js
async saveGrade(studentId, subjectId, term, ca, exam) → Promise<boolean>
```
- Clamps `ca` to `[0, 40]` and `exam` to `[0, 60]` internally before writing to Supabase.
- Returns `true` on success, `false` on error.

### Upload gate (admin-controlled)
`Data.session().uploadOpen` is `{ test: boolean, exam: boolean }`.
- `uploadOpen.test` gates CA entry.
- `uploadOpen.exam` gates exam entry.
The admin sets these flags via the "Upload periods" toggles on the Admin dashboard
(`admin.js` lines ~155–167).

The inline score-entry UI should respect the same flags: a CA input should be disabled when
`!sess.uploadOpen.test`, and the exam input when `!sess.uploadOpen.exam`. This prevents
teachers from editing scores outside open windows.

### Changes

**File: `src/views/teacher.js`** — `renderSubjectScores()` (lines ~268–290, inside `draw()`)

1. At the top of `draw()`, read the session flags:
   ```js
   const sess      = Data.session();
   const caOpen    = sess.uploadOpen?.test  ?? false;
   const examOpen  = sess.uploadOpen?.exam  ?? false;
   ```
2. Replace the CA cell template:
   ```js
   // BEFORE
   <td>${ca ?? '—'}</td>
   // AFTER
   <td><input class="score-input" type="number" min="0" max="40"
        value="${ca ?? ''}" placeholder="—" ${caOpen ? '' : 'disabled'}
        data-sid="${s.id}" data-sub="${subjectId}" data-term="${term}" data-type="test"></td>
   ```
3. Replace the exam cell template similarly with `max="60"`, `data-type="exam"`, and `examOpen`.
4. After the table is built (`$('st-scores-table').innerHTML = ...`), attach a **delegated
   `change` listener** on the `<tbody>` element:
   ```js
   $('st-scores-table').addEventListener('change', async e => {
     const inp = e.target.closest('input.score-input');
     if (!inp) return;
     const { sid, sub, term: t, type } = inp.dataset;
     const entry = Data.studentScores(sid)[sub]?.[+t] || {};
     const ca    = type === 'test' ? Number(inp.value) : (entry.test  ?? 0);
     const exam  = type === 'exam' ? Number(inp.value) : (entry.exam  ?? 0);
     const ok    = await Data.saveGrade(sid, sub, +t, ca, exam);
     if (!ok) toast('Score not saved — check your connection.', 'error');
   });
   ```
   Using `change` (fires on blur/enter) rather than `input` (fires on every keypress) avoids
   flooding Supabase with intermediate partial values.

**File: `index.html`** — `#view-subject-scores` section (line ~686)

Add an "Upload scores ↑" button to the `welcome-row` actions area so a teacher can trigger the
upload from the scores page as well as from the dashboard. This button should call
`$('st-file-input').click()` and requires the `st-file-input` element to be accessible from this
view. The `st-file-input` element currently lives in `view-subject-dashboard`. Two options:
- **Option A (preferred)**: Move `st-file-input` to a location outside both pages (e.g. at the
  bottom of `<body>`) so it is always present.
- **Option B**: Add a second `<input type="file" id="st-scores-file-input" hidden>` inside
  `view-subject-scores` and wire it in `renderSubjectScores()` with a separate `onchange` handler.

Use **Option B** to avoid touching the dashboard layout. Add to `index.html` inside
`#view-subject-scores`:
```html
<button class="outline-button" id="st-scores-upload-btn" style="width:auto;margin:0">
  ↑ Upload scores
</button>
<input type="file" id="st-scores-file-input" accept=".csv,.xlsx,.xls" hidden>
```
Wire in `renderSubjectScores()`:
```js
$('st-scores-upload-btn').onclick  = () => $('st-scores-file-input').click();
$('st-scores-file-input').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  processScoreUpload(file);
};
```

### Verify
Navigate to Teacher › Student Scores. When an upload window is open (`uploadOpen.test === true`),
the CA column should show number inputs. Typing a value and pressing Tab/Enter should save the
score (no page refresh needed). When the window is closed, inputs should appear disabled.

---

## Fix 4b — XLSX upload: fix DEFLATE decompression

### Confirmed bug location (teacher.js lines ~458–464)
```js
const cLen = (u8[i+18] | (u8[i+19]<<8) | (u8[i+20]<<16) | (u8[i+21]<<24)) >>> 0;
return dec.decode(u8.slice(dataStart, dataStart + cLen));
```
Bytes 18–21 in a ZIP Local File Header are the **compressed** byte count. The code passes the
raw DEFLATE-compressed bytes directly to `TextDecoder` — they are not valid UTF-8, so XML
parsing returns no matches and `_parseXlsxRows` returns `[]`.

Bytes 8–9 hold the **compression method**: `0x0000` = stored (no compression),
`0x0008` = DEFLATE. The code never checks this field.

### Decision: use `DecompressionStream` (no new dependency)
`DecompressionStream('deflate-raw')` is available in all modern browsers (Chrome 80+,
Firefox 113+, Safari 16.4+). This avoids adding a new npm dependency (the bug report asks
for `xlsx@0.18.5` but SheetJS at that version is 800 KB and would replace the existing
custom parser entirely — that is a much larger change than needed). The `DecompressionStream`
approach is a targeted fix to the existing parser.

If the school must support Safari < 16.4 or older browsers, note this caveat and fall back
to the CSV path with a toast: "Your browser does not support XLSX decompression. Use CSV
instead."

### Changes

**File: `src/views/teacher.js`**

1. Make `zipEntry()` inside `_parseXlsxRows` `async` and add compression-method detection:

```js
async function zipEntry(name) {
  const enc = new TextEncoder().encode(name);
  for (let i = 0; i < u8.length - 30; i++) {
    if (u8[i] !== 0x50 || u8[i+1] !== 0x4B || u8[i+2] !== 0x03 || u8[i+3] !== 0x04) continue;
    const method = u8[i+8] | (u8[i+9] << 8);          // 0 = stored, 8 = deflate
    const fLen   = u8[i+26] | (u8[i+27] << 8);
    const xLen   = u8[i+28] | (u8[i+29] << 8);
    if (fLen !== enc.length) continue;
    const fname  = u8.slice(i+30, i+30+fLen);
    if (!enc.every((b, j) => b === fname[j])) continue;
    const dataStart = i + 30 + fLen + xLen;
    const cLen      = (u8[i+18] | (u8[i+19]<<8) | (u8[i+20]<<16) | (u8[i+21]<<24)) >>> 0;
    const uLen      = (u8[i+22] | (u8[i+23]<<8) | (u8[i+24]<<16) | (u8[i+25]<<24)) >>> 0;
    const raw       = u8.slice(dataStart, dataStart + cLen);

    if (method === 0) {
      // Stored — no compression, read directly
      return dec.decode(raw);
    } else if (method === 8) {
      // DEFLATE — decompress with DecompressionStream
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('DecompressionStream not supported — use CSV upload instead.');
      }
      const ds     = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(raw);
      writer.close();
      const chunks = [];
      const reader = ds.readable.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      let offset = 0;
      const out  = new Uint8Array(uLen || chunks.reduce((a, c) => a + c.length, 0));
      for (const c of chunks) { out.set(c, offset); offset += c.length; }
      return dec.decode(out);
    }
    return null;  // unknown compression method — skip
  }
  return null;
}
```
(Bytes 22–25 are the **uncompressed** size; used to pre-allocate the output buffer.)

2. Make `_parseXlsxRows` `async` and `await` all `zipEntry(...)` calls:
```js
export async function _parseXlsxRows(buf) {
  ...
  const ssXml = (await zipEntry('xl/sharedStrings.xml')) || '';
  ...
  const wb    = (await zipEntry('xl/workbook.xml')) || '';
  const rel   = (await zipEntry('xl/_rels/workbook.xml.rels')) || '';
  ...
  const sheetXml = (await zipEntry('xl/' + target)) ||
                   (await zipEntry('xl/worksheets/sheet1.xml')) || '';
  ...
}
```

3. In `processScoreUpload` (already `async`), the XLSX branch currently calls `_parseXlsxRows`
   synchronously:
   ```js
   // BEFORE
   rows = _parseXlsxRows(buf);
   // AFTER
   rows = await _parseXlsxRows(buf);
   ```
   The surrounding `try/catch` already exists, so error handling is unchanged.

4. **`DecompressionStream` not supported fallback**: In the `catch` block of `processScoreUpload`,
   add a specific message for this error:
   ```js
   } catch (err) {
     const msg = err.message?.includes('DecompressionStream')
       ? 'Your browser does not support XLSX decompression. Please save as .csv and upload again.'
       : 'Could not read the spreadsheet. Save as .csv and try again.';
     toast(msg, 'error');
     return;
   }
   ```

**No changes to `package.json` are needed** — `xlsx@0.18.5` (SheetJS) is not required; the
existing custom parser is fixed in-place. If the team later wants to adopt SheetJS, that is a
separate refactor.

### Verify
Download the template score sheet from the scores page (`.xlsx`). Fill in two CA and two exam
scores, save, and upload. The toast should report "Uploaded 2 scores" (not "file appears to be
empty"). The scores should immediately appear in the table.

---

## Dependency order

| Step | Depends on |
|------|-----------|
| Fix 1 (index.html Alpine) | Independent — do first |
| Fix 3 (data.js sort) | Independent — do second (smallest change, propagates everywhere) |
| Fix 2 (ProgressionPool JSX) | Fix 3 must be done first so class lookups in the Decision dropdown are in alphabetical order |
| Fix 4a (score inputs) | Independent of 1–3, but do after Fix 3 |
| Fix 4b (XLSX parser) | Independent of all others |

---

## Build & test commands

From the workspace root (`c:\Users\Happy\Documents\Happy Management\schoolmg\schoolmg`):

```
npm run build     # Vite build — must complete with zero errors
npm run dev       # Dev server for manual verification
```

There are no automated tests in this project (no test script in `package.json`). Every fix
requires manual browser verification as described in each section's **Verify** block.

---

## Caveats / open questions

1. **`PlacementModal` usage after Fix 2**: The `PlacementModal` component and
   `placementModal` state in `AdminProgression` root are currently wired through
   `openPlacement` prop. Once `ProgressionPool` no longer needs a modal (Decision is inline),
   the `PlacementModal` and its state can be removed from the root — but check first whether
   any other panel uses `openPlacement`. From reading the file, only `ProgressionPool` receives
   it, so removal is safe.

2. **Stream casing**: `pathRequest.stream` values are stored as `"Science"`, `"Commercial"`,
   `"Arts"` (title case) from the Supabase `path_requests.requested_stream` column. Class
   `stream` field values must match exactly. Verify casing in the `Data.classes()` output
   before comparing with `===`.

3. **DecompressionStream on Safari < 16.4**: The fix will silently fail on old Safari with a
   helpful toast. If the school has iPads running older iOS, consider also offering a note
   in the upload UI suggesting Safari 16.4+ or Chrome.

4. **`uploadOpen` gate on score inputs**: The spec says "score entry" but does not specify
   whether the admin gate should apply to inline entry as well as upload. The plan applies
   it for consistency — if the school wants inline entry always open regardless of the upload
   window, remove the `disabled` attribute logic from Fix 4a.
