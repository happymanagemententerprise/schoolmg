// ============================================================
//  Happy Man Academy — Application Logic (v4)
//
//  Teacher capability model (every role is additive):
//    Subject Teacher  → subjects, scores, assignments, mentors
//    Class Teacher    → everything above + own class attendance,
//                       feedback and the full class report (all subjects)
//    HOD              → everything above + department oversight and
//                       reports for every class, limited to the
//                       subjects in the department they head
// ============================================================

'use strict';

let currentUser = null;

// ── DOM helpers ──────────────────────────────────────────────
const $    = id  => document.getElementById(id);
const $q   = sel => document.querySelector(sel);
const $all = sel => document.querySelectorAll(sel);
const esc  = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

// ── Capability helpers ───────────────────────────────────────
function isTeacher(user) {
  return !!user && ['Subject Teacher', 'Class Teacher', 'HOD'].includes(user.role);
}
function isAdmin(user)   { return user?.role === 'Administrator'; }
function isStudent(user) { return user?.role === 'Student'; }
function isParent(user)  { return user?.role === 'Parent'; }

// The class this teacher is in charge of (if any)
function myClassRecord(user) {
  return Data.classes().find(c => c.classTeacherId === user?.id) || null;
}
function hasClass(user) { return !!myClassRecord(user); }
function isHOD(user)    { return user?.role === 'HOD'; }

// Departments this HOD is responsible for
function myDepartments(user) {
  return Data.departments().filter(d => d.hodId === user?.id);
}

// Build nav items for a teacher — additive based on capabilities
function buildTeacherCapabilities(user) {
  // Every teacher gets the subject-level pages
  const nav = [
    { page: 'view-subject-dashboard', label: 'Dashboard', icon: 'D' },
    { page: 'view-subject-scores',    label: 'Scores',    icon: '✎' }
  ];
  // A class teacher is in charge of a class
  if (hasClass(user)) {
    nav.push(
      { page: 'view-class-overview',   label: 'My Class',     icon: 'C' },
      { page: 'view-class-report',     label: 'Class Report', icon: 'R' },
      { page: 'view-class-attendance', label: 'Attendance',   icon: 'A' },
      { page: 'view-class-feedback',   label: 'Feedback',     icon: 'F' },
      { page: 'view-admin-timetable',  label: 'Timetable',    icon: 'T' }
    );
  }
  // An HOD also oversees a department
  if (isHOD(user)) nav.push({ page: 'view-hod-dashboard', label: 'Department', icon: 'D' });
  return nav;
}

// ── Static nav for non-teacher roles ────────────────────────
const STATIC_NAV = {
  'Administrator': [
    { page: 'view-admin-overview',   label: 'Overview',   icon: 'O' },
    { page: 'view-admin-people',     label: 'People',     icon: 'P' },
    { page: 'view-admin-classes',    label: 'Classes',    icon: 'C' },
    { page: 'view-admin-subjects',   label: 'Subjects',   icon: 'S' },
    { page: 'view-admin-timetable',  label: 'Timetable',  icon: 'T' },
    { page: 'view-admin-analytics',  label: 'Analytics',  icon: 'A' },
    { page: 'view-admin-setup',      label: 'Setup',      icon: '◎' }
  ],
  'Student': [
    { page: 'view-student-dashboard', label: 'Dashboard',  icon: 'D' },
    { page: 'view-student-results',   label: 'My Results', icon: 'R' }
  ],
  'Parent': [
    { page: 'view-parent-dashboard',  label: 'Dashboard',  icon: 'D' }
  ]
};

function navForUser(user) {
  if (isTeacher(user)) return buildTeacherCapabilities(user);
  return STATIC_NAV[user.role] || [];
}

// ── Misc helpers ─────────────────────────────────────────────
function gradeLabel(score) {
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}
function toneClass(t) {
  return { blue:'avatar-blue', coral:'avatar-coral', green:'avatar-green', yellow:'avatar-yellow' }[t] || 'avatar-blue';
}
function statusClass(s) {
  return s === 'Promoted' ? 'promoted' : s === 'Review' ? 'review' : 'repeat';
}
function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
function avatarInitials(n) {
  return String(n || '?').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}
function levelTag(level) {
  const map = { JSS: 'Junior', SS: 'Senior', BOTH: 'JSS + SS' };
  return `<span class="level-tag level-${(level || 'BOTH').toLowerCase()}">${map[level] || level || '—'}</span>`;
}
function streamTag(stream) {
  return stream ? `<span class="stream-tag stream-${stream.toLowerCase()}">${stream}</span>` : '';
}
function subjectChip(sub) {
  return `<span class="subject-chip chip-${sub?.color || 'blue'}">${esc(sub?.code || '?')}</span>`;
}
function toast(msg, type = 'success') {
  const el = $('toast');
  el.textContent = msg;
  el.className   = 'toast toast-' + type;
  el.hidden      = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, 3200);
}
function currentTerm() { return Data.session().currentTerm; }
function passMark()    { return Academic.PASS_MARK; }

