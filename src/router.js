// ============================================================
//  Happy Man Academy — View routing and modal/drawer management
// ============================================================

import { getCurrentUser } from './state.js';
import { $, $q, $all, esc } from './utils.js';
import { navForUser, logout } from './auth.js';
import { Data } from './data/index.js';

// Import all view render functions
import {
  renderAdminOverview, renderAdminPeople, renderAdminClasses,
  renderAdminSubjects, renderAdminProgression, renderAdminTimetable,
  renderAdminAnalytics, renderAdminLeaderboard, renderAdminRecognition,
  renderAdminSetup
} from './views/admin.js';

import {
  renderSubjectDashboard, renderSubjectScores,
  renderClassOverview, renderClassReport, renderClassAttendance,
  renderClassFeedback, renderHODDashboard,
  renderTeacherLessons, renderTeacherQuizzes, renderTeacherDiscussions
} from './views/teacher.js';

import {
  renderStudentDashboard, renderStudentResults, renderStudentPathway,
  renderStudentLessons, renderStudentQuizzes, renderStudentDiscussions,
  renderStudentAttendance, renderStudentAssignments, renderStudentTimetable
} from './views/student.js';

import {
  renderParentDashboard, renderParentAttendance,
  renderParentAssignments, renderParentTimetable
} from './views/parent.js';

// ── View helpers ─────────────────────────────────────────────
export function showView(pageId) {
  $all('.page-wrap').forEach(v => { v.hidden = true; });
  const view = $(pageId);
  if (view) {
    view.hidden = false;
    const currentUser = getCurrentUser();
    const nav = navForUser(currentUser);
    $('page-title').textContent = nav.find(n => n.page === pageId)?.label || 'Dashboard';
  }
  $all('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === pageId));
  $q('.sidebar')?.classList.remove('open');
}

export function renderView(pageId) {
  ({
    'view-admin-overview':    renderAdminOverview,
    'view-admin-people':      renderAdminPeople,
    'view-admin-classes':     renderAdminClasses,
    'view-admin-subjects':    renderAdminSubjects,
    'view-admin-progression': renderAdminProgression,
    'view-admin-timetable':   renderAdminTimetable,
    'view-admin-analytics':   renderAdminAnalytics,
    'view-admin-leaderboard': renderAdminLeaderboard,
    'view-admin-recognition': renderAdminRecognition,
    'view-admin-setup':       renderAdminSetup,
    'view-subject-dashboard': renderSubjectDashboard,
    'view-subject-scores':    renderSubjectScores,
    'view-class-overview':    renderClassOverview,
    'view-class-report':      renderClassReport,
    'view-class-attendance':  renderClassAttendance,
    'view-class-feedback':    renderClassFeedback,
    'view-hod-dashboard':     renderHODDashboard,
    'view-teacher-lessons':     renderTeacherLessons,
    'view-teacher-quizzes':     renderTeacherQuizzes,
    'view-teacher-discussions': renderTeacherDiscussions,
    'view-student-dashboard': renderStudentDashboard,
    'view-student-results':   renderStudentResults,
    'view-student-pathway':     renderStudentPathway,
    'view-student-lessons':     renderStudentLessons,
    'view-student-quizzes':     renderStudentQuizzes,
    'view-student-discussions': renderStudentDiscussions,
    'view-student-attendance':  renderStudentAttendance,
    'view-student-assignments': renderStudentAssignments,
    'view-student-timetable':   renderStudentTimetable,
    'view-parent-dashboard':  renderParentDashboard,
    'view-parent-attendance':   renderParentAttendance,
    'view-parent-assignments':  renderParentAssignments,
    'view-parent-timetable':    renderParentTimetable
  })[pageId]?.();
}

// ── Modal helpers ────────────────────────────────────────────
// Defined in modals.js (no view imports) to break the static
// cycle: shared.js → router.js → admin.js → shared.js.
// Imported for local use in wireGlobals(), and re-exported so existing
// callers that import from router.js continue to work without changes.
import { openModal, closeModal } from './modals.js';
export { openModal, closeModal };

// ── Drawer helpers ───────────────────────────────────────────
export function openDrawer()   { const d=$('report-drawer'); d.classList.add('open');    d.setAttribute('aria-hidden','false'); }
export function closeDrawer()  { const d=$('report-drawer'); d.classList.remove('open'); d.setAttribute('aria-hidden','true'); }

// ── Row menu helpers ─────────────────────────────────────────
export function closeMenus()   { $all('.row-menu-list').forEach(m => { m.hidden = true; }); }

// ── Global event wiring ──────────────────────────────────────
export function wireGlobals() {
  wireNotifications();
  $all('[data-close-drawer]').forEach(el => el.addEventListener('click', closeDrawer));
  // Delegate modal close handling so buttons added after startup also work.
  // A close button can name its modal explicitly or inherit the containing overlay's id.
  document.addEventListener('click', e => {
    const btn = e.target.closest('.close-modal, [data-modal]');
    if (!btn) return;
    const id = btn.dataset.modal || btn.closest('.modal-overlay')?.id;
    if (!id) return; // React-owned modals close through their own state handler.
    e.preventDefault();
    closeModal(id);
  });
  $('logout-btn').addEventListener('click', logout);
  $('mobile-menu').addEventListener('click', () => $q('.sidebar').classList.toggle('open'));
  $q('.drawer-backdrop')?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenus(); closeDrawer(); } });

  // Global [data-nav] button handler
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-nav]');
    if (btn) {
      const page = btn.dataset.nav;
      const currentUser = getCurrentUser();
      if (!navForUser(currentUser).some(n => n.page === page)) return;
      showView(page); renderView(page); return;
    }
    if (!e.target.closest('.row-menu-wrap')) closeMenus();
  });
}

