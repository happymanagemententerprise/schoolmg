// ============================================================
//  Happy Man Academy — Parent views
// ============================================================

import { Data, Academic } from '../data/index.js';
import { getCurrentUser } from '../state.js';
import {
  $, $all, esc, toast, currentTerm, passMark, gradeLabel, toneClass, subjectChip, statusClass
} from '../utils.js';
import { openStudentReport } from './reports.js';
import { renderTimetableFor, renderParentGuardian, recordParentLoginIfNew, resultsLockedNote, termNameOf, renderEventsList, attendanceGridHTML, monthlyAttendanceHTML, assignmentRowsHTML } from './shared.js';
import { campusApi } from '../campus-api.js';

// ── Parent dashboard ──────────────────────────────────────────
export function renderParentDashboard() {
  const currentUser = getCurrentUser();
  const children = (currentUser.childIds || []).map(id => Data.student(id)).filter(Boolean);
  const term     = currentTerm();
  const released = Data.published(term);

  $('par-eyebrow').textContent       = `Parent portal · ${children.length} child${children.length !== 1 ? 'ren' : ''} linked · ${currentUser.phone || 'no phone on file'}`;
  $('par-welcome').textContent       = `Good morning, ${currentUser.name.split(' ')[0]}.`;
  $('par-stat-children').textContent = children.length;
  $('par-stat-names').textContent    = children.map(c => c.name.split(' ')[0]).join(' · ') || '—';
  const atts = children.map(c => +Academic.attendancePct(c.id));
  $('par-stat-att').textContent = (atts.length ? Math.round(atts.reduce((a, b) => a + b, 0) / atts.length) : 0) + '%';
  const avgs = children.map(c => Academic.termAverage(c.id, term));
  $('par-stat-avg').textContent    = released && avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) + '%' : '—';
  $('par-stat-events').textContent = Data.events().length;

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
        <span><small>Term avg</small><b>${released ? avg + '%' : '—'}</b></span>
        <span><small>CA / Exam</small><b>${released ? (check.english >= 0 ? `${Academic.termScores(s.id, term).filter(r => r.ca !== null).length} subjects` : '—') : '—'}</b></span>
        <span><small>Attendance</small><b>${att}</b></span>
        <span class="status ${released ? statusClass(status) : 'review'}">${released ? status : 'Locked'}</span>
        ${released ? `<button class="text-button" data-child="${s.id}">CA &amp; exam scores ↗</button>` : '<small class="muted-cell">Awaiting release</small>'}
        <button type="button" class="text-button" data-report-child="${s.id}">View report history ↗</button>
      </div>
    </div>`;
  }).join('') || '<p class="muted-cell">No children are linked to this account.</p>';

  $all('[data-child]').forEach(btn => btn.addEventListener('click', () => {
    showChildResults(btn.dataset.child);
  }));
  $all('[data-student]').forEach(btn => btn.addEventListener('click', () => openStudentReport(btn.dataset.student)));
  $all('[data-report-child]').forEach(btn => btn.addEventListener('click', () => openStudentReport(btn.dataset.reportChild)));

  if (children.length) {
    const sel = $('par-child-sel');
    sel.innerHTML = children.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    showChildResults(sel.value || children[0].id);
    sel.onchange = () => showChildResults(sel.value);
  } else {
    $('par-results-table').innerHTML = '<tr><td colspan="8" class="muted-cell">No children linked.</td></tr>';
    $('par-results-meta').textContent = '';
  }

  renderEventsList('par-events-list', 5);
  recordParentLoginIfNew();
  renderParentGuardian();
  bindPickupPinForm();
}

function bindPickupPinForm() {
  const form = $('parent-pickup-pin-form');
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const pin = $('parent-pickup-pin').value;
    const confirmPin = $('parent-pickup-pin-confirm').value;
    const feedback = $('parent-pickup-pin-feedback');
    if (!/^\d{6}$/.test(pin)) return showFeedback('Enter a six-digit PIN.', true);
    if (pin !== confirmPin) return showFeedback('The PIN entries do not match.', true);
    const submit = $('parent-pickup-pin-save');
    submit.disabled = true;
    submit.textContent = 'Saving…';
    try {
      if (Data.isDemoMode()) {
        localStorage.setItem('hma_demo_pickup_pin', pin);
      } else {
        await campusApi('/api/gate/pickup-pin', { method: 'POST', body: JSON.stringify({ pin }) });
      }
      form.reset();
      showFeedback(Data.isDemoMode() ? 'Demo PIN saved in this browser only.' : 'Pickup PIN saved securely. Share it only with authorized caregivers.');
    } catch (error) {
      showFeedback(error.message || 'Could not save the pickup PIN.', true);
    } finally {
      submit.disabled = false;
      submit.textContent = 'Save pickup PIN';
    }
    function showFeedback(message, isError = false) {
      feedback.textContent = message;
      feedback.className = `form-feedback mt8${isError ? ' error' : ''}`;
      feedback.hidden = false;
    }
  });
}

export function showChildResults(studentId) {
  const s     = Data.student(studentId);
  if (!s) return;
  const term  = currentTerm();
  const cl    = Data.cls(s.classId);
  const check = Academic.promotionCheck(studentId, term);

  if (!Data.published(term)) {
    $('par-results-meta').textContent = `${s.name} · ${cl?.name || '—'} · ${termNameOf(term)} · awaiting release`;
    $('par-results-table').innerHTML  = `<tr><td colspan="8" class="muted-cell">${resultsLockedNote(term)}</td></tr>`;
    return;
  }

  const rows  = Academic.termScores(studentId, term);
  $('par-results-meta').textContent =
    `${s.name} · ${cl?.name || '—'} · Term ${term} · average ${check.avg}% · ${check.pass ? 'on track to promote' : 'needs improvement'}`;

  $('par-results-table').innerHTML = rows.length ? rows.map(sub => {
    const total = sub.score;
    const pass  = total !== null && total >= passMark();
    return `<tr>
      <td><div class="student">${subjectChip(sub)}${esc(sub.name)}</div></td>
      <td class="muted-cell">${sub.midterm ?? '—'}</td>
      <td class="muted-cell">${sub.ca ?? '—'}</td>
      <td class="muted-cell">${sub.exam ?? '—'}</td>
      <td><strong>${total ?? '—'}</strong></td>
      <td>${total !== null ? gradeLabel(total) : '—'}</td>
      <td class="cr-caexam">${sub.ca === null ? '—' : `${sub.midterm == null ? '' : `${sub.midterm} + `}${sub.ca} + ${sub.exam} = ${sub.score}`}</td>
      <td><span class="status ${total === null ? 'review' : pass ? 'promoted' : 'repeat'}">${total === null ? '—' : pass ? 'Pass' : 'Fail'}</span></td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="muted-cell">No results recorded.</td></tr>';
}

