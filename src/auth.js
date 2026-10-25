// ============================================================
//  Happy Man Academy — Authentication, navigation and routing
// ============================================================

import { Data, DB } from './data/index.js';
import { clearPrevSessionCache } from './data/prevSessionCache.js';
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
    { page: 'view-campus',           label: 'Campus safety', icon: '◆' },
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
  nav.push({ page: 'view-campus', label: 'Campus safety', icon: '◆' });
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
  if (user?.role === 'SaaS Owner') return [
    { page: 'view-owner-schools', label: 'Schools', icon: 'S' },
    { page: 'view-owner-onboarding', label: 'Onboard school', icon: '+' }
  ];
  if (user?.role === 'Security Guard') return [{ page: 'view-campus', label: 'Gate register', icon: 'G' }];
  if (user?.role === 'Hostel Supervisor') return [{ page: 'view-campus', label: 'Hostel register', icon: 'H' }];
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

  Data.onAuthStateChange?.((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session?.user) {
      openPasswordRecovery(session.user.email);
    }
  });

  $('forgot-password-link').addEventListener('click', async () => {
    const email = emailI.value.trim().toLowerCase();
    const status = $('login-status');
    status.hidden = false;
    status.className = 'login-status muted-cell';
    if (!email) {
      status.textContent = 'Enter your email address above, then choose Forgot password?';
      emailI.focus();
      return;
    }

    const button = $('forgot-password-link');
    button.disabled = true;
    status.textContent = 'Sending password reset link…';
    try {
      const { error } = await Data.requestPasswordReset(email);
      if (error) throw new Error(error);
      status.textContent = 'If an account exists for this email, a reset link has been sent.';
    } catch (error) {
      status.textContent = error?.message || 'Could not send a reset link. Please try again.';
      status.className = 'login-status login-error';
    } finally {
      button.disabled = false;
    }
  });

  $('password-recovery-form').addEventListener('submit', async event => {
    event.preventDefault();
    const password = $('recovery-password').value;
    const confirm = $('recovery-password-confirm').value;
    const feedback = $('recovery-feedback');
    const submit = $('save-recovery-password');
    feedback.textContent = '';
    feedback.className = 'form-feedback mt8';

    if (password.length < 8) {
      feedback.textContent = 'Use at least 8 characters.';
      feedback.classList.add('error');
      return;
    }
    if (password !== confirm) {
      feedback.textContent = 'The passwords do not match.';
      feedback.classList.add('error');
      return;
    }

    submit.disabled = true;
    try {
      const { error } = await Data.updateOwnPassword(password);
      if (error) throw new Error(error);
      const session = await Data.getSession();
      const email = session?.user?.email || emailI.value.trim().toLowerCase();
      await Data.signOut();
      $('auth-recovery-modal').hidden = true;
      $('password-recovery-form').reset();
      window.history.replaceState(null, '', window.location.pathname);
      $('app-shell').hidden = true;
      $('login-screen').hidden = false;
      emailI.value = email;
      statusMessage('Password updated. Sign in with your new password.');
    } catch (error) {
      feedback.textContent = error?.message || 'Could not update your password. Request a new reset link and try again.';
      feedback.classList.add('error');
    } finally {
      submit.disabled = false;
    }
  });

  $all('.demo-btn').forEach(btn => btn.addEventListener('click', async () => {
    emailI.value = btn.dataset.email;
    pwI.value    = '';
    Alpine.store('loginError', '');
    const user = await Data.startDemoMode(btn.dataset.email);
    if (!user) {
      Alpine.store('loginError', 'This demo role is not available in the bundled school data.');
      return;
    }
    login(user);
  }));

  $('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = emailI.value.trim().toLowerCase();
    const password = pwI.value;
    Alpine.store('loginError', '');

    const { session, error } = await Data.signIn({ email, password });
    if (!session) {
      Alpine.store('loginError', error || 'Incorrect email or password.');
      return;
    }

    const user = Data.platformUser(session.user) || Data.userByEmail(session.user.email);
    if (!user) {
      Alpine.store('loginError', 'This account has no school access or active SaaS-owner membership.');
      return;
    }
    if (!user.platformOwner && Data.accountBlocked(user)) {
      Alpine.store('loginError', 'This account has been archived. Contact the school office.');
      return;
    }
    login(user);
  });
}

function statusMessage(message) {
  const status = $('login-status');
  status.hidden = false;
  status.className = 'login-status muted-cell';
  status.textContent = message;
}

export function openPasswordRecovery(email = '') {
  if (email) $('login-email').value = email;
  $('login-screen').hidden = false;
  $('app-shell').hidden = true;
  $('auth-recovery-modal').hidden = false;
  $('recovery-password').focus();
}

export function login(user) {
  setCurrentUser(user);
  Data.startRealtime();
  const demoBanner = $('demo-mode-banner');
  if (demoBanner) demoBanner.hidden = !Data.isDemoMode();
  import('./pwa.js').then(({ showPWAActions }) => showPWAActions());
  $('login-screen').hidden = true;
  $('app-shell').hidden    = false;
  buildNav(user);
  updateSidebarUser(user);
  routeToDefaultView(user);
}

