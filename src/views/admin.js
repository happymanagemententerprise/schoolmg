// ============================================================
//  Happy Man Academy — Administrator views
// ============================================================

import { Data, Academic, Progression, Timetable, Growth } from '../data/index.js';
import { getCurrentUser } from '../state.js';
import {
  _prRows, set_prRows, getSensitiveRun, set_sensitiveRun,
  _placementId, set_placementId, _editingUserId, set_editingUserId,
  _resetUserId
} from '../state.js';
import {
  $, $q, $all, esc, toast, formatDate, ordinal,
  gradeLabel, toneClass, avatarInitials, levelTag, streamTag,
  subjectChip, statusClass, currentTerm, passMark,
  downloadCsv, downloadXlsx, downloadXlsxMulti,
  classRank, yearRank
} from '../utils.js';
import { openModal, closeModal } from '../modals.js';
import { openDrawer, closeMenus } from '../router.js';
import { isTeacher, isAdmin, isStudent, isParent, isHOD, myClassRecord } from '../auth.js';
import { openStudentReport } from './reports.js';
import { timetableTable, askSensitiveConfirm, openResetPasswordModal, openClassReportModal,
         renderEventsList, termNameOf, resultsLockedNote, xpBar,
         renderStudentGrowth, renderParentGuardian, recordParentLoginIfNew, renderPassport } from './shared.js';
// openMentorModal is loaded dynamically to break the admin ↔ teacher circular import

// ── Admin overview ────────────────────────────────────────────
export function renderAdminOverview() {
  const currentUser = getCurrentUser();
  const sess = Data.session();
  const term = sess.currentTerm;

  $('admin-stat-students').textContent = Data.students().length;
  $('admin-stat-classes').textContent  = Data.classes().length;
  $('admin-stat-staff').textContent    = Data.users().filter(u => isTeacher(u)).length;
  $('admin-stat-subjects').textContent = Data.subjects().length;

  const now = new Date();
  $('admin-date-label').textContent =
    now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) +
    ` · Term ${term}`;
  $('admin-welcome-title').textContent = `Good morning, ${currentUser.name.split(' ')[0]}.`;

  const termBadge = $('admin-term-badge');
  if (termBadge) termBadge.innerHTML = `<span class="live-dot"></span>Term ${term} · Active`;

  $('admin-class-perf-table').innerHTML =
    `<div class="role-table-head"><span>Class</span><span>Students</span><span>Term ${term} avg</span><span>Status</span></div>` +
    Data.classes().map(cl => {
      const avg   = Academic.classAverage(cl.id, term);
      const badge = avg >= 60 ? 'promoted' : avg >= 45 ? 'review' : 'repeat';
      const label = avg >= 60 ? 'On track'  : avg >= 45 ? 'Monitor' : 'At risk';
      return `<div class="role-table-row">
        <span><strong>${esc(cl.name)}</strong> ${streamTag(cl.stream)}</span>
        <span>${Data.studentsByClass(cl.id).length}</span>
        <span><strong>${avg}%</strong></span>
        <span><span class="status ${badge}">${label}</span></span>
      </div>`;
    }).join('');

  renderEventsList('admin-events-list', 4);
  renderAdminStudentTable();
  renderUploadToggles();
  // renderAdminStudentTable is called via Alpine @input on #admin-student-search
  // Expose it on window so the Alpine expression can reference it
  window.renderAdminStudentTable = renderAdminStudentTable;
}