function showView(pageId) {
  $all('.page-wrap').forEach(v => { v.hidden = true; });
  const view = $(pageId);
  if (view) {
    view.hidden = false;
    const nav = navForUser(currentUser);
    $('page-title').textContent = nav.find(n => n.page === pageId)?.label || 'Dashboard';
  }
  $all('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === pageId));
  $q('.sidebar')?.classList.remove('open');
}
function openModal(id)  { const m=$(id); if(m){m.hidden=false; m.setAttribute('aria-hidden','false');} }
function closeModal(id) { const m=$(id); if(m){m.hidden=true;  m.setAttribute('aria-hidden','true');} }
function openDrawer()   { const d=$('report-drawer'); d.classList.add('open');    d.setAttribute('aria-hidden','false'); }
function closeDrawer()  { const d=$('report-drawer'); d.classList.remove('open'); d.setAttribute('aria-hidden','true'); }
function closeMenus()    { $all('.row-menu-list').forEach(m => { m.hidden = true; }); }

function downloadCsv(filename, rows) {
  const csv  = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Login ────────────────────────────────────────────────────
function initLogin() {
  const emailI = $('login-email'), pwI = $('login-password'), err = $('login-error');

  $all('.demo-btn').forEach(btn => btn.addEventListener('click', () => {
    emailI.value = btn.dataset.email;
    pwI.value    = btn.dataset.pw;
    err.hidden   = true;
  }));

  $('toggle-pw').addEventListener('click', () => {
    pwI.type = pwI.type === 'password' ? 'text' : 'password';
  });

  $('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const user = Data.userByEmail(emailI.value.trim().toLowerCase());
    if (user && user.password === pwI.value) { err.hidden = true; login(user); }
    else err.hidden = false;
  });
}

function login(user) {
  currentUser = user;
  DB.set('currentUser', { email: user.email });
  $('login-screen').hidden = true;
  $('app-shell').hidden    = false;
  buildNav(user);
  updateSidebarUser(user);
  routeToDefaultView(user);
}

function logout() {
  currentUser = null;
  DB.set('currentUser', null);
  $('app-shell').hidden    = true;
  $('login-screen').hidden = false;
  $('login-email').value = '';
  $('login-password').value = '';
}

function buildNav(user) {
  const items = navForUser(user);
  $('main-nav').innerHTML =
    '<p class="nav-label">Workspace</p>' +
    items.map(n =>
      `<button class="nav-item" data-page="${n.page}">
         <span class="nav-icon">${n.icon}</span>${n.label}
       </button>`
    ).join('') +
    '<p class="nav-label secondary-label">Account</p>' +
    '<button class="nav-item" id="nav-logout"><span class="nav-icon">⏻</span>Sign out</button>';

  $all('.nav-item').forEach(btn => btn.addEventListener('click', () => {
    if (btn.id === 'nav-logout') { logout(); return; }
    showView(btn.dataset.page);
    renderView(btn.dataset.page);
  }));
}

function updateSidebarUser(user) {
  $('sidebar-name').textContent   = user.name;
  $('sidebar-role').textContent   = user.role;
  $('sidebar-avatar').textContent = avatarInitials(user.name);
  $('sidebar-avatar').className   = `avatar ${user.tone}`;
  $('topbar-name').textContent    = user.name.split(' ')[0];
  $('topbar-avatar').textContent  = avatarInitials(user.name);
  $('topbar-avatar').className    = `avatar sm-avatar ${user.tone}`;
  const sess = Data.session();
  $('sidebar-session').textContent = `${sess.name} · Term ${sess.currentTerm}`;
}

function routeToDefaultView(user) {
  const first = navForUser(user)[0];
  if (first) { showView(first.page); renderView(first.page); }
}

// ── View router ──────────────────────────────────────────────
function renderView(pageId) {
  ({
    'view-admin-overview':    renderAdminOverview,
    'view-admin-people':      renderAdminPeople,
    'view-admin-classes':     renderAdminClasses,
    'view-admin-subjects':    renderAdminSubjects,
    'view-admin-timetable':   renderAdminTimetable,
    'view-admin-analytics':   renderAdminAnalytics,
    'view-admin-setup':       renderAdminSetup,
    'view-subject-dashboard': renderSubjectDashboard,
    'view-subject-scores':    renderSubjectScores,
    'view-class-overview':    renderClassOverview,
    'view-class-report':      renderClassReport,
    'view-class-attendance':  renderClassAttendance,
    'view-class-feedback':    renderClassFeedback,
    'view-hod-dashboard':     renderHODDashboard,
    'view-student-dashboard': renderStudentDashboard,
    'view-student-results':   renderStudentResults,
    'view-parent-dashboard':  renderParentDashboard
  })[pageId]?.();
}

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-nav]');
  if (btn) {
    // Buttons can point at a view outside the sidebar, so the target
    // still has to be one the current role is allowed to open.
    const page = btn.dataset.nav;
    if (!navForUser(currentUser).some(n => n.page === page)) return;
    showView(page); renderView(page); return;
  }
  if (!e.target.closest('.row-menu-wrap')) closeMenus();
});

// ══════════════════════════════════════════════════════════════
//  ADMINISTRATOR
// ══════════════════════════════════════════════════════════════
function renderAdminOverview() {
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
  $('admin-student-search').oninput = e => renderAdminStudentTable(e.target.value);
}

