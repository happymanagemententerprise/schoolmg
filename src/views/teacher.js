// ============================================================
//  Happy Man Academy — Teacher views
// ============================================================

import { Data, Academic, Progression } from '../data/index.js';
import { getCurrentUser } from '../state.js';
import {
  $, $q, $all, esc, toast, formatDate,
  gradeLabel, toneClass, subjectChip, statusClass, currentTerm, passMark,
  downloadCsv, downloadXlsx, downloadXlsxMulti,
  classRank, ordinal
} from '../utils.js';
import { openModal, closeModal, openDrawer, closeMenus } from '../router.js';

// showView / renderView loaded lazily to avoid a circular import with router.js
function showView(page) { import('../router.js').then(m => m.showView(page)); }
function renderView(page) { import('../router.js').then(m => m.renderView(page)); }
import { isTeacher, isAdmin, isHOD, myClassRecord, hasClass, myDepartments } from '../auth.js';
import { openStudentReport } from './reports.js';
import {
  askSensitiveConfirm, openClassReportModal, openResetPasswordModal, timetableTable
} from './shared.js';
// renderAdminTimetable is never called directly in teacher views; removed from import

// ── Teacher subject helpers ───────────────────────────────────
export function myTeacherSubjects() {
  const currentUser = getCurrentUser();
  return Data.teacherSubjects().filter(ts => ts.teacherId === currentUser.id);
}

export function myTeachingPairs() {
  return myTeacherSubjects().map(ts => ({
    subjectId: ts.subjectId,
    classId: ts.classId,
    subject: Data.subject(ts.subjectId),
    cls: Data.cls(ts.classId)
  })).filter(p => p.subject && p.cls);
}

// ── Subject dashboard ─────────────────────────────────────────
export function renderSubjectDashboard() {
  const currentUser = getCurrentUser();
  const pairs      = myTeachingPairs();
  const mine       = myTeacherSubjects();
  const sess       = Data.session();
  const myAssigns  = Data.assignments().filter(a => a.teacherId === currentUser.id);
  const cl         = myClassRecord(currentUser);
  const mySubjects = [...new Map(pairs.map(p => [p.subjectId, p.subject])).values()];
  const myClasses  = [...new Map(pairs.map(p => [p.classId, p.cls])).values()];

  const roleDesc = isHOD(currentUser)
    ? `HOD · ${myDepartments(currentUser).map(d => d.name).join(', ') || 'no department'} · ${pairs.length} subject/class`
    : hasClass(currentUser)
      ? `Class Teacher · ${cl.name} · ${pairs.length} subject/class`
      : `Subject Teacher · ${pairs.length} subject/class`;

  const eyebrowEl = $q('#view-subject-dashboard .eyebrow');
  if (eyebrowEl) eyebrowEl.textContent = roleDesc;
  const headingEl = $q('#view-subject-dashboard h1');
  if (headingEl) headingEl.textContent = `Good morning, ${currentUser.name.split(' ')[0]}.`;

  $('st-stat-subjects').textContent    = mySubjects.length;
  $('st-stat-assignments').textContent = myAssigns.length;
  $('st-stat-classes').textContent     = myClasses.length;
  $('st-stat-mentees').textContent     = Data.mentees(currentUser.id).length;

  const withScores = new Set();
  mine.forEach(ts => {
    Data.studentsByClass(ts.classId).forEach(s => {
      if (Data.studentScores(s.id)[ts.subjectId]?.[sess.currentTerm]) withScores.add(`${s.id}:${ts.subjectId}`);
    });
  });
  $('st-stat-uploaded').textContent = withScores.size;

  $('st-teaching-list').innerHTML = pairs.length
    ? pairs.map(p => `<div class="teacher-assignment">
        <div><strong>${esc(p.subject.name)}</strong><small>${esc(p.cls.name)} ${p.cls.stream ? '· ' + p.cls.stream : ''}</small></div>
        <span class="subject-chip chip-${p.subject.color}">${esc(p.subject.code)}</span>
      </div>`).join('')
    : '<p class="muted-cell">No subject assigned yet. Ask your HOD to assign you.</p>';

  $('st-assignments-list').innerHTML = myAssigns.length
    ? myAssigns.map(a => {
        const sub = Data.subject(a.subjectId), cl2 = Data.cls(a.classId);
        return `<div class="teacher-assignment">
          <div><strong>${esc(a.title)}</strong><small>${esc(sub?.name || '—')} · ${esc(cl2?.name || '—')}</small></div>
          <time>${formatDate(a.due)}</time>
        </div>`;
      }).join('')
    : '<p class="muted-cell">No assignments yet.</p>';

  renderMentees();

  $('st-choose-file').onclick = () => $('st-file-input').click();
  $('st-upload-btn').onclick  = () => $('st-file-input').click();
  $('st-file-input').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    processScoreUpload(file);
  };
  const dlBtn = $('st-download-sheet-btn');
  if (dlBtn) dlBtn.onclick = downloadScoreSheet;

  $('st-create-assign-btn').onclick = () => { populateAssignmentModal(); openModal('add-assignment-modal'); };
  $('save-assignment-btn').onclick  = saveAssignment;
  $('st-assign-mentor-btn').onclick = () => openMentorModal();
  $('st-report-link').onclick = hasClass(currentUser)
    ? () => { showView('view-class-report'); renderClassReport(); }
    : () => { showView('view-subject-scores'); renderSubjectScores(); };

  initWeeklyTopicsComposer();
}

// ── Weekly topics ─────────────────────────────────────────────
export function initWeeklyTopicsComposer() {
  const currentUser = getCurrentUser();
  const pairs = myTeachingPairs();
  const wrap  = $('wt-subject');
  if (!wrap) return;
  const noAllocation = () => {
    $('wt-subject').innerHTML = '<option value="">No allocation</option>';
    $('wt-class').innerHTML  = '<option value="">—</option>';
    $('wt-list-meta').textContent = 'You need a subject/class allocation before recording weekly topics.';
    $('wt-list').innerHTML = '';
    $('wt-add-btn').disabled = true;
  };
  if (!pairs.length) { noAllocation(); return; }

  const mySubjects = [...new Map(pairs.map(p => [p.subjectId, p.subject])).values()];
  $('wt-subject').innerHTML = mySubjects.length
    ? mySubjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')
    : '<option value="">No subjects</option>';
  $('wt-add-btn').disabled = false;

  function fillClasses() {
    const subjectId = $('wt-subject').value;
    const classes = pairs.filter(p => String(p.subjectId) === subjectId).map(p => p.cls);
    $('wt-class').innerHTML = classes.length
      ? classes.map(c => `<option value="${c.id}">${esc(c.name)}${c.stream ? ' · ' + c.stream : ''}</option>`).join('')
      : '<option value="">No classes</option>';
  }

  function drawList() {
    const subjectId = $('wt-subject').value;
    const classId   = $('wt-class').value;
    const list      = Progression.topicsFor(classId, subjectId).slice(0, 15);
    $('wt-list-meta').textContent = list.length
      ? `${Data.subject(subjectId)?.name || 'Subject'} · ${Data.cls(classId)?.name || 'Class'} — ${list.length} topic${list.length === 1 ? '' : 's'} logged, latest week ${list[0].week}.`
      : 'No topics recorded yet for this subject/class.';
    $('wt-list').innerHTML = list.map(t => `<div class="topic-row">
        <span class="subject-chip chip-${Data.subject(t.subjectId)?.color || 'blue'}">W${t.week}</span>
        <div><strong>${esc(t.topic)}</strong><small>${esc(t.summary || Data.subject(t.subjectId)?.name || '—')}</small></div>
      </div>`).join('') || '<p class="muted-cell">Nothing here yet &mdash; add the first topic for the week.</p>';
  }

  $('wt-subject').onchange = () => { fillClasses(); drawList(); };
  $('wt-class').onchange   = () => drawList();
  $('wt-add-btn').onclick  = async () => {
    const fb = $('wt-feedback');
    const subjectId = $('wt-subject').value, classId = $('wt-class').value;
    const week   = Number($('wt-week').value) || 1;
    const topic  = $('wt-topic').value.trim();
    const summary = $('wt-summary').value.trim();
    if (!subjectId || !classId) { fb.hidden = false; fb.textContent = 'Pick a subject and a class.'; fb.className = 'form-feedback mt8 text-danger'; return; }
    if (!topic)  { fb.hidden = false; fb.textContent = 'Give the topic a name.'; fb.className = 'form-feedback mt8 text-danger'; return; }
    await Progression.addWeeklyTopic({ classId, subjectId, week, topic, summary }, currentUser.id);
    $('wt-topic').value = ''; $('wt-summary').value = '';
    fb.hidden = false; fb.textContent = `Week ${week} topic saved for ${Data.cls(classId)?.name || 'the class'}. ✓`;
    fb.className = 'form-feedback mt8 green-text';
    drawList();
  };

  fillClasses();
  drawList();
}

