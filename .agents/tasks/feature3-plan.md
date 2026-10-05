# Implementation Plan — Three Features (Year 10 subjects · Admin stream change · CA/Exam report columns)

Workspace: `c:\Users\Happy\Documents\Happy Management\schoolmg\schoolmg`
Build: `npm run build` (Vite, no automated test runner)
Manual smoke-test: open `npm run dev` in browser and exercise each feature area.

---

## Feature 1 — Year 10 "Choose subjects" button text & stream note

### Background
`Progression.canChoose(10)` already returns `true`; `saveChooseSubjects` saves Grade 10
straight to `status: 'effective'`. The only gap is cosmetic:
- When a Year-10 student has **no subjects yet**, `renderStudentSubjectsPanel` falls through
  to the "no subjects chosen" branch, but `note.textContent` says the generic
  `"Pick your subjects for this … session"` — it should mention their stream/track.
- `btn.textContent` already says `'Choose subjects'` in that branch — ✓ (nothing to change).

### Files to modify
- `src/views/student.js`
  - Function `renderStudentSubjectsPanel` (~line 113–166 in the file)
  - The **"has effective subjects"** block sets `btn.textContent = year >= 11 ? 'Request change' : 'Change subjects'` — Year-10 students with subjects should see **'Change subjects'** not 'Request change'. The condition already handles this correctly; no change needed.
  - The **"no subjects yet"** note block (last `else` around line 155):

```javascript
// BEFORE (line ~158):
note.textContent = `Pick your subjects for this ${Data.session().name} — you can adjust them later.`;

// AFTER:
const streamLabel = cl?.stream ? ` (${cl.stream} stream)` : '';
note.textContent  = `Pick your subjects for ${Data.session().name}${streamLabel} — your choice takes effect immediately.`;
```

### Verify
Run `npm run build` — zero errors. Open the dev server as a Year-10 student with no
subjects chosen; the panel note now includes the stream name if one is set on the class.

---

## Feature 2 — Admin "Change stream" for SS students (Year 11/12)

### A — Modal HTML (`index.html`)

Append the following block **before** the `<!-- Toast notification -->` comment
(after the `assign-mentor-modal` closing `</div>`):

```html
<!-- Change stream modal (admin reclassifies an SS student) -->
<div class="modal-overlay" id="change-stream-modal" aria-hidden="true"
     x-data x-show="$store.modals['change-stream-modal']">
  <div class="modal">
    <div class="modal-header">
      <h3 id="cs-modal-title">Change stream</h3>
      <button class="close-modal" data-modal="change-stream-modal">&times;</button>
    </div>
    <div class="modal-body">
      <p class="role-muted" id="cs-modal-student"></p>
      <p class="role-muted" style="margin-top:8px">
        Moving the student to a new stream class changes their subject list immediately.
        A transfer record is saved for the audit trail.
      </p>
      <div class="form-group mt16">
        <label for="cs-modal-class">New class / stream</label>
        <select id="cs-modal-class"></select>
      </div>
      <div class="form-group">
        <label for="cs-modal-note">Reason note <small class="muted-cell">(optional)</small></label>
        <input id="cs-modal-note" type="text" placeholder="e.g. academic performance — moved from Science">
      </div>
      <div id="cs-modal-feedback" class="form-feedback mt8" hidden></div>
    </div>
    <div class="modal-footer">
      <button class="outline-button" data-modal="change-stream-modal" style="width:auto;margin:0">Cancel</button>
      <button class="btn-primary" id="cs-modal-save-btn" style="width:auto;margin:0">Move student</button>
    </div>
  </div>
</div>
```

**No password confirmation** — this mirrors how `openClassTeacherModal` works (no
sensitive-confirm step; the admin is already authenticated). If the team later wants
a password gate, wrap in `askSensitiveConfirm` following the pattern in `admin.js`'s
`bindStudentRowMenus` archive handler.

