// ============================================================
//  Happy Man Academy — Authentication, navigation and routing
// ============================================================

import { Data, DB } from './data/index.js';
import { getCurrentUser, setCurrentUser } from './state.js';
import { $, $q, $all, toast, avatarInitials } from './utils.js';

// ── Capability helpers ───────────────────────────────────────
export function isTeacher(user) {
  return !!user && ['Subject Teacher', 'Class Teacher', 'HOD'].includes(user.role);
}
export function isAdmin(user)   { return user?.role === 'Administrator'; }
export function isStudent(user) { return user?.role === 'Student'; }
export function isParent(user)  { return user?.role === 'Parent'; }
export function isHOD(user)     { return user?.role === 'HOD'; }

export function myClassRecord(user) {
  if (!user) return null;
  return Data.classes().find(c =>
    c.classTeacherId !== null &&
    String(c.classTeacherId) === String(user.id)
  ) || null;
}
export function hasClass(user) { return !!myClassRecord(user); }

export function myDepartments(user) {
  return Data.departments().filter(d => d.hodId === user?.id);
}

// ── Static nav for non-teacher roles ────────────────────────
export const STATIC_NAV = {
  'Administrator': [
    { page: 'view-admin-overview',   label: 'Overview',   icon: 'O' },
    { page: 'view-admin-people',     label: 'People',     icon: 'P' },
    { page: 'view-admin-classes',    label: 'Classes',    icon: 'C' },
    { page: 'view-admin-subjects',   label: 'Subjects',   icon: 'S' },
    { page: 'view-admin-progression', label: 'Progression', icon: '⇈' },
    { page: 'view-admin-timetable',  label: 'Timetable',  icon: 'T' },
    { page: 'view-admin-analytics',  label: 'Analytics',  icon: 'A' },
    { page: 'view-admin-leaderboard', label: 'Leaderboard', icon: '🏆' },
    { page: 'view-admin-recognition', label: 'Recognition', icon: '★' },
    { page: 'view-admin-setup',      label: 'Setup',      icon: '◎' }
  ],
  'Student': [
    { page: 'view-student-dashboard',   label: 'Dashboard',      icon: 'D' },
    { page: 'view-student-results',     label: 'My Results',     icon: 'R' },
    { page: 'view-student-pathway',     label: 'Choose my path', icon: '⇈' },
    { page: 'view-student-lessons',     label: 'My Lessons',     icon: 'L' },
    { page: 'view-student-quizzes',     label: 'My Quizzes',     icon: 'Q' },
    { page: 'view-student-discussions', label: 'Discussions',    icon: '◇' },
    { page: 'view-student-attendance',  label: 'My Attendance',  icon: 'A' },
    { page: 'view-student-assignments', label: 'Assignments',    icon: '✎' },
    { page: 'view-student-timetable',   label: 'Timetable',      icon: 'T' }
  ],
  'Parent': [
    { page: 'view-parent-dashboard',   label: 'Dashboard',  icon: 'D' },
    { page: 'view-parent-attendance',  label: 'Attendance', icon: 'A' },
    { page: 'view-parent-assignments', label: 'Assignments', icon: '✎' },
    { page: 'view-parent-timetable',   label: 'Timetable',  icon: 'T' }
  ]
};

export function buildTeacherCapabilities(user) {
  const nav = [
    { page: 'view-subject-dashboard', label: 'Dashboard', icon: 'D' },
    { page: 'view-subject-scores',    label: 'Scores',    icon: '✎' }
  ];
  nav.push(
    { page: 'view-teacher-lessons',     label: 'Lessons',     icon: 'L' },
    { page: 'view-teacher-quizzes',     label: 'Quizzes',     icon: 'Q' },
    { page: 'view-teacher-discussions', label: 'Discussions', icon: '◇' }
  );
  const cl = myClassRecord(user);
  if (cl) {
    nav.push(
      { page: 'view-class-overview',   label: 'My Class',     icon: 'C' },
      { page: 'view-class-report',     label: 'Class Report', icon: 'R' },
      { page: 'view-class-attendance', label: 'Attendance',   icon: 'A' },
      { page: 'view-class-feedback',   label: 'Feedback',     icon: 'F' },
      { page: 'view-admin-timetable',  label: 'Timetable',    icon: 'T' }
    );
  } else {
    const teacherClasses = Data.classes().map(c => ({ name: c.name, classTeacherId: c.classTeacherId }));
    console.info('[HMA] No class found for teacher id=' + user.id +
      '. Classes with teachers:', JSON.stringify(teacherClasses));
  }
  if (isHOD(user)) nav.push({ page: 'view-hod-dashboard', label: 'Department', icon: 'D' });
  return nav;
}

export function navForUser(user) {
  if (isTeacher(user)) return buildTeacherCapabilities(user);
  if (isStudent(user)) {
    const nav = [...STATIC_NAV['Student']];
    const st   = Data.student(user.studentId);
    const cl   = st ? Data.cls(st.classId) : null;
    const year = cl?.year ?? null;
    const showPath = !!(cl && (cl.selectionMode === 'pool' || Progression.isCheckpoint(year)));
    if (!showPath) {
      return nav.filter(n => n.page !== 'view-student-pathway');
    }
    return nav;
  }
  return STATIC_NAV[user.role] || [];
}

// ── Login / logout ───────────────────────────────────────────
export function initLogin() {
  const emailI = $('login-email'), pwI = $('login-password');

  $all('.demo-btn').forEach(btn => btn.addEventListener('click', () => {
    emailI.value = btn.dataset.email;
    pwI.value    = btn.dataset.pw;
    Alpine.store('loginError', '');
  }));

  $('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const email = emailI.value.trim().toLowerCase();
    const user  = Data.userByEmail(email);
    if (user && Data.passwordMatches(user, pwI.value)) {
      if (Data.accountBlocked(user)) {
        Alpine.store('loginError', 'This account has been archived and can no longer sign in. Contact the school office.');
        return;
      }
      Alpine.store('loginError', ''); login(user); return;
    }
    if (!user && Data.users().length) {
      Alpine.store('loginError', 'No account with that email. This page may be showing ' +
                        'out-of-date data - reload it, then try again.');
    } else if (user) {
      Alpine.store('loginError', 'That password is not right for ' + user.name + '.');
    } else {
      Alpine.store('loginError', 'Incorrect email or password.');
    }
  });
}

export function login(user) {
  setCurrentUser(user);
  DB.set('currentUser', { email: user.email });
  $('login-screen').hidden = true;
  $('app-shell').hidden    = false;
  buildNav(user);
  updateSidebarUser(user);
  routeToDefaultView(user);
}

export function logout() {
  setCurrentUser(null);
  DB.set('currentUser', null);
  $('app-shell').hidden    = true;
  $('login-screen').hidden = false;
  $('login-email').value = '';
  $('login-password').value = '';
}

export function buildNav(user) {
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
    // Import showView / renderView lazily to avoid circular deps
    import('./router.js').then(({ showView, renderView }) => {
      showView(btn.dataset.page);
      renderView(btn.dataset.page);
    });
  }));
}

export function updateSidebarUser(user) {
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

export function routeToDefaultView(user) {
  const first = navForUser(user)[0];
  if (first) {
    import('./router.js').then(({ showView, renderView }) => {
      showView(first.page);
      renderView(first.page);
    });
  }
}