// ── Mentorship ────────────────────────────────────────────────
export function renderMentees() {
  const currentUser = getCurrentUser();
  const wrap = $('st-mentees-list');
  if (!wrap) return;
  const mentees = Data.mentees(currentUser.id);
  wrap.innerHTML = mentees.length
    ? mentees.map(s => {
        const cl = Data.cls(s.classId);
        return `<div class="mentee-row">
          <span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>
          <div><strong>${esc(s.name)}</strong><small>${esc(cl?.name || '—')}</small></div>
          <button class="btn-sm-save" data-mentee-report="${s.id}">Report</button>
        </div>`;
      }).join('')
    : `<p class="muted-cell">You are not mentoring any student yet.</p>`;
  $all('[data-mentee-report]').forEach(btn =>
    btn.addEventListener('click', () => openStudentReport(btn.dataset.menteeReport)));
}

export function openMentorModal(focusStudentId = null) {
  const currentUser = getCurrentUser();
  const myClassIds = [...new Set(myTeacherSubjects().map(ts => ts.classId))];
  const pool = currentUser.role === 'Administrator'
    ? Data.students()
    : Data.students().filter(s => myClassIds.includes(s.classId));
  const source = pool.length ? pool : Data.students();

  $('am-student').innerHTML = source.map(s =>
    `<option value="${s.id}" ${String(s.id) === String(focusStudentId) ? 'selected' : ''}>${esc(s.name)} — ${esc(Data.cls(s.classId)?.name || '')}</option>`).join('')
    || '<option value="">No students found</option>';

  $('am-teacher').innerHTML = '<option value="">— No mentor —</option>' +
    Data.mentors().map(m => `<option value="${m.id}">${esc(m.name)} (${esc(m.role)})${m.subject ? ' · ' + esc(m.subject) : ''}</option>`).join('');
  $('am-scope').textContent = currentUser.role === 'Administrator'
    ? 'Pick any student on roll and any teacher as their mentor.'
    : `Pick a student from the ${new Set(myTeacherSubjects().map(ts => Data.cls(ts.classId)?.name).filter(Boolean)).size || 'no'} class(es) you teach, then choose a mentor.`;
  $('am-feedback').textContent = '';
  $('am-feedback').className = 'form-feedback mt8';
  openModal('assign-mentor-modal');

  $('save-mentor-btn').onclick = async () => {
    const sid = $('am-student').value;
    if (!sid) { toast('No student selected.', 'error'); return; }
    const mentor = await Data.setMentor(sid, $('am-teacher').value || null);
    closeModal('assign-mentor-modal');
    toast(mentor ? `${Data.student(sid)?.name} is now mentored by ${mentor.name}.` : 'Mentor removed.');
    if (isTeacher(currentUser)) renderSubjectDashboard();
    if (isAdmin(currentUser)) {
      import('./admin.js').then(({ renderPeopleTab }) => {
        renderPeopleTab($q('#people-tabs .tab-btn.active')?.dataset.tab || 'students-all');
      });
    }
  };
}

// ── Subject scores ────────────────────────────────────────────
export function renderSubjectScores() {
  const mine    = myTeacherSubjects();
  const subSel  = $('st-score-subject');
  const clsSel  = $('st-score-class');
  const termSel = $('st-score-term');

  const subjects = [...new Map(mine.map(ts => [ts.subjectId, Data.subject(ts.subjectId)])).values()].filter(Boolean);

  subSel.innerHTML = subjects.length
    ? subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')
    : '<option value="">No subjects assigned</option>';

  function fillClasses() {
    const subjectId = subSel.value;
    const classes   = [...new Map(mine.filter(ts => ts.subjectId === subjectId)
                    .map(ts => Data.cls(ts.classId)).filter(Boolean).map(c => [c.id, c])).values()];
    clsSel.innerHTML = '<option value="">All my classes</option>' +
      classes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }
  subSel.onchange = () => { fillClasses(); draw(); };
  clsSel.onchange  = draw;
  termSel.onchange = draw;
  fillClasses();
  termSel.value = currentTerm();

  function draw() {
    const subjectId = subSel.value;
    if (!subjectId) {
      $('st-scores-table').innerHTML = '<tr><td colspan="7" class="muted-cell">No subjects are assigned to you.</td></tr>';
      $('st-scores-meta').textContent = '';
      return;
    }
    const subject   = Data.subject(subjectId);
    const classId   = clsSel.value;
    const term      = +termSel.value;
    const classIds  = classId
      ? [classId]
      : [...new Set(mine.filter(ts => ts.subjectId === subjectId).map(ts => ts.classId))];

    const rows = classIds.flatMap(cid => Data.studentsByClass(cid).map(s => ({ s, cid })));
    $('st-scores-meta').textContent =
      `${subject?.name} · ${classId ? Data.cls(classId)?.name : `${classIds.length} classes you teach`} · Term ${term}`;

    $('st-scores-table').innerHTML = rows.length ? rows.map(({ s, cid }) => {
      const entry = Data.studentScores(s.id)[subjectId]?.[term];
      const ca    = entry?.test  ?? null;
      const exam  = entry?.exam  ?? null;
      const total = entry ? ca + exam : null;
      const grade = total !== null ? gradeLabel(total) : '—';
      const pass  = total !== null && total >= passMark();
      return `<tr>
        <td><div class="student"><span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>${esc(s.name)}</div></td>
        <td>${esc(Data.cls(cid)?.name || '—')}</td>
        <td>${ca ?? '—'}</td><td>${exam ?? '—'}</td>
        <td><strong>${total ?? '—'}</strong></td>
        <td><span class="status ${total === null ? 'review' : pass ? 'promoted' : 'repeat'}">${grade}</span></td>
      </tr>`;
    }).join('') : '<tr><td colspan="7" class="muted-cell">No students in this class.</td></tr>';
  }
  draw();

  const dlBtn = $('st-download-xls-btn');
  if (dlBtn) dlBtn.onclick = () => downloadScoreSheet(true);
}

export function downloadScoreSheet(asExcel) {
  const mine = myTeacherSubjects();
  if (!mine.length) { toast('No subjects are assigned to you.', 'error'); return; }

  const subSel    = $('st-score-subject');
  const subjectId = subSel?.value || mine[0].subjectId;
  const classId   = ($('st-score-class')?.value) || '';
  const term      = +($('st-score-term')?.value || currentTerm());
  const subject   = Data.subject(subjectId);
  const classIds  = classId
    ? [classId]
    : [...new Set(mine.filter(ts => ts.subjectId === subjectId).map(ts => ts.classId))];

  const header = ['Class', 'Admission No', 'Student Name', 'CA Score (max 40)', 'Exam Score (max 60)', 'Total', 'Feedback'];

  if (asExcel) {
    const sheets = classIds.map(cid => {
      const cl       = Data.cls(cid);
      const students = Data.studentsByClass(cid);
      const rows = [
        [`Happy Man Academy — ${subject?.name} · ${cl?.name || ''} · Term ${term}`],
        header
      ];
      students.forEach(s => {
        const e  = Data.studentScores(s.id)[subjectId]?.[term];
        const fb = Data.feedback()[s.id];
        const remark = fb && fb.term === term ? (fb.text || '') : '';
        rows.push([cl?.name || '', s.admissionNo || '', s.name,
          e?.test ?? '', e?.exam ?? '', e ? e.test + e.exam : '', remark]);
      });
      return { name: (cl?.name || cid).slice(0, 31), rows };
    });
    downloadXlsxMulti(`scores_${subject?.code || 'sub'}_term${term}.xlsx`, sheets);
  } else {
    const rows = [[`Happy Man Academy — ${subject?.name} · Term ${term}`], header];
    classIds.forEach(cid => {
      const cl = Data.cls(cid);
      Data.studentsByClass(cid).forEach(s => {
        const e  = Data.studentScores(s.id)[subjectId]?.[term];
        const fb = Data.feedback()[s.id];
        const remark = fb && fb.term === term ? (fb.text || '') : '';
        rows.push([cl?.name || '', s.admissionNo || '', s.name,
          e?.test ?? '', e?.exam ?? '', e ? e.test + e.exam : '', remark]);
      });
    });
    downloadCsv(`scores_${subject?.code || 'sub'}_term${term}.csv`, rows);
  }
  toast('Score sheet downloaded.');
}

