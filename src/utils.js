// ============================================================
//  Happy Man Academy — Pure utility helpers
// ============================================================

import { Data, Academic, Progression } from './data/index.js';

// ── DOM helpers ──────────────────────────────────────────────
export const $    = id  => document.getElementById(id);
export const $q   = sel => document.querySelector(sel);
export const $all = sel => document.querySelectorAll(sel);
export const esc  = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

// ── Toast notifications ──────────────────────────────────────
export function toast(msg, type = 'success') {
  const el = $('toast');
  el.textContent = msg;
  el.className   = 'toast toast-' + type;
  el.hidden      = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, 3200);
}

// ── Date and number helpers ──────────────────────────────────
export function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

export function ordinal(n) {
  if (n === null || n === undefined) return '—';
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Grade / label helpers ────────────────────────────────────
export function gradeLabel(score) {
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

export function toneClass(t) {
  return { blue:'avatar-blue', coral:'avatar-coral', green:'avatar-green', yellow:'avatar-yellow' }[t] || 'avatar-blue';
}

export function avatarInitials(n) {
  return String(n || '?').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export function levelTag(level) {
  const map = { JSS: 'Junior', SS: 'Senior', BOTH: 'JSS + SS' };
  return `<span class="level-tag level-${(level || 'BOTH').toLowerCase()}">${map[level] || level || '—'}</span>`;
}

export function streamTag(stream) {
  return stream ? `<span class="stream-tag stream-${stream.toLowerCase()}">${stream}</span>` : '';
}

export function subjectChip(sub) {
  return `<span class="subject-chip chip-${sub?.color || 'blue'}">${esc(sub?.code || '?')}</span>`;
}

export function statusClass(s) {
  return s === 'Promoted' ? 'promoted' : s === 'Review' ? 'review' : 'repeat';
}

// ── Session helpers ──────────────────────────────────────────
export function currentTerm() { return Data.session().currentTerm; }
export function passMark()    { return Academic.PASS_MARK; }

// ── Student position helpers ─────────────────────────────────
export function classRank(studentId, term) {
  const s = Data.student(studentId);
  if (!s) return null;
  const peers  = Data.studentsByClass(s.classId).filter(p => p.status !== 'archived');
  const myAvg  = Progression.sessionAverage(studentId);
  if (myAvg === null) return null;
  const above  = peers.filter(p => {
    const a = Progression.sessionAverage(p.id);
    return a !== null && a > myAvg;
  }).length;
  return above + 1;
}

export function yearRank(studentId, term) {
  const s = Data.student(studentId);
  if (!s) return null;
  const cl = Data.cls(s.classId);
  if (!cl) return null;
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

// ── CSV download ─────────────────────────────────────────────
export function downloadCsv(filename, rows) {
  const BOM = '\uFEFF';
  const csv  = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Excel (.xlsx) helpers ─────────────────────────────────────
const _xlsxXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export const _xlsxCol = (() => { const cache = {}; return n => {
  if (cache[n] !== undefined) return cache[n];
  let s = '', m = n + 1;
  while (m > 0) { const d = (m - 1) % 26; s = String.fromCharCode(65 + d) + s; m = Math.floor((m - 1) / 26); }
  cache[n] = s; return s;
}; })();

export const _xlsxEscape = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function xlsxSheetXml(rows) {
  const body = rows.map((r, i) => {
    const rowN = i + 1;
    const cells = r.map((v, j) => {
      const ref = _xlsxCol(j) + rowN;
      if (typeof v === 'number' && Number.isFinite(v)) {
        return `<c r="${ref}"${i === 0 ? ' s="1"' : ''}><v>${v}</v></c>`;
      }
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

export function _crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = (c >>> 8) ^ _crcTable[(c ^ u8[i]) & 0xff]; return (c ^ 0xffffffff) >>> 0; }

export function zipStore(parts) {
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

export function xlsxBlob(sheetName, rows) {
  return xlsxBlobMulti([{ name: sheetName, rows }]);
}

export function xlsxBlobMulti(sheets) {
  const sheetRefs = sheets.map((s, i) =>
    `<sheet name="${_xlsxEscape(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
  ).join('');

  const wbRels = sheets.map((_, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  ).join('') +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;

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

export function downloadXlsx(filename, rows, sheetName = 'Sheet1') {
  const name = filename.endsWith('.xlsx') ? filename : filename + '.xlsx';
  const url  = URL.createObjectURL(xlsxBlob(sheetName, rows));
  const a    = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export function downloadXlsxMulti(filename, sheets) {
  const name = filename.endsWith('.xlsx') ? filename : filename + '.xlsx';
  const url  = URL.createObjectURL(xlsxBlobMulti(sheets));
  const a    = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// ── PDF export ───────────────────────────────────────────────
export function printReportPdf() {
  document.body.classList.add('printing-report');
  const done = () => { document.body.classList.remove('printing-report'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}
