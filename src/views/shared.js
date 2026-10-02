// ============================================================
//  Happy Man Academy — Shared view utilities
//
//  Functions used by multiple view modules live here to break
//  static circular imports through router.js.
// ============================================================

import { Data, Academic, Growth } from '../data/index.js';
import { getCurrentUser } from '../state.js';
import { set_sensitiveRun, set_resetUserId } from '../state.js';
import {
  $, esc, toast, toneClass, gradeLabel, formatDate,
  currentTerm, passMark, subjectChip, downloadXlsxMulti
} from '../utils.js';
import { openModal } from '../router.js';
import { myClassRecord } from '../auth.js';

const ATT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

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

// ── Calendar events list ──────────────────────────────────────
export function renderEventsList(cid, max = 99) {
  const el = $(cid); if (!el) return;
  el.innerHTML = Data.events().slice(0, max).map(ev => {
    const d = new Date(ev.date);
    return `<div class="timeline-item">
      <time>${d.getDate()}<small>${d.toLocaleDateString('en-GB',{month:'short'}).toUpperCase()}</small></time>
      <div><strong>${esc(ev.title)}</strong><span>${esc(ev.note || '')}</span></div>
    </div>`;
  }).join('') || '<p class="muted-cell">No events scheduled.</p>';
}

// ── Term name helpers ─────────────────────────────────────────
export function termNameOf(term) {
  return Data.session().terms.find(t => t.term === Number(term))?.name || `Term ${term}`;
}

export function resultsLockedNote(term) {
  return `<span class="status review">Locked</span> &nbsp;${esc(termNameOf(term))} results have not been released yet — check back after the school publishes them.`;
}

// ── XP bar helper ─────────────────────────────────────────────
export function xpBar(label, value, pct) {
  const grade = value >= 300 ? 'xp-high' : value >= 100 ? 'xp-mid' : 'xp-low';
  return `<div class="xp-row">
    <span>${esc(label)}</span>
    <i class="xp-track"><em class="${grade}" style="width:${Math.min(100, pct)}%"></em></i>
    <b>${value} XP</b>
  </div>`;
}

// ── Student growth view ───────────────────────────────────────
export function renderStudentGrowth() {
  const currentUser = getCurrentUser();
  const sid = currentUser.studentId;
  const s   = Data.student(sid); if (!s) return;
  const xp  = Growth.studentXp(sid);
  const max = Math.max(xp.total, 1);
  $('std-xp-heading').textContent = `${xp.total} XP · Level ${xp.level} · ${xp.rank}`;
  $('std-rank-badge').textContent = `Next rank at ${xp.nextAt} XP`;
  $('std-xp-breakdown').innerHTML =
    xpBar('Academic consistency  (+50 per improving term)',     xp.categories.consistency,  xp.categories.consistency / max * 100) +
    xpBar('Attendance  (+100 per 100% week)',                   xp.categories.attendance,   xp.categories.attendance / max * 100) +
    xpBar('Co-curricular &amp; STEM  (+150 per verified artifact)', xp.categories.coCurricular, xp.categories.coCurricular / max * 100) +
    xpBar('Leadership &amp; character  (+75 per commendation)', xp.categories.leadership,   xp.categories.leadership / max * 100);

  const badges = Growth.badges(sid);
  $('std-badges').innerHTML = badges.length
    ? badges.map(b => `<div class="badge-chip"><span>${b.icon}</span><div><strong>${esc(b.label)}</strong><small>${esc(b.note)}</small></div></div>`).join('')
    : '<p class="muted-cell">Complete a verified artifact or earn a perfect attendance week to unlock your first badge.</p>';

  const arts = Growth.artifactsOf(sid);
  $('std-artifacts').innerHTML = arts.length ? arts.map(a => `
    <div class="event-mini-row">
      <span class="event-dot ${a.status === 'verified' ? 'event-academic' : a.status === 'rejected' ? 'event-session' : 'event-other'}"></span>
      <div><strong>${esc(a.title)}</strong><small>${esc(a.kind)}${a.note ? ' · ' + esc(a.note) : ''}</small></div>
      <span class="status ${a.status === 'verified' ? 'promoted' : a.status === 'rejected' ? 'repeat' : 'review'}">${a.status}</span>
    </div>`).join('') : '<p class="muted-cell">No artifacts yet — submit proof of a project, debate, sport or leadership role.</p>';

  $('std-art-submit').onclick = async () => {
    const title = $('std-art-title').value.trim();
    if (!title) { $('std-art-feedback').textContent = 'Give the artifact a title first.'; return; }
    await Growth.addArtifact({ studentId: sid, kind: $('std-art-kind').value, title, note: $('std-art-note').value.trim(), createdBy: currentUser.id });
    $('std-art-title').value = ''; $('std-art-note').value = '';
    $('std-art-feedback').textContent = 'Submitted — your class teacher will verify it.';
    renderStudentGrowth();
  };
  $('std-passport-btn').onclick = () => renderPassport(sid);
}