export async function processScoreUpload(file) {
  const currentUser = getCurrentUser();
  const buf = await file.arrayBuffer();
  let rows = [];

  if (file.name.toLowerCase().endsWith('.csv')) {
    const text = new TextDecoder().decode(buf);
    rows = text.split(/\r?\n/).map(line => {
      const out = []; let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
      out.push(cur.trim());
      return out;
    }).filter(r => r.some(c => c));
  } else {
    try {
      rows = _parseXlsxRows(buf);
    } catch (err) {
      toast('Could not read the spreadsheet. Save as .csv and try again.', 'error');
      return;
    }
  }

  if (rows.length < 2) { toast('The file appears to be empty.', 'error'); return; }

  const header = rows[0].map(h => String(h ?? '').toLowerCase().trim());
  const col = name => header.findIndex(h => h.includes(name));

  const colAdm  = col('admission');
  const colName = col('student name') >= 0 ? col('student name') : col('name');
  const colCA   = col('ca') >= 0 ? col('ca') : col('test');
  const colExam = col('exam');

  if (colCA < 0 || colExam < 0) {
    toast('Missing columns. The sheet must have "CA Score" and "Exam Score" columns.', 'error');
    return;
  }

  const subjectId = $('st-score-subject')?.value;
  const term      = +($('st-score-term')?.value || currentTerm());
  const mine      = myTeacherSubjects();
  if (!subjectId) { toast('Select a subject first, then upload.', 'error'); return; }

  const allowedClassIds = [...new Set(
    mine.filter(ts => ts.subjectId === subjectId).map(ts => ts.classId)
  )];
  const allowedStudents = allowedClassIds.flatMap(cid => Data.studentsByClass(cid));

  const byAdm  = new Map(allowedStudents.map(s => [String(s.admissionNo || '').toLowerCase(), s]));
  const byName = new Map(allowedStudents.map(s => [s.name.toLowerCase(), s]));

  let saved = 0, skipped = 0, errors = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const admVal  = colAdm  >= 0 ? String(row[colAdm]  ?? '').toLowerCase().trim() : '';
    const nameVal = colName >= 0 ? String(row[colName] ?? '').toLowerCase().trim() : '';
    const caRaw   = row[colCA];
    const exRaw   = row[colExam];

    if (!caRaw && !exRaw) { skipped++; continue; }

    const ca   = Math.min(40, Math.max(0, Number(String(caRaw  ?? '').replace(/[^0-9.]/g, '')) || 0));
    const exam = Math.min(60, Math.max(0, Number(String(exRaw ?? '').replace(/[^0-9.]/g, '')) || 0));

    const student = (admVal && byAdm.get(admVal)) || (nameVal && byName.get(nameVal));
    if (!student) {
      if (admVal || nameVal) errors.push(`Row ${i + 1}: "${admVal || nameVal}" not found`);
      skipped++;
      continue;
    }

    const ok = await Data.saveGrade(student.id, subjectId, term, ca, exam);
    if (ok) saved++; else skipped++;
  }

  await Progression.markUploaded(
    { classId: allowedClassIds[0] || '', subjectId, kind: 'both', rowCount: saved },
    currentUser.id
  );

  const msg = `Uploaded ${saved} score${saved !== 1 ? 's' : ''}` +
    (skipped ? ` · ${skipped} skipped` : '') +
    (errors.length ? ` · ${errors.length} unmatched` : '');
  toast(msg, saved > 0 ? 'success' : 'error');
  if (errors.length) console.warn('[HMA] unmatched upload rows:', errors.join('; '));

  renderSubjectScores();
  renderSubjectDashboard();
}

export function _parseXlsxRows(buf) {
  const u8  = new Uint8Array(buf);
  const dec = new TextDecoder();

  function zipEntry(name) {
    const enc = new TextEncoder().encode(name);
    for (let i = 0; i < u8.length - 30; i++) {
      if (u8[i] !== 0x50 || u8[i+1] !== 0x4B || u8[i+2] !== 0x03 || u8[i+3] !== 0x04) continue;
      const fLen = u8[i+26] | (u8[i+27] << 8);
      const xLen = u8[i+28] | (u8[i+29] << 8);
      if (fLen !== enc.length) continue;
      const fname = u8.slice(i+30, i+30+fLen);
      if (!enc.every((b, j) => b === fname[j])) continue;
      const dataStart = i + 30 + fLen + xLen;
      const cLen = (u8[i+18] | (u8[i+19]<<8) | (u8[i+20]<<16) | (u8[i+21]<<24)) >>> 0;
      return dec.decode(u8.slice(dataStart, dataStart + cLen));
    }
    return null;
  }

  const ssXml = zipEntry('xl/sharedStrings.xml') || '';
  const shared = [...ssXml.matchAll(/<si[^>]*>[\s\S]*?<\/si>/g)]
    .map(m => (m[0].match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [])
      .map(t => t.replace(/<[^>]+>/g, '')).join(''));

  const wb   = zipEntry('xl/workbook.xml') || '';
  const rel  = zipEntry('xl/_rels/workbook.xml.rels') || '';
  const sheetIdM = wb.match(/<sheet[^>]+sheetId="1"[^>]+r:id="([^"]+)"/);
  const sheetId  = sheetIdM?.[1] || 'rId1';
  const targetM  = rel.match(new RegExp(`Id="${sheetId}"[^>]+Target="([^"]+)"`));
  const target   = targetM?.[1] || 'worksheets/sheet1.xml';
  const sheetXml = zipEntry('xl/' + target) || zipEntry('xl/worksheets/sheet1.xml') || '';

  const result = [];
  for (const rowM of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    let lastCol = -1;
    for (const cellM of rowM[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const colStr = cellM[1];
      const colIdx = [...colStr].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
      while (cells.length <= colIdx) cells.push('');
      const attrs = cellM[2], inner = cellM[3];
      const vM = inner.match(/<v>([\s\S]*?)<\/v>/);
      const val = vM ? vM[1] : '';
      if (attrs.includes('t="s"')) {
        cells[colIdx] = shared[Number(val)] ?? '';
      } else if (attrs.includes('t="inlineStr"') || attrs.includes('t="str"')) {
        cells[colIdx] = inner.replace(/<[^>]+>/g, '');
      } else {
        cells[colIdx] = val === '' ? '' : isNaN(Number(val)) ? val : Number(val);
      }
      lastCol = colIdx;
    }
    result.push(cells);
  }
  return result;
}

// ── Assignment modal ──────────────────────────────────────────
export function populateAssignmentModal() {
  const mine     = myTeacherSubjects();
  const subjects = [...new Map(mine.map(ts => [ts.subjectId, Data.subject(ts.subjectId)])).values()].filter(Boolean);

  $('na-subject').innerHTML = subjects.length
    ? subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')
    : '<option value="">No subjects assigned</option>';

  function updateClasses() {
    const subId    = $('na-subject').value;
    const myClasses = [...new Map(mine.filter(ts => ts.subjectId === subId)
                    .map(ts => Data.cls(ts.classId)).filter(Boolean).map(c => [c.id, c])).values()];
    $('na-class').innerHTML = myClasses.length
      ? myClasses.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')
      : '<option value="">No class for this subject</option>';
  }
  $('na-subject').onchange = updateClasses;
  updateClasses();
  $('na-title').value = '';
  $('na-due').value   = '';
  $('na-feedback').textContent = '';
}

export async function saveAssignment() {
  const currentUser = getCurrentUser();
  const title = $('na-title').value.trim(), due = $('na-due').value;
  if (!title || !due) {
    $('na-feedback').textContent = 'Title and due date are required.';
    $('na-feedback').className = 'form-feedback error mt8';
    return;
  }
  await Data.addAssignment({
    title, subjectId: $('na-subject').value, classId: $('na-class').value,
    due, teacherId: currentUser.id, term: currentTerm()
  });
  closeModal('add-assignment-modal');
  toast('Assignment created.');
  if (isTeacher(currentUser)) renderSubjectDashboard();
}

// ── Class overview ────────────────────────────────────────────
export function renderClassOverview() {
  const currentUser = getCurrentUser();
  const cl = myClassRecord(currentUser);
  if (!cl) { toast('You are not assigned a class yet.', 'error'); return; }
  const students = Data.studentsByClass(cl.id).filter(s => s.status !== 'archived');
  const term     = currentTerm();
  const fb       = Data.feedback();
  const pending  = students.filter(s => !fb[s.id]?.submitted).length;
  const avg      = Academic.classAverage(cl.id, term);
  const girls    = students.filter(s => s.gender === 'F').length;
  const boys     = students.filter(s => s.gender === 'M').length;
  const atts     = students.map(s => +Academic.attendancePct(s.id));
  const avgAtt   = atts.length ? Math.round(atts.reduce((a, b) => a + b, 0) / atts.length) : 0;
  const promoted = students.filter(s => Academic.canPromote(s.id, term)).length;

  $('ct-eyebrow').textContent = `${isHOD(currentUser) ? 'HOD · ' : ''}Class teacher · ${cl.name}`;
  $('ct-welcome').textContent = `Good morning, ${currentUser.name.split(' ')[0]}.`;

  $('ct-stat-students').textContent = students.length;
  $('ct-stat-gender').textContent   = `${girls} girls · ${boys} boys`;
  $('ct-stat-pending').textContent  = pending;
  $('ct-stat-avg').textContent      = avg + '%';
  $('ct-stat-att').textContent      = avgAtt + '%';
  $('ct-stat-promoted').textContent = `${promoted}/${students.length}`;

  $('ct-student-table').innerHTML =
    `<div class="role-table-head"><span>Student</span><span>Attendance</span><span>Feedback</span><span></span></div>` +
    students.map(s => {
      const att  = Academic.attendancePct(s.id);
      const done = fb[s.id]?.submitted;
      return `<div class="role-table-row">
        <span class="student"><span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>${esc(s.name)}</span>
        <strong>${att}</strong>
        <span class="status ${done ? 'promoted' : 'review'}">${done ? 'Done' : 'Pending'}</span>
        <span class="role-row-actions">
          <button class="row-menu ct-att-btn" data-sid="${s.id}" title="Edit attendance">✎</button>
          <button class="btn-sm-save" data-reset-pw="${s.id}" title="Reset password">Reset</button>
        </span>
      </div>`;
    }).join('');

  $all('.ct-att-btn').forEach(btn => btn.addEventListener('click', () => {
    showView('view-class-attendance');
    renderClassAttendance(btn.dataset.sid);
  }));
  import('./shared.js').then(({ openResetPasswordModal: orp }) => {
    $all('[data-reset-pw]').forEach(btn => btn.addEventListener('click', () => orp(btn.dataset.resetPw)));
  });

  const atRisk = students.filter(s =>
    +Academic.attendancePct(s.id) < 90 || Academic.promotionStatus(s.id, term) === 'Repeat');
  $('ct-support-count').textContent = atRisk.length;
  $('ct-support-list').innerHTML = atRisk.flatMap(s => {
    const att = +Academic.attendancePct(s.id);
    const items = [];
    if (att < 90) items.push({ icon: '!', color: 'coral-bg', msg: `Low attendance (${att}%)`, name: s.name });
    if (Academic.promotionStatus(s.id, term) === 'Repeat') items.push({ icon: '↘', color: 'yellow-bg', msg: 'Not on track to promote', name: s.name });
    return items;
  }).map(i => `<div class="support-item">
    <span class="support-icon ${i.color}">${i.icon}</span>
    <div><strong>${i.msg}</strong><small>${esc(i.name)}</small></div><span>↗</span>
  </div>`).join('') || '<p class="muted-cell">Every student is on track.</p>';

  $('ct-add-feedback-btn').onclick = () => { showView('view-class-feedback'); renderClassFeedback(); };
  $('ct-open-register-btn').onclick = () => openClassReportModal(cl.id);
  $('ct-full-report-btn').onclick   = () => { showView('view-class-report'); renderClassReport(); };
  renderClassApprovals(cl);
}