export function renderAdminStudentTable(query = '') {
  const term = currentTerm();
  const q    = query.toLowerCase();
  const list = Data.students().filter(s =>
    s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));

  $('admin-student-table').innerHTML = list.length
    ? list.map(s => {
        const cl     = Data.cls(s.classId);
        const avg    = Academic.termAverage(s.id, term);
        const status = Academic.promotionStatus(s.id, term);
        const cPos   = classRank(s.id, term);
        const yPos   = yearRank(s.id, term);
        const posStr = cPos !== null ? `${ordinal(cPos)}<span class="muted-cell"> (${ordinal(yPos)})</span>` : '—';
        return `<tr>
          <td><div class="student"><span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>${esc(s.name)}</div></td>
          <td>${esc(cl?.name || '—')}</td>
          <td><span class="score">${avg}%</span></td>
          <td class="muted-cell">${Academic.attendancePct(s.id)}</td>
          <td>${posStr}</td>
          <td><span class="status ${statusClass(status)}">${status}</span></td>
          <td>${studentRowMenu(s.id)}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="7" class="muted-cell">No students match.</td></tr>';

  bindStudentRowMenus();
}

export function studentRowMenu(sid) {
  const s = Data.student(sid);
  const archived = !!(s && s.status === 'archived');
  return `<div class="row-menu-wrap">
    <button class="row-menu" data-menu-toggle aria-label="Student actions">•••</button>
    <div class="row-menu-list" hidden>
      <button data-student="${sid}">Open full report</button>
      <button data-student-mentor="${sid}">Assign mentor</button>
      <button data-student-reset="${sid}">Reset password</button>
      <button data-student-archive="${sid}">${archived ? 'Restore student' : 'Archive student'}</button>
    </div>
  </div>`;
}

export function bindStudentRowMenus() {
  const currentUser = getCurrentUser();
  $all('[data-menu-toggle]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const list = btn.nextElementSibling;
    const open = list.hidden;
    closeMenus();
    if (open) list.hidden = false;
  }));
  $all('[data-student]').forEach(btn => btn.addEventListener('click', () => {
    closeMenus(); openStudentReport(btn.dataset.student);
  }));
  $all('[data-student-mentor]').forEach(btn => btn.addEventListener('click', () => {
    closeMenus();
    import('./teacher.js').then(({ openMentorModal }) => openMentorModal(btn.dataset.studentMentor));
  }));
  $all('[data-student-reset]').forEach(btn => btn.addEventListener('click', () => {
    closeMenus(); openResetPasswordModal(btn.dataset.studentReset);
  }));
  $all('[data-student-archive]').forEach(btn => btn.addEventListener('click', () => {
    closeMenus();
    const sid = btn.dataset.studentArchive;
    const s = Data.student(sid);
    const archived = !!(s && s.status === 'archived');
    askSensitiveConfirm(
      archived ? 'Restore student' : 'Archive student',
      archived
        ? `${s.name} will be able to sign in again. Their records stay in the database.`
        : `${s.name} will no longer be able to sign in, but their academic records are kept — you can still open every past report.`,
      async () => {
        await Data.setStudentStatus(sid, archived ? 'active' : 'archived', archived ? null : 'archived', { userId: currentUser.id });
        renderPeopleTab($q('#people-tabs .tab-btn.active')?.dataset.tab || 'staff');
        toast(archived ? `${s.name} restored.` : `${s.name} archived.`);
      });
  }));
}

export function renderUploadToggles() {
  const sess = Data.session();
  $('admin-upload-toggles').innerHTML = ['test','exam'].map(type => `
    <div class="upload-toggle-row">
      <div>
        <strong>${type === 'test' ? 'Continuous assessment (CA)' : 'Exam'} score upload</strong>
        <small>Allows teachers to submit ${type === 'test' ? 'CA (40)' : 'exam (60)'} marks</small>
      </div>
      <button class="toggle-pill ${sess.uploadOpen[type] ? 'on' : ''}" data-upload="${type}">
        ${sess.uploadOpen[type] ? 'Open' : 'Closed'}
      </button>
    </div>`).join('');

  $all('[data-upload]').forEach(btn => btn.addEventListener('click', () => {
    const s = Data.session();
    s.uploadOpen[btn.dataset.upload] = !s.uploadOpen[btn.dataset.upload];
    Data.saveSession(s);
    renderUploadToggles();
    toast(`${btn.dataset.upload === 'test' ? 'CA' : 'Exam'} upload ${s.uploadOpen[btn.dataset.upload] ? 'opened' : 'closed'}.`);
  }));
}

// ── Admin · People ────────────────────────────────────────────
export function renderAdminPeople() {
  // Expose renderPeopleTab globally so Alpine @click can call it
  window.renderPeopleTab = renderPeopleTab;
  bindPeopleTabs();
  renderPeopleTab('staff');

  $('add-user-btn').onclick = () => {
    set_editingUserId(null);
    $('nu-modal-title').textContent = 'Add person';
    $('nu-feedback').textContent = '';
    $('nu-name').value = ''; $('nu-email').value = ''; $('nu-phone').value = '';
    $('nu-password').value = ''; $('nu-admission').value = '';
    $('nu-role').value = 'Subject Teacher';
    $('nu-gender').value = 'M';
    $('nu-class').innerHTML = '<option value="">— Select class —</option>' +
      Data.classes().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    syncPersonForm();
    openModal('add-user-modal');
  };

  $('nu-role').onchange = syncPersonForm;
  $('save-user-btn').onclick = saveUserFromForm;
}

export function syncPersonForm() {
  const role = $('nu-role').value;
  const isParentRole  = role === 'Parent';
  const isStudentRole = role === 'Student';
  const isStaff   = ['Class Teacher', 'Subject Teacher', 'HOD'].includes(role);

  $('nu-phone-group').hidden   = !isParentRole && !isStaff;
  $('nu-phone-required').hidden = !isParentRole;
  $('nu-phone').placeholder    = isParentRole ? 'e.g. 08031234567 (required)' : 'Optional';
  $('nu-class-group').hidden    = !isStudentRole;
  $('nu-gender-group').hidden   = !isStudentRole;
  $('nu-admission-group').hidden = !isStudentRole;
  $('nu-mentor-group').hidden   = !isStudentRole;
  $('nu-mentor-flag-row').hidden = !isStaff;
  $('nu-mentor').innerHTML = '<option value="">— No mentor —</option>' +
    Data.mentors().map(m => `<option value="${m.id}">${esc(m.name)} (${esc(m.role)})</option>`).join('');
}

export async function saveUserFromForm() {
  const currentUser = getCurrentUser();
  const editingUserId = _editingUserId;
  const feedback = $('nu-feedback');
  feedback.textContent = '';
  const name  = $('nu-name').value.trim();
  const email = $('nu-email').value.trim().toLowerCase();
  const role  = $('nu-role').value;
  const pw    = $('nu-password').value.trim();
  const phone = $('nu-phone').value.trim();

  if (!name || !email) {
    feedback.textContent = 'Name and email are required.';
    feedback.className = 'form-feedback error mt8';
    return;
  }
  if (!editingUserId && !pw) {
    feedback.textContent = 'A password is required for a new account.';
    feedback.className = 'form-feedback error mt8';
    return;
  }
  if (pw && pw.length < 6) {
    feedback.textContent = 'Use at least 6 characters for the password.';
    feedback.className = 'form-feedback error mt8';
    return;
  }
  if (role === 'Parent' && !phone) {
    feedback.textContent = 'A phone number is required when adding a parent.';
    feedback.className = 'form-feedback error mt8';
    return;
  }
  if (role === 'Student' && !$('nu-class').value) {
    feedback.textContent = 'Select the class for the student.';
    feedback.className = 'form-feedback error mt8';
    return;
  }
  if (editingUserId) {
    const done = Data.updateUser(editingUserId, { name, phone, role, ...(pw ? { password: pw } : {}) });
    closeModal('add-user-modal');
    toast(`${name} updated.`);
    renderPeopleTab($q('#people-tabs .tab-btn.active')?.dataset.tab || 'staff');
    await done;
    return;
  }
  if (Data.userByEmail(email)) {
    feedback.textContent = 'Email already exists.';
    feedback.className = 'form-feedback error mt8';
    return;
  }

  const pending = role === 'Student'
    ? Data.addStudent({
        name, email, password: pw, phone: phone || null,
        classId: $('nu-class').value, gender: $('nu-gender').value,
        admissionNo: $('nu-admission').value.trim(), mentorId: $('nu-class').value && $('nu-mentor').value
      })
    : Data.addUser({
        name, email, password: pw, phone: phone || null, role,
        initials: avatarInitials(name), tone: 'blue',
        isMentor: role === 'Parent' ? false : $('nu-mentor-flag')?.checked
      });
  closeModal('add-user-modal');
  toast(`${name} added as ${role}.`);
  renderPeopleTab($q('#people-tabs .tab-btn.active')?.dataset.tab || 'staff');

  pending.then(() => {
    if ($('add-user-modal').hidden) {
      renderPeopleTab($q('#people-tabs .tab-btn.active')?.dataset.tab || 'staff');
    }
  });
}

export function bindPeopleTabs() {
  // Active-class management is handled by Alpine @click on #people-tabs.
  // renderPeopleTab is called from the Alpine @click expression via window.renderPeopleTab.
  // This function is kept as a no-op to avoid breaking any existing call sites.
}

function myTeacherSubjectsOf(teacherId) {
  return Data.teacherSubjects().filter(ts => ts.teacherId === String(teacherId));
}

export function renderPeopleTab(tab) {
  const wrap = $('people-table-wrap');
  const term = currentTerm();

  if (tab === 'staff') {
    const staff = Data.users().filter(isTeacher);
    wrap.innerHTML = `<table><thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th><th>Subjects</th><th>ID</th><th></th></tr></thead><tbody>` +
      staff.map(u => {
        const subs = [...new Set(myTeacherSubjectsOf(u.id).map(ts => Data.subject(ts.subjectId)?.code).filter(Boolean))];
        return `<tr>
          <td><div class="student"><span class="student-avatar ${toneClass(u.tone)}">${u.initials}</span>${esc(u.name)}${u.isMentor ? ' <span class="level-tag level-both">Mentor</span>' : ''}</div></td>
          <td><span class="status review">${u.role}</span></td>
          <td class="muted-cell">${esc(u.phone || '—')}</td>
          <td class="muted-cell">${esc(u.email)}</td>
          <td class="muted-cell">${esc(subs.slice(0, 3).join(', ') || '—')}${subs.length > 3 ? ` +${subs.length - 3}` : ''}</td>
          <td class="muted-cell">${u.id}</td>
          <td><button class="btn-sm-save" data-reset-pw="${u.id}">Reset password</button></td>
        </tr>`;
      }).join('') + '</tbody></table>';
    bindResetPasswordButtons();

  } else if (tab === 'students-all') {
    wrap.innerHTML = `<table><thead><tr><th>Name</th><th>Class</th><th>Admission no</th><th>Mentor</th><th>Avg</th><th>Position</th><th>Status</th><th></th></tr></thead><tbody>` +
      Data.students().map(s => {
        const avg    = Academic.termAverage(s.id, term);
        const status = Academic.promotionStatus(s.id, term);
        const mentor = Data.mentor(s.mentorId);
        const rank   = classRank(s.id, term);
        return `<tr>
          <td><div class="student"><span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>${esc(s.name)}${s.status === 'archived' ? ' <span class="status repeat">Archived</span>' : ''}</div></td>
          <td>${esc(Data.cls(s.classId)?.name || '—')}</td>
          <td class="muted-cell">${esc(s.admissionNo || '—')}</td>
          <td class="muted-cell">${esc(mentor?.name || 'No mentor')}</td>
          <td><span class="score">${avg}%</span></td>
          <td class="muted-cell">${rank !== null ? ordinal(rank) : '—'}</td>
          <td><span class="status ${statusClass(status)}">${status}</span></td>
          <td>${studentRowMenu(s.id)}</td>
        </tr>`;
      }).join('') + '</tbody></table>';
    bindStudentRowMenus();

  } else {
    wrap.innerHTML = `<table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Children</th><th></th></tr></thead><tbody>` +
      Data.users().filter(isParent).map(p => `<tr>
        <td><div class="student"><span class="student-avatar ${toneClass(p.tone)}">${p.initials}</span>${esc(p.name)}</div></td>
        <td class="muted-cell">${p.phone ? esc(p.phone) : '<span class="text-danger">No phone</span>'}</td>
        <td class="muted-cell">${esc(p.email)}</td>
        <td class="muted-cell">${esc((p.childIds || []).map(id => Data.student(id)?.name || id).join(', ') || '—')}</td>
        <td><button class="btn-sm-save" data-edit-parent="${p.id}">Edit</button></td>
      </tr>`).join('') + '</tbody></table>';

    $all('[data-edit-parent]').forEach(btn => btn.addEventListener('click', () => {
      const p = Data.user(btn.dataset.editParent);
      set_editingUserId(p.id);
      $('nu-modal-title').textContent = 'Edit person';
      $('nu-feedback').textContent = '';
      $('nu-name').value = p.name;
      $('nu-email').value = p.email;
      $('nu-phone').value = p.phone || '';
      $('nu-password').value = '';
      $('nu-role').value = p.role;
      syncPersonForm();
      openModal('add-user-modal');
    }));
  }
}

// ── Password reset ────────────────────────────────────────────
function bindResetPasswordButtons() {
  $all('[data-reset-pw]').forEach(btn => btn.addEventListener('click', () => {
    openResetPasswordModal(btn.dataset.resetPw);
  }));
}

// openResetPasswordModal is imported from ./shared.js (above)

export function bindResetPasswordModal() {
  $('rp-generate-btn').addEventListener('click', () => {
    const pw = Data.generateTempPassword();
    $('rp-password').value = pw;
    $('rp-confirm').value  = pw;
    $('rp-feedback').textContent = '';
  });
  $('save-reset-btn').addEventListener('click', async () => {
    const currentUser = getCurrentUser();
    const pw1  = $('rp-password').value.trim();
    const pw2  = $('rp-confirm').value.trim();
    const fb   = $('rp-feedback');
    fb.textContent = '';
    if (!pw1) { fb.textContent = 'Enter a new password.';                 fb.className = 'form-feedback error mt8'; return; }
    if (pw1.length < 6) { fb.textContent = 'Use at least 6 characters.'; fb.className = 'form-feedback error mt8'; return; }
    if (pw1 !== pw2) { fb.textContent = 'The passwords do not match.';    fb.className = 'form-feedback error mt8'; return; }
    const target = Data.user(_resetUserId);
    const result = await Data.resetPassword(_resetUserId, pw1, currentUser);
    if (!result) {
      fb.textContent = 'You do not have permission to reset this account.';
      fb.className = 'form-feedback error mt8';
      return;
    }
    closeModal('reset-password-modal');
    toast(`Password reset for ${target?.name || 'that account'}.`);
  });
}

// ── Admin · Classes ───────────────────────────────────────────
export function renderAdminClasses() {
  function draw() {
    $('admin-classes-table').innerHTML = Data.classes().map(cl => {
      const teacher  = Data.user(cl.classTeacherId);
      const count    = Data.studentsByClass(cl.id).length;
      const subjects = Academic.classSubjects(cl.id).length;
      return `<tr>
        <td><strong>${esc(cl.name)}</strong></td>
        <td class="muted-cell">${cl.year ? `Year ${cl.year}` : '—'} ${levelTag(cl.level)}</td>
        <td>${streamTag(cl.stream) || '<span class="muted-cell">—</span>'}</td>
        <td>${teacher ? esc(teacher.name) : '<span class="muted-cell">Unassigned</span>'}</td>
        <td class="muted-cell">${subjects} subjects</td>
        <td>${count} student${count !== 1 ? 's' : ''}</td>
        <td>
          <div class="row-menu-wrap">
            <button class="row-menu" data-menu-toggle aria-label="Class actions">•••</button>
            <div class="row-menu-list" hidden>
              <button data-class-students="${cl.id}">View students</button>
              <button data-class-report="${cl.id}">Full class report</button>
              <button data-class-timetable="${cl.id}">Class timetable</button>
              <button data-class-teacher="${cl.id}">Assign class teacher</button>
            </div>
          </div>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="muted-cell">No classes yet.</td></tr>';

    $all('[data-menu-toggle]').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation();
      const list = btn.nextElementSibling;
      const open = list.hidden;
      closeMenus();
      if (open) list.hidden = false;
    }));
    $all('[data-class-students]').forEach(btn => btn.addEventListener('click', () => {
      closeMenus(); openClassStudentsModal(btn.dataset.classStudents);
    }));
    $all('[data-class-report]').forEach(btn => btn.addEventListener('click', () => {
      closeMenus(); openClassReportModal(btn.dataset.classReport);
    }));
    $all('[data-class-timetable]').forEach(btn => btn.addEventListener('click', () => {
      closeMenus();
      import('../router.js').then(({ showView, renderView }) => {
        showView('view-admin-timetable');
        renderAdminTimetable(btn.dataset.classTimetable);
      });
    }));
    $all('[data-class-teacher]').forEach(btn => btn.addEventListener('click', () => {
      closeMenus(); openClassTeacherModal(btn.dataset.classTeacher);
    }));
  }

  draw();
  $('add-class-btn').onclick = () => {
    $('nc-feedback').textContent = '';
    $('nc-name').value = '';
    $('nc-teacher').innerHTML = '<option value="">— None —</option>' +
      Data.teachers().map(t => `<option value="${t.id}">${esc(t.name)} (${t.role})</option>`).join('');
    syncClassForm();
    openModal('add-class-modal');
  };
  $('nc-level').onchange = syncClassForm;
  $('save-class-btn').onclick = () => {
    const name = $('nc-name').value.trim();
    const level = $('nc-level').value;
    const stream = level === 'SS' ? $('nc-stream').value : '';
    const year = Number($('nc-year').value);
    if (!name) {
      $('nc-feedback').textContent = 'Class name is required.';
      $('nc-feedback').className = 'form-feedback error mt8';
      return;
    }
    closeModal('add-class-modal');
    toast(`Class ${name} created.`);
    draw();
    refreshTTClassSelect();
    const classSel = $('analytics-class');
    if (classSel) classSel.innerHTML = Data.classes().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    Data.addClass({
      name, level, stream: stream || null, year: year || null,
      classTeacherId: $('nc-teacher').value || null
    }).then(() => {
      draw();
      refreshTTClassSelect();
    });
  };
}

