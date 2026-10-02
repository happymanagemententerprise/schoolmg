// ============================================================
//  Happy Man Academy — Shared view utilities
//
//  Functions used by both admin.js and teacher.js live here
//  to break the admin.js ↔ teacher.js static circular import.
// ============================================================

import { Data, Academic } from '../data/index.js';
import { getCurrentUser } from '../state.js';
import { set_sensitiveRun, set_resetUserId } from '../state.js';
import {
  $, esc, toneClass, currentTerm, downloadXlsxMulti
} from '../utils.js';
import { openModal } from '../router.js';
import { myClassRecord } from '../auth.js';

// ── Timetable HTML table renderer ────────────────────────────
export function timetableTable(schedule) {
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

// ── Sensitive-action confirmation modal ───────────────────────
export function askSensitiveConfirm(title, message, run) {
  set_sensitiveRun(run);
  $('sc-title').textContent    = title;
  $('sc-message').textContent  = message;
  $('sc-password').value       = '';
  const f = $('sc-feedback'); f.textContent = ''; f.hidden = true;
  openModal('sensitive-confirm-modal');
}

// ── Reset password modal ──────────────────────────────────────
export function openResetPasswordModal(userId) {
  const user = Data.user(userId);
  if (!user) return;
  set_resetUserId(userId);
  $('rp-eyebrow').textContent    = user.role;
  $('rp-title').textContent      = `Reset password · ${user.name}`;
  $('rp-sub').textContent        = `You can safely make up a new password — the old one stops working immediately.`;
  $('rp-feedback').textContent   = '';
  $('rp-password').value = '';
  $('rp-confirm').value = '';
  openModal('reset-password-modal');
  setTimeout(() => $('rp-password').focus(), 0);
}

// ── Class register / report modal ────────────────────────────
export function openClassReportModal(classId) {
  const currentUser = getCurrentUser();
  const cl = myClassRecord(currentUser);
  if (cl && String(cl.id) !== String(classId)) return;
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
    const summaryRows = [
      ['Admission No', 'Student', ...report.subjects.flatMap(s => [`${s.name} CA`, `${s.name} Exam`]), 'Average', 'Status']
    ];
    report.students.forEach(r => {
      summaryRows.push([r.student.admissionNo || '', r.student.name,
        ...r.rows.flatMap(x => [x.ca ?? '', x.exam ?? '']), r.average, r.status]);
    });
    const sheets = [{ name: 'Register', rows: summaryRows }];
    report.subjects.forEach(sub => {
      const subRows = [
        [`${klass.name} · ${sub.name} · Term ${term}`],
        ['Admission No', 'Student', 'CA (40)', 'Exam (60)', 'Total']
      ];
      report.students.forEach(r => {
        const sc = r.rows.find(x => x.subjectId === sub.id);
        subRows.push([r.student.admissionNo || '', r.student.name,
          sc?.ca ?? '', sc?.exam ?? '', sc?.score ?? '']);
      });
      sheets.push({ name: sub.code.slice(0, 31), rows: subRows });
    });
    downloadXlsxMulti(`register_${klass.name.replace(/\s+/g, '_')}_term${term}.xlsx`, sheets);
  };
  draw();
  openModal('class-register-modal');
}