function renderAdminStudentTable(query = '') {
  const term = currentTerm();
  const q    = query.toLowerCase();
  const list = Data.students().filter(s =>
    s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));

  $('admin-student-table').innerHTML = list.length
    ? list.map(s => {
        const cl     = Data.cls(s.classId);
        const avg    = Academic.termAverage(s.id, term);
        const status = Academic.promotionStatus(s.id, term);
        return `<tr>
          <td><div class="student"><span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>${esc(s.name)}</div></td>
          <td>${esc(cl?.name || '—')}</td>
          <td><span class="score">${avg}%</span></td>
          <td class="muted-cell">${Academic.attendancePct(s.id)}</td>
          <td><span class="status ${statusClass(status)}">${status}</span></td>
          <td>${studentRowMenu(s.id)}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="6" class="muted-cell">No students match.</td></tr>';

  bindStudentRowMenus();
}

function studentRowMenu(sid) {
  return `<div class="row-menu-wrap">
    <button class="row-menu" data-menu-toggle aria-label="Student actions">•••</button>
    <div class="row-menu-list" hidden>
      <button data-student="${sid}">Open full report</button>
      <button data-student-mentor="${sid}">Assign mentor</button>
    </div>
  </div>`;
}

function bindStudentRowMenus() {
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
    closeMenus(); openMentorModal(btn.dataset.studentMentor);
  }));
}

function renderUploadToggles() {
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

function renderEventsList(cid, max = 99) {
  const el = $(cid); if (!el) return;
  el.innerHTML = Data.events().slice(0, max).map(ev => {
    const d = new Date(ev.date);
    return `<div class="timeline-item">
      <time>${d.getDate()}<small>${d.toLocaleDateString('en-GB',{month:'short'}).toUpperCase()}</small></time>
      <div><strong>${esc(ev.title)}</strong><span>${esc(ev.note || '')}</span></div>
    </div>`;
  }).join('') || '<p class="muted-cell">No events scheduled.</p>';
}

// ── Admin · People (staff / students / parents) ──────────────
let _editingUserId = null;

function renderAdminPeople() {
  bindPeopleTabs();
  renderPeopleTab('staff');

  $('add-user-btn').onclick = () => {
    _editingUserId = null;
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

function syncPersonForm() {
  const role = $('nu-role').value;
  const isParent  = role === 'Parent';
  const isStudent = role === 'Student';
  const isStaff   = ['Class Teacher', 'Subject Teacher', 'HOD'].includes(role);

  $('nu-phone-group').hidden   = !isParent && !isStaff;
  $('nu-phone-required').hidden = !isParent;
  $('nu-phone').placeholder    = isParent ? 'e.g. 08031234567 (required)' : 'Optional';
  $('nu-class-group').hidden    = !isStudent;
  $('nu-gender-group').hidden   = !isStudent;
  $('nu-admission-group').hidden = !isStudent;
  $('nu-mentor-group').hidden   = !isStudent;
  $('nu-mentor-flag-row').hidden = !isStaff;
  $('nu-mentor').innerHTML = '<option value="">— No mentor —</option>' +
    Data.mentors().map(m => `<option value="${m.id}">${esc(m.name)} (${esc(m.role)})</option>`).join('');
}

async function saveUserFromForm() {
  const feedback = $('nu-feedback');
  feedback.textContent = '';
  const name  = $('nu-name').value.trim();
  const email = $('nu-email').value.trim().toLowerCase();
  const role  = $('nu-role').value;
  const pw    = $('nu-password').value.trim();
  const phone = $('nu-phone').value.trim();

  if (!name || !email || !pw) {
    feedback.textContent = 'Name, email and password are required.';
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
  if (_editingUserId) {
    const done = Data.updateUser(_editingUserId, { name, phone, role, password: pw });
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

  // Save locally first and let the database write settle in the
  // background, so the modal never sits there looking frozen.
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

  // Redraw once the database has confirmed, so the real id shows up
  pending.then(() => {
    if ($('add-user-modal').hidden) {
      renderPeopleTab($q('#people-tabs .tab-btn.active')?.dataset.tab || 'staff');
    }
  });
}

function bindPeopleTabs() {
  $all('#people-tabs .tab-btn').forEach(btn => btn.onclick = () => {
    $all('#people-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderPeopleTab(btn.dataset.tab);
  });
}

function renderPeopleTab(tab) {
  const wrap = $('people-table-wrap');
  const term = currentTerm();

  if (tab === 'staff') {
    const staff = Data.users().filter(isTeacher);
    wrap.innerHTML = `<table><thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th><th>Subjects</th><th>ID</th></tr></thead><tbody>` +
      staff.map(u => {
        const subs = [...new Set(myTeacherSubjectsOf(u.id).map(ts => Data.subject(ts.subjectId)?.code).filter(Boolean))];
        return `<tr>
          <td><div class="student"><span class="student-avatar ${toneClass(u.tone)}">${u.initials}</span>${esc(u.name)}${u.isMentor ? ' <span class="level-tag level-both">Mentor</span>' : ''}</div></td>
          <td><span class="status review">${u.role}</span></td>
          <td class="muted-cell">${esc(u.phone || '—')}</td>
          <td class="muted-cell">${esc(u.email)}</td>
          <td class="muted-cell">${esc(subs.slice(0, 3).join(', ') || '—')}${subs.length > 3 ? ` +${subs.length - 3}` : ''}</td>
          <td class="muted-cell">${u.id}</td>
        </tr>`;
      }).join('') + '</tbody></table>';

  } else if (tab === 'students-all') {
    wrap.innerHTML = `<table><thead><tr><th>Name</th><th>Class</th><th>Admission no</th><th>Mentor</th><th>Avg</th><th>Status</th><th></th></tr></thead><tbody>` +
      Data.students().map(s => {
        const avg    = Academic.termAverage(s.id, term);
        const status = Academic.promotionStatus(s.id, term);
        const mentor = Data.mentor(s.mentorId);
        return `<tr>
          <td><div class="student"><span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>${esc(s.name)}</div></td>
          <td>${esc(Data.cls(s.classId)?.name || '—')}</td>
          <td class="muted-cell">${esc(s.admissionNo || '—')}</td>
          <td class="muted-cell">${esc(mentor?.name || 'No mentor')}</td>
          <td><span class="score">${avg}%</span></td>
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
      _editingUserId = p.id;
      $('nu-modal-title').textContent = 'Edit person';
      $('nu-feedback').textContent = '';
      $('nu-name').value = p.name;
      $('nu-email').value = p.email;
      $('nu-phone').value = p.phone || '';
      $('nu-password').value = p.password || '';
      $('nu-role').value = p.role;
      syncPersonForm();
      openModal('add-user-modal');
    }));
  }
}

function myTeacherSubjectsOf(teacherId) {
  return Data.teacherSubjects().filter(ts => ts.teacherId === String(teacherId));
}

// ── Admin · Classes ──────────────────────────────────────────
function renderAdminClasses() {
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
      showView('view-admin-timetable');
      renderAdminTimetable(btn.dataset.classTimetable);
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
    // The cache is updated synchronously; the database write settles
    // in the background.
    Data.addClass({
      name, level, stream: stream || null, year: year || null,
      classTeacherId: $('nc-teacher').value || null
    }).then(() => {
      draw();
      refreshTTClassSelect();
    });
  };
}

function syncClassForm() {
  const level = $('nc-level').value;
  $('nc-stream-group').hidden = level !== 'SS';
  $('nc-year-group').hidden   = false;

  // Grade 7-9 for junior secondary, Grade 10-12 for senior secondary
  const allowed = level === 'SS' ? ['10', '11', '12'] : ['7', '8', '9'];
  const sel = $('nc-year');
  [...sel.options].forEach(o => { o.hidden = !allowed.includes(o.value); });
  if (!allowed.includes(sel.value)) sel.value = allowed[0];

  $('nc-year-hint').textContent = level === 'SS'
    ? 'Pick the year and the track; the year also sets the class level.'
    : 'Junior secondary classes take the common JSS subject list.';
}

function openClassStudentsModal(classId) {
  const cl       = Data.cls(classId);
  const students = Data.studentsByClass(classId);
  const term     = currentTerm();
  $('class-students-title').textContent = `${cl?.name} — Students`;
  $('class-students-table-wrap').innerHTML = students.length
    ? `<table><thead><tr><th>Student</th><th>Gender</th><th>Mentor</th><th>Avg</th><th>Status</th><th></th></tr></thead><tbody>` +
      students.map(s => {
        const avg    = Academic.termAverage(s.id, term);
        const status = Academic.promotionStatus(s.id, term);
        const mentor = Data.mentor(s.mentorId);
        return `<tr>
          <td><div class="student"><span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>${esc(s.name)}</div></td>
          <td class="muted-cell">${s.gender === 'F' ? 'Female' : 'Male'}</td>
          <td class="muted-cell">${esc(mentor?.name || '—')}</td>
          <td><span class="score">${avg}%</span></td>
          <td><span class="status ${statusClass(status)}">${status}</span></td>
          <td><button class="btn-sm-save" data-student="${s.id}">View report</button></td>
        </tr>`;
      }).join('') + '</tbody></table>'
    : '<p class="muted-cell" style="padding:16px">No students in this class.</p>';
  openModal('class-students-modal');
  $all('#class-students-table-wrap [data-student]').forEach(b =>
    b.addEventListener('click', () => { closeModal('class-students-modal'); openStudentReport(b.dataset.student); }));
}

