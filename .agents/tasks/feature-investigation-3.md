# Feature Investigation 3 — Happy Man Academy SPA

**Date:** Investigation complete  
**Files examined:** `data.js`, `src/views/student.js`, `src/views/teacher.js`, `src/views/admin.js`, `src/views/shared.js`, `src/react/components/AdminProgression.jsx`, `src/react/components/StudentReportDrawer.jsx`, `index.html`

---

## Executive Summary

| Feature | Current state | Gap | Effort |
|---|---|---|---|
| **F1: Year 10 subject selection after placement** | `canChoose(10)` returns `true`; saving with `year < 11` goes straight to `effective` (no approval). But `renderStudentSubjectsPanel()` shows the button **only after the student has effective subjects or no subjects** — a freshly-placed Grade 10 student who has no selection yet already sees the "Choose subjects" button. The button text is `'Change subjects'` vs `'Choose subjects'` depending on whether subjects exist. **This already works correctly.** | Minor wording issue only: the panel note says "Your subjects for this term." without the "request goes to teacher" qualifier (correct). No logic change needed; the flow is already right for Grade 10 → immediate effective. | None / cosmetic |
| **F2: Admin stream change (Year 11/12)** | `Progression.assignClass()` exists and already clears subject selections when the stream changes. But **there is no UI in AdminProgression.jsx, admin.js, or anywhere else** to trigger a stream change for an already-placed SS student. | Must build: a "Change stream" action on student rows in the Admin People → Students tab (or a dedicated admin student detail modal) that lets the admin pick a new class and calls `Progression.assignClass()`. | Medium |
| **F3: Class report column-per-subject table** | The current class report (`renderClassReport()` in `teacher.js` and `openClassReportModal()` in `shared.js`) uses a **column-per-subject layout already** — but each subject column shows only the combined total score as a single cell. The `shared.js` register shows `CA + Exam = Total` in one `<td>` as inline text. The user wants two explicit sub-header columns (CA | Exam) under each subject header. | Modify both the `<thead>` and `<tbody>` rendering: each subject becomes a `<colgroup>` with two `<th>` sub-headers (CA / Exam). | Medium |

---

## Feature 1 — Year 10 Subject Selection After Path Approval

### Q: Does `Progression.canChoose(year)` return true for year 10?

**Yes.** `data.js` line ~3001:

```js
canChoose(year) {
  // Grade 10 pool entrants choose during placement; 11/12 may adjust.
  return Number(year) >= 10;
}
```

Returns `true` for year 10, 11, and 12.

### Q: What does `renderStudentSubjectsPanel()` show for a placed Grade 10 student?

Code path (`src/views/student.js`, `renderStudentSubjectsPanel`):

1. `Progression.canChoose(year)` → `true` (year ≥ 10), so it does NOT fall into the "set by the school" branch.
2. If `sel && sel.status === 'pending'` → shows "Pending review" state.
3. If `eff && eff.length` (has effective subjects) → shows subjects, button labelled `'Change subjects'` (for year < 11) or `'Request change'` (for year ≥ 11).
4. Otherwise → shows "No subjects chosen yet" and a `'Choose subjects'` button.

**A freshly-placed Grade 10 student with no selection yet** falls into branch 4 — the button IS shown. ✓

### Q: Does `chooseSubjects()` go to approval for Grade 10?

**No — it goes straight to effective.** In `saveChooseSubjects()` (`student.js`):

```js
if (_csState.year >= 11) {
  // status: 'pending', sends to Progression.requestApproval()
} else {
  // Grade 10: status: 'effective' — immediate
  await Progression.chooseSubjects(_csState.sid, checked, { status: 'effective', userId: currentUser.id });
  toast('Your subjects are saved. ✓');
}
```

Grade 10 subjects are saved as `effective` immediately — no teacher approval step. ✓

### Q: What is the approval flow for Grade 10 vs Grade 11/12?

| Grade | Status written | Approval request created | Flow |
|---|---|---|---|
| 10 | `effective` | No | Immediate |
| 11 / 12 | `pending` | Yes — `Progression.requestApproval(...)` with `actionType: 'subject_change'` | Sent to class teacher approval in `ApprovalsPanel` |

**This is already correct as implemented.** The `ApprovalsPanel` in `AdminProgression.jsx` only shows up in the admin progression view — class teacher approval happens when the teacher's `ClassOverview.jsx` renders the `approvals` panel.

### Conclusion for Feature 1

**No code change is strictly needed for the core subject-selection flow.** The one minor gap is cosmetic: when a Grade 10 student is freshly placed (no subjects yet), the panel note says `"Pick your subjects for this 2026 / 2027 — you can adjust them later."` which is accurate. However there is **no indication that they are placed into a stream** and that the subjects shown will be filtered to their stream. Consider adding a note like: `"You've been placed in the {stream} stream. Pick your subjects for this session."` — but this is optional polish.