export function syncClassForm() {
  const level = $('nc-level').value;
  $('nc-stream-group').hidden = level !== 'SS';
  $('nc-year-group').hidden   = false;
  const allowed = level === 'SS' ? ['10', '11', '12'] : ['7', '8', '9'];
  const sel = $('nc-year');
  [...sel.options].forEach(o => { o.hidden = !allowed.includes(o.value); });
  if (!allowed.includes(sel.value)) sel.value = allowed[0];
  $('nc-year-hint').textContent = level === 'SS'
    ? 'Pick the year and the track; the year also sets the class level.'
    : 'Junior secondary classes take the common JSS subject list.';
}

export function openClassStudentsModal(classId) {
  const cl       = Data.cls(classId);
  const students = Data.studentsByClass(classId).filter(s => s.status !== 'archived');
  const term     = currentTerm();
  $('class-students-title').textContent = `${cl?.name} — Students`;
  $('class-students-table-wrap').innerHTML = students.length
    ? `<table><thead><tr><th>Student</th><th>Gender</th><th>Mentor</th><th>Avg</th><th>Position</th><th>Status</th><th></th></tr></thead><tbody>` +
      students.map(s => {
        const avg    = Academic.termAverage(s.id, term);
        const status = Academic.promotionStatus(s.id, term);
        const mentor = Data.mentor(s.mentorId);
        const rank   = classRank(s.id, term);
        return `<tr>
          <td><div class="student"><span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>${esc(s.name)}</div></td>
          <td class="muted-cell">${s.gender === 'F' ? 'Female' : 'Male'}</td>
          <td class="muted-cell">${esc(mentor?.name || '—')}</td>
          <td><span class="score">${avg}%</span></td>
          <td class="muted-cell">${rank !== null ? ordinal(rank) : '—'}</td>
          <td><span class="status ${statusClass(status)}">${status}</span></td>
          <td><button class="btn-sm-save" data-student="${s.id}">View report</button></td>
        </tr>`;
      }).join('') + '</tbody></table>'
    : '<p class="muted-cell" style="padding:16px">No students in this class.</p>';
  openModal('class-students-modal');
  $all('#class-students-table-wrap [data-student]').forEach(b =>
    b.addEventListener('click', () => { closeModal('class-students-modal'); openStudentReport(b.dataset.student); }));
}

export function openClassTeacherModal(classId) {
  const cl = Data.cls(classId);
  $('ct-modal-title').textContent = `${cl?.name} - class teacher`;
  $('ct-modal-class').innerHTML = cl
    ? `<option value="${cl.id}">${esc(cl.name)}</option>` : '<option value="">- None -</option>';
  $('ct-modal-class').value = String(classId ?? '');
  $('ct-modal-teacher').innerHTML = '<option value="">- None -</option>' +
    Data.teachers().map(t => `<option value="${t.id}" ${t.id === cl?.classTeacherId ? 'selected' : ''}>${esc(t.name)} (${t.role})</option>`).join('');
  $('ct-modal-feedback').textContent = '';
  openModal('class-teacher-modal');
  $('save-class-teacher-btn').onclick = () => {
    const teacherId = $('ct-modal-teacher').value;
    const klass     = Data.cls($('ct-modal-class').value);
    if (!klass) {
      $('ct-modal-feedback').textContent = 'That class no longer exists.';
      $('ct-modal-feedback').className = 'form-feedback error mt8';
      return;
    }
    closeModal('class-teacher-modal');
    const freed = teacherId
      ? Data.classes().find(c => c.id !== klass.id && String(c.classTeacherId) === String(teacherId))
      : null;
    toast(teacherId
      ? (freed
          ? `${Data.user(teacherId)?.name} now leads ${klass.name} (was the teacher of ${freed.name}).`
          : `${Data.user(teacherId)?.name} is now the class teacher of ${klass.name}.`)
      : 'Class teacher removed.');
    renderAdminClasses();
    Data.assignClassTeacher(klass.id, teacherId || null).then(renderAdminClasses);
  };
}

export function refreshTTClassSelect(preselect, lockToClassId = null) {
  const sel = $('tt-class'); if (!sel) return;
  const list = lockToClassId
    ? Data.classes().filter(c => String(c.id) === String(lockToClassId))
    : Data.classes();
  sel.innerHTML = list.map(cl =>
    `<option value="${cl.id}" ${String(cl.id) === String(preselect) ? 'selected' : ''}>${esc(cl.name)}</option>`).join('');
  sel.disabled = !!lockToClassId;
}