### B — `studentRowMenu()` in `src/views/admin.js` (~line 93–102)

Add a `'Change stream'` menu item **only** for SS (Year 11/12) students.
Read the student's class to determine level:

```javascript
export function studentRowMenu(sid) {
  const s        = Data.student(sid);
  const cl       = s ? Data.cls(s.classId) : null;
  const archived = !!(s && s.status === 'archived');
  const isSS     = cl?.level === 'SS';               // NEW
  return `<div class="row-menu-wrap">
    <button class="row-menu" data-menu-toggle aria-label="Student actions">•••</button>
    <div class="row-menu-list" hidden>
      <button data-student="${sid}">Open full report</button>
      <button data-student-mentor="${sid}">Assign mentor</button>
      ${isSS ? `<button data-student-stream="${sid}">Change stream</button>` : ''}
      <button data-student-reset="${sid}">Reset password</button>
      <button data-student-archive="${sid}">${archived ? 'Restore student' : 'Archive student'}</button>
    </div>
  </div>`;
}
```

### C — `bindStudentRowMenus()` in `src/views/admin.js` (~line 104–136)

Add a handler for `[data-student-stream]` **after** the existing `[data-student-reset]` block:

```javascript
$all('[data-student-stream]').forEach(btn => btn.addEventListener('click', () => {
  closeMenus();
  openChangeStreamModal(btn.dataset.studentStream);
}));
```

### D — New function `openChangeStreamModal(sid)` in `src/views/admin.js`

Add after `bindStudentRowMenus` (before `renderUploadToggles`):

```javascript
export function openChangeStreamModal(sid) {
  const currentUser = getCurrentUser();
  const s  = Data.student(sid);
  const cl = s ? Data.cls(s.classId) : null;
  if (!s || !cl) return;

  // Offer every SS class except the one the student is already in
  const targets = Data.classes().filter(c =>
    c.level === 'SS' && String(c.id) !== String(s.classId)
  );

  $('cs-modal-title').textContent   = `Change stream — ${s.name}`;
  $('cs-modal-student').textContent = `Currently in ${cl.name}${cl.stream ? ' · ' + cl.stream : ''}`;
  $('cs-modal-class').innerHTML = targets.length
    ? targets.map(c =>
        `<option value="${c.id}">${esc(c.name)}${c.stream ? ' · ' + c.stream : ''}</option>`
      ).join('')
    : '<option value="">— No other SS classes —</option>';
  $('cs-modal-note').value = '';
  const fb = $('cs-modal-feedback'); fb.textContent = ''; fb.hidden = true;

  $('cs-modal-save-btn').onclick = async () => {
    const toClassId = $('cs-modal-class').value;
    if (!toClassId) {
      fb.textContent = 'Select a class first.'; fb.hidden = false; return;
    }
    closeModal('change-stream-modal');
    await Progression.assignClass(sid, toClassId, {
      reason: 'stream_change',
      note: $('cs-modal-note').value.trim(),
      userId: currentUser.id
    });
    const newCl = Data.cls(toClassId);
    toast(`${s.name} moved to ${newCl?.name || 'new class'}.`);
    // Refresh the students table in whichever tab is active
    renderPeopleTab($q('#people-tabs .tab-btn.active')?.dataset.tab || 'students-all');
  };

  openModal('change-stream-modal');
}
```

**Patterns used:**
- `openModal` / `closeModal` from `'../modals.js'` (already imported).
- `toast()` from `'../utils.js'` (already imported).
- `Progression.assignClass(sid, toClassId, { reason, note, userId })` — already used in
  `runPlacement()` on line ~1221 of admin.js.
- `renderPeopleTab(tab)` — local function already in scope.

### Verify
`npm run build` — zero errors. Open dev server as admin → People → Students All → click
`•••` on a Year-11 student → "Change stream" appears → select a target class → "Move
student" closes modal, shows toast, table refreshes.

---

