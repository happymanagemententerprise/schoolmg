// ============================================================
//  Happy Man Academy — Shared student report drawer
// ============================================================

import { Data, Academic, Growth } from '../data/index.js';
import { getCurrentUser } from '../state.js';
import {
  $, esc, toneClass, formatDate, gradeLabel, statusClass,
  currentTerm, passMark, downloadXlsx, printReportPdf
} from '../utils.js';
import { openDrawer } from '../router.js';

export function openStudentReport(studentId, termOverride = null) {
  const currentUser = getCurrentUser();
  const s = Data.student(studentId);
  if (!s) return;
  const term   = termOverride || currentTerm();
  const cl     = Data.cls(s.classId);
  const avg    = Academic.termAverage(studentId, term);
  const status = Academic.promotionStatus(studentId, term);
  const check  = Academic.promotionCheck(studentId, term);
  const mentor = Data.mentor(s.mentorId);

  const isConsumer = currentUser && (currentUser.role === 'Student' || currentUser.role === 'Parent');
  if (isConsumer && !Data.published(term)) {
    $('drawer-eyebrow').textContent = `Term ${term} report · ${Data.session().name}`;
    $('drawer-name').textContent    = s.name;
    $('drawer-meta').textContent    = `${cl?.name || '—'} · ${esc(s.admissionNo || '—')}`;
    $('drawer-score').textContent   = '—';
    $('drawer-status').textContent  = 'Locked';
    $('drawer-status').className    = 'promotion-badge review';
    $('drawer-subjects').innerHTML  = `<div class="subject-row"><div><span>${_resultsLockedNote(term)}</span></div></div>`;
    $('drawer-mentor-chip').innerHTML = mentor
      ? `<div class="drawer-mentor-chip mt16"><span class="chip-label">Mentor</span><span class="student-avatar ${toneClass(mentor.tone)}" style="width:22px;height:22px;font-size:9px">${mentor.initials}</span><span>${esc(mentor.name)} · ${esc(mentor.subject || 'Mentor')}</span></div>` : '';
    $('drawer-attendance').textContent = Academic.attendancePct(studentId, term);
    const dl = $('drawer-download-btn'); dl.disabled = true; dl.onclick = null;
    const pdf = $('drawer-pdf-btn'); if (pdf) { pdf.disabled = true; pdf.onclick = null; }
    openDrawer();
    return;
  }

  $('drawer-eyebrow').textContent = `Term ${term} report · ${Data.session().name}`;
  $('drawer-name').textContent    = s.name;
  $('drawer-meta').textContent    = `${cl?.name || '—'} · ${esc(s.admissionNo || '—')}`;
  $('drawer-score').textContent   = avg + '%';
  const badge = $('drawer-status');
  const isConsumerView = currentUser && (currentUser.role === 'Student' || currentUser.role === 'Parent');
  const allTermsPublished = [1, 2, 3].every(t => Data.published(t));
  const showStatus = !isConsumerView || allTermsPublished;
  if (showStatus) {
    badge.textContent = status;
    badge.className = `promotion-badge ${statusClass(status)}`;
  } else {
    badge.textContent = '—';
    badge.className   = 'promotion-badge review';
  }

  const history = Data.promotionsFor(studentId);
  const archiveChip = s.status === 'archived'
    ? `<div class="subject-row"><div><span class="status repeat">Archived</span><small>This student cannot sign in; every previous record is kept in the database.</small></div></div>`
    : '';
  const historyChips = history.length
    ? `<div class="subject-row"><div><span>Previous sessions</span><small>${history.map(h => `${esc(h.outcome)}${h.avg != null ? ' · avg ' + h.avg + '%' : ''}`).join(' → ')}</small></div></div>`
    : '';

  $('drawer-subjects').innerHTML = archiveChip + historyChips +
    Academic.termScores(studentId, term).map(sc => {
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
  const dlBtn = $('drawer-download-btn');
  dlBtn.disabled = false;
  dlBtn.onclick = () => {
    const rows = [['Student', s.name], ['Class', cl?.name || ''], ['Term', term], ['Average', avg], ['Status', status], [],
                  ['Subject', 'CA (40)', 'Exam (60)', 'Total', 'Grade']];
    Academic.termScores(studentId, term).forEach(sc => {
      rows.push([sc.name, sc.ca ?? '', sc.exam ?? '', sc.score ?? '', sc.score !== null ? gradeLabel(sc.score) : '']);
    });
    downloadXlsx(`report_${s.name.replace(/\s+/g, '_')}_term${term}.xlsx`, rows, `Term ${term}`);
  };
  const pdfBtn = $('drawer-pdf-btn');
  if (pdfBtn) { pdfBtn.disabled = false; pdfBtn.onclick = printReportPdf; }
  openDrawer();
}

function _resultsLockedNote(term) {
  const termName = Data.session().terms.find(t => t.term === Number(term))?.name || `Term ${term}`;
  return `<span class="status review">Locked</span> &nbsp;${esc(termName)} results have not been released yet — check back after the school publishes them.`;
}