// ── Admin · Subjects ──────────────────────────────────────────
export function renderAdminSubjects() {
  // Expose on window so Alpine @change="renderAdminSubjects()" can call it
  window.renderAdminSubjects = renderAdminSubjects;

  function draw() {
    const level = $('as-filter-level').value;
    const group = $('as-filter-group').value;
    const list  = Data.subjects().filter(s =>
      (level === 'ALL' || s.level === 'BOTH' || s.level === level) &&
      (group === 'ALL' || s.group === group || s.level === 'JSS')
    );

    $('admin-subjects-table').innerHTML = list.map(sub => {
      const assigned = Data.teacherSubjects().filter(t => t.subjectId === sub.id);
      const names = [...new Set(assigned.map(a => Data.user(a.teacherId)?.name).filter(Boolean))];
      const classes = [...new Set(assigned.map(a => Data.cls(a.classId)?.name).filter(Boolean))];
      return `<tr>
        <td><div class="student">${subjectChip(sub)}${esc(sub.name)}</div></td>
        <td class="muted-cell">${levelTag(sub.level)}</td>
        <td>${sub.level === 'JSS'
              ? '<span class="stream-tag">Junior</span>'
              : (streamTag(sub.group) || '<span class="muted-cell">—</span>')}</td>
        <td><span class="status ${sub.type === 'core' ? 'promoted' : 'review'}">${sub.type === 'core' ? 'Core' : 'Elective'}</span></td>
        <td>${names.length ? esc(names.slice(0, 2).join(', ')) + (names.length > 2 ? ` +${names.length - 2}` : '') : '<span class="muted-cell">Unassigned</span>'}</td>
        <td class="muted-cell">${classes.length ? `${classes.length} class${classes.length !== 1 ? 'es' : ''}` : '—'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="muted-cell">No subjects match this filter.</td></tr>';

    $('as-count').textContent = `${list.length} of ${Data.subjects().length} subjects`;
  }

  // onchange handlers removed — Alpine @change on the selects calls renderAdminSubjects() directly.
  draw();

  $('add-subject-btn').onclick = () => {
    $('ns-feedback').textContent = '';
    $('ns-name').value = ''; $('ns-code').value = '';
    $('ns-level').value = 'JSS';
    $('ns-group').value = 'General';
    syncSubjectForm();
    openModal('add-subject-modal');
  };
  $('ns-level').onchange = syncSubjectForm;
  $('save-subject-btn').onclick = async () => {
    const name = $('ns-name').value.trim();
    const code = $('ns-code').value.trim().toUpperCase();
    if (!name || !code) {
      $('ns-feedback').textContent = 'Name and code are required.';
      $('ns-feedback').className = 'form-feedback error mt8';
      return;
    }
    await Data.addSubject({
      name, code,
      type:  $('ns-type').value,
      color: ['blue', 'coral', 'green', 'yellow'][Data.subjects().length % 4],
      level: $('ns-level').value,
      group: $('ns-level').value === 'JSS' ? 'General' : $('ns-group').value
    });
    closeModal('add-subject-modal');
    toast(`Subject ${name} added.`);
    draw();
  };
}

export function syncSubjectForm() {
  const level = $('ns-level').value;
  $('ns-group-group').hidden = level === 'JSS';
}

// ── Admin · Timetable ─────────────────────────────────────────
export function renderAdminTimetable(preselectClassId = null) {
  const currentUser = getCurrentUser();
  const mine = myClassRecord(currentUser);
  const genPanel = $q('.timetable-gen-panel');
  if (genPanel) genPanel.hidden = !isAdmin(currentUser);

  if (!isAdmin(currentUser)) {
    const classId = mine?.id ?? preselectClassId;
    if (!classId) {
      $('timetable-output').innerHTML = '<div class="panel"><p class="muted-cell">No class assigned to you — ask an administrator to assign you to a class.</p></div>';
      return;
    }
    const saved = Data.timetables().filter(r => String(r.classId) === String(classId));
    if (saved.length) {
      const schedule = _buildScheduleFromSaved(classId, saved);
      const cl = Data.cls(classId);
      $('timetable-output').innerHTML =
        `<div class="panel"><div class="panel-heading">
           <div><p class="eyebrow">Your class timetable · Term ${currentTerm()}</p><h2>${esc(cl?.name)} · Weekly schedule</h2></div>
           <button class="outline-button" id="tt-download" style="width:auto;margin:0">Download CSV ↓</button>
         </div>${timetableTable(schedule)}</div>`;
      const dl = $('tt-download');
      if (dl) dl.onclick = () => downloadCsv(`timetable_${(cl?.name || '').replace(/\s+/g, '_')}.csv`, timetableCsv(schedule));
    } else {
      $('timetable-output').innerHTML = '<div class="panel"><p class="muted-cell">No timetable has been generated for your class yet. Ask the administrator to generate one.</p></div>';
    }
    return;
  }

  if (!isAdmin(currentUser)) preselectClassId = mine?.id ?? null;
  refreshTTClassSelect(preselectClassId, isAdmin(currentUser) ? null : mine?.id);
  $('generate-tt-all-btn').hidden = false;

  const opts = () => ({
    periodsPerDay: +$('tt-periods').value,
    startHour:     +$('tt-start').value,
    periodMinutes: +$('tt-duration').value
  });

  $('generate-tt-btn').onclick = async () => {
    const classId = $('tt-class').value;
    if (!classId) { toast('Add a class first.', 'error'); return; }
    const all  = Timetable.generateAll(opts());
    const one  = all.schedules.find(s => s.classId === String(classId));
    if (!one) { toast('No subjects are mapped to this class yet.', 'error'); return; }
    $('timetable-output').innerHTML =
      `<div class="panel"><div class="panel-heading">
         <div><p class="eyebrow">Generated timetable · Term ${currentTerm()}</p><h2>${esc(one.name)} · Weekly schedule</h2></div>
         <button class="outline-button" id="tt-download" style="width:auto;margin:0">Download CSV ↓</button>
       </div>${timetableTable(one)}</div>`;
    $('tt-download').onclick = () => downloadCsv(`timetable_${one.name.replace(/\s+/g, '_')}.csv`, timetableCsv(one));
    toast(`Timetable generated for ${one.name}.`);
  };

  $('generate-tt-all-btn').onclick = async () => {
    const result = Timetable.generateAll(opts());
    if (!result.schedules.length) { toast('No classes to generate for.', 'error'); return; }
    $('timetable-output').innerHTML =
      `<div class="panel"><div class="panel-heading">
         <div><p class="eyebrow">Whole school · Term ${currentTerm()}</p>
         <h2>Timetable for all ${result.schedules.length} classes</h2></div>
         <button class="outline-button" id="tt-download-all" style="width:auto;margin:0">Download all CSV ↓</button>
       </div>
       <p class="role-muted" style="margin-top:10px">Generated without booking any teacher into two classes at the same period.</p>
       ${result.schedules.map(s => `<div class="tt-class-block">
            <div class="tt-class-head"><strong>${esc(s.name)}</strong> ${levelTag(s.level)} ${streamTag(s.stream)}<span class="muted-cell" style="margin-left:8px;font-size:12px">📍 ${esc(s.room || '—')}</span></div>
            ${timetableTable(s)}
          </div>`).join('')}
        ${result.absent.length ? `<p class="form-feedback error mt8">No teacher is allocated to any subject for: ${esc(result.absent.join(', '))}</p>` : ''}
        ${Object.keys(result.unstaffed || {}).length ? `<div class="form-feedback error mt8">
             These subjects are in the curriculum but have no teacher allocated, so they were left out of the timetable:
             ${Object.entries(result.unstaffed).map(([c, subs]) => `<br>${esc(c)} — ${esc(subs.join(', '))}`).join('')}
           </div>` : ''}
       </div>`;
    $('tt-download-all').onclick = () => {
      const rows = [['Class', 'Room', 'Day', 'Period', 'Time', 'Subject', 'Teacher']];
      result.schedules.forEach(s => s.days.forEach(d => d.periods.forEach(p => {
        rows.push([s.name, s.room || '—', d.day, p.period, p.time, p.subject, p.teacher]);
      })));
      downloadCsv(`school_timetable_term${currentTerm()}.csv`, rows);
    };
    let saved = 0;
    try { saved = await Data.saveTimetable(result.schedules, currentTerm()); }
    catch (err) { console.warn(err); }
    toast(saved
      ? `Timetable generated for all ${result.schedules.length} classes and saved.`
      : `Timetable generated for all ${result.schedules.length} classes.`);
  };
}

export function _buildScheduleFromSaved(classId, rows) {
  const cl   = Data.cls(classId);
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const byDay = {};
  rows.forEach(r => {
    const slot = Data.timeSlots().find(s => String(s.id) === String(r.timeSlotId));
    const day  = slot?.dayOfWeek ?? r.day ?? 1;
    const dayName = DAYS[(day - 1)] || `Day ${day}`;
    if (!byDay[dayName]) byDay[dayName] = [];
    byDay[dayName].push({
      period:  slot ? slot.period || byDay[dayName].length + 1 : byDay[dayName].length + 1,
      time:    slot ? `${slot.startTime}–${slot.endTime}` : '',
      subject: Data.subject(r.subjectId)?.name || '—',
      teacher: Data.user(r.teacherId)?.name  || '—',
      free:    false,
      color:   Data.subject(r.subjectId)?.color || 'blue'
    });
  });
  Object.values(byDay).forEach(d => d.sort((a, b) => a.period - b.period));
  const days = DAYS
    .filter(d => byDay[d])
    .map(d => ({ day: d, periods: byDay[d] }));
  return {
    classId, name: cl?.name || '—',
    level: cl?.level, stream: cl?.stream, room: '',
    days: days.length ? days : DAYS.map(d => ({ day: d, periods: [] }))
  };
}

// timetableTable is imported from ./shared.js (above)

export function timetableCsv(schedule) {
  const rows = [['Day', 'Period', 'Time', 'Subject', 'Code', 'Teacher']];
  schedule.days.forEach(d => d.periods.forEach(p => {
    rows.push([d.day, p.period, p.time, p.subject, p.code, p.teacher]);
  }));
  return rows;
}

// ── Admin · Analytics ─────────────────────────────────────────
export function renderAdminAnalytics() {
  const classSel = $('analytics-class');
  classSel.innerHTML = Data.classes().map(cl => `<option value="${cl.id}">${esc(cl.name)}</option>`).join('');
  $('analytics-term').value = currentTerm();

  function draw() {
    const classId = classSel.value, term = +$('analytics-term').value;
    const cl = Data.cls(classId), students = Data.studentsByClass(classId);
    const classAvg = Academic.classAverage(classId, term);
    const allAvgs  = students.map(s => Academic.termAverage(s.id, term));
    const promoted = students.filter(s => Academic.canPromote(s.id, term)).length;

    $('analytics-summary-cards').innerHTML = `
      <article class="stat-card accent-coral"><div class="stat-top"><span class="stat-label">Class</span><span class="stat-icon">C</span></div><strong>${esc(cl?.name || '—')}</strong><div class="stat-trend neutral">Term ${term}</div></article>
      <article class="stat-card accent-blue"><div class="stat-top"><span class="stat-label">Class average</span><span class="stat-icon">A</span></div><strong>${classAvg}%</strong><div class="stat-trend neutral">${students.length} students</div></article>
      <article class="stat-card accent-green"><div class="stat-top"><span class="stat-label">Promotion rate</span><span class="stat-icon">✓</span></div><strong>${students.length ? Math.round(promoted / students.length * 100) : 0}%</strong><div class="stat-trend up">${promoted}/${students.length}</div></article>
      <article class="stat-card accent-yellow"><div class="stat-top"><span class="stat-label">Top score</span><span class="stat-icon">↑</span></div><strong>${allAvgs.length ? Math.max(...allAvgs) : 0}%</strong><div class="stat-trend neutral">Highest avg</div></article>`;

    $('analytics-table').innerHTML = Academic.classSubjects(classId).map(sub => {
      const a    = Academic.subjectAnalytics(classId, sub.id, term);
      const pass = students.filter(s => (Academic.subjectScore(s.id, sub.id, term) || 0) >= passMark()).length;
      const rate = a.count ? Math.round(pass / a.count * 100) : 0;
      const rc   = rate >= 70 ? 'promoted' : rate >= 50 ? 'review' : 'repeat';
      return `<tr>
        <td><div class="student">${subjectChip(sub)}${esc(sub.name)}</div></td>
        <td>${a.count}</td><td><strong>${a.avg}%</strong></td><td>${a.max}%</td>
        <td>${a.min}%</td><td>${a.stddev}</td>
        <td><span class="status ${rc}">${rate}%</span></td>
      </tr>`;
    }).join('');

    $('analytics-attendance').innerHTML = students.map(s => {
      const wks   = Data.studentAttendance(s.id, term);
      const cells = ['W1', 'W2', 'W3', 'W4'].map(w => `<td>${Number(wks[w]) || 0}/5</td>`).join('');
      const pct   = +Academic.attendancePct(s.id, term);
      const rating = pct >= 90 ? 'Excellent' : pct >= 75 ? 'Good' : pct >= 60 ? 'Fair' : 'At risk';
      const rc     = pct >= 90 ? 'promoted' : pct >= 75 ? 'review' : 'repeat';
      return `<tr>
        <td><div class="student"><span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>${esc(s.name)}</div></td>
        ${cells}<td><strong>${pct}%</strong></td>
        <td><span class="status ${rc}">${rating}</span></td>
      </tr>`;
    }).join('');

    const mb = Data.session().midtermBreak || {};
    $('midterm-break-label').textContent = (mb.start || mb.end)
      ? `${mb.start ? formatDate(mb.start) : '—'} → ${mb.end ? formatDate(mb.end) : '—'}`
      : 'not set';
    const subs  = Academic.classSubjects(classId);
    const mrows = students.map(s => {
      const sc   = Data.studentScores(s.id);
      const cas  = subs.map(sub => { const e = sc[sub.id]?.[term]; return (e && Number.isFinite(e.test)) ? e.test : ''; });
      const nums = cas.filter(v => v !== '');
      const avg  = nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : '';
      return { s, cas, avg };
    });
    $('midterm-report-head').innerHTML =
      `<tr><th>Student</th>${subs.map(sub => `<th>${esc(sub.name)}</th>`).join('')}<th>Avg (CA)</th></tr>`;
    $('midterm-report-body').innerHTML = mrows.map(r => `<tr>
      <td><div class="student"><span class="student-avatar ${toneClass(r.s.tone)}">${r.s.initials}</span>${esc(r.s.name)}</div></td>
      ${r.cas.map(c => `<td>${c === '' ? '<span class="muted-cell">—</span>' : c}</td>`).join('')}
      <td><strong>${r.avg === '' ? '—' : r.avg + ' / 40'}</strong></td>
    </tr>`).join('');
    $('midterm-download-btn').onclick = () => {
      const rows = [[`Happy Man Academy — ${cl?.name || ''} mid-term report · Term ${term}`],
                    ['Student ID', 'Student', ...subs.map(x => x.name), 'Avg (CA only)']];
      mrows.forEach(r => rows.push([r.s.id, r.s.name, ...r.cas, r.avg]));
      downloadXlsx(`midterm_${cl?.name.replace(/\s+/g, '_') || 'class'}_term${term}.xlsx`, rows, `Mid-term · Term ${term}`);
      toast('Mid-term report downloaded.');
    };
  }
  draw();
  classSel.onchange = draw;
  $('analytics-term').onchange = draw;
}

// ── Admin · Leaderboard ───────────────────────────────────────
export function renderAdminLeaderboard() {
  const term = currentTerm();
  const topN = 10;
  const allStudents = Data.students()
    .filter(s => s.status !== 'archived')
    .map(s => ({
      ...s,
      avg: Progression.sessionAverage(s.id),
      termAvg: Academic.termAverage(s.id, term),
      className: Data.cls(s.classId)?.name || '—',
      rank: classRank(s.id, term)
    }))
    .filter(s => s.avg !== null);
  allStudents.sort((a, b) => (b.avg || 0) - (a.avg || 0));
  const topOverall = allStudents.slice(0, topN);
  const classes = Data.classes();
  const topPerClass = classes.map(cl => {
    const classStudents = allStudents.filter(s => s.classId === cl.id).slice(0, topN);
    return { class: cl, students: classStudents };
  }).filter(c => c.students.length > 0);

  $('leaderboard-overall').innerHTML = topOverall.length
    ? `<table>
        <thead><tr><th>#</th><th>Student</th><th>Class</th><th>Session Avg</th><th>Term ${term} Avg</th><th>Class Pos.</th></tr></thead>
        <tbody>` +
        topOverall.map((s, i) => `<tr>
          <td><strong class="leaderboard-rank ${i < 3 ? 'top-' + (i + 1) : ''}">${i + 1}</strong></td>
          <td><div class="student"><span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>${esc(s.name)}</div></td>
          <td>${esc(s.className)}</td>
          <td><span class="score">${Math.round(s.avg)}%</span></td>
          <td><span class="score">${s.termAvg}%</span></td>
          <td class="muted-cell">${s.rank !== null ? ordinal(s.rank) : '—'}</td>
        </tr>`).join('') + `</tbody></table>`
    : '<p class="muted-cell" style="padding:16px">No students with scores yet.</p>';

  $('leaderboard-classes').innerHTML = topPerClass.map(c => `
    <article class="panel">
      <div class="panel-heading">
        <div><h3>${esc(c.class.name)}</h3></div>
        <span class="read-only-badge">${c.students.length} ${c.students.length === 1 ? 'student' : 'students'}</span>
      </div>
      <div class="table-wrap mt16">
        <table>
          <thead><tr><th>#</th><th>Student</th><th>Session Avg</th><th>Term ${term} Avg</th></tr></thead>
          <tbody>` +
          c.students.map((s, i) => `<tr>
            <td><strong class="leaderboard-rank ${i < 3 ? 'top-' + (i + 1) : ''}">${i + 1}</strong></td>
            <td><div class="student"><span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>${esc(s.name)}</div></td>
            <td><span class="score">${Math.round(s.avg)}%</span></td>
            <td><span class="score">${s.termAvg}%</span></td>
          </tr>`).join('') +
          `</tbody></table>
      </div>
    </article>
  `).join('');
}

// ── Admin · Setup ─────────────────────────────────────────────
export function renderAdminSetup() {
  const currentUser = getCurrentUser();
  const sess = Data.session();
  $('setup-session-name').value = sess.name;
  $('setup-term').value = sess.currentTerm;
  $('setup-break-start').value = sess.midtermBreak?.start || '';
  $('setup-break-end').value   = sess.midtermBreak?.end   || '';
  updateUploadLabels(sess);
  renderSetupEventsList();

  $('toggle-test-upload').onclick = () => {
    const s = Data.session();
    s.uploadOpen.test = !s.uploadOpen.test;
    Data.saveSession(s);
    updateUploadLabels(s);
  };
  $('toggle-exam-upload').onclick = () => {
    const s = Data.session();
    s.uploadOpen.exam = !s.uploadOpen.exam;
    Data.saveSession(s);
    updateUploadLabels(s);
  };
  $('save-session-btn').onclick = () => {
    const s = Data.session();
    s.name = $('setup-session-name').value.trim() || s.name;
    s.currentTerm = +$('setup-term').value;
    s.midtermBreak = {
      start: $('setup-break-start').value || s.midtermBreak?.start || null,
      end:   $('setup-break-end').value   || s.midtermBreak?.end   || null
    };
    Data.saveSession(s);
    $('sidebar-session').textContent = `${s.name} · Term ${s.currentTerm}`;
    const termBadge = $('admin-term-badge');
    if (termBadge) termBadge.innerHTML = `<span class="live-dot"></span>Term ${s.currentTerm} · Active`;
    toast('Session settings saved.');
  };

  $('add-event-btn').onclick = async () => {
    const title = $('ev-title').value.trim(), date = $('ev-date').value;
    if (!title || !date) { toast('Title and date are required.', 'error'); return; }
    await Data.addEvent({ title, date, type: $('ev-type').value, note: $('ev-note').value.trim() });
    $('ev-title').value = ''; $('ev-date').value = ''; $('ev-note').value = '';
    renderSetupEventsList();
    toast('Event added.');
  };

  const gate = Data.promotionsGate();
  const ssBtn = $('start-session-btn'), ssNote = $('start-session-note');
  if (gate.open) {
    ssNote.textContent = `Close ${sess.name} and open ${Data.nextSessionLabel()}. Final promotion records are written for all active students, then a fresh session with three empty terms starts. This cannot be undone.`;
    ssBtn.disabled = false;
    ssBtn.onclick = () => askSensitiveConfirm('Start the next academic session',
      `Close ${sess.name} (Term ${gate.term} results are published) and open ${Data.nextSessionLabel()}. Promotion records for every active student are written, the session is marked closed, and a new session with three empty terms begins. This cannot be undone.`,
      runStartNewSession);
  } else {
    ssNote.textContent = gate.reason;
  }

  $('term-dates-list').innerHTML = sess.terms.map(t =>
    `<div class="event-mini-row">
      <span class="event-dot ${t.term === sess.currentTerm ? 'event-academic' : 'event-session'}"></span>
      <div><strong>${esc(t.name)}${t.term === sess.currentTerm ? ' · current' : ''}</strong>
      <small>${t.start ? formatDate(t.start) : '—'} → ${t.end ? formatDate(t.end) : '—'}</small></div>
    </div>`).join('');
}

export function updateUploadLabels(sess) {
  // DOM writes removed — Alpine x-text and :class own the label elements.
  // Sync Alpine component state only.
  const setupForm = $('session-setup-form');
  if (setupForm && window.Alpine) {
    const data = Alpine.$data(setupForm);
    if (data) {
      data.testOpen = !!sess.uploadOpen.test;
      data.examOpen = !!sess.uploadOpen.exam;
    }
  }
}

export function renderSetupEventsList() {
  const el = $('events-list-mini'); if (!el) return;
  el.innerHTML = Data.events().map(ev => `
    <div class="event-mini-row">
      <span class="event-dot event-${ev.type}"></span>
      <div><strong>${esc(ev.title)}</strong><small>${formatDate(ev.date)} · ${esc(ev.note || '')}</small></div>
    </div>`).join('') || '<p class="muted-cell">No events yet.</p>';
}

export function renderDayStructureBreaks(breaks) {
  $('dstr-breaks-editor').innerHTML = (breaks || []).length ? breaks.map((b, i) => `
    <div class="form-row tight mt8">
      <span class="role-muted" style="align-self:center">Break ${i + 1}</span>
      <input type="number" min="1" max="9" style="width:70px" data-break="after" value="${Number(b.after) || 3}" aria-label="After period">
      <input type="number" style="width:80px" data-break="minutes" value="${Number(b.minutes) || 15}" aria-label="Minutes">
      <input data-break="label" value="${esc(b.label || 'Break')}" style="flex:1" aria-label="Label">
      <button class="outline-button" data-break-remove style="width:auto;margin:0">✕</button>
    </div>`).join('') : '<p class="muted-cell">No breaks — add some by hand or restore the defaults.</p>';
  $all('[data-break-remove]').forEach(btn => btn.addEventListener('click', () => {
    const row = btn.closest('.form-row'); if (row) row.remove();
  }));
}

function readDayStructureBreaks() {
  return [...$all('#dstr-breaks-editor .form-row')].map(row => ({
    after:   Number(row.querySelector('[data-break="after"]')?.value)  || 3,
    minutes: Number(row.querySelector('[data-break="minutes"]')?.value) || 15,
    label:   row.querySelector('[data-break="label"]')?.value.trim() || 'Break'
  }));
}

export function initDayStructureForm() {
  const s = Data.ttSettings() || Timetable.DAY_DEFAULTS;
  $('dstr-periods').value = s.periods;
  $('dstr-start').value   = s.start;
  $('dstr-minutes').value = s.periodMinutes || s.minutes;
  $('dstr-reset-breaks').checked = false;
  renderDayStructureBreaks(s.breaks);
}

export function bindDayStructureForm() {
  $('dstr-reset-breaks').addEventListener('change', () => {
    renderDayStructureBreaks($('dstr-reset-breaks').checked ? Timetable.DAY_DEFAULTS.breaks : (Data.ttSettings()?.breaks || []));
  });
  $('save-day-structure-btn').addEventListener('click', async () => {
    const currentUser = getCurrentUser();
    const f = $('dstr-feedback');
    const periods = +$('dstr-periods').value, minutes = +$('dstr-minutes').value;
    const start = ($('dstr-start').value || '08:00').trim();
    if (!periods || periods < 4 || periods > 9) { f.textContent = 'Periods per day must be between 4 and 9.'; f.hidden = false; return; }
    if (!minutes || minutes < 20 || minutes > 90) { f.textContent = 'Period length must be between 20 and 90 minutes.'; f.hidden = false; return; }
    const breaks = $('dstr-reset-breaks').checked
      ? Timetable.DAY_DEFAULTS.breaks
      : readDayStructureBreaks();
    await Data.saveTimetableSettings({ periods, start, minutes, breaks }, currentUser.id);
    f.hidden = true;
    initDayStructureForm();
    toast('Day structure saved. Regenerate the timetable on the Timetable page.');
  });
}

// askSensitiveConfirm is imported from ./shared.js (above)

export function prDecisionRows() {
  return Data.students()
    .filter(s => s.status === 'active')
    .map(s => {
      const d = Progression.decision(s.id);
      const cls = Data.cls(s.classId);
      const next = d.outcome === 'pooled'
        ? Progression.poolClassName()
        : d.outcome === 'promoted'
          ? (Progression.classAfter(s.classId) ? Data.classNameOf(Progression.classAfter(s.classId)) : '—')
        : d.outcome === 'graduated'
          ? '— (graduates)'
        : d.outcome === 'repeat'
          ? `Repeats ${cls?.name || 'year'}`
        : '—';
      return { id: s.id, name: s.name, classId: s.classId, className: cls?.name || '—', decision: d, next };
    });
}

export function renderProgressionDecisions() {
  const currentUser = getCurrentUser();
  const gate = Data.promotionsGate();
  if (!gate.open) {
    set_prRows([]);
    $('pr-summary-badge').textContent = '—';
    $('pr-note').textContent = gate.reason;
    $('pr-decisions-table').innerHTML =
      `<tr><td colspan="7" class="muted-cell">${esc(termNameOf(gate.term))} results have to be published before any student is marked promoted. Publish them above to close the session and unlock the decisions.</td></tr>`;
    return;
  }
  const rows = prDecisionRows();
  set_prRows(rows);
  const counts = {};
  rows.forEach(r => { counts[r.decision.outcome] = (counts[r.decision.outcome] || 0) + 1; });
  $('pr-summary-badge').textContent = rows.length
    ? `${rows.length} students · ${counts.promoted || 0} promote · ${counts.pooled || 0} to pool · ${counts.graduated || 0} graduate · ${counts.repeat || 0} repeat`
    : 'No active students';
  $('pr-note').textContent = rows.length
    ? 'Preview only. Commit writes the promotion records and moves pooled students into the Grade 10 Pool.'
    : 'Nothing to evaluate yet — add students and enter scores first.';
  $('pr-decisions-table').innerHTML = rows.map(r => {
    const d = r.decision, ch = d.check || {};
    const chip = d.outcome === 'promoted' ? '<span class="status promoted">Promote</span>'
      : d.outcome === 'pooled' ? '<span class="status review">Pool</span>'
      : d.outcome === 'graduated' ? '<span class="status promoted">Graduate</span>'
      : '<span class="status repeat">Repeat</span>';
    const hint = d.outcome === 'repeat' && d.reason === 'no_marks' ? '<small class="muted-cell"> no marks</small>' : '';
    const override = Progression.overrideOf(r.id);
    const overrideTag = override
      ? `<small class="muted-cell">admin → ${override.decision}</small>`
      : '';
    return `<tr>
      <td><strong>${esc(r.name)}</strong></td>
      <td>${esc(r.className)}</td>
      <td>${ch.english ?? '—'}</td>
      <td>${ch.maths ?? '—'}</td>
      <td>${ch.avg ?? '—'}</td>
      <td>${chip}${hint}${overrideTag}</td>
      <td>${esc(r.next)}</td>
      <td class="role-row-actions" style="white-space:nowrap">
        ${override
          ? `<button class="btn-sm-outline" data-clear-override="${r.id}" title="Revert to the rule">↩ Clear</button>`
          : `<button class="btn-sm-save" data-override="${r.id}" ${d.outcome === 'repeat' || d.outcome === 'promoted' ? '' : 'disabled'} title="Manually promote a student below the line">Manual</button>`}
        <button class="btn-sm-outline" data-passport="${r.id}" title="Print the Student Achievement Passport">Passport</button>
      </td>
    </tr>`;
  }).join('');
  $all('#pr-decisions-table [data-override]').forEach(btn => btn.addEventListener('click', () => {
    const row = _prRows.find(x => x.id === btn.dataset.override); if (!row) return;
    askSensitiveConfirm('Manually promote this student?',
      `${row.name} fell below the 50-mark line, but as Administrator you can still promote them. The manual decision overrides the automatic rule for this session. Confirm with your password.`,
      () => runSetOverride(row.id, 'promoted', 'Manual promotion by admin'));
  }));
  $all('#pr-decisions-table [data-clear-override]').forEach(btn => btn.addEventListener('click', () => {
    const row = _prRows.find(x => x.id === btn.dataset.clearOverride); if (!row) return;
    askSensitiveConfirm('Revert to the automatic rule?',
      `${row.name}'s manual decision will be removed and the ${passMark()}-mark rule will apply again for this session.`,
      () => runClearOverride(row.id));
  }));
  $all('#pr-decisions-table [data-passport]').forEach(btn => btn.addEventListener('click', () => {
    renderPassport(btn.dataset.passport);
  }));
}