// ── Class approvals ───────────────────────────────────────────
export function renderClassApprovals(cl) {
  const currentUser = getCurrentUser();
  const wrap = $('ct-approvals-list');
  if (!wrap) return;
  const mine = new Set(Data.studentsByClass(cl.id).map(s => s.id));
  const rows = Progression.pendingApprovals()
    .filter(a => a.actionType === 'subject_change' && mine.has(String(a.entityId)));
  $('ct-approval-count').textContent = rows.length;

  if (!rows.length) {
    wrap.innerHTML = '<p class="muted-cell">No pending subject change requests for your class.</p>';
    return;
  }

  wrap.innerHTML = rows.map(a => {
    const st    = Data.student(a.entityId);
    const ids   = Array.isArray(a.payload?.subjectIds) ? a.payload.subjectIds : [];
    const names = ids.length ? ids.map(id => Data.subject(String(id))?.name || id).join(', ')
                             : (a.payload?.summary || 'Requested a change');
    return `<div class="approval-row">
      <span class="student"><span class="student-avatar ${st ? toneClass(st.tone) : 'blue'}">${st ? st.initials : '?'}</span></span>
      <div style="flex:1">
        <strong class="twelve">${esc(st?.name || 'Student ' + a.entityId)}</strong>
        <span class="approval-sub">${esc(names)}</span>
      </div>
      <span class="status review">Pending</span>
      <span class="approval-actions">
        <button class="btn-sm-save" data-approve="${a.id}">Approve</button>
        <button class="btn-sm-outline" data-reject="${a.id}" title="Reject">Reject</button>
      </span>
    </div>`;
  }).join('');

  $all('[data-approve]').forEach(b => b.addEventListener('click', async () => {
    const a = rows.find(r => r.id === b.dataset.approve);
    if (!a) return;
    const ids = Array.isArray(a.payload?.subjectIds) ? a.payload.subjectIds : [];
    await Progression.chooseSubjects(a.entityId, ids, { status: 'effective', userId: currentUser.id });
    await Progression.decideApproval(a.id, true, currentUser.id, 'Approved by class teacher');
    toast(`${Data.student(a.entityId)?.name.split(' ')[0] || 'Student'}'s subjects are now effective. ✓`);
    renderClassApprovals(cl);
  }));
  $all('[data-reject]').forEach(b => b.addEventListener('click', async () => {
    const a = rows.find(r => r.id === b.dataset.reject);
    if (!a) return;
    const prev = Array.isArray(a.payload?.previous) ? a.payload.previous : [];
    await Progression.chooseSubjects(a.entityId, prev, { status: 'effective', userId: currentUser.id });
    await Progression.decideApproval(a.id, false, currentUser.id, 'Declined by class teacher');
    toast('Change request declined; previous subjects kept.');
    renderClassApprovals(cl);
  }));
}

// ── Class report ──────────────────────────────────────────────
export function renderClassReport() {
  const currentUser = getCurrentUser();
  const cl = myClassRecord(currentUser);
  if (!cl) { toast('You are not assigned a class yet.', 'error'); return; }
  const termSel = $('cr-term');
  termSel.innerHTML = Data.session().terms.map(t =>
    `<option value="${t.term}" ${t.term === currentTerm() ? 'selected' : ''}>${esc(t.name)}</option>`).join('');

  function draw() {
    const term   = +termSel.value;
    const report = Academic.classReport(cl.id, term);
    const subjects = report.subjects;

    $('cr-eyebrow').textContent = `Class report · ${cl.name} · Term ${term}`;
    $('cr-title').textContent   = `${cl.name} — all subjects`;
    $('cr-meta').textContent    = `${report.students.length} students · ${subjects.length} subjects`;
    $('cr-class-average').textContent = Academic.classAverage(cl.id, term) + '%';
    $('cr-promoted').textContent      = `${report.students.filter(s => s.status === 'Promoted').length}/${report.students.length}`;

    $('cr-report-table').innerHTML = subjects.length && report.students.length
      ? `<table><thead><tr><th>Student</th>${subjects.map(s =>
          `<th class="cr-sub-head" title="${esc(s.name)}">${subjectChip(s)}</th>`).join('')}<th>Avg</th><th>Status</th><th></th></tr></thead><tbody>` +
        report.students.map(row => `<tr>
          <td><div class="student"><span class="student-avatar ${toneClass(row.student.tone)}">${row.student.initials}</span>${esc(row.student.name)}</div></td>
          ${row.rows.map(r => `<td class="cr-cell ${r.score === null ? 'cr-empty' : ''}">${
            r.score === null ? '—' :
            `<span class="${r.score >= passMark() ? 'cr-pass' : 'cr-fail'}">${r.score}</span>`}</td>`).join('')}
          <td><strong>${row.average}%</strong></td>
          <td><span class="status ${statusClass(row.status)}">${row.status}</span></td>
          <td><button class="btn-sm-save" data-cr-student="${row.student.id}">Detail</button></td>
        </tr>`).join('') + '</tbody></table>'
      : '<p class="muted-cell" style="padding:16px">No students or subjects mapped to this class yet.</p>';

    $('cr-subject-summary').innerHTML = subjects.map(sub => {
      const a = Academic.subjectAnalytics(cl.id, sub.id, term);
      const pass = report.students.filter(r => (r.rows.find(x => x.subjectId === sub.id)?.score ?? 0) >= passMark()).length;
      const rate = a.count ? Math.round(pass / a.count * 100) : 0;
      return `<div class="role-table-row cr-sum-row">
        <span class="student">${subjectChip(sub)}${esc(sub.name)}</span>
        <strong>${a.avg}%</strong>
        <span class="muted-cell">max ${a.max} · min ${a.min}</span>
        <span class="status ${rate >= 70 ? 'promoted' : rate >= 50 ? 'review' : 'repeat'}">${rate}%</span>
      </div>`;
    }).join('');

    $all('[data-cr-student]').forEach(btn => btn.addEventListener('click', () => {
      openStudentReport(btn.dataset.crStudent, term);
    }));
  }

  termSel.onchange = draw;
  $('cr-download-btn').onclick = () => {
    const term   = +termSel.value;
    const report = Academic.classReport(cl.id, term);
    const summaryRows = [
      [`${cl.name} — full class report · Term ${term}`],
      ['Admission No', 'Student', ...report.subjects.map(s => s.name), 'Average', 'Status']
    ];
    report.students.forEach(r => {
      summaryRows.push([r.student.admissionNo || '', r.student.name, ...r.rows.map(x => x.score ?? ''), r.average, r.status]);
    });
    const sheets = [{ name: 'Summary', rows: summaryRows }];
    report.subjects.forEach(sub => {
      const subRows = [
        [`${cl.name} · ${sub.name} · Term ${term}`],
        ['Admission No', 'Student', 'CA (40)', 'Exam (60)', 'Total', 'Grade', 'Status']
      ];
      report.students.forEach(r => {
        const sc = r.rows.find(x => x.subjectId === sub.id);
        const total = sc?.score ?? null;
        subRows.push([r.student.admissionNo || '', r.student.name,
          sc?.ca ?? '', sc?.exam ?? '', total ?? '',
          total !== null ? gradeLabel(total) : '',
          total === null ? '' : total >= passMark() ? 'Pass' : 'Fail']);
      });
      sheets.push({ name: sub.code.slice(0, 31), rows: subRows });
    });
    downloadXlsxMulti(`class_report_${cl.name.replace(/\s+/g, '_')}_term${term}.xlsx`, sheets);
  };
  $('cr-register-btn').onclick = () => openClassReportModal(cl.id);
  $('cr-feedback-btn').onclick = () => { showView('view-class-feedback'); renderClassFeedback(); };
  draw();
}