// ── Role-aware notification center ──────────────────────────
function wireNotifications() {
  const button = $('notif-btn');
  if (!button) return;
  const host = button.parentElement;
  host.classList.add('notification-host');
  const badge = document.createElement('span');
  badge.className = 'notification-badge';
  badge.hidden = true;
  button.append(badge);
  if (!$('notification-style')) {
    const style = document.createElement('style');
    style.id = 'notification-style';
    style.textContent = `
      .notification-host{position:relative}.icon-button i[hidden]{display:none}.notification-badge{position:absolute;top:-7px;right:-10px;min-width:17px;height:17px;padding:0 4px;display:grid;place-items:center;border:2px solid #fff;border-radius:99px;background:#e77b61;color:#fff;font:700 9px/1 Arial,sans-serif}.notification-badge[hidden]{display:none}
      .notification-panel{position:absolute;right:0;top:calc(100% + 14px);width:min(370px,calc(100vw - 32px));max-height:min(500px,calc(100vh - 100px));overflow:auto;background:#fff;border:1px solid #e7e9ed;border-radius:12px;box-shadow:0 16px 48px #17212b24;z-index:30;color:#24303a}
      .notification-head{display:flex;align-items:center;justify-content:space-between;padding:16px 17px;border-bottom:1px solid #edf0f2}.notification-head strong,.notification-head small{display:block}.notification-head strong{font-size:14px}.notification-head small{font-size:11px;color:#818991;margin-top:3px}
      .notification-mark{color:#147b77;font-size:11px;font-weight:600;padding:7px 8px;border-radius:6px}.notification-mark:hover:not(:disabled){background:#eef8f6}.notification-mark:disabled{opacity:.45;cursor:default}
      .notification-list{padding:4px 0}.notification-item{width:100%;display:grid;grid-template-columns:8px 1fr 10px;align-items:start;gap:11px;text-align:left;padding:13px 17px;border-bottom:1px solid #f0f1f3;color:inherit}.notification-item:hover{background:#f8fafb}.notification-item:last-child{border-bottom:0}.notification-item strong,.notification-item small{display:block}.notification-item strong{font-size:12px;font-weight:650;line-height:1.4}.notification-item small{font-size:11px;color:#818991;margin-top:4px}.notification-item.is-read strong{font-weight:500;color:#66717b}.notification-dot{width:7px;height:7px;border-radius:50%;background:#e77b61;margin-top:4px}.notification-item.is-read .notification-dot{background:#d8dde1}.notification-arrow{color:#a0a7ad;font-size:17px;line-height:1}
      .notification-empty{display:grid;gap:5px;text-align:center;padding:30px 18px;color:#68737d}.notification-empty strong{font-size:13px;color:#39444d}.notification-empty span{font-size:11px}
      @media(max-width:520px){.notification-panel{right:-52px}}
    `;
    document.head.append(style);
  }
  const panel = document.createElement('section');
  panel.id = 'notification-panel';
  panel.className = 'notification-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Notifications');
  panel.innerHTML = '<div class="notification-head"><div><strong>Notifications</strong><small id="notification-count"></small></div><button type="button" class="notification-mark" id="notification-mark">Mark all as read</button></div><div id="notification-list" class="notification-list"></div>';
  host.append(panel);
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', 'false');

  const storageKey = user => `hma-notifications-read:${user?.id || 'guest'}`;
  const getRead = user => {
    try { return new Set(JSON.parse(localStorage.getItem(storageKey(user)) || '[]')); }
    catch { return new Set(); }
  };
  const storeRead = (user, ids) => {
    try { localStorage.setItem(storageKey(user), JSON.stringify([...ids])); } catch { /* storage can be disabled */ }
  };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const limit = new Date(today); limit.setDate(limit.getDate() + 14);
  const noticesFor = user => {
    if (!user) return [];
    const notices = [];
    const isStudent = user.role === 'Student';
    const isParent = user.role === 'Parent';
    const student = isStudent ? Data.student(user.studentId) : null;
    const childIds = isParent ? (user.childIds || []).map(String) : [];
    const relevantClassIds = isStudent && student ? [String(student.classId)]
      : isParent ? childIds.map(id => Data.student(id)?.classId).filter(Boolean).map(String) : null;
    const permitted = navForUser(user).map(item => item.page);
    const pageFor = preferred => permitted.includes(preferred) ? preferred : (permitted[0] || '');
    const addDateNotice = (record, kind, title, date, page) => {
      if (!date) return;
      const day = new Date(`${date}T00:00:00`);
      if (Number.isNaN(day.getTime()) || day < today || day > limit) return;
      notices.push({ id: `${kind}:${record.id}:${date}`, title, detail: `${kind === 'event' ? 'School event' : 'Assignment due'} · ${day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, page });
    };
    (Data.events() || []).forEach(event => addDateNotice(event, 'event', event.title, event.date, pageFor(user.role === 'Administrator' ? 'view-admin-timetable' : user.role === 'Student' ? 'view-student-timetable' : user.role === 'Parent' ? 'view-parent-timetable' : 'view-class-overview')));
    (Data.assignments() || []).forEach(assignment => {
      if (relevantClassIds && !relevantClassIds.includes(String(assignment.classId))) return;
      if (user.role === 'Subject Teacher' && String(assignment.teacherId) !== String(user.id)) return;
      if (!['Administrator', 'Subject Teacher', 'Class Teacher', 'HOD', 'Student', 'Parent'].includes(user.role)) return;
      addDateNotice(assignment, 'assignment', assignment.title, assignment.due, pageFor(isStudent ? 'view-student-assignments' : isParent ? 'view-parent-assignments' : 'view-teacher-lessons'));
    });
    if ((isStudent || isParent) && Data.published()) {
      const sidList = isStudent ? [String(user.studentId)] : childIds;
      sidList.filter(id => Data.student(id)).forEach(id => {
        notices.push({ id: `report:${id}:${Data.session()?.currentTerm || Data.currentTerm?.() || 1}`, title: `A report is available${isParent ? ` for ${Data.student(id)?.name || 'your child'}` : ''}`, detail: 'The latest term report has been published', page: pageFor(isStudent ? 'view-student-results' : 'view-parent-dashboard') });
      });
    }
    return notices.sort((a, b) => a.id.localeCompare(b.id));
  };
  const refresh = () => {
    const user = getCurrentUser();
    const notices = noticesFor(user);
    const read = getRead(user);
    const unread = notices.filter(notice => !read.has(notice.id));
    const count = $('notification-count');
    count.textContent = unread.length ? `${unread.length} unread` : 'All caught up';
    badge.hidden = unread.length === 0;
    badge.textContent = unread.length > 99 ? '99+' : String(unread.length);
    button.querySelector('i')?.setAttribute('hidden', '');
    button.setAttribute('aria-label', unread.length ? `Notifications, ${unread.length} unread` : 'Notifications');
    $('notification-list').innerHTML = notices.length ? notices.map(notice => `
      <button type="button" class="notification-item ${read.has(notice.id) ? 'is-read' : ''}" data-notification-id="${esc(notice.id)}" data-notification-page="${esc(notice.page)}">
        <span class="notification-dot" aria-hidden="true"></span><span><strong>${esc(notice.title || 'Update')}</strong><small>${esc(notice.detail)}</small></span><span class="notification-arrow" aria-hidden="true">›</span>
      </button>`).join('') : '<div class="notification-empty"><strong>You’re all caught up</strong><span>New events, deadlines, and reports will appear here.</span></div>';
    $('notification-mark').disabled = unread.length === 0;
  };
  const shell = $('app-shell');
  if (shell) new MutationObserver(() => refresh()).observe(shell, { attributes: true, attributeFilter: ['hidden'] });
  refresh();
  button.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) refresh();
  });
  $('notification-mark').addEventListener('click', () => {
    const user = getCurrentUser();
    const read = getRead(user);
    noticesFor(user).forEach(notice => read.add(notice.id));
    storeRead(user, read); refresh();
  });
  $('notification-list').addEventListener('click', event => {
    const item = event.target.closest('[data-notification-id]');
    if (!item) return;
    const user = getCurrentUser();
    const read = getRead(user); read.add(item.dataset.notificationId); storeRead(user, read);
    const page = item.dataset.notificationPage;
    panel.hidden = true; button.setAttribute('aria-expanded', 'false');
    if (page && navForUser(user).some(entry => entry.page === page)) { showView(page); renderView(page); }
  });
  document.addEventListener('click', event => {
    if (!host.contains(event.target)) { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); }
  });
}
