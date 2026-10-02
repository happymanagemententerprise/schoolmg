// ============================================================
//  Happy Man Academy — View routing and modal/drawer management
// ============================================================

import { getCurrentUser } from './state.js';
import { $, $q, $all } from './utils.js';
import { navForUser, logout } from './auth.js';

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
export function openModal(id)  { const m=$(id); if(m){m.hidden=false; m.setAttribute('aria-hidden','false');} }
export function closeModal(id) { const m=$(id); if(m){m.hidden=true;  m.setAttribute('aria-hidden','true');} }

// ── Drawer helpers ───────────────────────────────────────────
export function openDrawer()   { const d=$('report-drawer'); d.classList.add('open');    d.setAttribute('aria-hidden','false'); }
export function closeDrawer()  { const d=$('report-drawer'); d.classList.remove('open'); d.setAttribute('aria-hidden','true'); }

// ── Row menu helpers ─────────────────────────────────────────
export function closeMenus()   { $all('.row-menu-list').forEach(m => { m.hidden = true; }); }

// ── Global event wiring ──────────────────────────────────────
export function wireGlobals() {
  $all('[data-close-drawer]').forEach(el => el.addEventListener('click', closeDrawer));
  $all('.close-modal').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.modal)));
  $all('[data-modal]').forEach(btn => {
    if (!btn.classList.contains('close-modal')) btn.addEventListener('click', () => closeModal(btn.dataset.modal));
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