// ── Attendance ────────────────────────────────────────────────
const ATT_DAYS     = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const ATT_DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export function renderClassAttendance(focusSid = null) {
  const currentUser = getCurrentUser();
  const cl = myClassRecord(currentUser);
  if (!cl) { toast('You are not assigned a class yet.', 'error'); return; }

  const students = Data.studentsByClass(cl.id).filter(s => s.status !== 'archived');
  const term     = currentTerm();
  const att      = Data.attendance(term);

  $('att-page-title').textContent  = `${cl.name} · Attendance`;
  $('att-class-name').textContent  = `${cl.name} · Term ${term}`;

  const normDay = arr => Array.from({ length: 5 }, (_, i) => (arr && arr[i]) || '');
  const draft   = {};
  const daily   = Data.dailyAttendance(term);
  students.forEach(s => {
    draft[s.id] = {};
    [1, 2, 3, 4].forEach(w => {
      draft[s.id][w] = normDay(daily[`W${w}`]?.[String(s.id)]);
    });
  });

  const isPresent = st => st === 'present' || st === 'late';

  function refreshStats() {
    const pcts  = students.map(s => parseInt(Academic.attendancePct(s.id, term), 10) || 0);
    const avg   = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
    const risk  = pcts.filter(p => p < 75).length;

    const w = +$('ct-day-week').value, d = +$('ct-day-of-week').value;
    const presentToday = students.filter(s => isPresent(draft[s.id][w][d])).length;
    const lateThisWeek = students.reduce((n, s) =>
      n + draft[s.id][w].filter(st => st === 'late').length, 0);

    $('att-stat-pct').textContent     = avg + '%';
    $('att-stat-sub').textContent     = avg >= 90 ? 'Excellent' : avg >= 75 ? 'Good' : 'Needs attention';
    $('att-stat-present').textContent = `${presentToday}/${students.length}`;
    $('att-stat-date').textContent    = `${ATT_DAYS_FULL[d]}, Week ${w}`;
    $('att-stat-late').textContent    = lateThisWeek;
    $('att-stat-risk').textContent    = risk;
  }

  function refreshCount() {
    const w = +$('ct-day-week').value, d = +$('ct-day-of-week').value;
    const present = students.filter(s => isPresent(draft[s.id][w][d])).length;
    const late    = students.filter(s => draft[s.id][w][d] === 'late').length;
    const absent  = students.filter(s => draft[s.id][w][d] === 'absent').length;
    const unmarked = students.length - present - absent;
    $('ct-day-count').textContent =
      `${present} present${late ? ` (${late} late)` : ''} · ${absent} absent` +
      (unmarked ? ` · ${unmarked} not marked` : '');
  }

  function termHeatmap(sid) {
    return [1, 2, 3, 4].map(w => {
      const row = draft[sid][w].map((st, d) => {
        const cls = st === 'present' ? 'present' : st === 'late' ? 'late' : st === 'absent' ? 'absent' : 'off';
        return `<span class="att-day ${cls}" title="W${w} ${ATT_DAYS[d]}: ${st || 'not marked'}">${ATT_DAYS[d][0]}</span>`;
      }).join('');
      return `<span class="att-week-group" title="Week ${w}">${row}</span>`;
    }).join('');
  }

  function drawDay() {
    const w = +$('ct-day-week').value, d = +$('ct-day-of-week').value;
    $('ct-daily-title').textContent = `${ATT_DAYS_FULL[d]}, Week ${w}`;

    $('ct-daily-list').innerHTML = students.map(s => {
      const st  = draft[s.id][w][d] || '';
      const pct = Academic.attendancePct(s.id, term);
      return `<tr class="${s.id === focusSid ? 'att-focused' : ''}">
        <td>
          <div class="student">
            <span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>
            <span>${esc(s.name)}</span>
          </div>
          <small class="muted-cell" style="padding-left:32px;display:block;margin-top:2px">
            <span class="status ${parseInt(pct,10) >= 90 ? 'promoted' : parseInt(pct,10) >= 75 ? 'review' : 'repeat'}" style="font-size:9px">${pct}</span>
          </small>
        </td>
        <td class="att-status-cell">
          <div class="att-3state">
            <button class="att-state-btn ${st === 'present' ? 'active-present' : ''}"
              data-sid="${s.id}" data-status="present">✓ Present</button>
            <button class="att-state-btn ${st === 'late'    ? 'active-late'    : ''}"
              data-sid="${s.id}" data-status="late">⏱ Late</button>
            <button class="att-state-btn ${st === 'absent'  ? 'active-absent'  : ''}"
              data-sid="${s.id}" data-status="absent">✗ Absent</button>
          </div>
        </td>
        <td class="att-term-col">
          <div class="att-heatmap">${termHeatmap(s.id)}</div>
        </td>
      </tr>`;
    }).join('');

    refreshCount();
    refreshStats();

    $all('#ct-daily-list .att-state-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.sid;
        const status = btn.dataset.status;
        const w = +$('ct-day-week').value, d = +$('ct-day-of-week').value;
        draft[sid][w][d] = draft[sid][w][d] === status ? '' : status;
        drawDay();
      });
    });
  }

  $('ct-day-week').onchange     = drawDay;
  $('ct-day-of-week').onchange  = drawDay;
  $('ct-day-week').value        = 1;
  $('ct-day-of-week').value     = 0;

  $('ct-all-present').onclick = () => {
    const w = +$('ct-day-week').value, d = +$('ct-day-of-week').value;
    students.forEach(s => { draft[s.id][w][d] = 'present'; });
    drawDay();
  };
  $('ct-all-absent').onclick = () => {
    const w = +$('ct-day-week').value, d = +$('ct-day-of-week').value;
    students.forEach(s => { draft[s.id][w][d] = 'absent'; });
    drawDay();
  };

  $('ct-save-day').onclick = async () => {
    const w = +$('ct-day-week').value, d = +$('ct-day-of-week').value;
    const marks = {};
    students.forEach(s => {
      const st = draft[s.id][w][d];
      marks[s.id] = st || 'absent';
    });
    await Data.saveDailyDay(w, d, marks, term);
    toast(`Register saved · ${ATT_DAYS_FULL[d]}, Week ${w}.`);
    drawWeekly();
    refreshStats();
  };

  function drawWeekly() {
    $('ct-attendance-table').innerHTML = students.map(s => {
      const saved  = Data.studentAttendance(s.id, term);
      const total  = Object.values(saved).reduce((a, b) => a + b, 0);
      const pct    = Academic.attendancePct(s.id, term);
      const pctNum = parseInt(pct, 10) || 0;
      const rowCls = s.id === focusSid ? 'att-focused' : '';

      const cells = ['W1', 'W2', 'W3', 'W4'].map(wk =>
        `<td class="muted-cell" style="text-align:center">${saved[wk] ?? '—'}</td>`
      ).join('');

      return `<tr class="${rowCls}">
        <td>
          <div class="student">
            <span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>
            ${esc(s.name)}
          </div>
        </td>
        ${cells}
        <td style="text-align:center"><strong>${total}</strong></td>
        <td><span class="status ${pctNum >= 90 ? 'promoted' : pctNum >= 75 ? 'review' : 'repeat'}">${pct}</span></td>
      </tr>`;
    }).join('');
  }

  drawDay();
  drawWeekly();
}

// ── Feedback ──────────────────────────────────────────────────
export function renderClassFeedback() {
  const currentUser = getCurrentUser();
  const cl = myClassRecord(currentUser);
  if (!cl) { toast('You are not assigned a class yet.', 'error'); return; }
  const students = Data.studentsByClass(cl.id).filter(s => s.status !== 'archived');
  const fb       = Data.feedback();

  $('ct-feedback-list').innerHTML = students.map(s => {
    const existing  = fb[s.id]?.text || '';
    const submitted = fb[s.id]?.submitted || false;
    return `<article class="panel feedback-card">
      <div class="feedback-student">
        <span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>
        <div><strong>${esc(s.name)}</strong><small>${esc(Data.cls(s.classId)?.name || '')}</small></div>
        <span class="status ${submitted ? 'promoted' : 'review'} ml-auto">${submitted ? 'Submitted' : 'Pending'}</span>
      </div>
      <textarea class="feedback-textarea" data-student-fb="${s.id}" rows="3"
        placeholder="Write end-of-term remarks for ${esc(s.name.split(' ')[0])}…">${esc(existing)}</textarea>
      <button class="btn-primary fb-save-btn" data-save-fb="${s.id}"
        style="width:auto;margin-top:10px;padding:9px 16px">${submitted ? 'Update' : 'Submit'} feedback</button>
    </article>`;
  }).join('');

  $all('[data-save-fb]').forEach(btn => btn.addEventListener('click', async () => {
    const sid  = btn.dataset.saveFb;
    const text = $(`[data-student-fb="${sid}"]`).value.trim();
    if (!text) { toast('Write the feedback first.', 'error'); return; }
    fb[sid] = { term: currentTerm(), text, submitted: true };
    await Data.saveFeedback(fb);
    toast(`Feedback for ${Data.student(sid)?.name} submitted.`);
    renderClassFeedback();
  }));
}