export async function logout() {
  window.dispatchEvent(new Event('hma:logout'));
  await Data.signOut();
  const demoBanner = $('demo-mode-banner');
  if (demoBanner) demoBanner.hidden = true;
  setCurrentUser(null);
  clearPrevSessionCache();
  $('app-shell').hidden    = true;
  $('login-screen').hidden = false;
  $('login-email').value = '';
  $('login-password').value = '';
}

export function buildNav(user) {
  const items = navForUser(user);
  const groups = navGroupsForUser(user, items);
  const iconPaths = {
    Today: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    Teaching: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 5.5v15.5M8 7h8M8 11h8"/>',
    Classroom: '<path d="M3 4h18v13H3zM8 21h8M12 17v4M7 8h10M7 12h6"/>',
    Learning: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 4.5v15M8 7h8M8 11h8M8 15h5"/>',
    Academics: '<path d="m12 3 9 5-9 5-9-5zM5 11v5l7 4 7-4v-5M21 8v7"/>',
    Planning: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    People: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1zM16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 4.6V20h-4"/>',
    Family: '<path d="M3 11.5 12 4l9 7.5M5 10v10h14V10M9 20v-6h6v6"/>',
    School: '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-7h6v7M8 10h.01M12 10h.01M16 10h.01"/>',
    Settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.7-1.4-2.4 1.4-1.1a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.7 1.4 2.4-1.4 1.1a8 8 0 0 1 0 2Z" transform="translate(-1 -1) scale(1.08)"/>'
  };
  $('main-nav').innerHTML = groups.map(group =>
    `<section class="nav-group" aria-label="${group.label}">
       <p class="nav-label">${group.label}</p>
       ${group.items.map(n =>
         `<button class="nav-item" data-page="${n.page}">
            <span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${iconPaths[group.label] || iconPaths.School}</svg></span>${n.label}
          </button>`
       ).join('')}
     </section>`
  ).join('') +
    '<section class="nav-group nav-account" aria-label="Account"><p class="nav-label">Account</p>' +
    '<button class="nav-item" id="nav-logout"><span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17l5-5-5-5M15 12H3M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg></span>Sign out</button></section>';

  $all('.nav-item').forEach(btn => btn.addEventListener('click', () => {
    if (btn.id === 'nav-logout') { logout(); return; }
    // Import showView / renderView lazily to avoid circular deps
    import('./router.js').then(({ showView, renderView }) => {
      showView(btn.dataset.page);
      renderView(btn.dataset.page);
    });
  }));
}

function navGroupsForUser(user, items) {
  const definitions = {
    'SaaS Owner': [['Platform', ['view-owner-schools', 'view-owner-onboarding']]],
    Administrator: [
      ['Today', ['view-admin-overview']],
      ['People', ['view-admin-people', 'view-campus', 'view-admin-recognition']],
      ['Academics', ['view-admin-classes', 'view-admin-subjects', 'view-admin-progression']],
      ['Planning', ['view-admin-timetable', 'view-admin-analytics', 'view-admin-leaderboard']],
      ['Settings', ['view-admin-setup']]
    ],
    Teacher: [
      ['Today', ['view-subject-dashboard']],
      ['Teaching', ['view-subject-scores', 'view-teacher-lessons', 'view-teacher-quizzes', 'view-teacher-discussions']],
      ['Classroom', ['view-class-overview', 'view-class-report', 'view-class-attendance', 'view-class-feedback', 'view-admin-timetable', 'view-campus', 'view-hod-dashboard']]
    ],
    Student: [
      ['Today', ['view-student-dashboard']],
      ['Academics', ['view-student-results', 'view-student-pathway', 'view-student-attendance', 'view-student-timetable']],
      ['Learning', ['view-student-lessons', 'view-student-quizzes', 'view-student-discussions', 'view-student-assignments']]
    ],
    Parent: [
      ['Family', ['view-parent-dashboard', 'view-parent-attendance', 'view-parent-assignments', 'view-parent-timetable']]
    ]
  };
  const role = user?.role === 'Administrator' ? 'Administrator'
    : ['Subject Teacher', 'Class Teacher', 'HOD'].includes(user?.role) ? 'Teacher'
    : user?.role;
  const defs = user?.role === 'Security Guard' || user?.role === 'Hostel Supervisor'
    ? [['School', items.map(item => item.page)]]
    : (definitions[role] || [['School', items.map(item => item.page)]]);
  const groups = defs.map(([label, pages]) => ({ label, items: items.filter(item => pages.includes(item.page)) }))
    .filter(group => group.items.length);
  const assigned = new Set(groups.flatMap(group => group.items.map(item => item.page)));
  const ungrouped = items.filter(item => !assigned.has(item.page));
  if (ungrouped.length) groups.push({ label: 'School', items: ungrouped });
  return groups;
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
  $('sidebar-session').textContent = user.platformOwner
    ? 'SaaS platform owner'
    : sess ? `${sess.name} · Term ${sess.currentTerm}` : 'School account';
  const notices = $('notif-btn');
  if (notices) notices.hidden = !!user.platformOwner;
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