## Feature 3 — Class report: CA / Exam sub-columns

### Data already present
`Academic.classReport(classId, term)` returns rows where each `r` in `row.rows` has
`r.ca`, `r.exam`, `r.score`. The data layer needs no changes.

### CSS additions (`src/styles.css`)

Append after the existing `.cr-remark` rule (currently the last rule in the
`/* Report matrix */` block, ~line 954):

```css
/* Sub-header rows for CA / Exam split columns */
.cr-sub-row th { font-size: 9px; font-weight: 600; color: var(--muted);
                 text-transform: uppercase; letter-spacing: .5px; padding: 2px 6px 5px; }
.cr-split     { font-size: 11px; white-space: nowrap; text-align: center; }
.cr-split b   { display: block; font-size: 13px; font-weight: 700; }
.cr-split small { color: var(--muted); font-size: 9px; }
```

### 3A — `renderClassReport()` draw() in `src/views/teacher.js` (~lines 629–671)

Current `<thead>`:
```html
<thead><tr><th>Student</th>
  ${subjects.map(s => `<th class="cr-sub-head" title="${esc(s.name)}">${subjectChip(s)}</th>`).join('')}
  <th>Avg</th><th>Status</th><th></th>
</tr></thead>
```

Replace with a two-row `<thead>`:
```javascript
`<table><thead>
  <tr>
    <th rowspan="2">Student</th>
    ${subjects.map(s =>
      `<th colspan="3" class="cr-sub-head" title="${esc(s.name)}">${subjectChip(s)}${esc(s.code)}</th>`
    ).join('')}
    <th rowspan="2">Avg</th>
    <th rowspan="2">Status</th>
    <th rowspan="2"></th>
  </tr>
  <tr class="cr-sub-row">
    ${subjects.map(() =>
      `<th>CA</th><th>Exam</th><th>Total</th>`
    ).join('')}
  </tr>
</thead><tbody>`
```

Current `<td>` per subject cell:
```javascript
`<td class="cr-cell ${r.score === null ? 'cr-empty' : ''}">
  ${r.score === null ? '—' : `<span class="${r.score >= passMark() ? 'cr-pass' : 'cr-fail'}">${r.score}</span>`}
</td>`
```

Replace with **three cells** per subject:
```javascript
`<td class="cr-split">${r.ca   !== null ? r.ca   : '<small>—</small>'}</td>
 <td class="cr-split">${r.exam !== null ? r.exam : '<small>—</small>'}</td>
 <td class="cr-split cr-cell ${r.score === null ? 'cr-empty' : ''}">
   ${r.score === null ? '—' : `<b class="${r.score >= passMark() ? 'cr-pass' : 'cr-fail'}">${r.score}</b>`}
 </td>`
```

### 3B — `openClassReportModal()` draw() in `src/views/shared.js` (~lines 71–85)

Current `<thead>`:
```html
<thead><tr><th>Student</th>
  ${report.subjects.map(s => `<th>${esc(s.code)}<br><span class="cr-sub-name">${esc(s.name)}</span></th>`).join('')}
  <th>Avg</th><th>Remark</th>
</tr></thead>
```

Replace:
```javascript
`<table><thead>
  <tr>
    <th rowspan="2">Student</th>
    ${report.subjects.map(s =>
      `<th colspan="3" class="cr-sub-head">${esc(s.code)}<br><span class="cr-sub-name">${esc(s.name)}</span></th>`
    ).join('')}
    <th rowspan="2">Avg</th>
    <th rowspan="2">Remark</th>
  </tr>
  <tr class="cr-sub-row">
    ${report.subjects.map(() => `<th>CA</th><th>Exam</th><th>Total</th>`).join('')}
  </tr>
</thead><tbody>`
```

Current per-subject `<td>`:
```javascript
`<td class="cr-caexam">${
  r.ca === null ? '—' : `${r.ca} <span class="cr-plus">+</span> ${r.exam} <span class="cr-eq">=</span> <b>${r.score}</b>`
}</td>`
```