// ── HOD dashboard ─────────────────────────────────────────────
export function renderHODDashboard() {
  const currentUser = getCurrentUser();
  const depts    = myDepartments(currentUser);
  const subjects = depts.length
    ? [...new Set(depts.flatMap(d => d.subjectIds))].map(id => Data.subject(id)).filter(Boolean)
    : Data.subjects();
  const users    = Data.users();
  const teachers = Data.teachers();
  const term     = currentTerm();
  const schoolAvgs = Data.students().map(s => Academic.termAverage(s.id, term)).filter(a => a > 0);
  const schoolAvg  = schoolAvgs.length ? Math.round(schoolAvgs.reduce((a, b) => a + b, 0) / schoolAvgs.length) : 0;

  $('hod-eyebrow').textContent = `Head of Department · ${depts.map(d => d.name).join(', ') || 'no department assigned'}`;
  $('hod-welcome').textContent = `Good morning, ${currentUser.name.split(' ')[0]}.`;

  $('hod-stat-depts').textContent    = depts.length;
  $('hod-stat-subjects').textContent = subjects.length;
  $('hod-stat-teachers').textContent = [...new Set(Data.teacherSubjects().filter(t => subjects.some(s => s.id === t.subjectId)).map(t => t.teacherId))].length;
  $('hod-stat-avg').textContent      = schoolAvg + '%';

  $('hod-dept-list').innerHTML = depts.length ? depts.map(dept => {
    const deptSubs = dept.subjectIds.map(id => Data.subject(id)).filter(Boolean);
    return `<div class="dept-card">
      <div class="dept-card-header">
        <strong>${esc(dept.name)}</strong>
        <span class="read-only-badge">${deptSubs.length} subject${deptSubs.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="dept-subjects">
        ${deptSubs.map(sub => {
          const assignments = Data.teacherSubjects().filter(t => t.subjectId === sub.id);
          const lines = assignments.length
            ? assignments.slice(0, 4).map(a => {
                const teacher = users.find(u => u.id === a.teacherId);
                return `<small class="dept-assign-line">
                    ${subjectChip(sub)}
                    ${esc(Data.cls(a.classId)?.name || '?')} — ${esc(teacher?.name || 'Unassigned')}
                  </small>`;
              }).join('') + (assignments.length > 4 ? `<small class="muted-cell">+${assignments.length - 4} more classes</small>` : '')
            : '<small class="muted-cell">No teacher assigned</small>';
          return `<div class="dept-subject-row">
            ${subjectChip(sub)}
            <div class="dept-sub-info"><strong>${esc(sub.name)}</strong>${lines}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('') : '<p class="muted-cell">You are not recorded as the head of any department.</p>';

  $('hod-dept-subjects').innerHTML = Data.subjects().map(s => `
    <label class="dept-check">
      <input type="checkbox" value="${s.id}" ${subjects.some(d => d.id === s.id) ? 'checked' : ''}>
      <span>${esc(s.code)} · ${esc(s.name)}</span>
    </label>`).join('');
  $('hod-save-dept-btn').onclick = async () => {
    const chosen = [...$all('#hod-dept-subjects input:checked')].map(i => i.value);
    const target = depts[0];
    if (!target) { toast('You are not the head of any department.', 'error'); return; }
    target.subjectIds = chosen;
    await Data.saveDepartments(Data.departments());
    toast(`${target.name} now covers ${chosen.length} subjects.`);
    renderHODDashboard();
  };

  $('hod-assign-teacher').innerHTML = teachers.map(t => `<option value="${t.id}">${esc(t.name)} — ${esc(t.role)}</option>`).join('');
  $('hod-assign-subject').innerHTML = subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('hod-assign-class').innerHTML = Data.classes().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

  $('hod-assign-btn').onclick = async () => {
    const teacherId = $('hod-assign-teacher').value;
    const subjectId = $('hod-assign-subject').value;
    const classId   = $('hod-assign-class').value;
    const existing  = Data.teacherSubjects();
    const dup       = existing.find(t => t.subjectId === subjectId && t.classId === classId);
    if (dup) dup.teacherId = teacherId;
    else existing.push({ teacherId, subjectId, classId });
    await Data.saveTeacherSubjects(existing);
    $('hod-assign-feedback').textContent = `✓ ${Data.user(teacherId)?.name} assigned to ${Data.subject(subjectId)?.name} (${Data.cls(classId)?.name})`;
    $('hod-assign-feedback').className   = 'form-feedback success mt8';
    toast(`${Data.user(teacherId)?.name} → ${Data.subject(subjectId)?.name} · ${Data.cls(classId)?.name}`);
    renderHODDashboard();
  };

  $('hod-analytics-table').innerHTML = subjects.map(sub => {
    const classes = [...new Set(Data.teacherSubjects().filter(t => t.subjectId === sub.id).map(t => t.classId))];
    let scores = [];
    classes.forEach(cid => Data.studentsByClass(cid).forEach(s => {
      const v = Academic.subjectScore(s.id, sub.id, term);
      if (v !== null) scores.push(v);
    }));
    if (!scores.length) {
      return `<tr><td><div class="student">${subjectChip(sub)}${esc(sub.name)}</div></td>
        <td class="muted-cell">—</td><td>0</td><td>—</td><td>—</td><td>—</td></tr>`;
    }
    const avg  = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const pass = scores.filter(v => v >= passMark()).length;
    const rate = Math.round(pass / scores.length * 100);
    return `<tr>
      <td><div class="student">${subjectChip(sub)}${esc(sub.name)}</div></td>
      <td>${classes.length} class${classes.length !== 1 ? 'es' : ''}</td>
      <td><strong>${avg}%</strong></td>
      <td>${Math.max(...scores)}%</td>
      <td>${Math.min(...scores)}%</td>
      <td><span class="status ${rate >= 70 ? 'promoted' : rate >= 50 ? 'review' : 'repeat'}">${rate}%</span></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="muted-cell">No subjects in your department.</td></tr>';

  renderHODReport();
}

export function renderHODReport() {
  const currentUser = getCurrentUser();
  const depts    = myDepartments(currentUser);
  const deptSubs = depts.flatMap(d => d.subjectIds).map(id => Data.subject(id)).filter(Boolean);
  const subjects = deptSubs.length ? deptSubs : Data.subjects();
  const classSel = $('hod-report-class');
  classSel.innerHTML = '<option value="">All classes</option>' +
    Data.classes().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

  function draw() {
    const term    = currentTerm();
    const classId = classSel.value;
    const classes = classId ? [Data.cls(classId)] : Data.classes();
    const rows    = [];

    classes.forEach(cl => {
      if (!cl) return;
      const offered = subjects.filter(s => {
        const inLevel = !cl.level || s.level === 'BOTH' || s.level === cl.level;
        const inGroup = !cl.stream || s.group === 'General' || s.group === cl.stream;
        return inLevel && inGroup;
      });
      Data.studentsByClass(cl.id).forEach(s => {
        const scores = Academic.termScores(s.id, term).filter(r => offered.some(o => o.id === r.subjectId));
        const withScore = scores.filter(r => r.score !== null);
        rows.push({
          student: s, cls: cl, scores,
          average: withScore.length ? Math.round(withScore.reduce((a, r) => a + r.score, 0) / withScore.length) : 0
        });
      });
    });

    $('hod-report-meta').textContent =
      `${depts.map(d => d.name).join(', ') || 'All subjects'} · ${classes.length} class${classes.length !== 1 ? 'es' : ''} · Term ${term}`;
    $('hod-report-table').innerHTML = rows.length
      ? `<table><thead><tr><th>Student</th><th>Class</th>${subjects.slice(0, 12).map(s =>
          `<th title="${esc(s.name)}">${esc(s.code)}</th>`).join('')}<th>Avg</th></tr></thead><tbody>` +
        rows.map(r => `<tr>
          <td><div class="student"><span class="student-avatar ${toneClass(r.student.tone)}">${r.student.initials}</span>${esc(r.student.name)}</div></td>
          <td class="muted-cell">${esc(r.cls.name)}</td>
          ${subjects.slice(0, 12).map(s => {
            const cell = r.scores.find(x => x.subjectId === s.id);
            return `<td class="cr-cell ${cell?.score === null || !cell ? 'cr-empty' : ''}">${
              !cell || cell.score === null ? '—'
              : `<span class="${cell.score >= passMark() ? 'cr-pass' : 'cr-fail'}">${cell.score}</span>`}</td>`;
          }).join('')}
          <td><strong>${r.average}%</strong></td>
        </tr>`).join('') + '</tbody></table>'
      : '<p class="muted-cell" style="padding:16px">No students in the selected classes.</p>';
  }
  classSel.onchange = draw;
  draw();
}

// ── LMS: teacher combos ───────────────────────────────────────
export function teacherCombos(user) {
  const allocs = (Data.teacherSubjects() || []).filter(ts => String(ts.teacherId) === String(user?.id));
  return allocs
    .map(ts => ({ subject: Data.subject(ts.subjectId), class: Data.cls(ts.classId) }))
    .filter(c => c.subject && c.class);
}

export function fillComboSelect(sel, combos) {
  if (!sel) return;
  sel.innerHTML = combos.length
    ? combos.map(co => `<option value="${co.subject.id}|${co.class.id}">${esc(co.subject.name)} · ${esc(co.class.name)}</option>`).join('')
    : '<option value="">No subject / class allocated</option>';
}

export function comboSplit(value) {
  const [subjectId, classId] = String(value || '').split('|');
  return { subjectId, classId };
}

// ── LMS: Lessons ──────────────────────────────────────────────
export function renderTeacherLessons() {
  const currentUser = getCurrentUser();
  const user  = currentUser;
  const combos = teacherCombos(user);
  fillComboSelect($('ls-pick'), combos);
  const msg = $('ls-msg'); if (msg) msg.hidden = true;
  $('ls-count').textContent = combos.filter(co => Data.lessonsFor(co.class.id, co.subject.id).length).length;

  $('ls-submit').onclick = async () => {
    const title   = $('ls-title').value.trim();
    const content = $('ls-content').value.trim();
    if (!title || !content) {
      _message(msg, 'Title and lesson content are required.', 'error'); return;
    }
    const { subjectId, classId } = comboSplit($('ls-pick')?.value);
    if (!subjectId || !classId) {
      _message(msg, 'Pick the subject and class first.', 'error'); return;
    }
    await Data.addLesson({ subjectId, classId, title, content }, user.id);
    $('ls-title').value = ''; $('ls-content').value = '';
    _message(msg, 'Lesson published.', 'success');
    renderTeacherLessons();
  };
  renderLessonsTable();
}

export function renderLessonsTable() {
  const currentUser = getCurrentUser();
  const mine = (Data.lmsLessons() || []).filter(l => l.teacherId === currentUser.id);
  $('ls-count').textContent = mine.length;
  const list = $('ls-list');
  list.innerHTML = mine.length
    ? `<div class="table-wrap"><table><thead><tr><th>Subject</th><th>Class</th><th>Title</th><th class="muted-cell">Posted</th><th></th></tr></thead>` +
      `<tbody>${mine.map(l => `
        <tr>
          <td>${esc(Data.subject(l.subjectId)?.name || '—')}</td>
          <td>${esc(Data.classNameOf(l.classId))}</td>
          <td>${esc(l.title)}</td>
          <td class="muted-cell">${formatDate(l.createdAt)}</td>
          <td><div class="table-actions">
            <button class="text-button" data-ls-view="${l.id}">View</button>
            <button class="text-button" data-ls-del="${l.id}">Delete</button>
          </div></td>
        </tr>`).join('')}</tbody></table></div>`
    : '<p class="muted-cell">No lessons published yet.</p>';

  $all('[data-ls-view]').forEach(b => b.onclick = () => {
    const lesson = (Data.lmsLessons() || []).find(x => String(x.id) === String(b.dataset.lsView));
    const box = $('ls-detail'); if (!lesson || !box) return;
    box.innerHTML = `<div class="panel">
      <div class="panel-heading"><div>
        <p class="eyebrow">${esc(Data.subject(lesson.subjectId)?.name || '')} · ${esc(Data.classNameOf(lesson.classId))} · ${esc(Data.user(lesson.teacherId)?.name || '')} · ${formatDate(lesson.createdAt)}</p>
        <h2>${esc(lesson.title)}</h2>
      </div></div>
      <div class="ls-body">${esc(lesson.content)}</div>
    </div>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $all('[data-ls-del]').forEach(b => b.onclick = async () => {
    await Data.deleteLesson(b.dataset.lsDel, currentUser.id);
    toast('Lesson deleted.');
    renderTeacherLessons();
  });
}

// ── LMS: Quizzes ──────────────────────────────────────────────
export function renderTeacherQuizzes() {
  const currentUser = getCurrentUser();
  const user = currentUser;
  fillComboSelect($('qz-pick'), teacherCombos(user));
  const msg = $('qz-msg'); if (msg) msg.hidden = true;

  $('qz-create').onclick = async () => {
    const title = $('qz-title').value.trim();
    if (!title) { _message(msg, 'A title is required.', 'error'); return; }
    const { subjectId, classId } = comboSplit($('qz-pick')?.value);
    if (!subjectId || !classId) {
      _message(msg, 'Pick the subject and class first.', 'error'); return;
    }
    await Data.createQuiz({ subjectId, classId, title, description: $('qz-desc').value.trim() }, user.id);
    $('qz-title').value = ''; $('qz-desc').value = '';
    _message(msg, 'Quiz created. Add questions below.', 'success');
    renderTeacherQuizzes();
  };
  renderQuizList();
}

export function renderQuizList() {
  const currentUser = getCurrentUser();
  const mine = (Data.lmsQuizzes() || []).filter(q => q.teacherId === currentUser.id);
  if ($('qz-count')) $('qz-count').textContent = mine.length;
  const list = $('qz-list');
  list.innerHTML = mine.length
    ? `<div class="table-wrap"><table><thead><tr><th>Subject</th><th>Class</th><th>Title</th><th class="muted-cell">Qns</th><th>Status</th><th></th></tr></thead>` +
      `<tbody>${mine.map(q => `
        <tr>
          <td>${esc(Data.subject(q.subjectId)?.name || '—')}</td>
          <td>${esc(Data.classNameOf(q.classId))}</td>
          <td>${esc(q.title)}${q.description ? `<div class="muted-cell" style="font-size:10px;margin-top:2px">${esc(q.description)}</div>` : ''}</td>
          <td class="muted-cell">${Data.questionsForQuiz(q.id).length}</td>
          <td><span class="status ${q.isPublished ? 'promoted' : 'review'}">${q.isPublished ? 'Published' : 'Draft'}</span></td>
          <td><div class="table-actions">
            <button class="text-button" data-q-ed="${q.id}">Questions</button>
            <button class="text-button" data-q-pub="${q.id}">${q.isPublished ? 'Unpublish' : 'Publish'}</button>
            <button class="text-button" data-q-res="${q.id}">Results</button>
            <button class="text-button" data-q-del="${q.id}">Delete</button>
          </div></td>
        </tr>`).join('')}</tbody></table></div>`
    : '<p class="muted-cell">No quizzes yet — create one above.</p>';

  $all('[data-q-pub]').forEach(b => b.onclick = async () => {
    const quiz = (Data.lmsQuizzes() || []).find(x => String(x.id) === String(b.dataset.qPub)); if (!quiz) return;
    await Data.setQuizPublished(quiz.id, !quiz.isPublished);
    renderQuizList();
  });
  $all('[data-q-del]').forEach(b => b.onclick = async () => {
    const quiz = (Data.lmsQuizzes() || []).find(x => String(x.id) === String(b.dataset.qDel)); if (!quiz) return;
    await Data.deleteQuiz(quiz.id, currentUser.id);
    toast('Quiz deleted.');
    renderTeacherQuizzes();
  });
  $all('[data-q-ed]').forEach(b => b.onclick = () => {
    const quiz = (Data.lmsQuizzes() || []).find(x => String(x.id) === String(b.dataset.qEd)); if (quiz) openQuizEditor(quiz);
  });
  $all('[data-q-res]').forEach(b => b.onclick = () => {
    const quiz = (Data.lmsQuizzes() || []).find(x => String(x.id) === String(b.dataset.qRes)); if (quiz) openQuizResults(quiz);
  });
}

export function quizQuestionEditorHTML(q = {}) {
  const type = q.questionType === 'tf' ? 'tf' : 'mc';
  const opt  = q.options || {};
  return `<div class="quiz-question" data-qeditor>
    <div class="form-row tight">
      <div class="form-group" style="flex:2"><label>Question</label>
        <input class="q-text" value="${esc(q.questionText || '')}"></div>
      <div class="form-group"><label>Type</label>
        <select class="q-type">
          <option value="mc" ${type === 'mc' ? 'selected' : ''}>Multiple choice</option>
          <option value="tf" ${type === 'tf' ? 'selected' : ''}>True / False</option>
        </select></div>
      <div class="form-group"><label>Points</label>
        <input class="q-points" type="number" min="1" value="${Number(q.points) || 1}"></div>
      <div class="form-group"><button class="text-button" data-remove-q style="margin-top:22px">Remove</button></div>
    </div>
    <div class="form-row tight">
      <div class="form-group"><label>A</label><input class="q-opt" data-opt="A" value="${esc(type === 'tf' ? (opt.A || 'True') : (opt.A || ''))}"></div>
      <div class="form-group"><label>B</label><input class="q-opt" data-opt="B" value="${esc(type === 'tf' ? (opt.B || 'False') : (opt.B || ''))}"></div>
      <div class="form-group"><label>C</label><input class="q-opt" data-opt="C" value="${esc(type === 'tf' ? (opt.C || '') : (opt.C || ''))}"></div>
      <div class="form-group"><label>D</label><input class="q-opt" data-opt="D" value="${esc(type === 'tf' ? (opt.D || '') : (opt.D || ''))}"></div>
    </div>
    <div class="form-group"><label>Correct answer</label>
      <input class="q-correct" value="${esc(q.correctAnswer || '')}" placeholder="e.g. B  —  or  True / False" style="max-width:300px">
    </div>
  </div>`;
}

export function bindQuizEditorEvents() {
  $all('[data-remove-q]').forEach(b => b.onclick = () => {
    const ed = b.closest('[data-qeditor]'); if (ed) ed.remove();
  });
  $all('.q-type').forEach(sel => sel.onchange = () => {
    const ed = sel.closest('[data-qeditor]'); if (!ed) return;
    const tf = sel.value === 'tf';
    ed.querySelector('[data-opt="A"]').value = tf ? 'True' : '';
    ed.querySelector('[data-opt="B"]').value = tf ? 'False' : '';
    ed.querySelector('[data-opt="C"]').value = '';
    ed.querySelector('[data-opt="D"]').value = '';
  });
}

export function openQuizEditor(quiz) {
  const box = $('qz-detail'); if (!box) return;
  const existing = Data.questionsForQuiz(quiz.id);
  box.innerHTML = `<div class="panel">
    <div class="panel-heading"><div>
      <p class="eyebrow">${esc(Data.subject(quiz.subjectId)?.name || '')} · ${esc(Data.classNameOf(quiz.classId))}</p>
      <h2>Questions — ${esc(quiz.title)}</h2>
    </div><span class="read-only-badge">${existing.length} saved</span></div>
    <div id="q-editors" class="mt8">
      ${existing.length ? existing.map(quizQuestionEditorHTML).join('') : quizQuestionEditorHTML()}
    </div>
    <div class="form-row tight mt16">
      <button class="outline-button" id="q-add-more" style="width:auto;margin:0">+ Add another question</button>
      <button class="btn-primary" id="q-save" style="width:auto;margin:0">Save questions</button>
    </div>
    <div id="q-msg" class="form-feedback mt8" hidden></div>
  </div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  bindQuizEditorEvents();
  $('q-add-more').onclick = () => {
    $('q-editors').insertAdjacentHTML('beforeend', quizQuestionEditorHTML());
    bindQuizEditorEvents();
  };
  $('q-save').onclick = async () => {
    const questions = [...$all('[data-qeditor]')].map(ed => ({
      questionText:  ed.querySelector('.q-text').value.trim(),
      questionType:  ed.querySelector('.q-type').value,
      options: {
        A: ed.querySelector('[data-opt="A"]').value.trim(),
        B: ed.querySelector('[data-opt="B"]').value.trim(),
        C: ed.querySelector('[data-opt="C"]').value.trim(),
        D: ed.querySelector('[data-opt="D"]').value.trim()
      },
      correctAnswer: ed.querySelector('.q-correct').value.trim(),
      points:        Number(ed.querySelector('.q-points').value) || 1
    })).filter(qd => qd.questionText);
    const msg = $('q-msg');
    if (!questions.length) { _message(msg, 'Add at least one question with text.', 'error'); return; }
    await Data.saveQuizQuestions(quiz.id, questions);
    _message(msg, 'Questions saved.', 'success');
    renderQuizList();
    openQuizEditor(quiz);
  };
}

export function openQuizResults(quiz) {
  const box = $('qz-detail'); if (!box) return;
  const students = (Data.studentsByClass(quiz.classId) || []).filter(s => s.status === 'active');
  const rows = students.map(s => {
    const attempt = Data.attemptFor(quiz.id, s.id);
    return `<tr>
      <td><div class="student"><span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>${esc(s.name)}</div></td>
      <td class="muted-cell">${esc(s.admissionNo || s.id)}</td>
      <td>${attempt ? `<strong>${attempt.score} / ${attempt.total}</strong>` : '<span class="muted-cell">Not attempted</span>'}</td>
      <td class="muted-cell">${attempt?.submittedAt ? formatDate(attempt.submittedAt) : '—'}</td>
    </tr>`;
  }).join('');
  box.innerHTML = `<div class="panel">
    <div class="panel-heading"><div>
      <p class="eyebrow">${esc(Data.subject(quiz.subjectId)?.name || '')} · ${esc(Data.classNameOf(quiz.classId))}</p>
      <h2>Results — ${esc(quiz.title)}</h2>
    </div></div>
    <div class="table-wrap mt16"><table><thead><tr><th>Student</th><th>Admission No.</th><th>Score</th><th>Submitted</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="muted-cell">No active students in this class.</td></tr>'}</tbody></table></div>
  </div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── LMS: Discussions ──────────────────────────────────────────
export function renderTeacherDiscussions() {
  const currentUser = getCurrentUser();
  const user = currentUser;
  fillComboSelect($('td-pick'), teacherCombos(user));
  const msg = $('td-msg'); if (msg) msg.hidden = true;

  $('td-open').onclick = async () => {
    const title = $('td-title').value.trim();
    if (!title) { _message(msg, 'A topic is required.', 'error'); return; }
    const { subjectId, classId } = comboSplit($('td-pick')?.value);
    if (!subjectId || !classId) {
      _message(msg, 'Pick the subject and class first.', 'error'); return;
    }
    await Data.openDiscussion({ subjectId, classId, title, body: $('td-body').value.trim() }, user.id);
    $('td-title').value = ''; $('td-body').value = '';
    _message(msg, 'Discussion opened.', 'success');
    renderTeacherDiscussions();
  };
  renderDiscussionsTable();
}

export function renderDiscussionsTable() {
  const currentUser = getCurrentUser();
  const mine = (Data.lmsDiscussions() || []).filter(d => String(d.teacherId) === String(currentUser.id));
  const list = $('td-list');
  list.innerHTML = mine.length
    ? `<div class="table-wrap"><table><thead><tr><th>Subject</th><th>Class</th><th>Topic</th><th class="muted-cell">Replies</th><th></th></tr></thead>` +
      `<tbody>${mine.map(d => `
        <tr>
          <td>${esc(Data.subject(d.subjectId)?.name || '—')}</td>
          <td>${esc(Data.classNameOf(d.classId))}</td>
          <td>${esc(d.title)}</td>
          <td class="muted-cell">${Data.postsFor(d.id).length}</td>
          <td><div class="table-actions">
            <button class="text-button" data-tt-open="${d.id}">View</button>
            <button class="text-button" data-tt-del="${d.id}">Delete</button>
          </div></td>
        </tr>`).join('')}</tbody></table></div>`
    : '<p class="muted-cell">No discussions opened yet.</p>';

  $all('[data-tt-open]').forEach(b => b.onclick = () => renderThread(b.dataset.ttOpen, 'td-thread'));
  $all('[data-tt-del]').forEach(b => b.onclick = async () => {
    await Data.deleteDiscussion(b.dataset.ttDel, currentUser.id);
    toast('Discussion deleted.');
    renderTeacherDiscussions();
  });
}

export function renderThread(discussionId, containerId) {
  const currentUser = getCurrentUser();
  const box = $(containerId); if (!box) return;
  const discussion = (Data.lmsDiscussions() || []).find(x => String(x.id) === String(discussionId));
  if (!discussion) { box.innerHTML = ''; return; }
  const posts = Data.postsFor(discussion.id);
  const opening = `<div class="thread-card">
    <p class="muted-cell">${esc(Data.subject(discussion.subjectId)?.name || '')} · ${esc(Data.classNameOf(discussion.classId))} · opened by ${esc(Data.user(discussion.teacherId)?.name || '—')} · ${formatDate(discussion.createdAt)}</p>
    <strong>${esc(discussion.title)}</strong>
    ${discussion.body ? `<p style="white-space:pre-wrap;margin:8px 0 0">${esc(discussion.body)}</p>` : ''}
  </div>`;
  const replies = posts.map(post => {
    const author = Data.user(post.userId);
    const role = author && isTeacher(author) ? 'Teacher' : isAdmin(author) ? 'Administrator' : 'Student';
    return `<div class="thread-card">
      <p class="muted-cell" style="margin:0 0 4px"><strong>${esc(author?.name || '—')}</strong> · ${role} · ${formatDate(post.createdAt)}</p>
      <p style="white-space:pre-wrap;margin:0">${esc(post.body)}</p>
    </div>`;
  }).join('');
  box.innerHTML = `<div class="panel">
    <div class="panel-heading"><div><p class="eyebrow">Discussion</p><h2>${esc(discussion.title)}</h2></div></div>
    ${opening}
    ${replies || '<p class="muted-cell">No replies yet — start the conversation.</p>'}
    <div class="form-group mt16"><label for="reply-text">Your reply</label>
      <textarea id="reply-text" rows="2" placeholder="Share your thoughts…"></textarea></div>
    <button class="btn-primary" id="reply-post" style="width:auto;margin:0">Reply</button>
    <div id="reply-msg" class="form-feedback mt8" hidden></div>
  </div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  $('reply-post').onclick = async () => {
    const body = $('reply-text').value.trim();
    if (!body) return;
    await Data.addDiscussionPost(discussion.id, currentUser.id, body);
    renderThread(discussionId, containerId);
  };
}

// ── Internal helper ───────────────────────────────────────────
function _message(el, text, kind) {
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  el.className = kind === 'error' ? 'form-feedback mt8 text-danger' : 'form-feedback mt8 success';
}