function openClassTeacherModal(classId) {
  const cl = Data.cls(classId);
  $('ct-modal-title').textContent = `${cl?.name} - class teacher`;
  // The select is a read-only display of which class is being edited, so it
  // needs an option before its value can be set.
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
    toast(teacherId ? `${Data.user(teacherId)?.name} is now the class teacher of ${klass.name}.` : 'Class teacher removed.');
    renderAdminClasses();
    // The local cache is updated synchronously; the database write
    // settles in the background.
    Data.assignClassTeacher(klass.id, teacherId || null).then(renderAdminClasses);
  };
}

// ── Admin · Subjects ─────────────────────────────────────────
function renderAdminSubjects() {
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

  $('as-filter-level').onchange = draw;
  $('as-filter-group').onchange = draw;
  $('as-filter-level').value = 'ALL';
  $('as-filter-group').value = 'ALL';
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

function syncSubjectForm() {
  const level = $('ns-level').value;
  $('ns-group-group').hidden = level === 'JSS';
}

// ── Admin · Timetable (single class or the whole school) ─────
function renderAdminTimetable(preselectClassId = null) {
  // Teachers only ever see (and generate) the timetable for their own class
  const mine = myClassRecord(currentUser);
  if (!isAdmin(currentUser)) preselectClassId = mine?.id ?? null;
  refreshTTClassSelect(preselectClassId, isAdmin(currentUser) ? null : mine?.id);
  $('generate-tt-all-btn').hidden = !isAdmin(currentUser);

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
            <div class="tt-class-head"><strong>${esc(s.name)}</strong> ${levelTag(s.level)} ${streamTag(s.stream)}</div>
            ${timetableTable(s)}
          </div>`).join('')}
        ${result.absent.length ? `<p class="form-feedback error mt8">No teacher is allocated to any subject for: ${esc(result.absent.join(', '))}</p>` : ''}
        ${Object.keys(result.unstaffed || {}).length ? `<div class="form-feedback error mt8">
             These subjects are in the curriculum but have no teacher allocated, so they were left out of the timetable:
             ${Object.entries(result.unstaffed).map(([c, subs]) => `<br>${esc(c)} — ${esc(subs.join(', '))}`).join('')}
           </div>` : ''}
       </div>`;
    $('tt-download-all').onclick = () => {
      const rows = [['Class', 'Day', 'Period', 'Time', 'Subject', 'Teacher']];
      result.schedules.forEach(s => s.days.forEach(d => d.periods.forEach(p => {
        rows.push([s.name, d.day, p.period, p.time, p.subject, p.teacher]);
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

function refreshTTClassSelect(preselect, lockToClassId = null) {
  const sel = $('tt-class'); if (!sel) return;
  const list = lockToClassId
    ? Data.classes().filter(c => String(c.id) === String(lockToClassId))
    : Data.classes();
  sel.innerHTML = list.map(cl =>
    `<option value="${cl.id}" ${String(cl.id) === String(preselect) ? 'selected' : ''}>${esc(cl.name)}</option>`).join('');
  sel.disabled = !!lockToClassId;
}

function timetableTable(schedule) {
  const colors = ['coral', 'blue', 'green', 'yellow', 'coral', 'blue', 'green'];
  const periods = schedule.days[0]?.periods.length || 0;
  let html = `<div class="timetable-wrap mt16"><table class="timetable-table">
    <thead><tr><th>Period</th><th>Time</th>${schedule.days.map(d => `<th>${d.day}</th>`).join('')}</tr></thead><tbody>`;
  for (let p = 0; p < periods; p++) {
    html += `<tr><td class="tt-period">P${p + 1}</td><td class="tt-time muted-cell">${schedule.days[0].periods[p].time}</td>`;
    schedule.days.forEach((day, di) => {
      const s = day.periods[p];
      if (s.free) {
        html += `<td><span class="tt-subject tt-free">${esc(s.subject)}</span></td>`;
        return;
      }
      html += `<td><span class="subject-chip chip-${s.color || colors[di % colors.length]}">${esc(s.code)}</span>
                <span class="tt-subject">${esc(s.subject)}</span>
                <small class="tt-teacher">${esc(s.teacher)}</small></td>`;
    });
    html += '</tr>';
  }
  return html + '</tbody></table></div>';
}

function timetableCsv(schedule) {
  const rows = [['Day', 'Period', 'Time', 'Subject', 'Code', 'Teacher']];
  schedule.days.forEach(d => d.periods.forEach(p => {
    rows.push([d.day, p.period, p.time, p.subject, p.code, p.teacher]);
  }));
  return rows;
}

// ── Admin · Analytics ────────────────────────────────────────
function renderAdminAnalytics() {
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
  }
  draw();
  classSel.onchange = draw;
  $('analytics-term').onchange = draw;
}

// ── Admin · Setup ────────────────────────────────────────────
function renderAdminSetup() {
  const sess = Data.session();
  $('setup-session-name').value = sess.name;
  $('setup-term').value = sess.currentTerm;
  updateUploadLabels(sess);
  renderSetupEventsList();

  $('toggle-test-upload').onclick = () => { const s = Data.session(); s.uploadOpen.test = !s.uploadOpen.test;  Data.saveSession(s); updateUploadLabels(s); };
  $('toggle-exam-upload').onclick = () => { const s = Data.session(); s.uploadOpen.exam = !s.uploadOpen.exam; Data.saveSession(s); updateUploadLabels(s); };
  $('save-session-btn').onclick = () => {
    const s = Data.session();
    s.name = $('setup-session-name').value.trim() || s.name;
    s.currentTerm = +$('setup-term').value;
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

  // Term dates are read-only here; they are maintained in the database.
  $('term-dates-list').innerHTML = sess.terms.map(t =>
    `<div class="event-mini-row">
      <span class="event-dot ${t.term === sess.currentTerm ? 'event-academic' : 'event-session'}"></span>
      <div><strong>${esc(t.name)}${t.term === sess.currentTerm ? ' · current' : ''}</strong>
      <small>${t.start ? formatDate(t.start) : '—'} → ${t.end ? formatDate(t.end) : '—'}</small></div>
    </div>`).join('');
}

function updateUploadLabels(sess) {
  ['test', 'exam'].forEach(t => {
    const el = $(`upload-${t}-label`);
    el.textContent = sess.uploadOpen[t] ? 'Open' : 'Closed';
    el.className   = sess.uploadOpen[t] ? 'open-label' : 'closed-label';
  });
}

function renderSetupEventsList() {
  const el = $('events-list-mini'); if (!el) return;
  el.innerHTML = Data.events().map(ev => `
    <div class="event-mini-row">
      <span class="event-dot event-${ev.type}"></span>
      <div><strong>${esc(ev.title)}</strong><small>${formatDate(ev.date)} · ${esc(ev.note || '')}</small></div>
    </div>`).join('') || '<p class="muted-cell">No events yet.</p>';
}

// ══════════════════════════════════════════════════════════════
//  TEACHER VIEWS
//  Subject pages: every teacher.
//  Class pages: class teachers (and HODs who own a class).
// ══════════════════════════════════════════════════════════════
function myTeacherSubjects() {
  return Data.teacherSubjects().filter(ts => ts.teacherId === currentUser.id);
}

// The subject/class pairs this teacher is responsible for
function myTeachingPairs() {
  return myTeacherSubjects().map(ts => ({
    subjectId: ts.subjectId,
    classId: ts.classId,
    subject: Data.subject(ts.subjectId),
    cls: Data.cls(ts.classId)
  })).filter(p => p.subject && p.cls);
}

// ── Subject dashboard (all teachers) ────────────────────────
function renderSubjectDashboard() {
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

  // How many students already have a score from this teacher
  const withScores = new Set();
  mine.forEach(ts => {
    Data.studentsByClass(ts.classId).forEach(s => {
      if (Data.studentScores(s.id)[ts.subjectId]?.[sess.currentTerm]) withScores.add(`${s.id}:${ts.subjectId}`);
    });
  });
  $('st-stat-uploaded').textContent = withScores.size;

  // Subject + class coverage — the teacher always sees what they teach
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
  $('st-file-input').onchange = e => { if (e.target.files.length) toast(`${e.target.files[0].name} ready to upload.`); };
  const dlBtn = $('st-download-sheet-btn');
  if (dlBtn) dlBtn.onclick = downloadScoreSheet;

  $('st-create-assign-btn').onclick = () => { populateAssignmentModal(); openModal('add-assignment-modal'); };
  $('save-assignment-btn').onclick  = saveAssignment;
  $('st-assign-mentor-btn').onclick = () => openMentorModal();
  $('st-report-link').onclick = hasClass(currentUser)
    ? () => { showView('view-class-report'); renderClassReport(); }
    : () => { showView('view-subject-scores'); renderSubjectScores(); };
}

// ── Mentorship segment ───────────────────────────────────────
function renderMentees() {
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

function openMentorModal(focusStudentId = null) {
  // A teacher can mentor students from the classes they teach
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
    if (isAdmin(currentUser)) renderPeopleTab($q('#people-tabs .tab-btn.active')?.dataset.tab || 'students-all');
  };
}

// ── Subject scores — only the classes this teacher teaches ───
function renderSubjectScores() {
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
  if (dlBtn) dlBtn.onclick = downloadScoreSheet;
}

// Download score sheet CSV for the selected subject / class / term
function downloadScoreSheet() {
  const mine = myTeacherSubjects();
  if (!mine.length) { toast('No subjects are assigned to you.', 'error'); return; }

  const subSel = $('st-score-subject');
  const subjectId = subSel?.value || mine[0].subjectId;
  const classId   = ($('st-score-class')?.value) || '';
  const term      = +($('st-score-term')?.value || currentTerm());
  const subject   = Data.subject(subjectId);
  const classIds  = classId ? [classId] : [...new Set(mine.filter(ts => ts.subjectId === subjectId).map(ts => ts.classId))];
  const students  = classIds.flatMap(cid => Data.studentsByClass(cid).map(s => ({ s, cid })));

  const rows = [[`Happy Man Academy — ${subject?.name} · Term ${term}`],
                ['Class', 'Student ID', 'Student Name', 'CA Score (max 40)', 'Exam Score (max 60)', 'Total']];
  students.forEach(({ s, cid }) => {
    const e = Data.studentScores(s.id)[subjectId]?.[term];
    rows.push([Data.cls(cid)?.name || '', s.id, s.name, e?.test ?? '', e?.exam ?? '', e ? e.test + e.exam : '']);
  });
  downloadCsv(`scores_${subject?.code || 'sub'}_term${term}.csv`, rows);
  toast('Score sheet downloaded.');
}

// ── Assignment modal ─────────────────────────────────────────
function populateAssignmentModal() {
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

async function saveAssignment() {
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

// ── Class overview (class teacher / HOD with a class) ────────
function renderClassOverview() {
  const cl = myClassRecord(currentUser);
  if (!cl) { toast('You are not assigned a class yet.', 'error'); return; }
  const students = Data.studentsByClass(cl.id);
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
        <button class="row-menu ct-att-btn" data-sid="${s.id}" title="Edit attendance">✎</button>
      </div>`;
    }).join('');

  $all('.ct-att-btn').forEach(btn => btn.addEventListener('click', () => {
    showView('view-class-attendance');
    renderClassAttendance(btn.dataset.sid);
  }));

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
}

// ── Class report — every subject, the class teacher's view ───
function renderClassReport() {
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
    $('cr-meta').textContent    = `${report.students.length} students · ${subjects.length} subjects · ${levelTag(cl.level)} ${streamTag(cl.stream)}`;
    $('cr-class-average').textContent = Academic.classAverage(cl.id, term) + '%';
    $('cr-promoted').textContent      = `${report.students.filter(s => s.status === 'Promoted').length}/${report.students.length}`;

    // Matrix: every student against every subject
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

    // Subject summary
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
    const rows   = [[`${cl.name} — full class report · Term ${term}`],
                    ['Student ID', 'Student', ...report.subjects.map(s => s.name), 'Average', 'Status']];
    report.students.forEach(r => {
      rows.push([r.student.id, r.student.name, ...r.rows.map(x => x.score ?? ''), r.average, r.status]);
    });
    downloadCsv(`class_report_${cl.name.replace(/\s+/g, '_')}_term${term}.csv`, rows);
  };
  $('cr-register-btn').onclick = () => openClassReportModal(cl.id);
  $('cr-feedback-btn').onclick = () => { showView('view-class-feedback'); renderClassFeedback(); };
  draw();
}

// Full class register modal — CA and exam for every subject
function openClassReportModal(classId) {
  const cl = myClassRecord(currentUser);
  if (cl && String(cl.id) !== String(classId)) return;   // teachers only see their own class
  const klass = cl || Data.cls(classId);
  if (!klass) return;

  const termSel = $('register-term-sel');
  termSel.innerHTML = Data.session().terms.map(t =>
    `<option value="${t.term}" ${t.term === currentTerm() ? 'selected' : ''}>${esc(t.name)}</option>`).join('');

  function draw() {
    const term   = +termSel.value;
    const report = Academic.classReport(klass.id, term);
    $('register-title').textContent = `${klass.name} — full class register`;

    $('register-table-wrap').innerHTML = report.subjects.length && report.students.length
      ? `<table><thead><tr><th>Student</th>${report.subjects.map(s =>
          `<th>${esc(s.code)}<br><span class="cr-sub-name">${esc(s.name)}</span></th>`).join('')}<th>Avg</th><th>Remark</th></tr></thead><tbody>` +
        report.students.map(row => `<tr>
          <td><div class="student"><span class="student-avatar ${toneClass(row.student.tone)}">${row.student.initials}</span>${esc(row.student.name)}</div></td>
          ${row.rows.map(r => `<td class="cr-caexam">${
            r.ca === null ? '—' : `${r.ca} <span class="cr-plus">+</span> ${r.exam} <span class="cr-eq">=</span> <b>${r.score}</b>`}</td>`).join('')}
          <td><strong>${row.average}%</strong></td>
          <td class="muted-cell cr-remark">${esc(row.remark || '—')}</td>
        </tr>`).join('') + '</tbody></table>'
      : '<p class="muted-cell" style="padding:16px">Nothing to show yet.</p>';
  }
  termSel.onchange = draw;
  $('register-download-btn').onclick = () => {
    const term   = +termSel.value;
    const report = Academic.classReport(klass.id, term);
    const rows   = [['Student ID', 'Student', ...report.subjects.flatMap(s => [`${s.name} CA`, `${s.name} Exam`]), 'Average', 'Status']];
    report.students.forEach(r => {
      rows.push([r.student.id, r.student.name,
        ...r.rows.flatMap(x => [x.ca ?? '', x.exam ?? '']), r.average, r.status]);
    });
    downloadCsv(`register_${klass.name.replace(/\s+/g, '_')}_term${term}.csv`, rows);
  };
  draw();
  openModal('class-register-modal');
}

// ── Attendance ───────────────────────────────────────────────
function renderClassAttendance(focusSid = null) {
  const cl = myClassRecord(currentUser);
  if (!cl) { toast('You are not assigned a class yet.', 'error'); return; }
  const students = Data.studentsByClass(cl.id);
  const term     = currentTerm();
  const weeks    = ['W1', 'W2', 'W3', 'W4'];
  const att = Data.attendance(term);

  $('att-class-name').textContent = `${cl.name} · Term ${term}`;

  function draw() {
    $('ct-attendance-table').innerHTML = students.map(s => {
      const saved = Data.studentAttendance(s.id, term);
      const total = Object.values(saved).reduce((a, b) => a + b, 0);
      const pct   = Academic.attendancePct(s.id, term);
      const rowCls = s.id === focusSid ? 'att-focused' : '';
      const inputs = weeks.map(w =>
        `<td><input type="number" class="att-input" min="0" max="5"
          value="${saved[w] ?? ''}" placeholder="0"
          data-sid="${s.id}" data-week="${w}"
          aria-label="${esc(s.name)} ${w}"></td>`).join('');
      return `<tr class="${rowCls}">
        <td><div class="student"><span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>${esc(s.name)}</div></td>
        ${inputs}
        <td><strong>${total}</strong></td>
        <td><span class="status ${+pct >= 90 ? 'promoted' : 'repeat'}">${pct}</span></td>
        <td><button class="btn-sm-save" data-save-att="${s.id}">Save</button></td>
      </tr>`;
    }).join('');

    $all('.att-input').forEach(inp => inp.addEventListener('input', () => {
      const row    = inp.closest('tr');
      const total  = [...row.querySelectorAll('.att-input')].reduce((a, i) => a + (+i.value || 0), 0);
      row.querySelector('strong').textContent = total;
      const badge  = row.querySelector('.status');
      const pct    = Math.round((total / (weeks.length * 5)) * 100);
      badge.textContent = pct + '%';
      badge.className   = `status ${pct >= 90 ? 'promoted' : 'repeat'}`;
    }));

    $all('[data-save-att]').forEach(btn => btn.addEventListener('click', async () => {
      const sid  = btn.dataset.saveAtt;
      const row  = btn.closest('tr');
      att[sid]   = {};
      row.querySelectorAll('.att-input').forEach(i => {
        att[sid][i.dataset.week] = Math.min(5, Math.max(0, +i.value || 0));
      });
      await Data.saveAttendance(att, term);
      toast(`Attendance saved for ${Data.student(sid)?.name}.`);
      draw();
    }));
  }
  draw();
}

// ── Feedback ─────────────────────────────────────────────────
function renderClassFeedback() {
  const cl = myClassRecord(currentUser);
  if (!cl) { toast('You are not assigned a class yet.', 'error'); return; }
  const students = Data.studentsByClass(cl.id);
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

// ── HOD: department oversight + reports ──────────────────────
function renderHODDashboard() {
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

  // Department cards
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

  // Department subjects — the HOD can adjust the list
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

  // Assign teachers
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

  // School-wide analytics for the department's subjects
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

// HOD report: every class, but only the subjects of the department
function renderHODReport() {
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

// ══════════════════════════════════════════════════════════════
//  STUDENT
// ══════════════════════════════════════════════════════════════
function renderStudentDashboard() {
  const sid     = currentUser.studentId;
  const s       = Data.student(sid);
  if (!s) { toast('This login is not linked to a student record.', 'error'); return; }
  const term    = currentTerm();
  const cl      = Data.cls(s.classId);
  const avg     = Academic.termAverage(sid, term);
  const att     = Academic.attendancePct(sid);
  const status  = Academic.promotionStatus(sid, term);
  const assigns = Data.assignments().filter(a => a.classId === s.classId);
  const mentor  = Data.mentor(s.mentorId);
  const check   = Academic.promotionCheck(sid, term);

  $('std-eyebrow').textContent      = `Student portal · ID ${sid} · ${s.admissionNo || ''}`;
  $('std-welcome').textContent      = `Welcome back, ${s.name.split(' ')[0]}.`;
  $('std-name').textContent         = s.name;
  $('std-class').textContent        = `${cl?.name || '—'} · ${Data.session().name}${cl?.stream ? ' · ' + cl.stream : ''}`;
  $('std-avatar').textContent       = s.initials;
  $('std-avatar').className         = `avatar ${toneClass(s.tone)}`;
  $('std-stat-avg').textContent     = avg + '%';
  $('std-stat-avg-note').textContent = `Grade ${gradeLabel(avg)} · ${[check.enPass, check.maPass, check.avgPass].filter(Boolean).length} of 3 met`;
  $('std-stat-att').textContent     = att;
  $('std-stat-assigns').textContent = assigns.length;
  $('std-stat-status').textContent  = status;

  $('std-subject-results').innerHTML = Academic.termScores(sid, term).map(sc => {
    const pct = sc.score ?? 0, pass = pct >= passMark();
    return `<div>
      <span>${esc(sc.name)}</span>
      <b class="${pass ? '' : 'text-danger'}">${pct}%</b>
      <i><em style="width:${pct}%;background:${pass ? 'var(--green)' : 'var(--coral)'}"></em></i>
    </div>`;
  }).join('');

  // Promotion tracker — English, Mathematics and the overall average
  const reqs = [
    { label: `English ${passMark()} and above`,        met: check.enPass, value: check.english + '%' },
    { label: `Mathematics ${passMark()} and above`,     met: check.maPass, value: check.maths + '%' },
    { label: `Overall average ${passMark()} and above`, met: check.avgPass, value: check.avg + '%' }
  ];
  const met      = reqs.filter(r => r.met).length;
  const promoted = check.pass;

  $('std-promo-title').textContent = promoted ? "You're on track" : 'Needs improvement';
  $('std-promo-badge').textContent = promoted ? '✓' : '!';
  $('std-promo-badge').className   = `check-badge ${promoted ? '' : 'warn-badge'}`;
  $('std-promo-circle').innerHTML  = `<strong>${met}/3</strong><span>requirements</span>`;
  $('std-promo-reqs').innerHTML    = reqs.map(r => `
    <div>
      <span class="requirement-check ${r.met ? '' : 'req-fail'}">${r.met ? '✓' : '✗'}</span>
      <span>${r.label}</span><b>${r.value}</b>
    </div>`).join('');

  $('std-assignments-list').innerHTML = assigns.map(a => {
    const sub = Data.subject(a.subjectId);
    return `<div class="assignment-item">
      <span class="assignment-type chip-${sub?.color || 'blue'}">${esc(sub?.code || '?')}</span>
      <div><strong>${esc(a.title)}</strong><small>${esc(sub?.name || '')}</small></div>
      <time>${formatDate(a.due)}</time>
    </div>`;
  }).join('') || '<p class="muted-cell">No assignments.</p>';

  $('std-mentor-card').innerHTML = mentorCard(mentor);
  $('std-view-report-btn').onclick = () => openStudentReport(sid);
  $('std-download-btn').onclick    = () => toast('Report prepared. ✓');
}

function mentorCard(mentor) {
  if (!mentor) return '<p class="muted-cell">No mentor assigned yet.</p>';
  return `<div class="mentor-header">
      <div class="mentor-avatar avatar-${mentor.tone}">${mentor.initials}</div>
      <div class="mentor-info">
        <strong>${esc(mentor.name)}</strong>
        <span>${esc(mentor.subject || 'Mentor')} · ${esc(mentor.role)}${mentor.phone ? ' · ' + esc(mentor.phone) : ''}</span>
      </div>
    </div>
    <p class="mentor-bio mt8">${esc(mentor.bio || '')}</p>`;
}

function renderStudentResults() {
  const sid     = currentUser.studentId;
  if (!Data.student(sid)) { toast('This login is not linked to a student record.', 'error'); return; }
  const termSel = $('std-results-term');
  termSel.innerHTML = Data.session().terms.map(t =>
    `<option value="${t.term}" ${t.term === currentTerm() ? 'selected' : ''}>${esc(t.name)}</option>`).join('');

  function draw() {
    const term = +termSel.value;
    $('std-results-table').innerHTML = Academic.termScores(sid, term).map(sub => {
      const ca    = sub.ca ?? '—';
      const exam  = sub.exam ?? '—';
      const total = sub.score;
      const grade = total !== null ? gradeLabel(total) : '—';
      const pass  = total !== null && total >= passMark();
      return `<tr>
        <td><div class="student">${subjectChip(sub)}${esc(sub.name)}</div></td>
        <td class="muted-cell">${sub.type === 'core' ? 'Core' : 'Elective'}</td>
        <td>${ca}</td><td>${exam}</td>
        <td><strong>${total ?? '—'}</strong></td><td>${grade}</td>
        <td><span class="status ${total === null ? 'review' : pass ? 'promoted' : 'repeat'}">${total === null ? '—' : pass ? 'Pass' : 'Fail'}</span></td>
      </tr>`;
    }).join('');
    $('std-results-meta').textContent =
      `${Data.session().name} · ${Academic.termScores(sid, term).length} subjects · average ${Academic.termAverage(sid, term)}%`;
  }
  draw();
  termSel.onchange = draw;
}

// ══════════════════════════════════════════════════════════════
//  PARENT
// ══════════════════════════════════════════════════════════════
function renderParentDashboard() {
  const children = (currentUser.childIds || []).map(id => Data.student(id)).filter(Boolean);
  const term     = currentTerm();

  $('par-eyebrow').textContent       = `Parent portal · ${children.length} child${children.length !== 1 ? 'ren' : ''} linked · ${currentUser.phone || 'no phone on file'}`;
  $('par-welcome').textContent       = `Good morning, ${currentUser.name.split(' ')[0]}.`;
  $('par-stat-children').textContent = children.length;
  $('par-stat-names').textContent    = children.map(c => c.name.split(' ')[0]).join(' · ') || '—';
  const atts = children.map(c => +Academic.attendancePct(c.id));
  $('par-stat-att').textContent = (atts.length ? Math.round(atts.reduce((a, b) => a + b, 0) / atts.length) : 0) + '%';
  const avgs = children.map(c => Academic.termAverage(c.id, term));
  $('par-stat-avg').textContent    = (avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : 0) + '%';
  $('par-stat-events').textContent = Data.events().length;

  // Child cards — totals, mentor and attendance
  $('par-children-list').innerHTML = children.map(s => {
    const cl     = Data.cls(s.classId);
    const avg    = Academic.termAverage(s.id, term);
    const att    = Academic.attendancePct(s.id);
    const status = Academic.promotionStatus(s.id, term);
    const mentor = Data.mentor(s.mentorId);
    const check  = Academic.promotionCheck(s.id, term);
    return `<div class="child-card">
      <div class="student-profile">
        <div class="avatar ${toneClass(s.tone)}">${s.initials}</div>
        <div><strong>${esc(s.name)}</strong><span>${esc(cl?.name || '—')} · ${esc(s.admissionNo || s.id)}</span></div>
        <div class="child-mentor ml-auto">
          <small>Mentor</small>
          <strong>${esc(mentor?.name || 'Not assigned')}</strong>
          ${mentor?.phone ? `<small>${esc(mentor.phone)}</small>` : ''}
        </div>
      </div>
      <div class="child-metrics">
        <span><small>Term avg</small><b>${avg}%</b></span>
        <span><small>CA / Exam</small><b>${check.english >= 0 ? `${Academic.termScores(s.id, term).filter(r => r.ca !== null).length} subjects` : '—'}</b></span>
        <span><small>Attendance</small><b>${att}</b></span>
        <span class="status ${statusClass(status)}">${status}</span>
        <button class="text-button" data-child="${s.id}">CA &amp; exam scores ↗</button>
      </div>
    </div>`;
  }).join('') || '<p class="muted-cell">No children are linked to this account.</p>';

  $all('[data-child]').forEach(btn => btn.addEventListener('click', () => {
    showChildResults(btn.dataset.child);
  }));
  $all('[data-student]').forEach(btn => btn.addEventListener('click', () => openStudentReport(btn.dataset.student)));

  // Detailed CA / exam breakdown for the selected child
  if (children.length) {
    const sel = $('par-child-sel');
    sel.innerHTML = children.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    showChildResults(sel.value || children[0].id);
    sel.onchange = () => showChildResults(sel.value);
  } else {
    $('par-results-table').innerHTML = '<tr><td colspan="7" class="muted-cell">No children linked.</td></tr>';
    $('par-results-meta').textContent = '';
  }

  renderEventsList('par-events-list', 5);
}

// CA and exam split — what a parent needs to see
function showChildResults(studentId) {
  const s     = Data.student(studentId);
  if (!s) return;
  const term  = currentTerm();
  const rows  = Academic.termScores(studentId, term);
  const cl    = Data.cls(s.classId);
  const check = Academic.promotionCheck(studentId, term);

  $('par-results-meta').textContent =
    `${s.name} · ${cl?.name || '—'} · Term ${term} · average ${check.avg}% · ${check.pass ? 'on track to promote' : 'needs improvement'}`;

  $('par-results-table').innerHTML = rows.length ? rows.map(sub => {
    const total = sub.score;
    const pass  = total !== null && total >= passMark();
    return `<tr>
      <td><div class="student">${subjectChip(sub)}${esc(sub.name)}</div></td>
      <td class="muted-cell">${sub.ca ?? '—'}</td>
      <td class="muted-cell">${sub.exam ?? '—'}</td>
      <td><strong>${total ?? '—'}</strong></td>
      <td>${total !== null ? gradeLabel(total) : '—'}</td>
      <td class="cr-caexam">${sub.ca === null ? '—' : `${sub.ca} + ${sub.exam} = ${sub.score}`}</td>
      <td><span class="status ${total === null ? 'review' : pass ? 'promoted' : 'repeat'}">${total === null ? '—' : pass ? 'Pass' : 'Fail'}</span></td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="muted-cell">No results recorded.</td></tr>';
}

// ══════════════════════════════════════════════════════════════
//  STUDENT REPORT DRAWER
// ══════════════════════════════════════════════════════════════
function openStudentReport(studentId, termOverride = null) {
  const s = Data.student(studentId);
  if (!s) return;
  const term   = termOverride || currentTerm();
  const cl     = Data.cls(s.classId);
  const avg    = Academic.termAverage(studentId, term);
  const status = Academic.promotionStatus(studentId, term);
  const check  = Academic.promotionCheck(studentId, term);
  const mentor = Data.mentor(s.mentorId);

  $('drawer-eyebrow').textContent = `Term ${term} report · ${Data.session().name}`;
  $('drawer-name').textContent    = s.name;
  $('drawer-meta').textContent    = `${cl?.name || '—'} · ID ${studentId} · ${esc(s.admissionNo || '')}`;
  $('drawer-score').textContent   = avg + '%';
  const badge = $('drawer-status');
  badge.textContent = status;
  badge.className = `promotion-badge ${statusClass(status)}`;

  $('drawer-subjects').innerHTML = Academic.termScores(studentId, term).map(sc => {
    const pass = (sc.score ?? 0) >= passMark();
    return `<div class="subject-row">
      <div><span>${esc(sc.name)}</span>
        <small>${sc.type === 'core' ? 'Core' : 'Elective'} · CA ${sc.ca ?? '—'} + Exam ${sc.exam ?? '—'}</small></div>
      <b class="${pass ? '' : 'text-danger'}">${sc.score ?? '—'}</b>
    </div>`;
  }).join('');

  $('drawer-mentor-chip').innerHTML = mentor
    ? `<div class="drawer-mentor-chip mt16">
        <span class="chip-label">Mentor</span>
        <span class="student-avatar ${toneClass(mentor.tone)}" style="width:22px;height:22px;font-size:9px">${mentor.initials}</span>
        <span>${esc(mentor.name)} · ${esc(mentor.subject || 'Mentor')}${mentor.phone ? ' · ' + esc(mentor.phone) : ''}</span>
      </div>` : '';

  $('drawer-attendance').textContent  = Academic.attendancePct(studentId, term);
  $('drawer-download-btn').onclick = () => {
    const rows = [['Student', s.name], ['Class', cl?.name || ''], ['Term', term], ['Average', avg], ['Status', status], [],
                  ['Subject', 'CA (40)', 'Exam (60)', 'Total', 'Grade']];
    Academic.termScores(studentId, term).forEach(sc => {
      rows.push([sc.name, sc.ca ?? '', sc.exam ?? '', sc.score ?? '', sc.score !== null ? gradeLabel(sc.score) : '']);
    });
    downloadCsv(`report_${s.name.replace(/\s+/g, '_')}_term${term}.csv`, rows);
  };
  openDrawer();
}

// ══════════════════════════════════════════════════════════════
//  GLOBAL WIRING
// ══════════════════════════════════════════════════════════════
function wireGlobals() {
  $all('[data-close-drawer]').forEach(el => el.addEventListener('click', closeDrawer));
  $all('.close-modal').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.modal)));
  $all('[data-modal]').forEach(btn => {
    if (!btn.classList.contains('close-modal')) btn.addEventListener('click', () => closeModal(btn.dataset.modal));
  });
  $('logout-btn').addEventListener('click', logout);
  $('mobile-menu').addEventListener('click', () => $q('.sidebar').classList.toggle('open'));
  $q('.drawer-backdrop')?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenus(); closeDrawer(); } });
}

// ══════════════════════════════════════════════════════════════
//  BOOTSTRAP
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  const loadingEl = document.createElement('div');
  loadingEl.id      = 'app-loading';
  loadingEl.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:var(--bg,#f5f5f5);font-size:15px;color:#888;z-index:9999;';
  loadingEl.textContent   = 'Connecting to database…';
  document.body.appendChild(loadingEl);

  await loadFromSupabase();

  loadingEl.remove();

  wireGlobals();
  initLogin();

  const failed = Data.failedSources();
  if (failed.length) {
    console.warn('[HMA] unreachable tables:', failed.join(', '));
  }

  const saved = DB.get('currentUser');
  if (saved?.email) {
    const fresh = Data.userByEmail(saved.email);
    if (fresh) login(fresh);
  }
});