Replace with three cells:
```javascript
`<td class="cr-split">${r.ca   !== null ? r.ca   : '—'}</td>
 <td class="cr-split">${r.exam !== null ? r.exam : '—'}</td>
 <td class="cr-split cr-cell">
   ${r.ca !== null ? `<b>${r.score}</b>` : '—'}
 </td>`
```

### 3C — `StudentReportDrawer.jsx` (`src/react/components/StudentReportDrawer.jsx`)

The drawer currently renders a flat list of `<div class="subject-row">` items.
Replace the `<div className="report-subjects">` block (and its inner `.map(sc => ...)`)
with a `<table>` that mirrors the CA/Exam column layout.

**For Term 1 & 2 (non-isTerm3) rows**, the current div layout is:
```jsx
<div className="subject-row" key={sc.subjectId || sc.name}>
  <div>
    <span>{sc.name}</span>
    <small>... CA {sc.ca ?? '—'} + Exam {sc.exam ?? '—'}</small>
  </div>
  <div className="subject-row-score"><b ...>{sc.score ?? '—'}</b>...</div>
</div>
```

Replace the entire `<div className="report-subjects">` section with:
```jsx
<div className="report-subjects">
  {/* history rows unchanged */}
  <div className="table-wrap mt8">
    <table className="cr-report-table">
      <thead>
        <tr>
          <th rowSpan={2} style={{textAlign:'left'}}>Subject</th>
          <th colSpan={3}>Score breakdown</th>
          {isTerm3 && <><th rowSpan={2}>T2</th><th rowSpan={2}>T1</th><th rowSpan={2}>3-Avg</th></>}
          <th rowSpan={2}>Grade</th>
        </tr>
        <tr className="cr-sub-row">
          <th>CA</th><th>Exam</th><th>Total</th>
        </tr>
      </thead>
      <tbody>
        {scores.map(sc => {
          if (isTerm3) {
            // existing T3 logic, render as table row
            const t2 = t2ById[sc.subjectId] ?? null;
            const t1 = t1ById[sc.subjectId] ?? null;
            const vals = [sc.score, t2, t1].filter(v => v !== null);
            const avg3 = vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : null;
            const pass = avg3 !== null && avg3 >= passMark();
            return (
              <tr key={sc.subjectId || sc.name}>
                <td>{sc.name}<br/><small className="muted-cell">{sc.type==='core'?'Core':'Elective'}</small></td>
                <td className="cr-split">{sc.ca ?? '—'}</td>
                <td className="cr-split">{sc.exam ?? '—'}</td>
                <td className="cr-split"><b className={pass?'':'text-danger'}>{sc.score ?? '—'}</b></td>
                <td className="cr-split muted-cell">{t2 ?? '—'}</td>
                <td className="cr-split muted-cell">{t1 ?? '—'}</td>
                <td className="cr-split"><b>{avg3 ?? '—'}</b></td>
                <td><small>{avg3 !== null ? gradeLabel(avg3) : '—'}</small></td>
              </tr>
            );
          }
          // Term 1 & 2
          const pass = (sc.score ?? 0) >= passMark();
          return (
            <tr key={sc.subjectId || sc.name}>
              <td>{sc.name}<br/><small className="muted-cell">{sc.type==='core'?'Core':'Elective'}</small></td>
              <td className="cr-split">{sc.ca ?? '—'}</td>
              <td className="cr-split">{sc.exam ?? '—'}</td>
              <td className="cr-split"><b className={pass?'':'text-danger'}>{sc.score ?? '—'}</b></td>
              <td><small>{sc.score !== null ? gradeLabel(sc.score) : '—'}</small></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
</div>
```

The `history` rows and `MentorChip` stay outside the table, unchanged.

### 3D — `StudentResults.jsx` (`src/react/components/StudentResults.jsx`)