export async function runSetOverride(studentId, decision, reason) {
  const currentUser = getCurrentUser();
  await Progression.setOverride(studentId, decision, reason, currentUser.id);
  renderProgressionDecisions();
  toast('Manual decision recorded — the override wins for this session.');
}

export async function runClearOverride(studentId) {
  await Progression.clearOverride(studentId);
  renderProgressionDecisions();
  toast('Override removed.');
}

export async function runProgressionCommit() {
  const currentUser = getCurrentUser();
  const gate = Data.promotionsGate();
  if (!gate.open) { toast(gate.reason, 'error'); return; }
  if (!_prRows.length) renderProgressionDecisions();
  const rows = _prRows;
  const poolId = Progression.poolClass()?.id || null;
  for (const r of rows) {
    const d = r.decision, ch = d.check || {};
    await Progression.snapshotPromotions([{
      studentId: r.id, fromClassId: r.classId,
      toClassId: d.outcome === 'pooled' ? poolId : d.outcome === 'promoted' ? Progression.classAfter(r.classId) : null,
      outcome:   d.outcome,
      avg:       ch.avg ?? null, en: ch.english ?? null, ma: ch.maths ?? null
    }]);
    if (d.outcome === 'pooled' && poolId) {
      await Progression.assignClass(r.id, poolId, { reason: 'pool_placement', note: 'End-of-session promotion', userId: currentUser.id });
    } else if (d.outcome === 'promoted') {
      const next = Progression.classAfter(r.classId);
      if (next) await Progression.assignClass(r.id, next, { reason: 'promotion', note: 'Met the promotion rule', userId: currentUser.id });
    }
  }
  renderProgressionDecisions();
  renderProgressionPool();
  toast('Promotion decisions committed.');
}

