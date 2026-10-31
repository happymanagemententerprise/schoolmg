// ============================================================
//  Happy Man Academy — Session History (Previous Sessions)
// ============================================================

import { Data } from '../data/index.js';
import { getCurrentUser, isAdmin, isTeacher, isStudent, isParent } from '../state.js';
import { $, esc, toneClass } from '../utils.js';
import { mount as reactMount } from '../react/mount.js';
import PreviousSessionPanel from '../react/components/PreviousSessionPanel.jsx';
import { getSessionsWithData } from '../data/prevSessionCache.js';

let _state = {
  studentId: null,
  sessionId: null,
  sessionName: null,
};

export async function renderSessionHistory() {
  const user = getCurrentUser();
  if (!user) return;

  const container = view-session-history;
  if (!container) return;

  let students = Data.students() || [];
  if (isStudent(user)) {
    students = students.filter(s => s._userId === String(user.id) || s.id === String(user.studentId));
  } else if (isParent(user)) {
    const childIds = (user.childIds || []).map(String);
    students = students.filter(s => childIds.includes(String(s.id)));
  } else if (isTeacher(user)) {
    const cl = Data.classes().find(c =>
      c.classTeacherId !== null && String(c.classTeacherId) === String(user.id)
    );
    if (cl) {
      students = Data.studentsByClass(cl.id);
    } else {
      students = [];
    }
  }

  const sel = sh-student-select;
  if (sel) {
    sel.innerHTML = students.length
      ? '<option value=\"\">Select student...</option>' +
        students.map(s => {
          const cl = Data.cls(s.classId);
          return '<option value=\"' + s.id + '\">' + esc(s.name) + (cl ? ' — ' + esc(cl.name) : '') + '</option>';
        }).join('')
      : '<option value=\"\">No students available</option>';
    sel.onchange = () => {
      const sid = sel.value;
      _state = { studentId: sid, sessionId: null, sessionName: null };
      renderSessionSelector();
    };
  }

  if (isStudent(user) && students[0]) {
    const sid = students[0].id;
    if (sel) sel.value = sid;
    _state.studentId = sid;
  } else if (isParent(user) && students.length === 1) {
    const sid = students[0].id;
    if (sel) sel.value = sid;
    _state.studentId = sid;
  }

  renderSessionSelector();
}

async function renderSessionSelector() {
  const sel = sh-session-select;
  const empty = sh-empty;
  const mount = sh-panel-mount;
  if (!sel) return;

  if (!_state.studentId) {
    sel.innerHTML = '<option value=\"\">Select a student first</option>';
    sel.disabled = true;
    if (empty) { empty.hidden = false; empty.textContent = 'Select a student to view their previous session records.'; }
    if (mount) mount.innerHTML = '';
    return;
  }

  sel.disabled = false;
  if (empty) empty.hidden = true;
  if (mount) mount.innerHTML = '';

  try {
    const sessions = await getSessionsWithData(_state.studentId);
    if (sessions.length === 0) {
      sel.innerHTML = '<option value=\"\">No previous sessions with data</option>';
      if (empty) { empty.hidden = false; empty.textContent = 'No previous session records found for this student.'; }
      return;
    }
    sel.innerHTML = '<option value=\"\">Select a session...</option>' +
      sessions.map(s => '<option value=\"' + s.id + '\" data-name=\"' + esc(s.name) + '\">' + esc(s.name) + (s.isClosed ? ' (Closed)' : '') + '</option>').join('');
    sel.onchange = () => {
      const sid = sel.value;
      if (!sid) { if (mount) mount.innerHTML = ''; return; }
      const opt = sel.selectedOptions[0];
      _state.sessionId = sid;
      _state.sessionName = opt && opt.dataset ? opt.dataset.name || sid : sid;
      renderPanel();
    };
  } catch (e) {
    sel.innerHTML = '<option value=\"\">Error loading sessions</option>';
    if (empty) { empty.hidden = false; empty.textContent = 'Could not load previous sessions: ' + e.message; }
  }
}

function renderPanel() {
  const mount = sh-panel-mount;
  if (!mount) return;
  if (!_state.studentId || !_state.sessionId) { mount.innerHTML = ''; return; }
  reactMount('sh-panel-mount', PreviousSessionPanel, {
    studentId: _state.studentId,
    sessionId: _state.sessionId,
    sessionName: _state.sessionName,
  });
}