The component already uses a `<table>` with flat column headers (`CA (40)`, `Exam (60)`,
`Total`, etc.). Replace the single `<thead>` with a two-row header:

**Non-T3 thead** (current):
```jsx
<tr>
  <th>Subject</th><th>Type</th><th>CA (40)</th><th>Exam (60)</th>
  <th>Total</th><th>Grade</th><th>Status</th>
</tr>
```

Replace with:
```jsx
<>
  <tr>
    <th rowSpan={2} style={{textAlign:'left'}}>Subject</th>
    <th rowSpan={2}>Type</th>
    <th colSpan={3}>Score breakdown</th>
    <th rowSpan={2}>Grade</th>
    <th rowSpan={2}>Status</th>
  </tr>
  <tr className="cr-sub-row">
    <th>CA (40)</th><th>Exam (60)</th><th>Total</th>
  </tr>
</>
```

**T3 thead** (current):
```jsx
<tr>
  <th>Subject</th><th>Type</th><th>CA (40)</th><th>Exam (60)</th>
  <th>T3 Total</th><th>T2 Total</th><th>T1 Total</th>
  <th>3-Term Avg</th><th>Grade</th><th>Status</th>
</tr>
```

Replace with:
```jsx
<>
  <tr>
    <th rowSpan={2} style={{textAlign:'left'}}>Subject</th>
    <th rowSpan={2}>Type</th>
    <th colSpan={3}>Score breakdown</th>
    <th rowSpan={2}>T2 Total</th>
    <th rowSpan={2}>T1 Total</th>
    <th rowSpan={2}>3-Term Avg</th>
    <th rowSpan={2}>Grade</th>
    <th rowSpan={2}>Status</th>
  </tr>
  <tr className="cr-sub-row">
    <th>CA (40)</th><th>Exam (60)</th><th>T3 Total</th>
  </tr>
</>
```

The body `<tr>` cells stay the same; the column order already lines up.

### Verify Feature 3
`npm run build` — zero errors. Open dev server:
1. As class teacher → class report → table has two-row header with CA / Exam / Total sub-columns.
2. As admin → Classes → "Full class report" → same two-row header.
3. As student / admin opening a student report drawer → table replaces the div list.
4. As student → Results view → two-row header.

---

## Ordered execution checklist

- [ ] 1. Add CSS to `src/styles.css` — append 4 rules after `.cr-remark`.
      Files: `src/styles.css`
      Verify: `npm run build` passes.

- [ ] 2. Feature 1 — update stream note in `renderStudentSubjectsPanel`.
      Files: `src/views/student.js`
      Verify: `npm run build` passes.

- [ ] 3. Feature 2A — add modal HTML to `index.html` before toast div.
      Files: `index.html`
      Verify: `npm run build` passes; modal element exists in DOM.

- [ ] 4. Feature 2B/C/D — update `studentRowMenu`, `bindStudentRowMenus`, add
      `openChangeStreamModal` in `src/views/admin.js`.
      Files: `src/views/admin.js`
      Verify: `npm run build` passes.

- [ ] 5. Feature 3A — update `renderClassReport` draw() in `src/views/teacher.js`.
      Files: `src/views/teacher.js`
      Verify: `npm run build` passes.

- [ ] 6. Feature 3B — update `openClassReportModal` draw() in `src/views/shared.js`.
      Files: `src/views/shared.js`
      Verify: `npm run build` passes.

- [ ] 7. Feature 3C — convert `StudentReportDrawer.jsx` subject list to table.
      Files: `src/react/components/StudentReportDrawer.jsx`
      Verify: `npm run build` passes.

- [ ] 8. Feature 3D — update `StudentResults.jsx` thead to two-row layout.
      Files: `src/react/components/StudentResults.jsx`
      Verify: `npm run build` passes.

- [ ] 9. Final full build + smoke test.
      Verify: `npm run build` clean; manual check in browser of all three features.