export function renderProgressionPool() {
  const entrants = Progression.poolEntrants();
  $('pr-pool-table').innerHTML = entrants.length ? entrants.map(s => `
    <tr>
      <td><strong>${esc(s.name)}</strong></td>
      <td>${esc(s.admissionNo || '—')}</td>
      <td><button class="outline-button" data-place="${s.id}">Place in track</button></td>
    </tr>`).join('')
    : `<tr><td colspan="3" class="muted-cell">${Progression.poolClass() ? 'No entrants in the pool right now.' : 'No pool class configured yet (set one class to selection mode "pool").'}</td></tr>`;
  $all('#pr-pool-table [data-place]').forEach(btn => btn.addEventListener('click', () => openPlacementModal(btn.dataset.place)));
  const closeBtn = $('pr-close-pool-btn');
  closeBtn.disabled = !entrants.length;
}

export function openPlacementModal(studentId) {
  const s = Data.student(studentId); if (!s) return;
  set_placementId(String(studentId));
  let targets = Data.classes().filter(c => c.level === 'SS' && c.year === 10 && c.stream && c.selectionMode !== 'pool');
  if (!targets.length) targets = Data.classes().filter(c => c.level === 'SS' && c.stream && c.selectionMode !== 'pool');
  $('pl-student').textContent = `${s.name} · ${Data.cls(s.classId)?.name || 'Grade 10 Pool'}`;
  $('pl-eyebrow').textContent = `Picks the senior subject list of the chosen track.`;
  $('pl-class').innerHTML = targets.length
    ? targets.map(c => `<option value="${c.id}">${esc(c.name)} · ${esc(c.stream)}</option>`).join('')
    : '<option value="">— No track classes available —</option>';
  $('pl-note').value = ''; $('pl-password').value = '';
  const f = $('pl-feedback'); f.textContent = ''; f.hidden = true;
  openModal('place-student-modal');
}