// ── Parent guardian panel ─────────────────────────────────────
export function renderParentGuardian() {
  const currentUser = getCurrentUser();
  const pid = currentUser.id;
  const pp  = Growth.parentProfile(pid);
  $('par-guard-count').textContent = `${pp.badges.length} badge${pp.badges.length !== 1 ? 's' : ''} earned`;
  $('par-guard-note').textContent  = pp.badges.length
    ? 'You are an engaged guardian — keep it up to lock in the incentives.'
    : 'No guardian badges yet. Acknowledge results, attend PTA, and settle early to unlock them.';
  $('par-guard-badges').innerHTML = pp.badges.length
    ? pp.badges.map(b => `<div class="badge-chip"><span>${b.icon}</span><div><strong>${esc(b.label)}</strong><small>${esc(b.note)}</small></div></div>`).join('')
    : '<p class="muted-cell">Badges appear as you engage.</p>';
  $('par-guard-stats').innerHTML = `
    <span class="guard-stat"><small>Logins</small><b>${pp.loginCount}</b></span>
    <span class="guard-stat"><small>Results &amp; PTA this session</small><b>${pp.thisSessSlog}</b></span>
    <span class="guard-stat"><small>Engagement total</small><b>${pp.engagementTotal}</b></span>
    <span class="guard-stat"><small>Early payment</small><b>${pp.earlyPayment ? '✓' : '—'}</b></span>`;
  $('par-ack-btn').onclick = async () => {
    await Growth.recordParentEngagement(pid, 'ack_results');
    renderParentGuardian(); toast('Results acknowledged — thank you for staying engaged.');
  };
  $('par-pta-btn').onclick = async () => {
    await Growth.recordParentEngagement(pid, 'pta');
    renderParentGuardian(); toast('PTA attendance recorded.');
  };
}

// ── Record parent login ───────────────────────────────────────
export function recordParentLoginIfNew() {
  const currentUser = getCurrentUser();
  const eng = (Data.parentEngagements() || []).filter(e => e.kind === 'login' && String(e.parentId) === String(currentUser.id));
  const last = eng.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0];
  const today = new Date().toISOString().slice(0, 10);
  if (!eng.length || String(last?.at || '').slice(0, 10) !== today) Growth.recordParentEngagement(currentUser.id, 'login');
}

// ── Student Achievement Passport ──────────────────────────────
export function renderPassport(studentId) {
  const sid = String(studentId);
  const s   = Data.student(sid); if (!s) return;
  const sess = Data.session();
  const term = currentTerm();
  const cl   = Data.cls(s.classId);
  const avg  = Academic.termAverage(sid, term);
  const att  = Academic.attendancePct(sid);
  const xp   = Growth.studentXp(sid);
  const badges = Growth.badges(sid);
  const arts = Growth.artifactsOf(sid).filter(a => a.status === 'verified');
  const mentor = Data.mentor(s.mentorId);
  const code = Growth.passportCode(sid);

  const comps = [
    { label: 'Academic competence',        pct: Math.min(100, Math.round(avg || 0)) },
    { label: 'Attendance & conduct',       pct: Math.min(100, Math.round(+att || 0)) },
    { label: 'Co-curricular & STEM',       pct: Math.min(100, xp.categories.coCurricular / 150 * 100) },
    { label: 'Leadership & character',     pct: Math.min(100, xp.categories.leadership / 75 * 100) },
    { label: 'Resilience (improvements)',  pct: Math.min(100, xp.improvements.filter(p => p.curr > p.prev).length * 20) }
  ];

  const rows = Academic.termScores(sid, term);
  const table = rows.length ? rows.map(sc => `
    <tr><td class="p-subj">${esc(sc.name)}</td><td>${sc.ca ?? '—'}</td><td>${sc.exam ?? '—'}</td><td><strong>${sc.score ?? '—'}</strong></td><td>${sc.score !== null ? gradeLabel(sc.score) : '—'}</td></tr>
  `).join('') : `<tr><td colspan="5">No recorded scores yet.</td></tr>`;

  $('passport-sheet').innerHTML = `
    <div class="p-head">
      <div class="p-crest"><span>HMA</span><small>EST. 2012</small></div>
      <div class="p-brand"><strong>HAPPY MAN ACADEMY</strong><span>Student Achievement Passport &middot; ${esc(sess.name)} &middot; Term ${term}</span></div>
      <div class="p-code">Verify: <b>${esc(code)}</b></div>
    </div>
    <div class="p-banner">
      <div class="avatar ${toneClass(s.tone)}">${s.initials}</div>
      <div class="p-id">
        <strong class="p-name">${esc(s.name)}</strong>
        <span>${esc(cl?.name || '—')} &middot; ${esc(s.admissionNo || '—')}</span>
        <span>Mentor: ${esc(mentor?.name || 'Not assigned')} &middot; Guardian tier: ${s.parentId ? 'Linked' : '—'}</span>
      </div>
      <div class="p-snapshot">
        <span><small>Average</small><b>${avg}%</b></span>
        <span><small>Attendance</small><b>${att}</b></span>
        <span><small>Level ${xp.level}</small><b>${xp.rank}</b></span>
      </div>
    </div>
    <div class="p-section">
      <h4>Term ${term} academic record — CA (40) + Exam (60) = Total (100)</h4>
      <table class="p-table">
        <thead><tr><th>Subject</th><th>CA</th><th>Exam</th><th>Total</th><th>Grade</th></tr></thead>
        <tbody>${table}</tbody>
      </table>
    </div>
    <div class="p-section">
      <h4>360&deg; competencies (session)</h4>
      ${comps.map(c => `
        <div class="p-comp"><span>${esc(c.label)}</span>
          <i class="xp-track"><em class="xp-mid" style="width:${c.pct}%"></em></i><b>${c.pct}%</b></div>`).join('')}
    </div>
    <div class="p-section">
      <h4>Verified proof-of-work</h4>
      <div class="p-cards">
        ${arts.length ? arts.map(a => `
          <div class="p-card"><strong>${a.kind}</strong><span>${esc(a.title)}</span><small>${esc(a.note || '')}</small></div>`).join('')
          : '<span class="muted-cell">No verified artifacts this session.</span>'}
        ${badges.length ? badges.map(b => `<div class="p-card p-badge"><strong>${b.icon} ${esc(b.label)}</strong><small>${esc(b.note)}</small></div>`).join('')
          : ''}
      </div>
    </div>
    <div class="p-footer">
      <div class="p-qr">${esc(code.slice(-4))}</div>
      <div class="p-foot-note">This passport is generated by Happy Man Academy and carries a session-bound verification code. Present the original document; its status is confirmed against the school register.</div>
      <div class="p-sign"><span>Class Teacher</span><span>Principal</span></div>
    </div>`;
  openModal('passport-modal');
}