// ── Shared child selector helper ──────────────────────────────
function parentChildSelect(selId, onPick) {
  const currentUser = getCurrentUser();
  const sel = $(selId); if (!sel) return;
  const children = (currentUser.childIds || []).map(id => Data.student(String(id))).filter(Boolean);
  sel.innerHTML = children.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if (!children.length) return;
  onPick(children[0].id);
  sel.onchange = () => onPick(sel.value);
}

export function renderParentAttendance() {
  const mode = () => ($('par-att-mode')?.querySelector('button.active')?.dataset.mode) || 'weekly';
  parentChildSelect('par-att-child', childId => {
    const s = Data.student(childId); if (!s) return;
    $('par-att-meta').textContent = `${s.name} · ${esc(Data.cls(s.classId)?.name || '')} · ${termNameOf(currentTerm())}`;
    $('par-att-grid').innerHTML = mode() === 'monthly'
      ? monthlyAttendanceHTML(childId, currentTerm())
      : attendanceGridHTML(childId, currentTerm(), { fullTerm: true, showFutureWeeks: true });
  });
  $all('#par-att-mode button').forEach(b => b.onclick = () => {
    $all('#par-att-mode button').forEach(x => x.classList.toggle('active', x === b));
    const sel = $('par-att-child');
    if (sel) sel.onchange();
  });
}

export function renderParentAssignments() {
  parentChildSelect('par-assign-child', childId => {
    const s = Data.student(childId); if (!s) return;
    $('par-assign-meta').textContent = `${s.name} · ${esc(Data.cls(s.classId)?.name || '')}`;
    $('par-assign-list').innerHTML   = assignmentRowsHTML(s.classId);
  });
}

export function renderParentTimetable() {
  parentChildSelect('par-tt-child', childId => {
    const s = Data.student(childId); if (!s) return;
    $('par-tt-meta').textContent = `${s.name} · ${esc(Data.cls(s.classId)?.name || '')} · Term ${currentTerm()}`;
    renderTimetableFor(s.classId, 'par-tt-grid');
  });
}