---

## Feature 2 — Admin Can Change a Year 11/12 Student's Stream/Path

### Q: Is there any UI for changing an existing SS student's stream?

**None found in any file.**

- `AdminProgression.jsx` — handles pool placement (Grade 10 Pool → stream class), manual promotion override, and approval decisions. **No stream-change action for already-placed students.**
- `src/views/admin.js` — `studentRowMenu()` only exposes: "Open full report", "Assign mentor", "Reset password", "Archive student". **No stream change.**
- `renderAdminClasses()` — class actions are: View students, Full class report, Class timetable, Assign class teacher. **No transfer/stream change.**
- `renderPeopleTab()` for `students-all` tab — renders a table with the same `studentRowMenu()` actions.
- `openClassStudentsModal()` — shows a modal of students in a class with only "View report" per student.

### Q: Does a method exist for reassigning a student's stream?

**Yes — `Progression.assignClass()` in `data.js` already does everything needed:**

```js
async assignClass(studentId, toClassId, { reason = 'stream_change', note = '', userId } = {}) {
  // ...
  const movedStream = !!fromCls?.stream && !!toCls?.stream && fromCls.stream !== toCls.stream;
  // Updates students table (class_id)
  // Writes a student_transfers record (status: 'approved')
  // If movedStream: clears subject_selections so the student re-chooses for new stream
  return true;
}
```

Calling `Progression.assignClass(studentId, newClassId, { reason: 'stream_change', note: '...', userId })` is the complete operation. No new data-layer method is needed.

### What needs to be built

A UI action for admin to change an already-placed SS student's stream:

1. **Entry point:** Add a `"Change stream"` button/menu item on each SS student row in admin People → Students tab (`studentRowMenu()` or a dedicated per-student detail modal).
2. **Modal:** A simple modal listing SS classes in other streams at the same year level (e.g., for a Grade 11 Science student, offer Grade 11 Commercial and Grade 11 Arts). Require admin password confirmation (reuse `askSensitiveConfirm` pattern).
3. **Action:** Call `Progression.assignClass(studentId, targetClassId, { reason: 'stream_change', note, userId })`.
4. **Feedback:** Toast "Student moved to {new class}. Subject selections cleared." and refresh the student table.

**Data flow already supports this** — `assignClass` writes the `student_transfers` record and clears the old subject selection so the student must re-choose subjects for the new stream.

### Recommended implementation path

- Modify `studentRowMenu()` in `admin.js`: add `<button data-student-stream="${sid}">Change stream</button>` — but only render it if `Data.cls(s.classId)?.level === 'SS'`.
- Add `openChangeStreamModal(sid)` function to `admin.js` that populates a modal with same-year SS classes in different streams.
- Wire the button in `bindStudentRowMenus()`.
- Reuse the `sensitive-confirm-modal` pattern (already in `index.html`) for password confirmation, or add a new simple modal.

---

## Feature 3 — Report Table: Column-Per-Subject with CA/Exam Sub-Headers

### Current layout in `renderClassReport()` (teacher.js)

The class report table in the `view-class-report` view (`#cr-report-table`) currently renders:

```html
<table>
  <thead>
    <tr>
      <th>Student</th>
      <th class="cr-sub-head"><!-- subject chip: ENG --></th>  <!-- one th per subject -->
      <th class="cr-sub-head"><!-- subject chip: MAT --></th>
      ...
      <th>Avg</th>
      <th>Status</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><!-- student name --></td>
      <td class="cr-cell"><!-- score (total only) --></td>     <!-- one td per subject -->
      ...
      <td><strong>avg%</strong></td>
      <td><span class="status ...">...</span></td>
      <td><button>Detail</button></td>
    </tr>
  </tbody>
</table>
```

Each subject is a **single column** showing just the total score (e.g., `72`). No CA/Exam breakdown visible in the main table.

Relevant code (`teacher.js`, `renderClassReport()` → `draw()`):

```js
// Header
`<th class="cr-sub-head" title="${esc(s.name)}">${subjectChip(s)}</th>`

// Body cell
`<td class="cr-cell ${r.score === null ? 'cr-empty' : ''}">
  ${r.score === null ? '—' : `<span class="${r.score >= passMark() ? 'cr-pass' : 'cr-fail'}">${r.score}</span>`}
</td>`
```

`r` comes from `Academic.classReport()` which provides `{ ca, exam, score, subjectId, name }`.

### Current layout in `openClassReportModal()` (shared.js)

The register modal (`#register-table-wrap`) uses a slightly different format:

```html
<!-- Header -->
<th>${esc(s.code)}<br><span class="cr-sub-name">${esc(s.name)}</span></th>

<!-- Body cell (shared.js) -->
<td class="cr-caexam">
  ${r.ca === null ? '—' : `${r.ca} <span class="cr-plus">+</span> ${r.exam} <span class="cr-eq">=</span> <b>${r.score}</b>`}
</td>
```

The register modal already shows `CA + Exam = Total` inline, but as one cell, not two sub-columns.

### What the user wants

A table where each subject has **two sub-header columns: CA Score | Exam Score**, and each row is a student. The user also wants year 10-12 students to be able to select subjects.

Target structure:

```html
<table>
  <thead>
    <tr>
      <th rowspan="2">Student</th>
      <th colspan="2">English</th>  <!-- two cols per subject -->
      <th colspan="2">Maths</th>
      ...
      <th rowspan="2">Avg</th>
      <th rowspan="2">Status</th>
    </tr>
    <tr>
      <th>CA</th><th>Exam</th>
      <th>CA</th><th>Exam</th>
      ...
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Ama Osei</td>
      <td>32</td><td>55</td>   <!-- CA and Exam split -->
      <td>28</td><td>48</td>
      ...
      <td>76%</td>
      <td>Promoted</td>
    </tr>
  </tbody>
</table>
```

### What needs to change

**`src/views/teacher.js` — `renderClassReport()` → `draw()`**

1. Change the `<thead>` to a two-row header using `rowspan`/`colspan`:
   - Row 1: `<th rowspan="2">Student</th>`, then for each subject `<th colspan="2">{chip+name}</th>`, then `<th rowspan="2">Avg</th>`, `<th rowspan="2">Status</th>`, `<th rowspan="2"></th>`
   - Row 2: for each subject, two `<th>` elements: `CA` and `Exam`

2. Change the `<tbody>` cell rendering from one `<td>` per subject to two:
   ```js
   `<td class="cr-cell">${r.ca ?? '—'}</td>
    <td class="cr-cell">${r.exam ?? '—'}</td>`
   ```
   (The `r.ca` and `r.exam` values are already provided by `Academic.classReport()`.)

**`src/views/shared.js` — `openClassReportModal()` → `draw()`**

Same transformation: split each subject column into CA + Exam sub-columns.

**`src/react/components/StudentReportDrawer.jsx`** — The individual student report drawer already shows `CA {x} + Exam {y}` as inline text in the `<small>` sub-line of each subject row. The user's request for the columnar table is directed at the **class report**, not the individual student drawer. However, if a grid/table layout per student is desired in the drawer too, the same pattern can be applied. This is out of scope for the user's request as stated.

### Data availability

`Academic.classReport(classId, term)` already returns per-student, per-subject objects with `{ ca, exam, score }` (`data.js` → `Academic.classReport`). No data layer changes needed — the CA and Exam values are already there.

### Download impact

`$('cr-download-btn').onclick` in `teacher.js` currently exports only total scores per subject. The Excel download should also be updated to include CA and Exam columns. The `summaryRows` header line and per-student row should become: `[...subjects.flatMap(s => [s.name + ' CA', s.name + ' Exam']), 'Average', 'Status']`.

---

## Conclusions and Recommended Fixes

### Feature 1 (Year 10 subject selection)
**No logic changes needed.** The code is already correct: `canChoose(10) = true`, saving is immediate (no approval), and the UI shows the button. Optional polish: change the panel note for placed Grade 10 students with no subjects yet to mention their stream: *"You've been placed in the Science stream. Choose your subjects for this session."*

### Feature 2 (Admin stream change)
**Must build the UI.** The data layer is ready. Required changes:
- `src/views/admin.js`: `studentRowMenu()` → add `"Change stream"` action for SS students only
- `src/views/admin.js`: new `openChangeStreamModal(sid)` function
- `src/views/admin.js`: `bindStudentRowMenus()` → bind `[data-student-stream]` buttons
- `index.html`: optionally add a new `change-stream-modal` (or reuse the existing `sensitive-confirm-modal` with an embedded select)

### Feature 3 (CA/Exam sub-columns in class report)
**Two files to modify.** Both the main class report view and the register modal need the two-row header approach:
- `src/views/teacher.js`: `renderClassReport()` → `draw()` — rewrite `<thead>` and `<tbody>` cells
- `src/views/shared.js`: `openClassReportModal()` → `draw()` — same transformation
- `src/views/teacher.js`: `cr-download-btn` handler — update Excel export to include CA+Exam columns
- No changes needed in `data.js` — `Academic.classReport()` already supplies `r.ca` and `r.exam`
