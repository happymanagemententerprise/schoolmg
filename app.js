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
  if (!user) return null;
  // classTeacherId is String(teacher_classes[0].teacher_id) — compare as strings
  return Data.classes().find(c =>
    c.classTeacherId !== null &&
    String(c.classTeacherId) === String(user.id)
  ) || null;
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
  // And the classroom / learning pages
  nav.push(
    { page: 'view-teacher-lessons',     label: 'Lessons',     icon: 'L' },
    { page: 'view-teacher-quizzes',     label: 'Quizzes',     icon: 'Q' },
    { page: 'view-teacher-discussions', label: 'Discussions', icon: '◇' }
  );
  // A class teacher is in charge of a class
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
    // Debug: log the mismatch so it's visible in the browser console
    const teacherClasses = Data.classes().map(c => ({ name: c.name, classTeacherId: c.classTeacherId }));
    console.info('[HMA] No class found for teacher id=' + user.id +
      '. Classes with teachers:', JSON.stringify(teacherClasses));
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

function navForUser(user) {
  if (isTeacher(user)) return buildTeacherCapabilities(user);
  if (isStudent(user)) {
    const nav = [...STATIC_NAV['Student']];
    // "Choose my path" is only relevant for Grade 9 pool students or newly
    // promoted Year 10 students waiting for stream placement.
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

// ── Student position helpers ─────────────────────────────────
// Returns 1-based rank of studentId within their class for a given term.
// Students with the same session average share the same rank (dense rank).
function classRank(studentId, term) {
  const s = Data.student(studentId);
  if (!s) return null;
  const peers  = Data.studentsByClass(s.classId).filter(p => p.status !== 'archived');
  const myAvg  = Progression.sessionAverage(studentId);
  if (myAvg === null) return null;
  // count how many peers have a strictly higher session average
  const above  = peers.filter(p => {
    const a = Progression.sessionAverage(p.id);
    return a !== null && a > myAvg;
  }).length;
  return above + 1;
}

// Returns 1-based rank of studentId across ALL classes in the same year/level.
function yearRank(studentId, term) {
  const s = Data.student(studentId);
  if (!s) return null;
  const cl = Data.cls(s.classId);
  if (!cl) return null;
  // same year = same level + same year number
  const sameYear = Data.classes().filter(c => c.level === cl.level && c.year === cl.year);
  const allStudents = sameYear.flatMap(c => Data.studentsByClass(c.id))
    .filter(p => p.status !== 'archived');
  const myAvg = Progression.sessionAverage(studentId);
  if (myAvg === null) return null;
  const above = allStudents.filter(p => {
    const a = Progression.sessionAverage(p.id);
    return a !== null && a > myAvg;
  }).length;
  return above + 1;
}

// Ordinal suffix: 1st, 2nd, 3rd, 4th…
function ordinal(n) {
  if (n === null || n === undefined) return '—';
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
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
  // UTF-8 BOM ensures Excel opens the file with correct encoding on all platforms
  const BOM = '\uFEFF';
  const csv  = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Excel (.xlsx) export — small dependency-free workbook writer ──
// Builds a single-sheet OpenXML package with a STORED (uncompressed) zip,
// so no external library is needed. Numbers become real numeric cells;
// everything else is an inline string (avoids sharedStrings.xml).
const _xlsxXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const _xlsxCol = (() => { const cache = {}; return n => {
  if (cache[n] !== undefined) return cache[n];
  let s = '', m = n + 1;
  while (m > 0) { const d = (m - 1) % 26; s = String.fromCharCode(65 + d) + s; m = Math.floor((m - 1) / 26); }
  cache[n] = s; return s;
}; })();
const _xlsxEscape = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function xlsxSheetXml(rows) {
  const body = rows.map((r, i) => {
    const rowN = i + 1;
    const cells = r.map((v, j) => {
      const ref = _xlsxCol(j) + rowN;
      // Numbers: real numeric cell
      if (typeof v === 'number' && Number.isFinite(v)) {
        return `<c r="${ref}"${i === 0 ? ' s="1"' : ''}><v>${v}</v></c>`;
      }
      // Strings: use t="str" which is universally supported by Excel/LibreOffice
      const safe = _xlsxEscape(v ?? '');
      return `<c r="${ref}" t="str"${i === 0 ? ' s="1"' : ''}><v>${safe}</v></c>`;
    }).join('');
    return `<row r="${rowN}">${cells}</row>`;
  }).join('');
  return _xlsxXml +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetData>' + body + '</sheetData></worksheet>';
}
const _xlsxContentTypes = _xlsxXml +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>';
const _xlsxRootRels = _xlsxXml +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';
const _xlsxWorkbookRels = _xlsxXml +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';
const _xlsxStyles = _xlsxXml +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '</styleSheet>';

const _crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
function _crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = (c >>> 8) ^ _crcTable[(c ^ u8[i]) & 0xff]; return (c ^ 0xffffffff) >>> 0; }
function zipStore(parts) {
  const enc = new TextEncoder();
  const now = new Date();
  const time = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const date = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  const locals = [];
  const chunks = [];
  let offset = 0;
  for (const p of parts) {
    const name = enc.encode(p.name);
    const data = typeof p.data === 'string' ? enc.encode(p.data) : p.data;
    const crc  = _crc32(data);
    const hdr  = new DataView(new ArrayBuffer(30));
    hdr.setUint32(0, 0x04034b50, true); hdr.setUint16(4, 20, true); hdr.setUint16(6, 0, true);
    hdr.setUint16(8, 0, true); hdr.setUint16(10, time, true); hdr.setUint16(12, date, true);
    hdr.setUint32(14, crc, true); hdr.setUint32(18, data.length, true); hdr.setUint32(22, data.length, true);
    hdr.setUint16(26, name.length, true); hdr.setUint16(28, 0, true);
    locals.push({ name, data, crc, localOffset: offset });
    chunks.push(new Uint8Array(hdr.buffer), name, data);
    offset += 30 + name.length + data.length;
  }
  const dirStart = offset;
  for (const c of locals) {
    const hdr = new DataView(new ArrayBuffer(46));
    hdr.setUint32(0, 0x02014b50, true); hdr.setUint16(4, 20, true); hdr.setUint16(6, 20, true);
    hdr.setUint16(8, 0, true); hdr.setUint16(10, 0, true); hdr.setUint16(12, time, true); hdr.setUint16(14, date, true);
    hdr.setUint32(16, c.crc, true); hdr.setUint32(20, c.data.length, true); hdr.setUint32(24, c.data.length, true);
    hdr.setUint16(28, c.name.length, true); hdr.setUint16(30, 0, true); hdr.setUint16(32, 0, true);
    hdr.setUint16(34, 0, true); hdr.setUint16(36, 0, true); hdr.setUint32(38, c.localOffset, true);
    chunks.push(new Uint8Array(hdr.buffer), c.name);
    offset += 46 + c.name.length;
  }
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(4, 0, true); eocd.setUint16(6, 0, true);
  eocd.setUint16(8, locals.length, true); eocd.setUint16(10, locals.length, true);
  eocd.setUint32(12, offset - dirStart, true); eocd.setUint32(16, dirStart, true); eocd.setUint16(20, 0, true);
  chunks.push(new Uint8Array(eocd.buffer));
  const len = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
function xlsxBlob(sheetName, rows) {
  return xlsxBlobMulti([{ name: sheetName, rows }]);
}

// Multi-sheet version: sheets = [{ name, rows }, ...]
function xlsxBlobMulti(sheets) {
  // Build workbook.xml listing all sheets
  const sheetRefs = sheets.map((s, i) =>
    `<sheet name="${_xlsxEscape(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
  ).join('');

  // Build workbook rels pointing to each worksheet
  const wbRels = sheets.map((_, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  ).join('') +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;

  // Content types for each worksheet
  const extraTypes = sheets.map((_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join('');
  const contentTypes = _xlsxXml +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    extraTypes +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>';

  const parts = [
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels',         data: _xlsxRootRels },
    { name: 'xl/workbook.xml',     data: _xlsxXml +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets>${sheetRefs}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: _xlsxXml +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels}</Relationships>` },
    { name: 'xl/styles.xml', data: _xlsxStyles },
    ...sheets.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: xlsxSheetXml(s.rows)
    }))
  ];
  return new Blob([zipStore(parts)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function downloadXlsx(filename, rows, sheetName = 'Sheet1') {
  const name = filename.endsWith('.xlsx') ? filename : filename + '.xlsx';
  const url  = URL.createObjectURL(xlsxBlob(sheetName, rows));
  const a    = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// Download a multi-sheet workbook: sheets = [{ name, rows }, ...]
function downloadXlsxMulti(filename, sheets) {
  const name = filename.endsWith('.xlsx') ? filename : filename + '.xlsx';
  const url  = URL.createObjectURL(xlsxBlobMulti(sheets));
  const a    = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// ── PDF export — the browser's print dialog with "Save as PDF" ──
// Only the open report drawer prints (see the printing-report rules in
// styles.css); the app chrome and dashboard panels are hidden.
function printReportPdf() {
  document.body.classList.add('printing-report');
  const done = () => { document.body.classList.remove('printing-report'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
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
    const email = emailI.value.trim().toLowerCase();
    const user  = Data.userByEmail(email);
    if (user && Data.passwordMatches(user, pwI.value)) {
      if (Data.accountBlocked(user)) {
        err.textContent = 'This account has been archived and can no longer sign in. Contact the school office.';
        err.hidden = false; return;
      }
      err.hidden = true; login(user); return;
    }
    // "Incorrect email or password" on its own is misleading when the real
    // cause is a stale page, so say which of the two it actually was.
    if (!user && Data.users().length) {
      err.textContent = 'No account with that email. This page may be showing ' +
                        'out-of-date data - reload it, then try again.';
    } else if (user) {
      err.textContent = 'That password is not right for ' + user.name + '.';
    } else {
      err.textContent = 'Incorrect email or password.';
    }
    err.hidden = false;
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
    'view-admin-progression': renderAdminProgression,
    'view-admin-timetable':  renderAdminTimetable,
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

function studentRowMenu(sid) {
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

  if (!name || !email) {
    feedback.textContent = 'Name and email are required.';
    feedback.className = 'form-feedback error mt8';
    return;
  }
  if (!_editingUserId && !pw) {
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
  if (_editingUserId) {
    const done = Data.updateUser(_editingUserId, { name, phone, role, ...(pw ? { password: pw } : {}) });
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
      _editingUserId = p.id;
      $('nu-modal-title').textContent = 'Edit person';
      $('nu-feedback').textContent = '';
      $('nu-name').value = p.name;
      $('nu-email').value = p.email;
      $('nu-phone').value = p.phone || '';
      $('nu-password').value = ''; // hashed — leave blank to keep the current one
      $('nu-role').value = p.role;
      syncPersonForm();
      openModal('add-user-modal');
    }));
  }
}

// ── Password reset ───────────────────────────────────────────
// Who may reset: an Administrator resets staff (or anyone); a Class
// Teacher resets students in their own class. Data.resetPassword
// enforces the same rule.
let _resetUserId = null;

function bindResetPasswordButtons() {
  $all('[data-reset-pw]').forEach(btn => btn.addEventListener('click', () => {
    openResetPasswordModal(btn.dataset.resetPw);
  }));
}

function openResetPasswordModal(userId) {
  const user = Data.user(userId);
  if (!user) return;
  _resetUserId = userId;
  $('rp-eyebrow').textContent    = user.role;
  $('rp-title').textContent      = `Reset password · ${user.name}`;
  $('rp-sub').textContent        = `You can safely make up a new password — the old one stops working immediately.`;
  $('rp-feedback').textContent   = '';
  $('rp-password').value = '';
  $('rp-confirm').value = '';
  openModal('reset-password-modal');
  setTimeout(() => $('rp-password').focus(), 0);
}

function bindResetPasswordModal() {
  $('rp-generate-btn').addEventListener('click', () => {
    const pw = Data.generateTempPassword();
    $('rp-password').value = pw;
    $('rp-confirm').value  = pw;
    $('rp-feedback').textContent = '';
  });
  $('save-reset-btn').addEventListener('click', async () => {
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
    const freed = teacherId
      ? Data.classes().find(c => c.id !== klass.id && String(c.classTeacherId) === String(teacherId))
      : null;
    toast(teacherId
      ? (freed
          ? `${Data.user(teacherId)?.name} now leads ${klass.name} (was the teacher of ${freed.name}).`
          : `${Data.user(teacherId)?.name} is now the class teacher of ${klass.name}.`)
      : 'Class teacher removed.');
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
  // Teachers only ever see the timetable for their own class — no generator.
  const mine = myClassRecord(currentUser);

  // Hide the entire generator panel for non-admin users
  const genPanel = $q('.timetable-gen-panel');
  if (genPanel) genPanel.hidden = !isAdmin(currentUser);

  if (!isAdmin(currentUser)) {
    // Non-admin (class teacher / HOD): show the saved timetable for their
    // class immediately, with no generate controls.
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

  // Admin-only from here ────────────────────────────────────────
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

// Build a timetable schedule object from saved DB rows (for view-only display)
function _buildScheduleFromSaved(classId, rows) {
  const cl   = Data.cls(classId);
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  // Group rows by day
  const byDay = {};
  rows.forEach(r => {
    const slot = Data.timeSlots().find(s => String(s.id) === String(r.timeSlotId));
    const day  = slot?.dayOfWeek ?? r.day ?? 1; // 1=Mon … 5=Fri
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
  // Sort periods within each day
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

    // Attendance performance — the daily marks uploaded by a class teacher
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

    // Mid-term report — only the CA test scores actually uploaded appear;
    // exam marks and unpublished gaps are never guessed.
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

// ── Admin · Leaderboard ──────────────────────────────────────
function renderAdminLeaderboard() {
  const term = currentTerm();
  const topN = 10; // Show top 10 students per class and overall
  
  // Get all active students with their averages
  const allStudents = Data.students()
    .filter(s => s.status !== 'archived')
    .map(s => ({
      ...s,
      avg: Progression.sessionAverage(s.id),
      termAvg: Academic.termAverage(s.id, term),
      className: Data.cls(s.classId)?.name || '—',
      rank: classRank(s.id, term)
    }))
    .filter(s => s.avg !== null); // Only students with scores
  
  // Sort by session average descending
  allStudents.sort((a, b) => (b.avg || 0) - (a.avg || 0));
  
  // Top performers overall
  const topOverall = allStudents.slice(0, topN);
  
  // Top performers per class
  const classes = Data.classes();
  const topPerClass = classes.map(cl => {
    const classStudents = allStudents
      .filter(s => s.classId === cl.id)
      .slice(0, topN);
    return { class: cl, students: classStudents };
  }).filter(c => c.students.length > 0);
  
  // Render overall leaderboard
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
        </tr>`).join('') +
        `</tbody></table>`
    : '<p class="muted-cell" style="padding:16px">No students with scores yet.</p>';
  
  // Render per-class leaderboards
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
          `</tbody>
        </table>
      </div>
    </article>
  `).join('');
}

// ── Admin · Setup ────────────────────────────────────────────
function renderAdminSetup() {
  const sess = Data.session();
  $('setup-session-name').value = sess.name;
  $('setup-term').value = sess.currentTerm;
  $('setup-break-start').value = sess.midtermBreak?.start || '';
  $('setup-break-end').value   = sess.midtermBreak?.end   || '';
  updateUploadLabels(sess);
  renderSetupEventsList();

  $('toggle-test-upload').onclick = () => { const s = Data.session(); s.uploadOpen.test = !s.uploadOpen.test;  Data.saveSession(s); updateUploadLabels(s); };
  $('toggle-exam-upload').onclick = () => { const s = Data.session(); s.uploadOpen.exam = !s.uploadOpen.exam; Data.saveSession(s); updateUploadLabels(s); };
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

  // End of session — only when the final term's results are published.
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
//  ADMIN · PROGRESSION & PLACEMENT
//  Decisions are always previewed first; committing, placing and
//  closing the pool go through a password check. Everything is a
//  best-effort client write mirroring the usual app pattern.
// ══════════════════════════════════════════════════════════════
let _prRows = [];          // last dry-run decision rows
let _sensitiveRun = null;  // action queued behind the password confirm
let _placementId = null;   // student id being placed from the pool

function prDecisionRows() {
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

function renderProgressionDecisions() {
  const gate = Data.promotionsGate();
  if (!gate.open) {
    _prRows = [];
    $('pr-summary-badge').textContent = '—';
    $('pr-note').textContent = gate.reason;
    $('pr-decisions-table').innerHTML =
      `<tr><td colspan="7" class="muted-cell">${esc(termNameOf(gate.term))} results have to be published before any student is marked promoted. Publish them above to close the session and unlock the decisions.</td></tr>`;
    return;
  }
  const rows = prDecisionRows();
  _prRows = rows;
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

async function runSetOverride(studentId, decision, reason) {
  await Progression.setOverride(studentId, decision, reason, currentUser.id);
  renderProgressionDecisions();
  toast('Manual decision recorded — the override wins for this session.');
}

async function runClearOverride(studentId) {
  await Progression.clearOverride(studentId);
  renderProgressionDecisions();
  toast('Override removed.');
}

async function runProgressionCommit() {
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

function renderProgressionPool() {
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

function openPlacementModal(studentId) {
  const s = Data.student(studentId); if (!s) return;
  _placementId = String(studentId);
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

async function runPlacement() {
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

async function runClosePool() {
  const n = await Progression.closePool(currentUser.id);
  renderProgressionPool(); renderProgressionDecisions();
  toast(n ? `${n} unplaced entrant(s) marked inactive.` : 'Nothing to close.');
}

async function runStartNewSession() {
  const next = await Data.startNewSession({ userId: currentUser.id });
  if (!next) { toast('Publish the final term results before starting the next session.', 'error'); return; }
  toast(`Started ${next.name}. Reloading…`);
  setTimeout(() => location.reload(), 600);
}

function termCoverageProgression(term) {
  const cov = Progression.coverage(term);
  let entered = 0, total = 0;
  Object.values(cov).forEach(cl => cl.subjects.forEach(s => { entered += s.entered; total += s.total; }));
  return total ? Math.round(entered / total * 100) : 100;
}

function termNameOf(term) {
  return Data.session().terms.find(t => t.term === Number(term))?.name || `Term ${term}`;
}
function resultsLockedNote(term) {
  return `<span class="status review">Locked</span> &nbsp;${esc(termNameOf(term))} results have not been released yet — check back after the school publishes them.`;
}

function renderProgressionPublish() {
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

async function renderProgressionPositions() {
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

function renderProgressionApprovals() {
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

function readDayStructureBreaks() {
  return [...$all('#dstr-breaks-editor .form-row')].map(row => ({
    after:   Number(row.querySelector('[data-break="after"]')?.value)  || 3,
    minutes: Number(row.querySelector('[data-break="minutes"]')?.value) || 15,
    label:   row.querySelector('[data-break="label"]')?.value.trim() || 'Break'
  }));
}

function renderDayStructureBreaks(breaks) {
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

function initDayStructureForm() {
  const s = Data.ttSettings() || Timetable.DAY_DEFAULTS;
  $('dstr-periods').value = s.periods;
  $('dstr-start').value   = s.start;
  $('dstr-minutes').value = s.periodMinutes || s.minutes;
  $('dstr-reset-breaks').checked = false;
  renderDayStructureBreaks(s.breaks);
}

function bindDayStructureForm() {
  $('dstr-reset-breaks').addEventListener('change', () => {
    renderDayStructureBreaks($('dstr-reset-breaks').checked ? Timetable.DAY_DEFAULTS.breaks : (Data.ttSettings()?.breaks || []));
  });
  $('save-day-structure-btn').addEventListener('click', async () => {
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

function askSensitiveConfirm(title, message, run) {
  _sensitiveRun = run;
  $('sc-title').textContent    = title;
  $('sc-message').textContent  = message;
  $('sc-password').value       = '';
  const f = $('sc-feedback'); f.textContent = ''; f.hidden = true;
  openModal('sensitive-confirm-modal');
}

function renderAdminProgression() {
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

function bindProgressionModals() {
  $('pl-save-btn').addEventListener('click', runPlacement);
  $('sc-confirm-btn').addEventListener('click', async () => {
    const f = $('sc-feedback');
    if (!Data.passwordMatches(currentUser, $('sc-password').value)) {
      f.textContent = 'That password is not right for this account.'; f.hidden = false; return;
    }
    f.hidden = true;
    closeModal('sensitive-confirm-modal');
    const run = _sensitiveRun; _sensitiveRun = null;
    if (typeof run === 'function') await run();
  });
  bindDayStructureForm();
}

// ══════════════════════════════════════════════════════════════
//  GROWTH & RECOGNITION UI
//  Reads the derived Growth values (XP, ranks, badges); the only writes
//  are the stored records: artifacts, commendations, engagements and
//  honors. Errors are swallowed by the writers (offline-first app).
// ══════════════════════════════════════════════════════════════
function xpBar(label, value, pct) {
  const grade = value >= 300 ? 'xp-high' : value >= 100 ? 'xp-mid' : 'xp-low';
  return `<div class="xp-row">
    <span>${esc(label)}</span>
    <i class="xp-track"><em class="${grade}" style="width:${Math.min(100, pct)}%"></em></i>
    <b>${value} XP</b>
  </div>`;
}

function renderStudentGrowth() {
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

function renderParentGuardian() {
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

// Login engagement for the parent streak — at most one per calendar day.
function recordParentLoginIfNew() {
  const eng = (Data.parentEngagements() || []).filter(e => e.kind === 'login' && String(e.parentId) === String(currentUser.id));
  const last = eng.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0];
  const today = new Date().toISOString().slice(0, 10);
  if (!eng.length || String(last?.at || '').slice(0, 10) !== today) Growth.recordParentEngagement(currentUser.id, 'login');
}

// ── Student Achievement Passport (printable) ─────────────────
function renderPassport(studentId) {
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

// ── Admin · Recognition (Educator Recognition Engine) ────────
function renderAdminRecognition() {
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
  $('st-file-input').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = ''; // allow re-selecting the same file
    processScoreUpload(file);
  };
  const dlBtn = $('st-download-sheet-btn');
  if (dlBtn) dlBtn.onclick = downloadScoreSheet;

  $('st-create-assign-btn').onclick = () => { populateAssignmentModal(); openModal('add-assignment-modal'); };
  $('save-assignment-btn').onclick  = saveAssignment;
  $('st-assign-mentor-btn').onclick = () => openMentorModal();
  $('st-report-link').onclick = hasClass(currentUser)
    ? () => { showView('view-class-report'); renderClassReport(); }
    : () => { showView('view-subject-scores'); renderSubjectScores(); };

  initWeeklyTopicsComposer();
}

// ── Weekly topics — what the teacher covered, per subject/class ─
function initWeeklyTopicsComposer() {
  const pairs = myTeachingPairs();
  const wrap  = $('wt-subject');
  if (!wrap) return;
  const noAllocation = () => {
    $('wt-subject').innerHTML = '<option value="">No allocation</option>';
    $('wt-class').innerHTML  = '<option value="">—</option>';
    $('wt-list-meta').textContent = 'You need a subject/class allocation before recording weekly topics.';
    $('wt-list').innerHTML = '';
    $('wt-add-btn').disabled = true;
  };
  if (!pairs.length) { noAllocation(); return; }

  const mySubjects = [...new Map(pairs.map(p => [p.subjectId, p.subject])).values()];
  $('wt-subject').innerHTML = mySubjects.length
    ? mySubjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')
    : '<option value="">No subjects</option>';
  $('wt-add-btn').disabled = false;

  function fillClasses() {
    const subjectId = $('wt-subject').value;
    const classes = pairs.filter(p => String(p.subjectId) === subjectId).map(p => p.cls);
    $('wt-class').innerHTML = classes.length
      ? classes.map(c => `<option value="${c.id}">${esc(c.name)}${c.stream ? ' · ' + c.stream : ''}</option>`).join('')
      : '<option value="">No classes</option>';
  }

  function drawList() {
    const subjectId = $('wt-subject').value;
    const classId   = $('wt-class').value;
    const list      = Progression.topicsFor(classId, subjectId).slice(0, 15);
    $('wt-list-meta').textContent = list.length
      ? `${Data.subject(subjectId)?.name || 'Subject'} · ${Data.cls(classId)?.name || 'Class'} — ${list.length} topic${list.length === 1 ? '' : 's'} logged, latest week ${list[0].week}.`
      : 'No topics recorded yet for this subject/class.';
    $('wt-list').innerHTML = list.map(t => `<div class="topic-row">
        <span class="subject-chip chip-${Data.subject(t.subjectId)?.color || 'blue'}">W${t.week}</span>
        <div><strong>${esc(t.topic)}</strong><small>${esc(t.summary || Data.subject(t.subjectId)?.name || '—')}</small></div>
      </div>`).join('') || '<p class="muted-cell">Nothing here yet &mdash; add the first topic for the week.</p>';
  }

  $('wt-subject').onchange = () => { fillClasses(); drawList(); };
  $('wt-class').onchange   = () => drawList();
  $('wt-add-btn').onclick  = async () => {
    const fb = $('wt-feedback');
    const subjectId = $('wt-subject').value, classId = $('wt-class').value;
    const week   = Number($('wt-week').value) || 1;
    const topic  = $('wt-topic').value.trim();
    const summary = $('wt-summary').value.trim();
    if (!subjectId || !classId) { fb.hidden = false; fb.textContent = 'Pick a subject and a class.'; fb.className = 'form-feedback mt8 text-danger'; return; }
    if (!topic)  { fb.hidden = false; fb.textContent = 'Give the topic a name.'; fb.className = 'form-feedback mt8 text-danger'; return; }
    await Progression.addWeeklyTopic({ classId, subjectId, week, topic, summary }, currentUser.id);
    $('wt-topic').value = ''; $('wt-summary').value = '';
    fb.hidden = false; fb.textContent = `Week ${week} topic saved for ${Data.cls(classId)?.name || 'the class'}. ✓`;
    fb.className = 'form-feedback mt8 green-text';
    drawList();
  };

  fillClasses();
  drawList();
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
  if (dlBtn) dlBtn.onclick = () => downloadScoreSheet(true);
}

// Download the score sheet for the selected subject / class / term
function downloadScoreSheet(asExcel) {
  const mine = myTeacherSubjects();
  if (!mine.length) { toast('No subjects are assigned to you.', 'error'); return; }

  const subSel    = $('st-score-subject');
  const subjectId = subSel?.value || mine[0].subjectId;
  const classId   = ($('st-score-class')?.value) || '';
  const term      = +($('st-score-term')?.value || currentTerm());
  const subject   = Data.subject(subjectId);
  const classIds  = classId
    ? [classId]
    : [...new Set(mine.filter(ts => ts.subjectId === subjectId).map(ts => ts.classId))];

  const header = ['Class', 'Admission No', 'Student Name', 'CA Score (max 40)', 'Exam Score (max 60)', 'Total', 'Feedback'];

  if (asExcel) {
    // One sheet per class so each class is separate when downloaded
    const sheets = classIds.map(cid => {
      const cl       = Data.cls(cid);
      const students = Data.studentsByClass(cid);
      const rows = [
        [`Happy Man Academy — ${subject?.name} · ${cl?.name || ''} · Term ${term}`],
        header
      ];
      students.forEach(s => {
        const e  = Data.studentScores(s.id)[subjectId]?.[term];
        const fb = Data.feedback()[s.id];
        const remark = fb && fb.term === term ? (fb.text || '') : '';
        rows.push([cl?.name || '', s.admissionNo || '', s.name,
          e?.test ?? '', e?.exam ?? '', e ? e.test + e.exam : '', remark]);
      });
      return { name: (cl?.name || cid).slice(0, 31), rows };
    });
    downloadXlsxMulti(`scores_${subject?.code || 'sub'}_term${term}.xlsx`, sheets);
  } else {
    const rows = [[`Happy Man Academy — ${subject?.name} · Term ${term}`], header];
    classIds.forEach(cid => {
      const cl = Data.cls(cid);
      Data.studentsByClass(cid).forEach(s => {
        const e  = Data.studentScores(s.id)[subjectId]?.[term];
        const fb = Data.feedback()[s.id];
        const remark = fb && fb.term === term ? (fb.text || '') : '';
        rows.push([cl?.name || '', s.admissionNo || '', s.name,
          e?.test ?? '', e?.exam ?? '', e ? e.test + e.exam : '', remark]);
      });
    });
    downloadCsv(`scores_${subject?.code || 'sub'}_term${term}.csv`, rows);
  }
  toast('Score sheet downloaded.');
}

// ── Score upload — parse the teacher's filled-in spreadsheet ─
// Matches rows to students by Admission No (preferred) or Student Name.
// Only writes scores for students in the classes the teacher is allocated to.
// Accepted formats: .csv and .xlsx (the built-in dependency-free reader handles both).
async function processScoreUpload(file) {
  // 1. Read file bytes
  const buf = await file.arrayBuffer();
  let rows = [];

  if (file.name.toLowerCase().endsWith('.csv')) {
    // Parse CSV (handles quoted fields)
    const text = new TextDecoder().decode(buf);
    rows = text.split(/\r?\n/).map(line => {
      const out = []; let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
      out.push(cur.trim());
      return out;
    }).filter(r => r.some(c => c));
  } else {
    // Parse XLSX — extract the first sheet's shared strings + cells
    try {
      rows = _parseXlsxRows(buf);
    } catch (err) {
      toast('Could not read the spreadsheet. Save as .csv and try again.', 'error');
      return;
    }
  }

  if (rows.length < 2) { toast('The file appears to be empty.', 'error'); return; }

  // 2. Detect header row — find columns by name (case-insensitive)
  const header = rows[0].map(h => String(h ?? '').toLowerCase().trim());
  const col = name => header.findIndex(h => h.includes(name));

  const colAdm  = col('admission');            // Admission No
  const colName = col('student name') >= 0 ? col('student name') : col('name');
  const colCA   = col('ca') >= 0 ? col('ca') : col('test');
  const colExam = col('exam');

  if (colCA < 0 || colExam < 0) {
    toast('Missing columns. The sheet must have "CA Score" and "Exam Score" columns.', 'error');
    return;
  }

  // 3. Determine which subject and term we're uploading for (from the score view)
  const subjectId = $('st-score-subject')?.value;
  const term      = +($('st-score-term')?.value || currentTerm());
  const mine      = myTeacherSubjects();
  if (!subjectId) { toast('Select a subject first, then upload.', 'error'); return; }

  // All students in classes this teacher teaches this subject
  const allowedClassIds = [...new Set(
    mine.filter(ts => ts.subjectId === subjectId).map(ts => ts.classId)
  )];
  const allowedStudents = allowedClassIds.flatMap(cid => Data.studentsByClass(cid));

  // Build lookup maps: admissionNo→student, name(lower)→student
  const byAdm  = new Map(allowedStudents.map(s => [String(s.admissionNo || '').toLowerCase(), s]));
  const byName = new Map(allowedStudents.map(s => [s.name.toLowerCase(), s]));

  // 4. Process data rows
  let saved = 0, skipped = 0, errors = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const admVal  = colAdm  >= 0 ? String(row[colAdm]  ?? '').toLowerCase().trim() : '';
    const nameVal = colName >= 0 ? String(row[colName] ?? '').toLowerCase().trim() : '';
    const caRaw   = row[colCA];
    const exRaw   = row[colExam];

    if (!caRaw && !exRaw) { skipped++; continue; } // blank row

    const ca   = Math.min(40, Math.max(0, Number(String(caRaw  ?? '').replace(/[^0-9.]/g, '')) || 0));
    const exam = Math.min(60, Math.max(0, Number(String(exRaw ?? '').replace(/[^0-9.]/g, '')) || 0));

    // Match student
    const student = (admVal && byAdm.get(admVal)) || (nameVal && byName.get(nameVal));
    if (!student) {
      if (admVal || nameVal) errors.push(`Row ${i + 1}: "${admVal || nameVal}" not found`);
      skipped++;
      continue;
    }

    const ok = await Data.saveGrade(student.id, subjectId, term, ca, exam);
    if (ok) saved++; else skipped++;
  }

  // 5. Mark the sheet as uploaded and refresh the view
  await Progression.markUploaded(
    { classId: allowedClassIds[0] || '', subjectId, kind: 'both', rowCount: saved },
    currentUser.id
  );

  const msg = `Uploaded ${saved} score${saved !== 1 ? 's' : ''}` +
    (skipped ? ` · ${skipped} skipped` : '') +
    (errors.length ? ` · ${errors.length} unmatched` : '');
  toast(msg, saved > 0 ? 'success' : 'error');
  if (errors.length) console.warn('[HMA] unmatched upload rows:', errors.join('; '));

  renderSubjectScores();   // refresh the on-screen table
  renderSubjectDashboard(); // refresh the stat cards
}

// Minimal XLSX reader — extracts cell values from the first worksheet.
// Only handles inline strings (t="inlineStr"), shared strings, and numbers.
function _parseXlsxRows(buf) {
  const u8  = new Uint8Array(buf);
  const dec = new TextDecoder();

  // Read a zip entry by filename
  function zipEntry(name) {
    const enc = new TextEncoder().encode(name);
    for (let i = 0; i < u8.length - 30; i++) {
      if (u8[i] !== 0x50 || u8[i+1] !== 0x4B || u8[i+2] !== 0x03 || u8[i+3] !== 0x04) continue;
      const fLen = u8[i+26] | (u8[i+27] << 8);
      const xLen = u8[i+28] | (u8[i+29] << 8);
      if (fLen !== enc.length) continue;
      const fname = u8.slice(i+30, i+30+fLen);
      if (!enc.every((b, j) => b === fname[j])) continue;
      const dataStart = i + 30 + fLen + xLen;
      const cLen = (u8[i+18] | (u8[i+19]<<8) | (u8[i+20]<<16) | (u8[i+21]<<24)) >>> 0;
      return dec.decode(u8.slice(dataStart, dataStart + cLen));
    }
    return null;
  }

  // Pull all text content from <si> shared-string entries
  const ssXml = zipEntry('xl/sharedStrings.xml') || '';
  const shared = [...ssXml.matchAll(/<si[^>]*>[\s\S]*?<\/si>/g)]
    .map(m => (m[0].match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [])
      .map(t => t.replace(/<[^>]+>/g, '')).join(''));

  // Find the first sheet
  const wb   = zipEntry('xl/workbook.xml') || '';
  const rel  = zipEntry('xl/_rels/workbook.xml.rels') || '';
  const sheetIdM = wb.match(/<sheet[^>]+sheetId="1"[^>]+r:id="([^"]+)"/);
  const sheetId  = sheetIdM?.[1] || 'rId1';
  const targetM  = rel.match(new RegExp(`Id="${sheetId}"[^>]+Target="([^"]+)"`));
  const target   = targetM?.[1] || 'worksheets/sheet1.xml';
  const sheetXml = zipEntry('xl/' + target) || zipEntry('xl/worksheets/sheet1.xml') || '';

  // Parse rows and cells
  const result = [];
  for (const rowM of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    let lastCol = -1;
    for (const cellM of rowM[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const colStr = cellM[1];
      const colIdx = [...colStr].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
      // Fill gaps with empty strings
      while (cells.length <= colIdx) cells.push('');
      const attrs = cellM[2], inner = cellM[3];
      const vM = inner.match(/<v>([\s\S]*?)<\/v>/);
      const val = vM ? vM[1] : '';
      if (attrs.includes('t="s"')) {
        cells[colIdx] = shared[Number(val)] ?? '';
      } else if (attrs.includes('t="inlineStr"') || attrs.includes('t="str"')) {
        cells[colIdx] = inner.replace(/<[^>]+>/g, '');
      } else {
        cells[colIdx] = val === '' ? '' : isNaN(Number(val)) ? val : Number(val);
      }
      lastCol = colIdx;
    }
    result.push(cells);
  }
  return result;
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
  const students = Data.studentsByClass(cl.id).filter(s => s.status !== 'archived');
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
        <span class="role-row-actions">
          <button class="row-menu ct-att-btn" data-sid="${s.id}" title="Edit attendance">✎</button>
          <button class="btn-sm-save" data-reset-pw="${s.id}" title="Reset password">Reset</button>
        </span>
      </div>`;
    }).join('');

  $all('.ct-att-btn').forEach(btn => btn.addEventListener('click', () => {
    showView('view-class-attendance');
    renderClassAttendance(btn.dataset.sid);
  }));
  bindResetPasswordButtons();

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
  renderClassApprovals(cl);
}

// ── Class teacher: subject change approvals for the class ─────
function renderClassApprovals(cl) {
  const wrap = $('ct-approvals-list');
  if (!wrap) return;
  const mine = new Set(Data.studentsByClass(cl.id).map(s => s.id));
  const rows = Progression.pendingApprovals()
    .filter(a => a.actionType === 'subject_change' && mine.has(String(a.entityId)));
  $('ct-approval-count').textContent = rows.length;

  if (!rows.length) {
    wrap.innerHTML = '<p class="muted-cell">No pending subject change requests for your class.</p>';
    return;
  }

  wrap.innerHTML = rows.map(a => {
    const st    = Data.student(a.entityId);
    const ids   = Array.isArray(a.payload?.subjectIds) ? a.payload.subjectIds : [];
    const names = ids.length ? ids.map(id => Data.subject(String(id))?.name || id).join(', ')
                             : (a.payload?.summary || 'Requested a change');
    return `<div class="approval-row">
      <span class="student"><span class="student-avatar ${st ? toneClass(st.tone) : 'blue'}">${st ? st.initials : '?'}</span></span>
      <div style="flex:1">
        <strong class="twelve">${esc(st?.name || 'Student ' + a.entityId)}</strong>
        <span class="approval-sub">${esc(names)}</span>
      </div>
      <span class="status review">Pending</span>
      <span class="approval-actions">
        <button class="btn-sm-save" data-approve="${a.id}">Approve</button>
        <button class="btn-sm-outline" data-reject="${a.id}" title="Reject">Reject</button>
      </span>
    </div>`;
  }).join('');

  $all('[data-approve]').forEach(b => b.addEventListener('click', async () => {
    const a = rows.find(r => r.id === b.dataset.approve);
    if (!a) return;
    const ids = Array.isArray(a.payload?.subjectIds) ? a.payload.subjectIds : [];
    await Progression.chooseSubjects(a.entityId, ids, { status: 'effective', userId: currentUser.id });
    await Progression.decideApproval(a.id, true, currentUser.id, 'Approved by class teacher');
    toast(`${Data.student(a.entityId)?.name.split(' ')[0] || 'Student'}'s subjects are now effective. ✓`);
    renderClassApprovals(cl);
  }));
  $all('[data-reject]').forEach(b => b.addEventListener('click', async () => {
    const a = rows.find(r => r.id === b.dataset.reject);
    if (!a) return;
    const prev = Array.isArray(a.payload?.previous) ? a.payload.previous : [];
    await Progression.chooseSubjects(a.entityId, prev, { status: 'effective', userId: currentUser.id });
    await Progression.decideApproval(a.id, false, currentUser.id, 'Declined by class teacher');
    toast('Change request declined; previous subjects kept.');
    renderClassApprovals(cl);
  }));
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
    // One sheet per subject — Summary sheet + one sheet per subject
    const summaryRows = [
      [`${cl.name} — full class report · Term ${term}`],
      ['Admission No', 'Student', ...report.subjects.map(s => s.name), 'Average', 'Status']
    ];
    report.students.forEach(r => {
      summaryRows.push([r.student.admissionNo || '', r.student.name, ...r.rows.map(x => x.score ?? ''), r.average, r.status]);
    });
    const sheets = [{ name: 'Summary', rows: summaryRows }];
    report.subjects.forEach(sub => {
      const subRows = [
        [`${cl.name} · ${sub.name} · Term ${term}`],
        ['Admission No', 'Student', 'CA (40)', 'Exam (60)', 'Total', 'Grade', 'Status']
      ];
      report.students.forEach(r => {
        const sc = r.rows.find(x => x.subjectId === sub.id);
        const total = sc?.score ?? null;
        subRows.push([r.student.admissionNo || '', r.student.name,
          sc?.ca ?? '', sc?.exam ?? '', total ?? '',
          total !== null ? gradeLabel(total) : '',
          total === null ? '' : total >= passMark() ? 'Pass' : 'Fail']);
      });
      sheets.push({ name: sub.code.slice(0, 31), rows: subRows });
    });
    downloadXlsxMulti(`class_report_${cl.name.replace(/\s+/g, '_')}_term${term}.xlsx`, sheets);
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
    // One sheet per subject plus a summary sheet
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

// ── Attendance ───────────────────────────────────────────────
const ATT_DAYS     = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const ATT_DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function renderClassAttendance(focusSid = null) {
  const cl = myClassRecord(currentUser);
  if (!cl) { toast('You are not assigned a class yet.', 'error'); return; }

  const students = Data.studentsByClass(cl.id).filter(s => s.status !== 'archived');
  const term     = currentTerm();
  const att      = Data.attendance(term);

  $('att-page-title').textContent  = `${cl.name} · Attendance`;
  $('att-class-name').textContent  = `${cl.name} · Term ${term}`;

  // ── Normalise daily draft: { sid: { week: [status×5] } } ──
  const normDay = arr => Array.from({ length: 5 }, (_, i) => (arr && arr[i]) || '');
  const draft   = {};
  const daily   = Data.dailyAttendance(term);
  students.forEach(s => {
    draft[s.id] = {};
    [1, 2, 3, 4].forEach(w => {
      draft[s.id][w] = normDay(daily[`W${w}`]?.[String(s.id)]);
    });
  });

  const isPresent = st => st === 'present' || st === 'late';

  // ── Stat cards ──────────────────────────────────────────────
  function refreshStats() {
    const pcts  = students.map(s => parseInt(Academic.attendancePct(s.id, term), 10) || 0);
    const avg   = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
    const risk  = pcts.filter(p => p < 75).length;

    const w = +$('ct-day-week').value, d = +$('ct-day-of-week').value;
    const presentToday = students.filter(s => isPresent(draft[s.id][w][d])).length;
    const lateThisWeek = students.reduce((n, s) =>
      n + draft[s.id][w].filter(st => st === 'late').length, 0);

    $('att-stat-pct').textContent     = avg + '%';
    $('att-stat-sub').textContent     = avg >= 90 ? 'Excellent' : avg >= 75 ? 'Good' : 'Needs attention';
    $('att-stat-present').textContent = `${presentToday}/${students.length}`;
    $('att-stat-date').textContent    = `${ATT_DAYS_FULL[d]}, Week ${w}`;
    $('att-stat-late').textContent    = lateThisWeek;
    $('att-stat-risk').textContent    = risk;
  }

  // ── Day count bar ───────────────────────────────────────────
  function refreshCount() {
    const w = +$('ct-day-week').value, d = +$('ct-day-of-week').value;
    const present = students.filter(s => isPresent(draft[s.id][w][d])).length;
    const late    = students.filter(s => draft[s.id][w][d] === 'late').length;
    const absent  = students.filter(s => draft[s.id][w][d] === 'absent').length;
    const unmarked = students.length - present - absent;
    $('ct-day-count').textContent =
      `${present} present${late ? ` (${late} late)` : ''} · ${absent} absent` +
      (unmarked ? ` · ${unmarked} not marked` : '');
  }

  // ── Build the per-student term heatmap chips ─────────────────
  // Shows 4 weeks × 5 days as small coloured squares
  function termHeatmap(sid) {
    return [1, 2, 3, 4].map(w => {
      const row = draft[sid][w].map((st, d) => {
        const cls = st === 'present' ? 'present' : st === 'late' ? 'late' : st === 'absent' ? 'absent' : 'off';
        return `<span class="att-day ${cls}" title="W${w} ${ATT_DAYS[d]}: ${st || 'not marked'}">${ATT_DAYS[d][0]}</span>`;
      }).join('');
      return `<span class="att-week-group" title="Week ${w}">${row}</span>`;
    }).join('');
  }

  // ── Daily register ──────────────────────────────────────────
  function drawDay() {
    const w = +$('ct-day-week').value, d = +$('ct-day-of-week').value;
    $('ct-daily-title').textContent = `${ATT_DAYS_FULL[d]}, Week ${w}`;

    $('ct-daily-list').innerHTML = students.map(s => {
      const st  = draft[s.id][w][d] || '';
      const pct = Academic.attendancePct(s.id, term);
      return `<tr class="${s.id === focusSid ? 'att-focused' : ''}">
        <td>
          <div class="student">
            <span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>
            <span>${esc(s.name)}</span>
          </div>
          <small class="muted-cell" style="padding-left:32px;display:block;margin-top:2px">
            <span class="status ${parseInt(pct,10) >= 90 ? 'promoted' : parseInt(pct,10) >= 75 ? 'review' : 'repeat'}" style="font-size:9px">${pct}</span>
          </small>
        </td>
        <td class="att-status-cell">
          <div class="att-3state">
            <button class="att-state-btn ${st === 'present' ? 'active-present' : ''}"
              data-sid="${s.id}" data-status="present">✓ Present</button>
            <button class="att-state-btn ${st === 'late'    ? 'active-late'    : ''}"
              data-sid="${s.id}" data-status="late">⏱ Late</button>
            <button class="att-state-btn ${st === 'absent'  ? 'active-absent'  : ''}"
              data-sid="${s.id}" data-status="absent">✗ Absent</button>
          </div>
        </td>
        <td class="att-term-col">
          <div class="att-heatmap">${termHeatmap(s.id)}</div>
        </td>
      </tr>`;
    }).join('');

    refreshCount();
    refreshStats();

    $all('#ct-daily-list .att-state-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.sid;
        const status = btn.dataset.status;
        const w = +$('ct-day-week').value, d = +$('ct-day-of-week').value;
        // Toggle: click the active state to clear; click another to set
        draft[sid][w][d] = draft[sid][w][d] === status ? '' : status;
        drawDay();
      });
    });
  }

  $('ct-day-week').onchange     = drawDay;
  $('ct-day-of-week').onchange  = drawDay;
  $('ct-day-week').value        = 1;
  $('ct-day-of-week').value     = 0;

  $('ct-all-present').onclick = () => {
    const w = +$('ct-day-week').value, d = +$('ct-day-of-week').value;
    students.forEach(s => { draft[s.id][w][d] = 'present'; });
    drawDay();
  };
  $('ct-all-absent').onclick = () => {
    const w = +$('ct-day-week').value, d = +$('ct-day-of-week').value;
    students.forEach(s => { draft[s.id][w][d] = 'absent'; });
    drawDay();
  };

  // Save day — writes every student's status for the selected day to Supabase
  $('ct-save-day').onclick = async () => {
    const w = +$('ct-day-week').value, d = +$('ct-day-of-week').value;
    const marks = {};
    students.forEach(s => {
      const st = draft[s.id][w][d];
      marks[s.id] = st || 'absent'; // unmarked → absent on save
    });
    await Data.saveDailyDay(w, d, marks, term);
    toast(`Register saved · ${ATT_DAYS_FULL[d]}, Week ${w}.`);
    drawWeekly();
    refreshStats();
  };

  // ── Weekly rollup table — read-only summary derived from daily register ─
  function drawWeekly() {
    $('ct-attendance-table').innerHTML = students.map(s => {
      const saved  = Data.studentAttendance(s.id, term);
      const total  = Object.values(saved).reduce((a, b) => a + b, 0);
      const pct    = Academic.attendancePct(s.id, term);
      const pctNum = parseInt(pct, 10) || 0;
      const rowCls = s.id === focusSid ? 'att-focused' : '';

      const cells = ['W1', 'W2', 'W3', 'W4'].map(wk =>
        `<td class="muted-cell" style="text-align:center">${saved[wk] ?? '—'}</td>`
      ).join('');

      return `<tr class="${rowCls}">
        <td>
          <div class="student">
            <span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>
            ${esc(s.name)}
          </div>
        </td>
        ${cells}
        <td style="text-align:center"><strong>${total}</strong></td>
        <td><span class="status ${pctNum >= 90 ? 'promoted' : pctNum >= 75 ? 'review' : 'repeat'}">${pct}</span></td>
      </tr>`;
    }).join('');
  }

  drawDay();
  drawWeekly();
}

// ── Feedback ─────────────────────────────────────────────────
function renderClassFeedback() {
  const cl = myClassRecord(currentUser);
  if (!cl) { toast('You are not assigned a class yet.', 'error'); return; }
  const students = Data.studentsByClass(cl.id).filter(s => s.status !== 'archived');
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

  $('std-eyebrow').textContent      = `Student portal · ${s.admissionNo || ''}`;
  $('std-welcome').textContent      = `Welcome back, ${s.name.split(' ')[0]}.`;
  $('std-name').textContent         = s.name;
  $('std-class').textContent        = `${cl?.name || '—'} · ${Data.session().name}${cl?.stream ? ' · ' + cl.stream : ''}`;
  $('std-avatar').textContent       = s.initials;
  $('std-avatar').className         = `avatar ${toneClass(s.tone)}`;
  $('std-stat-avg').textContent     = avg + '%';
  $('std-stat-avg-note').textContent = `Grade ${gradeLabel(avg)} · ${[check.enPass, check.maPass, check.avgPass].filter(Boolean).length} of 3 met`;
  $('std-stat-att').textContent     = att;
  $('std-stat-assigns').textContent = assigns.length;
  // Promotion status is only meaningful after all three terms are published
  const _allPub = [1, 2, 3].every(t => Data.published(t));
  $('std-stat-status').textContent  = _allPub ? status : '—';

  $('std-subject-results').innerHTML = Academic.termScores(sid, term).map(sc => {
    const pct = sc.score ?? 0, pass = pct >= passMark();
    return `<div>
      <span>${esc(sc.name)}</span>
      <b class="${pass ? '' : 'text-danger'}">${pct}%</b>
      <i><em style="width:${pct}%;background:${pass ? 'var(--green)' : 'var(--coral)'}"></em></i>
    </div>`;
  }).join('');

  // Promotion tracker — English, Mathematics and the overall average
  // (each must be AT LEAST the pass mark; exactly 50 passes).
  const reqs = [
    { label: `At least ${passMark()}% in English`,     met: check.enPass, value: check.english + '%' },
    { label: `At least ${passMark()}% in Mathematics`, met: check.maPass, value: check.maths + '%' },
    { label: `Overall average at least ${passMark()}%`, met: check.avgPass, value: check.avg + '%' }
  ];
  const met      = reqs.filter(r => r.met).length;
  const promoted = check.pass;

  $('std-promo-title').textContent = promoted ? "You're on track" : 'Needs improvement';
  $('std-promo-badge').textContent = promoted ? '✓' : '!';
  $('std-promo-badge').className   = `check-badge ${promoted ? '' : 'warn-badge'}`;
  $('std-promo-circle').innerHTML  = `<strong>${met}/3</strong><span>requirements</span>`;
  // Promotion tracker shown to students only after all 3 terms are published
  const _promoEl = $('std-promo-reqs');
  if (_allPub) {
    $('std-promo-reqs').innerHTML = reqs.map(r => `
      <div>
        <span class="requirement-check ${r.met ? '' : 'req-fail'}">${r.met ? '✓' : '✗'}</span>
        <span>${r.label}</span><b>${r.value}</b>
      </div>`).join('');
  } else {
    $('std-promo-title').textContent = 'Pending';
    $('std-promo-badge').textContent = '…';
    $('std-promo-badge').className   = 'check-badge';
    $('std-promo-circle').innerHTML  = `<strong>—</strong><span>awaiting final term</span>`;
    $('std-promo-reqs').innerHTML    = '<div class="muted-cell" style="font-size:12px">Promotion status will be shown after all term results are published.</div>';
  }

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

  renderStudentSubjectsPanel();
  renderStudentGrowth();
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
  const cur = currentTerm();

  // Students only see published terms. Unpublished terms are hidden entirely
  // from the selector — the publish feature controls when students can see results.
  const visibleTerms = Data.session().terms
    .filter(t => t.term <= cur && Data.published(t.term));

  if (!visibleTerms.length) {
    termSel.innerHTML = '';
    $('std-results-table').innerHTML = `<tr><td colspan="7" class="muted-cell">${resultsLockedNote(cur)}</td></tr>`;
    $('std-results-meta').textContent = `${Data.session().name} · awaiting release`;
    return;
  }

  termSel.innerHTML = visibleTerms
    .map(t => `<option value="${t.term}" ${t.term === cur ? 'selected' : ''}>${esc(t.name)}</option>`)
    .join('');
  // If current term not published, default to most recent published
  if (!Data.published(cur)) termSel.value = String(visibleTerms[visibleTerms.length - 1].term);

  function draw() {
    const term = +termSel.value;
    if (!Data.published(term)) {
      $('std-results-table').innerHTML = `<tr><td colspan="7" class="muted-cell">${resultsLockedNote(term)}</td></tr>`;
      $('std-results-meta').textContent = `${Data.session().name} · awaiting release`;
      return;
    }
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

// ── Student: subject registration panel ───────────────────────
function renderStudentSubjectsPanel() {
  const sid = currentUser.studentId;
  const st  = Data.student(sid);
  const note = $('std-subjects-note');
  const grid = $('std-subjects-list');
  const btn  = $('std-subjects-btn');
  if (!st || !note || !grid || !btn) return;

  const year = Progression.yearOf(sid);
  const sel  = Progression.selectionFor(sid);
  const eff  = Progression.effectiveSubjects(sid);
  const cl   = Data.cls(st.classId);

  const topics = Progression.topicsFor(st.classId).slice(0, 5);
  const topicBlock = topics.length
    ? `<div class="mt16"><p class="role-muted" style="margin:0 0 6px"><strong>What's been covered</strong> · latest weekly topics in your class</p>` +
      topics.map(t => `<div class="topic-row">
        <span class="subject-chip chip-${Data.subject(t.subjectId)?.color || 'blue'}">W${t.week}</span>
        <div><strong>${esc(t.topic)}</strong><small>${esc(Data.subject(t.subjectId)?.name || '')}</small></div>
      </div>`).join('') + '</div>'
    : '';

  if (!Progression.canChoose(year)) {
    note.textContent = 'Subject registration for this year is set by the school — your subjects appear on your report automatically.';
    btn.hidden = true;
    grid.innerHTML = topicBlock || '<p class="muted-cell">Junior secondary classes take the common subject list.</p>';
    return;
  }

  if (sel && sel.status === 'pending') {
    note.textContent = 'Your change request has been sent to your class teacher for review.';
    btn.hidden = true;
    grid.innerHTML =
      `<div class="subject-results"><div><span>Requested subjects</span><b class="status review">Pending review</b></div>` +
      sel.subjectIds.map(id => `<div><span>${esc(Data.subject(id)?.name || id)}</span><b class="muted-cell">${esc(Data.subject(id)?.type === 'core' ? 'Core' : 'Elective')}</b></div>`).join('') +
      `</div>` + topicBlock;
    return;
  }

  if (eff && eff.length) {
    note.textContent = year >= 11
      ? 'Your subjects for this term. You can request a change at any time — your class teacher will review it.'
      : 'Your subjects for this term.';
    btn.hidden = false;
    btn.textContent = year >= 11 ? 'Request change' : 'Change subjects';
    grid.innerHTML =
      `<div class="subject-results">` +
      eff.map(id => `<div><span>${esc(Data.subject(id)?.name || id)}</span><b>${esc(Data.subject(id)?.type === 'core' ? 'Core' : 'Elective')}</b></div>`).join('') +
      `</div>` + topicBlock;
    btn.onclick = openChooseSubjectsModal;
    return;
  }

  note.textContent = `Pick your subjects for this ${Data.session().name} — you can adjust them later.`;
  btn.hidden = false;
  btn.textContent = 'Choose subjects';
  grid.innerHTML = `<p class="muted-cell">No subjects chosen yet.</p>` + topicBlock;
  btn.onclick = openChooseSubjectsModal;
}

let _csState = null;

function openChooseSubjectsModal() {
  const sid = currentUser.studentId;
  const st  = Data.student(sid);
  const cl  = st ? Data.cls(st.classId) : null;
  if (!st || !cl) return;
  const year   = Progression.yearOf(sid);
  const subs   = Academic.classSubjects(cl.id);
  const counts = Progression.selectionCounts() || { minTotal: 8, general: 1, stream: 5 };
  const sel    = Progression.selectionFor(sid);
  const cur    = (sel && sel.status !== 'pending') ? (sel.subjectIds || []) : [];
  _csState = { sid, year, previous: cur };

  $('cs-eyebrow').textContent =
    `${st.name.split(' ')[0]}, choose from the subjects offered in the ${cl.stream ? cl.stream : cl.level} track. ` +
    `You need at least ${counts.minTotal} subjects (${counts.general} general + ${counts.stream} stream/electives).`;
  $('cs-rules').innerHTML = `<p class="role-muted" style="margin:0">Core subjects stay, this choice decides your remaining subjects. ` +
    (year >= 11 ? 'Changes above this are reviewed by your class teacher before they take effect.' : 'Your choice is effective immediately.') + '</p>';
  $('cs-list').innerHTML = subs.map(sub => {
    const locked = sub.type === 'core' || sub.group === 'General' || (cl.stream && sub.group === cl.stream);
    return `<label class="dept-check">
      <input type="checkbox" value="${sub.id}" ${cur.includes(String(sub.id)) ? 'checked' : ''}>
      <span>${subjectChip(sub)}${esc(sub.name)}</span>
      <small class="muted-cell" style="margin-left:auto">${locked ? (sub.type === 'core' ? 'core' : sub.group) : 'elective'}</small>
    </label>`;
  }).join('');
  $('cs-feedback').hidden = true;
  $('cs-save-btn').onclick = saveChooseSubjects;
  openModal('choose-subjects-modal');
}

async function saveChooseSubjects() {
  const checked = [...$all('#cs-list input:checked')].map(i => i.value);
  const counts  = Progression.selectionCounts() || { minTotal: 8 };
  const fb      = $('cs-feedback');
  const fail = msg => { fb.hidden = false; fb.textContent = msg; fb.className = 'form-feedback mt8 text-danger'; };
  if (!checked.length)  { fail('Select at least one subject.'); return; }
  if (checked.length < counts.minTotal) { fail(`Pick at least ${counts.minTotal} subjects (${checked.length} chosen so far).`); return; }
  if (!_csState) return;

  if (_csState.year >= 11) {
    await Progression.chooseSubjects(_csState.sid, checked, { status: 'pending', userId: currentUser.id });
    await Progression.requestApproval({
      actionType: 'subject_change',
      entityType: 'subject_selection',
      entityId: _csState.sid,
      payload: { subjectIds: checked.map(String), previous: (_csState.previous || []).map(String) },
      summary: `${Data.student(_csState.sid)?.name.trim().split(' ').slice(0, 2).join(' ') || 'Student'} requested a subject change (${checked.length} subjects).`
    }, currentUser.id);
    closeModal('choose-subjects-modal');
    toast('Change request sent to your class teacher. ✓');
  } else {
    await Progression.chooseSubjects(_csState.sid, checked, { status: 'effective', userId: currentUser.id });
    closeModal('choose-subjects-modal');
    toast('Your subjects are saved. ✓');
  }
  _csState = null;
  renderStudentSubjectsPanel();
}

// ══════════════════════════════════════════════════════════════
//  PARENT
// ══════════════════════════════════════════════════════════════
function renderParentDashboard() {
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
        <span><small>Term avg</small><b>${released ? avg + '%' : '—'}</b></span>
        <span><small>CA / Exam</small><b>${released ? (check.english >= 0 ? `${Academic.termScores(s.id, term).filter(r => r.ca !== null).length} subjects` : '—') : '—'}</b></span>
        <span><small>Attendance</small><b>${att}</b></span>
        <span class="status ${released ? statusClass(status) : 'review'}">${released ? status : 'Locked'}</span>
        ${released ? `<button class="text-button" data-child="${s.id}">CA &amp; exam scores ↗</button>` : '<small class="muted-cell">Awaiting release</small>'}
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
  recordParentLoginIfNew();
  renderParentGuardian();
}

// CA and exam split — what a parent needs to see
function showChildResults(studentId) {
  const s     = Data.student(studentId);
  if (!s) return;
  const term  = currentTerm();
  const cl    = Data.cls(s.classId);
  const check = Academic.promotionCheck(studentId, term);

  if (!Data.published(term)) {
    $('par-results-meta').textContent = `${s.name} · ${cl?.name || '—'} · ${termNameOf(term)} · awaiting release`;
    $('par-results-table').innerHTML  = `<tr><td colspan="7" class="muted-cell">${resultsLockedNote(term)}</td></tr>`;
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

  // Students and parents only see a term's report once the school releases it.
  // Staff (a class teacher reviewing their own class) always sees the report.
  const isConsumer = currentUser && (currentUser.role === 'Student' || currentUser.role === 'Parent');
  if (isConsumer && !Data.published(term)) {
    $('drawer-eyebrow').textContent = `Term ${term} report · ${Data.session().name}`;
    $('drawer-name').textContent    = s.name;
    $('drawer-meta').textContent    = `${cl?.name || '—'} · ${esc(s.admissionNo || '—')}`;
    $('drawer-score').textContent   = '—';
    $('drawer-status').textContent  = 'Locked';
    $('drawer-status').className    = 'promotion-badge review';
    $('drawer-subjects').innerHTML  = `<div class="subject-row"><div><span>${resultsLockedNote(term)}</span></div></div>`;
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
  // Promotion status (Promoted / Repeat / Review) is only shown to students
  // and parents after ALL three terms have been published — it reflects the
  // final session outcome, not a single-term snapshot.
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
  bindResetPasswordModal();
  bindProgressionModals();
  bindPassportActions();

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

function bindPassportActions() {
  // window.print() in a normal browser shows the system print dialog,
  // where the user can pick "Save as PDF". We scope the print CSS to a
  // .printing body class so only the passport sheet is printed.
  // Use afterprint to remove the class so the dialog has time to render.
  const doPrint = () => {
    document.body.classList.add('printing');
    const done = () => {
      document.body.classList.remove('printing');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    // Double rAF ensures the class is applied before print() is called
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };
  $('passport-print-btn')?.addEventListener('click', doPrint);
  $('passport-download-btn')?.addEventListener('click', doPrint);
}

// ════════════════════════════════════════════════════════════════
//  LEARNING MANAGEMENT — teacher pages
// ════════════════════════════════════════════════════════════════

// The (subject, class) pairs a teacher is actually allocated to teach.
function teacherCombos(user) {
  const allocs = (Data.teacherSubjects() || []).filter(ts => String(ts.teacherId) === String(user?.id));
  return allocs
    .map(ts => ({ subject: Data.subject(ts.subjectId), class: Data.cls(ts.classId) }))
    .filter(c => c.subject && c.class);
}
function comboOptionHTML(combo, value) {
  return `<option value="${value}">${esc(combo.subject.name)} · ${esc(combo.class.className)}</option>`;
}
function comboSplit(value) {
  const [subjectId, classId] = String(value || '').split('|');
  return { subjectId, classId };
}
function fillComboSelect(sel, combos) {
  if (!sel) return;
  sel.innerHTML = combos.length
    ? combos.map(co => comboOptionHTML(co, `${co.subject.id}|${co.class.id}`)).join('')
    : '<option value="">No subject / class allocated</option>';
}

function renderTeacherLessons() {
  const user  = currentUser;
  const combos = teacherCombos(user);
  fillComboSelect($('ls-pick'), combos);
  const msg = $('ls-msg'); if (msg) msg.hidden = true;
  $('ls-count').textContent = combos.filter(co => Data.lessonsFor(co.class.id, co.subject.id).length).length;

  $('ls-submit').onclick = async () => {
    const title   = $('ls-title').value.trim();
    const content = $('ls-content').value.trim();
    if (!title || !content) {
      message(msg, 'Title and lesson content are required.', 'error'); return;
    }
    const { subjectId, classId } = comboSplit($('ls-pick')?.value);
    if (!subjectId || !classId) {
      message(msg, 'Pick the subject and class first.', 'error'); return;
    }
    await Data.addLesson({ subjectId, classId, title, content }, user.id);
    $('ls-title').value = ''; $('ls-content').value = '';
    message(msg, 'Lesson published.', 'success');
    renderTeacherLessons();
  };
  renderLessonsTable();
}

function renderLessonsTable() {
  const mine = (Data.lmsLessons() || []).filter(l => l.teacherId === currentUser.id);
  $('ls-count').textContent = mine.length;
  const list = $('ls-list');
  list.innerHTML = mine.length
    ? `<div class="table-wrap"><table><thead><tr><th>Subject</th><th>Class</th><th>Title</th><th class="muted-cell">Posted</th><th></th></tr></thead>` +
      `<tbody>${mine.map(l => `
        <tr>
          <td>${esc(Data.subject(l.subjectId)?.name || '—')}</td>
          <td>${esc(Data.classNameOf(l.classId))}</td>
          <td>${esc(l.title)}</td>
          <td class="muted-cell">${formatDate(l.createdAt)}</td>
          <td><div class="table-actions">
            <button class="text-button" data-ls-view="${l.id}">View</button>
            <button class="text-button" data-ls-del="${l.id}">Delete</button>
          </div></td>
        </tr>`).join('')}</tbody></table></div>`
    : '<p class="muted-cell">No lessons published yet.</p>';

  $all('[data-ls-view]').forEach(b => b.onclick = () => {
    const lesson = (Data.lmsLessons() || []).find(x => String(x.id) === String(b.dataset.lsView));
    const box = $('ls-detail'); if (!lesson || !box) return;
    box.innerHTML = `<div class="panel">
      <div class="panel-heading"><div>
        <p class="eyebrow">${esc(Data.subject(lesson.subjectId)?.name || '')} · ${esc(Data.classNameOf(lesson.classId))} · ${esc(Data.user(lesson.teacherId)?.name || '')} · ${formatDate(lesson.createdAt)}</p>
        <h2>${esc(lesson.title)}</h2>
      </div></div>
      <div class="ls-body">${esc(lesson.content)}</div>
    </div>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $all('[data-ls-del]').forEach(b => b.onclick = async () => {
    await Data.deleteLesson(b.dataset.lsDel, currentUser.id);
    toast('Lesson deleted.');
    renderTeacherLessons();
  });
}

function renderTeacherQuizzes() {
  const user = currentUser;
  fillComboSelect($('qz-pick'), teacherCombos(user));
  const msg = $('qz-msg'); if (msg) msg.hidden = true;

  $('qz-create').onclick = async () => {
    const title = $('qz-title').value.trim();
    if (!title) { message(msg, 'A title is required.', 'error'); return; }
    const { subjectId, classId } = comboSplit($('qz-pick')?.value);
    if (!subjectId || !classId) {
      message(msg, 'Pick the subject and class first.', 'error'); return;
    }
    await Data.createQuiz({ subjectId, classId, title, description: $('qz-desc').value.trim() }, user.id);
    $('qz-title').value = ''; $('qz-desc').value = '';
    message(msg, 'Quiz created. Add questions below.', 'success');
    renderTeacherQuizzes();
  };
  renderQuizList();
}

function renderQuizList() {
  const mine = (Data.lmsQuizzes() || []).filter(q => q.teacherId === currentUser.id);
  if ($('qz-count')) $('qz-count').textContent = mine.length;
  const list = $('qz-list');
  list.innerHTML = mine.length
    ? `<div class="table-wrap"><table><thead><tr><th>Subject</th><th>Class</th><th>Title</th><th class="muted-cell">Qns</th><th>Status</th><th></th></tr></thead>` +
      `<tbody>${mine.map(q => `
        <tr>
          <td>${esc(Data.subject(q.subjectId)?.name || '—')}</td>
          <td>${esc(Data.classNameOf(q.classId))}</td>
          <td>${esc(q.title)}${q.description ? `<div class="muted-cell" style="font-size:10px;margin-top:2px">${esc(q.description)}</div>` : ''}</td>
          <td class="muted-cell">${Data.questionsForQuiz(q.id).length}</td>
          <td><span class="status ${q.isPublished ? 'promoted' : 'review'}">${q.isPublished ? 'Published' : 'Draft'}</span></td>
          <td><div class="table-actions">
            <button class="text-button" data-q-ed="${q.id}">Questions</button>
            <button class="text-button" data-q-pub="${q.id}">${q.isPublished ? 'Unpublish' : 'Publish'}</button>
            <button class="text-button" data-q-res="${q.id}">Results</button>
            <button class="text-button" data-q-del="${q.id}">Delete</button>
          </div></td>
        </tr>`).join('')}</tbody></table></div>`
    : '<p class="muted-cell">No quizzes yet — create one above.</p>';

  $all('[data-q-pub]').forEach(b => b.onclick = async () => {
    const quiz = (Data.lmsQuizzes() || []).find(x => String(x.id) === String(b.dataset.qPub)); if (!quiz) return;
    await Data.setQuizPublished(quiz.id, !quiz.isPublished);
    renderQuizList();
  });
  $all('[data-q-del]').forEach(b => b.onclick = async () => {
    const quiz = (Data.lmsQuizzes() || []).find(x => String(x.id) === String(b.dataset.qDel)); if (!quiz) return;
    await Data.deleteQuiz(quiz.id, currentUser.id);
    toast('Quiz deleted.');
    renderTeacherQuizzes();
  });
  $all('[data-q-ed]').forEach(b => b.onclick = () => {
    const quiz = (Data.lmsQuizzes() || []).find(x => String(x.id) === String(b.dataset.qEd)); if (quiz) openQuizEditor(quiz);
  });
  $all('[data-q-res]').forEach(b => b.onclick = () => {
    const quiz = (Data.lmsQuizzes() || []).find(x => String(x.id) === String(b.dataset.qRes)); if (quiz) openQuizResults(quiz);
  });
}

function quizQuestionEditorHTML(q = {}) {
  const type = q.questionType === 'tf' ? 'tf' : 'mc';
  const opt  = q.options || {};
  return `<div class="quiz-question" data-qeditor>
    <div class="form-row tight">
      <div class="form-group" style="flex:2"><label>Question</label>
        <input class="q-text" value="${esc(q.questionText || '')}"></div>
      <div class="form-group"><label>Type</label>
        <select class="q-type">
          <option value="mc" ${type === 'mc' ? 'selected' : ''}>Multiple choice</option>
          <option value="tf" ${type === 'tf' ? 'selected' : ''}>True / False</option>
        </select></div>
      <div class="form-group"><label>Points</label>
        <input class="q-points" type="number" min="1" value="${Number(q.points) || 1}"></div>
      <div class="form-group"><button class="text-button" data-remove-q style="margin-top:22px">Remove</button></div>
    </div>
    <div class="form-row tight">
      <div class="form-group"><label>A</label><input class="q-opt" data-opt="A" value="${esc(type === 'tf' ? (opt.A || 'True') : (opt.A || ''))}"></div>
      <div class="form-group"><label>B</label><input class="q-opt" data-opt="B" value="${esc(type === 'tf' ? (opt.B || 'False') : (opt.B || ''))}"></div>
      <div class="form-group"><label>C</label><input class="q-opt" data-opt="C" value="${esc(type === 'tf' ? (opt.C || '') : (opt.C || ''))}"></div>
      <div class="form-group"><label>D</label><input class="q-opt" data-opt="D" value="${esc(type === 'tf' ? (opt.D || '') : (opt.D || ''))}"></div>
    </div>
    <div class="form-group"><label>Correct answer</label>
      <input class="q-correct" value="${esc(q.correctAnswer || '')}" placeholder="e.g. B  —  or  True / False" style="max-width:300px">
    </div>
  </div>`;
}

function bindQuizEditorEvents() {
  $all('[data-remove-q]').forEach(b => b.onclick = () => {
    const ed = b.closest('[data-qeditor]'); if (ed) ed.remove();
  });
  $all('.q-type').forEach(sel => sel.onchange = () => {
    const ed = sel.closest('[data-qeditor]'); if (!ed) return;
    const tf = sel.value === 'tf';
    ed.querySelector('[data-opt="A"]').value = tf ? 'True' : '';
    ed.querySelector('[data-opt="B"]').value = tf ? 'False' : '';
    ed.querySelector('[data-opt="C"]').value = '';
    ed.querySelector('[data-opt="D"]').value = '';
  });
}

function openQuizEditor(quiz) {
  const box = $('qz-detail'); if (!box) return;
  const existing = Data.questionsForQuiz(quiz.id);
  box.innerHTML = `<div class="panel">
    <div class="panel-heading"><div>
      <p class="eyebrow">${esc(Data.subject(quiz.subjectId)?.name || '')} · ${esc(Data.classNameOf(quiz.classId))}</p>
      <h2>Questions — ${esc(quiz.title)}</h2>
    </div><span class="read-only-badge">${existing.length} saved</span></div>
    <div id="q-editors" class="mt8">
      ${existing.length ? existing.map(quizQuestionEditorHTML).join('') : quizQuestionEditorHTML()}
    </div>
    <div class="form-row tight mt16">
      <button class="outline-button" id="q-add-more" style="width:auto;margin:0">+ Add another question</button>
      <button class="btn-primary" id="q-save" style="width:auto;margin:0">Save questions</button>
    </div>
    <div id="q-msg" class="form-feedback mt8" hidden></div>
  </div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  bindQuizEditorEvents();
  $('q-add-more').onclick = () => {
    $('q-editors').insertAdjacentHTML('beforeend', quizQuestionEditorHTML());
    bindQuizEditorEvents();
  };
  $('q-save').onclick = async () => {
    const questions = [...$all('[data-qeditor]')].map(ed => ({
      questionText:  ed.querySelector('.q-text').value.trim(),
      questionType:  ed.querySelector('.q-type').value,
      options: {
        A: ed.querySelector('[data-opt="A"]').value.trim(),
        B: ed.querySelector('[data-opt="B"]').value.trim(),
        C: ed.querySelector('[data-opt="C"]').value.trim(),
        D: ed.querySelector('[data-opt="D"]').value.trim()
      },
      correctAnswer: ed.querySelector('.q-correct').value.trim(),
      points:        Number(ed.querySelector('.q-points').value) || 1
    })).filter(qd => qd.questionText);
    const msg = $('q-msg');
    if (!questions.length) { message(msg, 'Add at least one question with text.', 'error'); return; }
    await Data.saveQuizQuestions(quiz.id, questions);
    message(msg, 'Questions saved.', 'success');
    renderQuizList();
    openQuizEditor(quiz);
  };
}

function openQuizResults(quiz) {
  const box = $('qz-detail'); if (!box) return;
  const students = (Data.studentsByClass(quiz.classId) || []).filter(s => s.status === 'active');
  const rows = students.map(s => {
    const attempt = Data.attemptFor(quiz.id, s.id);
    return `<tr>
      <td><div class="student"><span class="student-avatar ${toneClass(s.tone)}">${s.initials}</span>${esc(s.name)}</div></td>
      <td class="muted-cell">${esc(s.admissionNo || s.id)}</td>
      <td>${attempt ? `<strong>${attempt.score} / ${attempt.total}</strong>` : '<span class="muted-cell">Not attempted</span>'}</td>
      <td class="muted-cell">${attempt?.submittedAt ? formatDate(attempt.submittedAt) : '—'}</td>
    </tr>`;
  }).join('');
  box.innerHTML = `<div class="panel">
    <div class="panel-heading"><div>
      <p class="eyebrow">${esc(Data.subject(quiz.subjectId)?.name || '')} · ${esc(Data.classNameOf(quiz.classId))}</p>
      <h2>Results — ${esc(quiz.title)}</h2>
    </div></div>
    <div class="table-wrap mt16"><table><thead><tr><th>Student</th><th>Admission No.</th><th>Score</th><th>Submitted</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="muted-cell">No active students in this class.</td></tr>'}</tbody></table></div>
  </div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderTeacherDiscussions() {
  const user = currentUser;
  fillComboSelect($('td-pick'), teacherCombos(user));
  const msg = $('td-msg'); if (msg) msg.hidden = true;

  $('td-open').onclick = async () => {
    const title = $('td-title').value.trim();
    if (!title) { message(msg, 'A topic is required.', 'error'); return; }
    const { subjectId, classId } = comboSplit($('td-pick')?.value);
    if (!subjectId || !classId) {
      message(msg, 'Pick the subject and class first.', 'error'); return;
    }
    await Data.openDiscussion({ subjectId, classId, title, body: $('td-body').value.trim() }, user.id);
    $('td-title').value = ''; $('td-body').value = '';
    message(msg, 'Discussion opened.', 'success');
    renderTeacherDiscussions();
  };
  renderDiscussionsTable();
}

function renderDiscussionsTable() {
  const mine = (Data.lmsDiscussions() || []).filter(d => String(d.teacherId) === String(currentUser.id));
  const list = $('td-list');
  list.innerHTML = mine.length
    ? `<div class="table-wrap"><table><thead><tr><th>Subject</th><th>Class</th><th>Topic</th><th class="muted-cell">Replies</th><th></th></tr></thead>` +
      `<tbody>${mine.map(d => `
        <tr>
          <td>${esc(Data.subject(d.subjectId)?.name || '—')}</td>
          <td>${esc(Data.classNameOf(d.classId))}</td>
          <td>${esc(d.title)}</td>
          <td class="muted-cell">${Data.postsFor(d.id).length}</td>
          <td><div class="table-actions">
            <button class="text-button" data-tt-open="${d.id}">View</button>
            <button class="text-button" data-tt-del="${d.id}">Delete</button>
          </div></td>
        </tr>`).join('')}</tbody></table></div>`
    : '<p class="muted-cell">No discussions opened yet.</p>';

  $all('[data-tt-open]').forEach(b => b.onclick = () => renderThread(b.dataset.ttOpen, 'td-thread'));
  $all('[data-tt-del]').forEach(b => b.onclick = async () => {
    await Data.deleteDiscussion(b.dataset.ttDel, currentUser.id);
    toast('Discussion deleted.');
    renderTeacherDiscussions();
  });
}

// Shared thread viewer (teacher + student).
function renderThread(discussionId, containerId) {
  const box = $(containerId); if (!box) return;
  const discussion = (Data.lmsDiscussions() || []).find(x => String(x.id) === String(discussionId));
  if (!discussion) { box.innerHTML = ''; return; }
  const posts = Data.postsFor(discussion.id);
  const opening = `<div class="thread-card">
    <p class="muted-cell">${esc(Data.subject(discussion.subjectId)?.name || '')} · ${esc(Data.classNameOf(discussion.classId))} · opened by ${esc(Data.user(discussion.teacherId)?.name || '—')} · ${formatDate(discussion.createdAt)}</p>
    <strong>${esc(discussion.title)}</strong>
    ${discussion.body ? `<p style="white-space:pre-wrap;margin:8px 0 0">${esc(discussion.body)}</p>` : ''}
  </div>`;
  const replies = posts.map(post => {
    const author = Data.user(post.userId);
    const role = author && isTeacher(author) ? 'Teacher' : isAdmin(author) ? 'Administrator' : 'Student';
    return `<div class="thread-card">
      <p class="muted-cell" style="margin:0 0 4px"><strong>${esc(author?.name || '—')}</strong> · ${role} · ${formatDate(post.createdAt)}</p>
      <p style="white-space:pre-wrap;margin:0">${esc(post.body)}</p>
    </div>`;
  }).join('');
  box.innerHTML = `<div class="panel">
    <div class="panel-heading"><div><p class="eyebrow">Discussion</p><h2>${esc(discussion.title)}</h2></div></div>
    ${opening}
    ${replies || '<p class="muted-cell">No replies yet — start the conversation.</p>'}
    <div class="form-group mt16"><label for="reply-text">Your reply</label>
      <textarea id="reply-text" rows="2" placeholder="Share your thoughts…"></textarea></div>
    <button class="btn-primary" id="reply-post" style="width:auto;margin:0">Reply</button>
    <div id="reply-msg" class="form-feedback mt8" hidden></div>
  </div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  $('reply-post').onclick = async () => {
    const body = $('reply-text').value.trim();
    if (!body) return;
    await Data.addDiscussionPost(discussion.id, currentUser.id, body);
    renderThread(discussionId, containerId);
  };
}

// ── student pages ───────────────────────────────────────────────

function renderStudentPathway() {
  const s = Data.student(currentUser.studentId);
  const box = $('stu-path-body');
  if (!$('stu-path-body')) return;
  if (!s) {
    box.innerHTML = '<div class="panel"><p class="muted-cell">This login is not linked to a student record.</p></div>';
    return;
  }
  const cl   = Data.cls(s.classId);
  const year = cl?.year ?? null;
  if ($('stu-path-heading')) $('stu-path-heading').textContent = cl ? `Choose my path — ${esc(cl.className)}` : 'Choose my path';
  const eligible = !!(cl && (cl.selectionMode === 'pool' || Progression.isCheckpoint(year)));

  if (!cl) {
    box.innerHTML = '<div class="panel"><p class="muted-cell">No class record yet.</p></div>';
    return;
  }

  // Placed into a stream class — path already decided.
  if (cl.stream) {
    box.innerHTML = `<div class="panel">
      <div class="panel-heading"><div><p class="eyebrow">Path decided</p><h2>${esc(cl.className)}</h2></div>
        <span class="status promoted">Placed</span></div>
      <p class="role-muted">Your path is set for this session — you are on the <strong>${esc(cl.stream)}</strong> stream.</p>
    </div>`;
    return;
  }

  if (!eligible) {
    box.innerHTML = `<div class="panel">
      <p class="role-muted">At your year the school sets your class for you — the choice opens at the Grade 9 checkpoint and for students in a placement pool.</p>
      <p class="muted-cell">Current class: ${esc(cl.className)}.</p>
    </div>`;
    return;
  }

  const targetYear = cl.year === 10 ? 10 : cl.year + 1;
  const options = (Data.classes() || []).filter(c => c.year == targetYear && c.level === 'SS' && ['Science', 'Commercial', 'Arts'].includes(c.stream));
  const hints = {
    Science:    'Mathematics, Physics, Chemistry, Biology',
    Commercial: 'Accounting, Business Studies, Commerce, Economics',
    Arts:       'Literature, Fine & Applied Arts, Music, Theatre'
  };
  const req  = Progression.pathRequest(s.id);
  const chosen = req?.stream || '';

  const statusHTML = req ? `<div class="path-status ${req.status}">
      ${req.status === 'approved'
        ? `<strong>Your path is decided.</strong> The school placed you on the ${esc(req.stream || '—')} stream.`
        : `<strong>Preference recorded: ${esc(req.stream || '—')}.</strong> The school will confirm it — you can change it any time before they decide.`}
      ${req.note ? `<div class="muted-cell mt8">Your note to the school: ${esc(req.note)}</div>` : ''}
    </div>` : '';

  box.innerHTML = `<div class="panel">
    <div class="panel-heading"><div>
      <p class="eyebrow">Grade ${targetYear} · SSS</p>
      <h2>Pick the stream that fits you</h2>
    </div></div>
    <p class="role-muted">For ${esc(cl.className)} the school decides your final path with your results and your wishes in mind. Pick the stream you want — the administration will confirm it.</p>
    ${statusHTML}
    <div class="path-options mt16">
      ${options.length ? options.map(o => `
        <label class="path-card${o.stream === chosen ? ' selected' : ''}" data-stream="${o.stream}">
          <input type="radio" name="stu-path" value="${o.stream}" ${o.stream === chosen ? 'checked' : ''}>
          <strong>${esc(o.className)}</strong>
          <span class="muted-cell">${esc(hints[o.stream] || '')}</span>
        </label>`).join('')
        : '<p class="muted-cell">The stream classes for Grade ' + targetYear + ' have not been set up yet.</p>'}
    </div>
    <div class="form-group mt16"><label for="stu-path-note">Anything you want the school to know <small class="muted-cell" style="font-weight:400">(optional)</small></label>
      <textarea id="stu-path-note" rows="3" maxlength="500" placeholder="e.g. I enjoy sciences and would like to study medicine…">${esc((req && req.note) || '')}</textarea></div>
    <button class="btn-primary" id="stu-path-save" style="width:auto;margin:0">Save my choice</button>
    <div id="stu-path-msg" class="form-feedback mt8" hidden></div>
  </div>`;

  $all('.path-card').forEach(card => card.onclick = () => {
    $all('.path-card').forEach(x => x.classList.toggle('selected', x === card));
    const radio = card.querySelector('input[type=radio]'); if (radio) radio.checked = true;
  });
  $('stu-path-save').onclick = async () => {
    const picked = $q('input[name="stu-path"]:checked');
    const msg = $('stu-path-msg');
    if (!picked) { message(msg, 'Choose a path first.', 'error'); return; }
    await Progression.requestPathway(s.id, picked.value, $('stu-path-note').value.trim(), currentUser.id);
    message(msg, 'Your choice is saved — the school will confirm it.', 'success');
    renderStudentPathway();
  };
}

function renderStudentLessons() {
  const s = Data.student(currentUser.studentId);
  const list = $('stu-less-list');
  if (!s || !list) return;
  const lessons = Data.lessonsFor(s.classId) || [];
  list.innerHTML = lessons.length
    ? `<div class="table-wrap"><table><thead><tr><th>Subject</th><th>Title</th><th class="muted-cell">Teacher</th><th class="muted-cell">Posted</th><th></th></tr></thead>` +
      `<tbody>${lessons.map(l => `
        <tr>
          <td>${esc(Data.subject(l.subjectId)?.name || '—')}</td>
          <td>${esc(l.title)}</td>
          <td class="muted-cell">${esc(Data.user(l.teacherId)?.name || '—')}</td>
          <td class="muted-cell">${formatDate(l.createdAt)}</td>
          <td><button class="text-button" data-stu-read="${l.id}">Read</button></td>
        </tr>`).join('')}</tbody></table></div>`
    : '<p class="muted-cell">No lessons have been published for your class yet.</p>';

  $all('[data-stu-read]').forEach(b => b.onclick = () => {
    const lesson = (Data.lmsLessons() || []).find(x => String(x.id) === String(b.dataset.stuRead));
    const box = $('stu-less-detail'); if (!lesson || !box) return;
    box.innerHTML = `<div class="panel">
      <div class="panel-heading"><div>
        <p class="eyebrow">${esc(Data.subject(lesson.subjectId)?.name || '')} · ${esc(Data.user(lesson.teacherId)?.name || '')} · ${formatDate(lesson.createdAt)}</p>
        <h2>${esc(lesson.title)}</h2>
      </div></div>
      <div class="ls-body">${esc(lesson.content)}</div>
    </div>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function renderStudentQuizzes() {
  const s = Data.student(currentUser.studentId);
  const list = $('sq-list');
  if (!s || !list) return;
  const quizzes = (Data.quizzesFor(s.classId) || []).filter(q => q.isPublished);
  list.innerHTML = quizzes.length
    ? `<div class="table-wrap"><table><thead><tr><th>Subject</th><th>Title</th><th class="muted-cell">Qns</th><th>Your score</th><th></th></tr></thead>` +
      `<tbody>${quizzes.map(q => {
        const attempt = Data.attemptFor(q.id, s.id);
        return `<tr>
          <td>${esc(Data.subject(q.subjectId)?.name || '—')}</td>
          <td>${esc(q.title)}${q.description ? `<div class="muted-cell" style="font-size:10px;margin-top:2px">${esc(q.description)}</div>` : ''}</td>
          <td class="muted-cell">${Data.questionsForQuiz(q.id).length}</td>
          <td>${attempt ? `<span class="status promoted">${attempt.score} / ${attempt.total}</span>` : '<span class="muted-cell">Not attempted</span>'}</td>
          <td>${attempt
            ? `<button class="text-button" data-sq-result="${q.id}">View result</button>`
            : `<button class="btn-primary small" data-sq-take="${q.id}">Take quiz</button>`}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`
    : '<p class="muted-cell">No quizzes are available for your class right now.</p>';

  $all('[data-sq-take]').forEach(b => b.onclick = () => openQuizTaker(b.dataset.sqTake));
  $all('[data-sq-result]').forEach(b => b.onclick = () => openStudentQuizResult(b.dataset.sqResult));
}

function openQuizTaker(quizId) {
  const box = $('sq-body'); if (!box) return;
  const quiz = (Data.lmsQuizzes() || []).find(x => String(x.id) === String(quizId)); if (!quiz) return;
  const questions = Data.questionsForQuiz(quizId);
  box.innerHTML = `<div class="panel">
    <div class="panel-heading"><div>
      <p class="eyebrow">${esc(Data.subject(quiz.subjectId)?.name || '')} · ${esc(Data.classNameOf(quiz.classId))}</p>
      <h2>${esc(quiz.title)}</h2>
    </div></div>
    ${quiz.description ? `<p class="role-muted">${esc(quiz.description)}</p>` : ''}
    <form id="quiz-form" class="mt8">
      ${questions.map((qq, i) => `
        <fieldset class="quiz-fieldset">
          <legend>Question ${i + 1}${qq.points > 1 ? ` · ${qq.points} pts` : ''}</legend>
          <p class="quiz-question-text">${esc(qq.questionText)}</p>
          ${qq.questionType === 'tf'
            ? `<div class="form-row tight">
                <label class="dept-check"><input type="radio" name="q${qq.id}" value="True" required> True</label>
                <label class="dept-check"><input type="radio" name="q${qq.id}" value="False" required> False</label>
              </div>`
            : [['A', qq.options?.A], ['B', qq.options?.B], ['C', qq.options?.C], ['D', qq.options?.D]]
                .filter(([, v]) => v != null && v !== '')
                .map(([label, v]) => `<label class="dept-check"><input type="radio" name="q${qq.id}" value="${esc(v)}" required> <strong>${label}.</strong> ${esc(v)}</label>`).join('')}
        </fieldset>`).join('')}
      <button class="btn-primary mt16" type="submit" style="width:auto">Submit quiz</button>
      <div id="quiz-msg" class="form-feedback mt8" hidden></div>
    </form>
  </div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  $('quiz-form').onsubmit = async e => {
    e.preventDefault();
    const msg = $('quiz-msg');
    const answers = {};
    questions.forEach(qq => {
      const picked = $q(`input[name="q${qq.id}"]:checked`);
      if (picked) answers[qq.id] = picked.value;
    });
    const result = await Data.submitQuizAttempt(quiz.id, currentUser.studentId, answers);
    if (!result) { message(msg, 'This quiz has no questions yet.', 'error'); return; }
    message(msg, `You scored ${result.score} / ${result.total} — well done.`, 'success');
    openStudentQuizResult(quiz.id);
  };
}

function openStudentQuizResult(quizId) {
  const box = $('sq-body'); if (!box) return;
  const quiz    = (Data.lmsQuizzes() || []).find(x => String(x.id) === String(quizId));
  const attempt = Data.attemptFor(quizId, currentUser.studentId);
  if (!attempt) { box.innerHTML = '<div class="panel"><p class="muted-cell">No attempt recorded.</p></div>'; return; }
  const detail = (Data.questionsForQuiz(quizId) || []).map(qq => {
    const got   = String(attempt.answers?.[qq.id] ?? '').trim();
    const right = got.toLowerCase() === String(qq.correctAnswer).toLowerCase();
    return `<tr>
      <td>${esc(qq.questionText)}</td>
      <td class="muted-cell">${esc(got) || '—'}</td>
      <td class="muted-cell">${esc(qq.correctAnswer)}</td>
      <td><span class="status ${right ? 'promoted' : 'repeat'}">${right ? 'Correct' : 'Incorrect'}</span></td>
    </tr>`;
  }).join('');
  box.innerHTML = `<div class="panel">
    <div class="panel-heading"><div>
      <p class="eyebrow">${quiz ? esc(quiz.title) : ''}</p>
      <h2>Your result</h2>
    </div><span class="check-badge">${attempt.score} / ${attempt.total}</span></div>
    <div class="table-wrap mt16"><table><thead><tr><th>Question</th><th>Your answer</th><th>Correct</th><th></th></tr></thead>
      <tbody>${detail || '<tr><td colspan="4" class="muted-cell">No questions saved for this quiz.</td></tr>'}</tbody></table></div>
  </div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderStudentDiscussions() {
  const s = Data.student(currentUser.studentId);
  const list = $('sd-list');
  if (!s || !list) return;
  const discussions = Data.discussionsFor(s.classId) || [];
  list.innerHTML = discussions.length
    ? `<div class="table-wrap"><table><thead><tr><th>Subject</th><th>Topic</th><th class="muted-cell">Teacher</th><th class="muted-cell">Replies</th><th></th></tr></thead>` +
      `<tbody>${discussions.map(d => `
        <tr>
          <td>${esc(Data.subject(d.subjectId)?.name || '—')}</td>
          <td>${esc(d.title)}</td>
          <td class="muted-cell">${esc(Data.user(d.teacherId)?.name || '—')}</td>
          <td class="muted-cell">${Data.postsFor(d.id).length}</td>
          <td><button class="text-button" data-sd-open="${d.id}">Open</button></td>
        </tr>`).join('')}</tbody></table></div>`
    : '<p class="muted-cell">No discussions are open for your class yet.</p>';
  $all('[data-sd-open]').forEach(b => b.onclick = () => renderThread(b.dataset.sdOpen, 'sd-thread'));
}

function renderStudentAttendance() {
  const s = Data.student(currentUser.studentId);
  const sel = $('stu-att-term');
  if (!s || !sel) return;
  sel.innerHTML = Data.session().terms.map(t =>
    `<option value="${t.term}" ${t.term === currentTerm() ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  const draw = () => {
    $('stu-att-meta').textContent = `${s.name} · ${esc(Data.cls(s.classId)?.className || '')} · ${termNameOf(+sel.value)}`;
    $('stu-att-grid').innerHTML   = attendanceGridHTML(s.id, +sel.value);
  };
  draw();
  sel.onchange = draw;
}

function dayChipsHTML(studentId, term, wk) {
  const arr = Data.dailyAttendance(term)[wk]?.[String(studentId)] || [];
  if (!arr.some(Boolean)) return '';
  return `<span class="att-days">${[0, 1, 2, 3, 4].map(i => {
    const st = arr[i];
    return `<b class="att-day ${st || 'off'}" title="${ATT_DAYS[i]}: ${st || 'unmarked'}">${st ? st[0].toUpperCase() : '&middot;'}</b>`;
  }).join('')}</span>`;
}

function attendanceGridHTML(studentId, term) {
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

function assignmentRowsHTML(classId) {
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

function renderStudentAssignments() {
  const s = Data.student(currentUser.studentId);
  const meta = $('stu-assign-meta');
  const list = $('stu-assign-list');
  if (!s || !meta || !list) return;
  meta.textContent = `${s.name.split(' ')[0]}, here are the assignments set for ${esc(Data.cls(s.classId)?.className || 'your class')}.`;
  list.innerHTML = assignmentRowsHTML(s.classId);
}

function renderStudentTimetable() {
  const s = Data.student(currentUser.studentId);
  const meta = $('stu-tt-meta');
  if (!s || !meta) return;
  meta.textContent = `${s.name} · ${esc(Data.cls(s.classId)?.className || '')}`;
  renderTimetableFor(s.classId, 'stu-tt-grid');
}

function renderTimetableFor(classId, containerId) {
  const box = $(containerId); if (!box) return;
  const all     = Timetable.generateAll();
  const schedule = all.schedules.find(x => String(x.classId) === String(classId));
  if (!schedule) {
    box.innerHTML = `<div class="panel"><p class="muted-cell">No weekly timetable generated for ${esc(Data.classNameOf(classId))} yet.</p></div>`;
    return;
  }
  box.innerHTML = `<div class="panel">
    <div class="panel-heading"><div>
      <p class="eyebrow">Term ${currentTerm()} · ${esc(Data.session().name)}</p>
      <h2>${esc(schedule.name)} · Weekly schedule</h2>
    </div><span class="read-only-badge">View only</span></div>
    ${timetableTable(schedule)}
  </div>`;
}

// ── parent pages ────────────────────────────────────────────────

function parentChildSelect(selId, onPick) {
  const sel = $(selId); if (!sel) return;
  const children = (currentUser.childIds || []).map(id => Data.student(String(id))).filter(Boolean);
  sel.innerHTML = children.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if (!children.length) return;
  onPick(children[0].id);
  sel.onchange = () => onPick(sel.value);
}

function renderParentAttendance() {
  parentChildSelect('par-att-child', childId => {
    const s = Data.student(childId); if (!s) return;
    $('par-att-meta').textContent = `${s.name} · ${esc(Data.cls(s.classId)?.className || '')} · ${termNameOf(currentTerm())}`;
    $('par-att-grid').innerHTML   = attendanceGridHTML(childId, currentTerm());
  });
}

function renderParentAssignments() {
  parentChildSelect('par-assign-child', childId => {
    const s = Data.student(childId); if (!s) return;
    $('par-assign-meta').textContent = `${s.name} · ${esc(Data.cls(s.classId)?.className || '')}`;
    $('par-assign-list').innerHTML   = assignmentRowsHTML(s.classId);
  });
}

function renderParentTimetable() {
  parentChildSelect('par-tt-child', childId => {
    const s = Data.student(childId); if (!s) return;
    $('par-tt-meta').textContent = `${s.name} · ${esc(Data.cls(s.classId)?.className || '')} · Term ${currentTerm()}`;
    renderTimetableFor(s.classId, 'par-tt-grid');
  });
}

// Small form-feedback helper: sets text, unhides and resets its class.
function message(el, text, kind) {
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  el.className = kind === 'error' ? 'form-feedback mt8 text-danger' : 'form-feedback mt8 success';
}