export async function runPlacement() {
  const currentUser = getCurrentUser();
  const f = $('pl-feedback');
  if (!Data.passwordMatches(currentUser, $('pl-password').value)) {
    f.textContent = 'That password is not right for this account.'; f.hidden = false; return;
  }
  const to = $('pl-class').value;
  if (!to) { f.textContent = 'Choose a target class first.'; f.hidden = false; return; }
  closeModal('place-student-modal');
  await Progression.assignClass(Data.student(_placementId).id, to, {
    reason: 'pool_placement', note: $('pl-note').value.trim(), userId: currentUser.id });
  toast('Student placed in their track class.');
  renderProgressionDecisions(); renderProgressionPool();
}

export async function runClosePool() {
  const currentUser = getCurrentUser();
  const n = await Progression.closePool(currentUser.id);
  renderProgressionPool(); renderProgressionDecisions();
  toast(n ? `${n} unplaced entrant(s) marked inactive.` : 'Nothing to close.');
}

export async function runStartNewSession() {
  const currentUser = getCurrentUser();
  const next = await Data.startNewSession({ userId: currentUser.id });
  if (!next) { toast('Publish the final term results before starting the next session.', 'error'); return; }
  toast(`Started ${next.name}. Reloading…`);
  setTimeout(() => location.reload(), 600);
}

export function termCoverageProgression(term) {
  const cov = Progression.coverage(term);
  let entered = 0, total = 0;
  Object.values(cov).forEach(cl => cl.subjects.forEach(s => { entered += s.entered; total += s.total; }));
  return total ? Math.round(entered / total * 100) : 100;
}

export function renderProgressionPublish() {
  const currentUser = getCurrentUser();
  const el = $('pr-publish-form');
  el.innerHTML = Data.session().terms.map(t => {
    const pct  = termCoverageProgression(t.term);
    const isPub = Data.published(t.term);
    const state = isPub ? 'Published' : pct >= 100 ? 'Ready to publish' : `Waiting on ${Math.min(100, 100 - pct)}% of classes`;
    return `<div class="form-group">
      <label>${esc(t.name)}</label>
      <div class="toggle-row">
        <span class="${isPub ? 'open-label' : pct >= 100 ? 'closed-label' : 'closed-label'}">${state}</span>
        <button class="btn-primary" data-publish="${t.term}" ${isPub ? 'data-unpublish=""' : ''} ${isPub || pct >= 100 ? '' : 'disabled'}>${isPub ? 'Unpublish' : 'Publish'}</button>
      </div>
    </div>`;
  }).join('');
  $all('#pr-publish-form [data-publish]').forEach(btn => btn.addEventListener('click', async () => {
    const term = +btn.dataset.publish;
    const on = !('unpublish' in btn.dataset);
    await Progression.setTermPublished(term, on, currentUser.id);
    renderProgressionPublish();
    toast(on ? `Term ${term} results published.` : `Term ${term} results taken offline.`);
  }));
}