// ── Attendance day chips ──────────────────────────────────────
export function dayChipsHTML(studentId, term, wk) {
  const arr = Data.dailyAttendance(term)[wk]?.[String(studentId)] || [];
  if (!arr.some(Boolean)) return '';
  return `<span class="att-days">${[0, 1, 2, 3, 4].map(i => {
    const st = arr[i];
    return `<b class="att-day ${st || 'off'}" title="${ATT_DAYS[i]}: ${st || 'unmarked'}">${st ? st[0].toUpperCase() : '&middot;'}</b>`;
  }).join('')}</span>`;
}

// ── Attendance grid HTML ──────────────────────────────────────
export function attendanceGridHTML(studentId, term) {
  const weeks = Data.studentAttendance(studentId, term) || {};
  const entries = Object.entries(weeks).sort(
    (a, b) => (parseInt(a[0].replace('W', ''), 10) || 0) - (parseInt(b[0].replace('W', ''), 10) || 0));
  const present = entries.reduce((sum, [, d]) => sum + (Number(d) || 0), 0);
  const possibile = entries.length * 5;
  return `<div class="att-legend"><b class="att-day present">P</b> present &nbsp;<b class="att-day late">L</b> late &nbsp;<b class="att-day absent">A</b> absent</div>
    <div class="att-grid mt16">
      ${entries.length ? entries.map(([w, d]) => `
        <div class="att-week"><strong>${esc(w)}</strong><span>${Number(d) || 0} / 5 days</span>${dayChipsHTML(studentId, term, w)}</div>`).join('')
        : '<p class="muted-cell">No attendance recorded for this term.</p>'}
    </div>
    <div class="att-summary mt16">
      <div><span>Days present</span><b>${present}</b></div>
      <div><span>Possible</span><b>${possibile}</b></div>
      <div><span>Attendance</span><b>${Academic.attendancePct(studentId, term)}</b></div>
    </div>`;
}

// ── Assignment rows HTML ──────────────────────────────────────
export function assignmentRowsHTML(classId) {
  const assigns = (Data.assignments() || [])
    .filter(a => String(a.classId) === String(classId))
    .sort((a, b) => String(a.due || '').localeCompare(String(b.due || '')));
  const now = new Date().toISOString().slice(0, 10);
  return assigns.length ? assigns.map(a => {
    const subject  = Data.subject(a.subjectId);
    const teacher  = Data.user(a.teacherId);
    const chips    = (subject?.color ? `chip-${subject.color}` : '') + (subject?.code ? '' : ' chip-blue');
    const upcoming = a.due && String(a.due) >= now;
    return `<div class="assignment-item">
      <span class="assignment-type ${chips}">${esc(subject?.code || '?')}</span>
      <div><strong>${esc(a.title)}</strong>
        <small>${esc(subject?.name || '')}${teacher ? ` · ${esc(teacher.name)}` : ''}${a.note ? ` · ${esc(a.note)}` : ''}</small></div>
      <time>${a.due ? formatDate(a.due) : '—'}${upcoming ? ' · upcoming' : ''}</time>
    </div>`;
  }).join('') : '<p class="muted-cell">No assignments for this class right now.</p>';
}