export async function renderProgressionPositions() {
  const term = +$('pr-pos-term').value;
  const rows = await Progression.positions(term);
  const sorted = [...rows].sort((a, b) => a.yearPosition - b.yearPosition || a.classPosition - b.classPosition);
  $('pr-positions-table').innerHTML = sorted.length ? sorted.map((r, i) => {
    const s = Data.student(r.studentId), cl = Data.cls(r.classId);
    return `<tr>
      <td>${i + 1}</td>
      <td><strong>${esc(s?.name || '—')}</strong></td>
      <td>${esc(cl?.name || '—')}</td>
      <td>${r.classPosition}</td>
      <td>${r.yearPosition}</td>
      <td>${r.termAvg ?? '—'}</td>
      <td>${r.sessionAvg ?? '—'}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="muted-cell">No positions yet for this term.</td></tr>';
}

export function renderProgressionApprovals() {
  const currentUser = getCurrentUser();
  const list = $('pr-approvals-list');
  const rows = Progression.approvalsFor();
  list.innerHTML = rows.length ? rows.map(a => {
    const who = a.requestedBy ? Data.user(a.requestedBy) : null;
    const action = String(a.actionType || 'approve').replace(/_/g, ' ');
    return `<div class="event-mini-row">
      <span class="event-dot event-academic"></span>
      <div><strong>${esc(a.note || action)}</strong>
      <small>${esc(action)} · ${esc(a.entityType || '')}${who ? ' · requested by ' + esc(who.name) : ''} · ${formatDate(a.at)}</small></div>
      <span class="role-row-actions">
        <button class="outline-button" data-approval-ok="${a.id}">Approve</button>
        <button class="outline-button" data-approval-no="${a.id}">Reject</button>
      </span>
    </div>`;
  }).join('') : '<p class="muted-cell">Nothing awaiting your decision.</p>';
  $all('[data-approval-ok]').forEach(b => b.addEventListener('click', async () => {
    await Progression.decideApproval(b.dataset.approvalOk, true, currentUser.id);
    renderProgressionApprovals(); toast('Request approved.');
  }));
  $all('[data-approval-no]').forEach(b => b.addEventListener('click', async () => {
    await Progression.decideApproval(b.dataset.approvalNo, false, currentUser.id);
    renderProgressionApprovals(); toast('Request rejected.');
  }));
}

export function renderAdminProgression() {
  renderProgressionDecisions();
  renderProgressionPool();
  renderProgressionPublish();
  renderProgressionApprovals();
  initDayStructureForm();
  const posSel = $('pr-pos-term');
  posSel.value = currentTerm();
  renderProgressionPositions();

  $('pr-dryrun-btn').addEventListener('click', () => { renderProgressionDecisions(); toast('Preview refreshed — nothing written.'); });
  $('pr-commit-btn').addEventListener('click', () => {
    if (!_prRows.length) renderProgressionDecisions();
    const gate = Data.promotionsGate();
    if (!gate.open) { toast(gate.reason, 'error'); return; }
    const counts = {};
    _prRows.forEach(r => { counts[r.decision.outcome] = (counts[r.decision.outcome] || 0) + 1; });
    askSensitiveConfirm('Commit promotion decisions',
      `${_prRows.length} active student(s). ${counts.promoted || 0} promoted to the next class, ` +
      `${counts.pooled || 0} moved into the Grade 10 Pool, ${counts.graduated || 0} graduate, ` +
      `${counts.repeat || 0} repeat. Class assignments and promotion records are updated now — this is the end-of-session action.`,
      runProgressionCommit);
  });
  $('pr-close-pool-btn').addEventListener('click', () => {
    const n = Progression.poolEntrants().length;
    if (!n) return;
    askSensitiveConfirm('Close the Grade 10 Pool',
      `${n} unplaced entrant(s) will be marked inactive in the roll. This cannot be undone.`,
      runClosePool);
  });
  posSel.addEventListener('change', renderProgressionPositions);
  $('pr-commit-btn').disabled = !Data.promotionsGate().open;
}

export function bindProgressionModals() {
  $('pl-save-btn').addEventListener('click', runPlacement);
  $('sc-confirm-btn').addEventListener('click', async () => {
    const currentUser = getCurrentUser();
    const f = $('sc-feedback');
    if (!Data.passwordMatches(currentUser, $('sc-password').value)) {
      f.textContent = 'That password is not right for this account.'; f.hidden = false; return;
    }
    f.hidden = true;
    closeModal('sensitive-confirm-modal');
    const run = getSensitiveRun(); set_sensitiveRun(null);
    if (typeof run === 'function') await run();
  });
  bindDayStructureForm();
}

// ── Passport actions binder (print / download) ────────────────
export function bindPassportActions() {
  const doPrint = () => {
    document.body.classList.add('printing');
    const done = () => {
      document.body.classList.remove('printing');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };
  $('passport-print-btn')?.addEventListener('click', doPrint);
  $('passport-download-btn')?.addEventListener('click', doPrint);
}

// ── Single bootstrap entry for all admin modal binders ────────
export function initAdminModals() {
  bindResetPasswordModal();
  bindProgressionModals();
  bindPassportActions();
}

// ── Admin · Recognition ───────────────────────────────────────
export function renderAdminRecognition() {
  const currentUser = getCurrentUser();
  const lb = Growth.leaderboard();
  $('rec-leaderboard').innerHTML = lb.length
    ? lb.map((r, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
        const rec   = r.rec, hon = (rec.honors || []).map(h => h.kind.replace(/_/g, ' ')).join(', ');
        return `<div class="leaderboard-row${i === 0 && rec.points > 0 ? ' lb-leader' : ''}">
          <span class="lb-rank">${medal}</span>
          <span class="avatar ${toneClass(r.tone)}">${r.initials || avatarInitials(r.name)}</span>
          <div class="lb-name"><strong>${esc(r.name)}</strong>
            <small>${rec.mentorNotes} mentor note${rec.mentorNotes !== 1 ? 's' : ''} &middot; ${rec.verifications} verified artifact${rec.verifications !== 1 ? 's' : ''}${rec.masterRegister ? ' &middot; Master Register' : ''}${hon ? ' &middot; ' + esc(hon) : ''}</small></div>
          <b class="lb-points">${rec.points} pts</b>
        </div>`;
      }).join('')
    : '<p class="muted-cell">No teacher has earned recognition points yet.</p>';

  const log = [...(Data.teacherRecognitions() || []), ...(Data.parentEngagements() || [])]
    .sort((a, b) => String(b.at || b.awardedAt || '').localeCompare(String(a.at || a.awardedAt || '')));
  $('rec-log').innerHTML = log.length
    ? log.slice(0, 8).map(e => {
        const honor   = e.awardedAt !== undefined;
        const when    = formatDate(honor ? e.awardedAt : e.at);
        const subject = honor ? Data.user(e.teacherId) : Data.user(e.parentId);
        const label   = `${subject?.name || '—'} · ${String(e.kind).replace(/_/g, ' ')}`;
        return `<div class="event-mini-row">
          <span class="event-dot ${honor ? 'event-academic' : 'event-session'}"></span>
          <div><strong>${esc(label)}</strong><small>${esc(e.note || '')}</small></div>
          <time>${when}</time>
        </div>`;
      }).join('')
    : '<p class="muted-cell">No awards or engagements logged yet.</p>';

  const teachers = Data.users().filter(isTeacher);
  $('rec-teacher').innerHTML = teachers.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  $('rec-award-btn').onclick = async () => {
    await Growth.recordTeacherRecognition({ teacherId: $('rec-teacher').value, kind: $('rec-kind').value, note: $('rec-note').value.trim() });
    $('rec-note').value = '';
    renderAdminRecognition();
    toast('Honor awarded.');
  };

  const arts = (Data.artifacts() || []).filter(a => a.status === 'pending');
  $('rec-portfolio').innerHTML = arts.length
    ? arts.map(a => {
        const stu = Data.student(a.studentId);
        return `<tr>
          <td><div class="student"><span class="student-avatar ${stu ? toneClass(stu.tone) : 'blue'}">${stu ? stu.initials : '?'}</span>${esc(stu?.name || a.studentId)}</div></td>
          <td><strong>${esc(a.title)}</strong><small class="muted-cell"> ${esc(a.kind)}${a.note ? ' · ' + esc(a.note) : ''}</small></td>
          <td><span class="status review">Pending</span></td>
          <td class="role-row-actions">
            <button class="btn-sm-save" data-verify="${a.id}">Verify</button>
            <button class="btn-sm-outline" data-reject="${a.id}">Reject</button>
          </td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="4" class="muted-cell">Nothing waiting for verification.</td></tr>';
  $all('[data-verify]').forEach(b => b.addEventListener('click', async () => {
    await Growth.decideArtifact(b.dataset.verify, true, currentUser.id);
    renderAdminRecognition(); toast('Artifact verified — +150 XP credited to the student.');
  }));
  $all('[data-reject]').forEach(b => b.addEventListener('click', async () => {
    await Growth.decideArtifact(b.dataset.reject, false, currentUser.id);
    renderAdminRecognition(); toast('Artifact rejected.');
  }));
}

// openClassReportModal is imported from ./shared.js (above)
