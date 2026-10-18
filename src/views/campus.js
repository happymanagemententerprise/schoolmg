import { Data } from '../data/index.js';
import { getCurrentUser } from '../state.js';
import { $, $q, esc, toast } from '../utils.js';
import { campusApi, watchCampusEvents } from '../campus-api.js';
import { isAdmin, isTeacher } from '../auth.js';

const userRole = () => getCurrentUser()?.role;
const isGuard = () => userRole() === 'Security Guard';
const isHostelStaff = () => userRole() === 'Hostel Supervisor';
let stopCampusEvents = null;
// Demo-only campus events live in memory. They are never submitted to Supabase.
const demoGateEvents = new Map();
const demoHostelPresence = new Map();
const feedback = (message, isError = false) => {
  const el = $('campus-feedback');
  if (!el) return;
  el.textContent = message;
  el.className = `form-feedback mt8${isError ? ' error' : ''}`;
  el.hidden = !message;
};

export async function renderCampus() {
  if (Data.isDemoMode() && (isGuard() || isHostelStaff())) {
    renderLocalCampusDemo();
    return;
  }
  if (!stopCampusEvents) stopCampusEvents = watchCampusEvents((type) => {
    if ($('view-campus')?.hidden) return;
    if (type === 'residence-updated') {
      if (isAdmin(getCurrentUser()) || isGuard()) loadGateRoster();
      if (isAdmin(getCurrentUser()) || isHostelStaff()) loadHostelDashboard();
    }
    if (type === 'gate-event') loadGateRoster();
    if (type === 'hostel-event') loadHostelDashboard();
    if (type === 'swap-updated') loadPeriodsAndSwaps();
  });
  const content = $('campus-content');
  const admin = isAdmin(getCurrentUser());
  const teacher = isTeacher(getCurrentUser());
  const sections = [];
  if (admin || isGuard()) sections.push(renderGateSection());
  if (admin || isHostelStaff()) sections.push(renderHostelSection());
  if (teacher || admin) sections.push(renderPeriodSection());
  if (admin) sections.push(renderHostelSetup());
  content.innerHTML = sections.join('') || '<div class="panel empty-state">Your account does not have a campus operations assignment.</div>';
  $('campus-refresh').onclick = renderCampus;
  await Promise.all([
    (admin || isGuard()) ? loadGateRoster() : Promise.resolve(),
    (admin || isHostelStaff()) ? loadHostelDashboard() : Promise.resolve(),
    (teacher || admin) ? loadPeriodsAndSwaps() : Promise.resolve(),
    admin ? bindHostelSetup() : Promise.resolve()
  ]);
}

function renderLocalCampusDemo() {
  const content = $('campus-content');
  const students = Data.students();
  if (isGuard()) {
    const dayStudents = students.filter(s => Number(s.id) % 2 === 1);
    content.innerHTML = `${renderGateSection()}<p class="muted-cell mt8">Local demo register · sample day students only. Events stay in this browser.</p>`;
    renderLocalGateRoster(dayStudents);
  } else {
    const boarders = students.filter(s => Number(s.id) % 2 === 0);
    content.innerHTML = `${renderHostelSection()}<p class="muted-cell mt8">Local demo hostel · sample boarders only. Presence changes stay in this browser.</p>`;
    renderLocalHostelRoster(boarders);
  }
  $('campus-refresh').onclick = renderCampus;
}

function renderLocalGateRoster(roster) {
  const root = $('gate-roster');
  if (!root) return;
  const find = value => roster.find(s => String(s.id) === value || String(s.admission_no).toLowerCase() === value.toLowerCase());
  const eventLabel = student => {
    const event = demoGateEvents.get(String(student.id));
    return event ? `${event.type === 'arrival' ? 'Arrived' : 'Picked up'} · ${event.time} · Local demo` : '—';
  };
  const draw = () => {
    root.innerHTML = `<table><thead><tr><th>Student</th><th>Class</th><th>Admission no.</th><th>Last gate event</th><th>Record</th></tr></thead><tbody>${roster.map(s => `<tr data-gate-student="${esc(s.id)}"><td>${esc(s.users?.name || 'Student')}</td><td>${esc(s.classes?.class_name || '—')}</td><td>${esc(s.admission_no)}</td><td data-last-event>${esc(eventLabel(s))}</td><td><button class="btn-sm-save" data-local-gate="arrival" data-student="${esc(s.id)}">Arrived</button> <button class="btn-sm-save" data-local-gate="pickup" data-student="${esc(s.id)}">Picked up</button></td></tr>`).join('')}</tbody></table>`;
    root.querySelectorAll('[data-local-gate]').forEach(button => button.addEventListener('click', () => save(button.dataset.student, button.dataset.localGate)));
  };
  const save = (id, type) => {
    demoGateEvents.set(String(id), { type, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    draw();
    toast(`Demo gate ${type === 'arrival' ? 'arrival' : 'pick-up'} recorded locally.`);
  };
  $('gate-record-btn').onclick = () => {
    const student = find($('gate-student-query').value.trim());
    if (!student) return feedback('No sample day student matches that admission number or ID.', true);
    save(student.id, $('gate-event-type').value);
  };
  draw();
}

function renderLocalHostelRoster(roster) {
  const root = $('hostel-dashboard');
  if (!root) return;
  const date = new Date().toLocaleDateString();
  const draw = () => {
    root.innerHTML = `<div class="mt16"><div class="panel-heading"><h3>Demo Boarding House</h3><span class="read-only-badge">${esc(date)} · ${roster.length} sample boarders</span></div><div class="table-wrap mt8"><table><thead><tr><th>Boarder</th><th>Class</th><th>Presence</th><th>Update</th></tr></thead><tbody>${roster.map(s => {
      const present = demoHostelPresence.get(String(s.id)) ?? (Number(s.id) % 4 !== 0);
      return `<tr><td>${esc(s.users?.name || 'Student')} <small class="muted-cell">${esc(s.admission_no)}</small></td><td>${esc(s.classes?.class_name || '—')}</td><td>${present ? '<span class="status promoted">Present</span>' : '<span class="status review">Out</span>'}</td><td><button type="button" class="btn-sm-save" data-local-hostel="in" data-student="${esc(s.id)}">Check in</button> <button type="button" class="btn-sm-save" data-local-hostel="out" data-student="${esc(s.id)}">Check out</button></td></tr>`;
    }).join('')}</tbody></table></div></div>`;
    root.querySelectorAll('[data-local-hostel]').forEach(button => button.addEventListener('click', () => {
      demoHostelPresence.set(String(button.dataset.student), button.dataset.localHostel === 'in');
      draw();
      toast('Demo hostel presence updated locally.');
    }));
  };
  draw();
}

function renderGateSection() {
  return `<section class="panel mt16">
    <div class="panel-heading"><div><h2>Day student gate register</h2><p class="muted-cell">Record arrival and pick-up. Linked guardians receive an SMS when messaging is configured.</p></div><span class="read-only-badge">Gate staff</span></div>
    <div class="form-row mt16"><label>Admission number / student ID<input id="gate-student-query" type="search" autocomplete="off" placeholder="Scan QR/RFID or enter admission number"></label><label>Gate event<select id="gate-event-type"><option value="arrival">Arrival</option><option value="pickup">Pick-up</option></select></label><label>Capture method<select id="gate-method"><option value="manual">Manual</option><option value="qr">QR code</option><option value="rfid">RFID</option></select></label><button class="btn-primary" id="gate-record-btn" type="button">Record event</button></div>
    <div class="table-wrap mt16" id="gate-roster"><p class="muted-cell">Loading student roster…</p></div>
  </section>`;
}

function renderHostelSection() {
  return `<section class="panel mt16">
    <div class="panel-heading"><div><h2>Hostel presence</h2><p class="muted-cell">Check boarders in or out and review the latest daily close summary.</p></div></div>
    <div id="hostel-dashboard" class="mt16"><p class="muted-cell">Loading assigned hostels…</p></div>
  </section>`;
}

function renderPeriodSection() {
  return `<section class="panel mt16">
    <div class="panel-heading"><div><h2>My class periods</h2><p class="muted-cell">Mark subject-period attendance. Approved cover assignments change the teacher who can submit the register.</p></div></div>
    <div id="period-attendance" class="mt16"><p class="muted-cell">Loading today’s periods…</p></div>
  </section>
  <section class="panel mt16">
    <div class="panel-heading"><div><h2>Request class cover</h2><p class="muted-cell">A school administrator must approve teacher cover requests.</p></div></div>
    <div class="form-row mt16"><label>My period<select id="swap-period"><option value="">Choose a period</option>${ownTimetableOptions()}</select></label><label>Covering teacher<select id="swap-teacher"><option value="">Choose a teacher</option>${Data.users().filter(u => isTeacher(u) && String(u.id) !== String(getCurrentUser().id)).map(u => `<option value="${esc(u.id)}">${esc(u.name)} · ${esc(u.role)}</option>`).join('')}</select></label><label>Reason<input id="swap-reason" maxlength="240" placeholder="Reason for cover"></label><button type="button" class="btn-primary" id="swap-request-btn">Request cover</button></div>
    <div class="table-wrap mt16" id="swap-requests"><p class="muted-cell">Loading cover requests…</p></div>
  </section>`;
}

function ownTimetableOptions() {
  const currentTerm = Data.session()?.currentTerm;
  return Data.timetables().filter(p => String(p.teacherId) === String(getCurrentUser()?.id) && Number(p.term) === Number(currentTerm)).map(p => {
    const slot = Data.timeSlots().find(t => String(t.id) === String(p.timeSlotId));
    const cl = Data.cls(p.classId), subject = Data.subject(p.subjectId);
    return `<option value="${esc(p.id)}">${esc(cl?.name || 'Class')} · ${esc(subject?.name || 'Subject')} · ${esc(slot?.day || '')} ${esc(slot?.start || '')}</option>`;
  }).join('');
}

function renderHostelSetup() {
  return `<section class="panel mt16">
    <div class="panel-heading"><div><h2>Hostel setup</h2><p class="muted-cell">Add hostels and assign a hostel supervisor account.</p></div></div>
    <div class="form-row mt16"><label>New hostel name<input id="new-hostel-name" maxlength="80" placeholder="e.g. Girls’ Hostel"></label><button class="btn-sm-save" id="add-hostel-btn" type="button">Add hostel</button><label>Hostel<select id="setup-hostel"><option value="">Choose a hostel</option></select></label><label>Supervisor<select id="setup-hostel-staff"><option value="">Choose a supervisor</option>${Data.users().filter(u => u.role === 'Hostel Supervisor').map(u => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('')}</select></label><button class="btn-sm-save" id="assign-hostel-staff-btn" type="button">Assign supervisor</button></div>
    <p class="muted-cell mt16">Assign each boarder to a hostel from People → Students. You can add supervisors as staff with the Hostel Supervisor role.</p>
  </section>`;
}

async function bindHostelSetup() {
  const fill = async () => {
    const hostels = await campusApi('/api/hostels');
    $('setup-hostel').innerHTML = '<option value="">Choose a hostel</option>' + hostels.map(h => `<option value="${h.id}">${esc(h.name)}</option>`).join('');
  };
  try { await fill(); } catch (err) { feedback(err.message, true); }
  $('add-hostel-btn')?.addEventListener('click', async () => {
    try { await campusApi('/api/hostels', { method: 'POST', body: JSON.stringify({ name: $('new-hostel-name').value }) }); $('new-hostel-name').value = ''; await fill(); toast('Hostel added.'); }
    catch (err) { feedback(err.message, true); }
  });
  $('assign-hostel-staff-btn')?.addEventListener('click', async () => {
    try {
      const hostelId = $('setup-hostel').value, userId = $('setup-hostel-staff').value;
      if (!hostelId || !userId) throw new Error('Choose both a hostel and a supervisor.');
      await campusApi(`/api/hostels/${hostelId}/staff`, { method: 'POST', body: JSON.stringify({ userId }) }); toast('Supervisor assigned.');
    } catch (err) { feedback(err.message, true); }
  });
}

async function loadGateRoster() {
  try {
    const roster = await campusApi('/api/campus/roster');
    $('gate-roster').innerHTML = `<table><thead><tr><th>Student</th><th>Class</th><th>Admission no.</th><th>Last gate event</th><th>Record</th></tr></thead><tbody>${roster.map(s => `<tr data-gate-student="${s.id}" data-admission="${esc(s.admission_no)}"><td>${esc(s.users?.name || 'Student')}</td><td>${esc(s.classes?.class_name || '—')}</td><td>${esc(s.admission_no)}</td><td data-last-event>${s.last_gate_event ? `${esc(s.last_gate_event.event_type === 'arrival' ? 'Arrived' : 'Picked up')} · ${esc(new Date(s.last_gate_event.event_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))} · SMS ${esc(s.last_gate_event.parent_sms_status)}` : '—'}</td><td><button class="btn-sm-save" data-gate-action="arrival" data-student="${s.id}">Arrived</button> <button class="btn-sm-save" data-gate-action="pickup" data-student="${s.id}">Picked up</button></td></tr>`).join('')}</tbody></table>`;
    $('gate-record-btn').onclick = async () => {
      const query = $('gate-student-query').value.trim();
      const student = roster.find(s => String(s.id) === query || String(s.admission_no).toLowerCase() === query.toLowerCase());
      if (!student) return feedback('No day student matches that admission number or ID.', true);
      await recordGate(student.id, $('gate-event-type').value, $('gate-method').value);
    };
    $all('[data-gate-action]').forEach(button => button.addEventListener('click', () => recordGate(button.dataset.student, button.dataset.gateAction, 'manual')));
  } catch (err) { $('gate-roster').innerHTML = `<p class="form-feedback error">${esc(err.message)}</p>`; }
}

async function recordGate(studentId, eventType, method) {
  try {
    const event = await campusApi('/api/gate/events', { method: 'POST', body: JSON.stringify({ studentId, eventType, method }) });
    const row = $q(`[data-gate-student="${studentId}"]`);
    if (row) row.querySelector('[data-last-event]').textContent = `${eventType === 'arrival' ? 'Arrived' : 'Picked up'} · ${new Date(event.event_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · SMS ${event.parent_sms_status}`;
    toast(`Gate ${eventType} recorded · guardian SMS ${event.parent_sms_status}.`);
    window.dispatchEvent(new CustomEvent('hma:gate-event', { detail: event }));
  } catch (err) { feedback(err.message, true); }
}

async function loadHostelDashboard() {
  const root = $('hostel-dashboard');
  try {
    const hostels = await campusApi('/api/hostel/dashboard');
    if (!hostels.length) { root.innerHTML = '<p class="muted-cell">No hostel is assigned to your account yet.</p>'; return; }
    root.innerHTML = hostels.map(h => `<div class="mt16"><div class="panel-heading"><h3>${esc(h.name)}</h3><span class="read-only-badge">${esc(h.date)} · ${h.summary.checked_in_count} check-ins · ${h.summary.auto_checkout_count} automatic close-outs</span></div><div class="table-wrap mt8"><table><thead><tr><th>Boarder</th><th>Class</th><th>Presence</th><th>Update</th></tr></thead><tbody>${h.roster.map(s => `<tr data-hostel-student="${s.id}" data-hostel-id="${h.id}"><td>${esc(s.name || 'Student')} <small class="muted-cell">${esc(s.admission_no)}</small></td><td>${esc(s.class_name || '—')}</td><td data-presence>${s.presence === 'present' ? '<span class="status promoted">Present</span>' : '<span class="status review">Out</span>'}</td><td><button type="button" class="btn-sm-save" data-hostel-event="check_in" data-student="${s.id}" data-hostel="${h.id}">Check in</button> <button type="button" class="btn-sm-save" data-hostel-event="check_out" data-student="${s.id}" data-hostel="${h.id}">Check out</button></td></tr>`).join('')}</tbody></table></div></div>`).join('');
    $all('[data-hostel-event]').forEach(button => button.addEventListener('click', async () => {
      try {
        await campusApi('/api/hostel/presence', { method: 'POST', body: JSON.stringify({ hostelId: button.dataset.hostel, studentId: button.dataset.student, eventType: button.dataset.hostelEvent }) });
        toast('Hostel presence saved.'); await loadHostelDashboard();
      } catch (err) { feedback(err.message, true); }
    }));
  } catch (err) { root.innerHTML = `<p class="form-feedback error">${esc(err.message)}</p>`; }
}

async function loadPeriodsAndSwaps() {
  try {
    const periods = await campusApi('/api/teacher/periods');
    const root = $('period-attendance');
    root.innerHTML = periods.length ? periods.map(p => `<div class="mt16"><div class="panel-heading"><h3>${esc(p.subjects?.name || 'Subject')} · ${esc(p.classes?.class_name || 'Class')}</h3><span class="read-only-badge">${esc(p.slot.start_time)}–${esc(p.slot.end_time)}</span></div><div class="table-wrap mt8"><table><thead><tr><th>Student</th><th>Status</th><th>Mark</th></tr></thead><tbody>${p.students.map(s => `<tr><td>${esc(s.name || 'Student')} · ${esc(s.admission_no)}</td><td>${esc(s.status || 'Unmarked')}</td><td>${['present','absent','late','excused'].map(status => `<button type="button" class="btn-sm-save" data-period-mark="${status}" data-period="${p.id}" data-student="${s.id}">${status[0].toUpperCase()}${status.slice(1)}</button>`).join(' ')}</td></tr>`).join('')}</tbody></table></div></div>`).join('') : '<p class="muted-cell">No periods are assigned to you today.</p>';
    $all('[data-period-mark]').forEach(button => button.addEventListener('click', async () => {
      try { await campusApi('/api/period-attendance', { method: 'POST', body: JSON.stringify({ timetableId: button.dataset.period, studentId: button.dataset.student, status: button.dataset.periodMark }) }); toast('Period attendance saved.'); await loadPeriodsAndSwaps(); }
      catch (err) { feedback(err.message, true); }
    }));
  } catch (err) { $('period-attendance').innerHTML = `<p class="form-feedback error">${esc(err.message)}</p>`; }
  $('swap-request-btn')?.addEventListener('click', async () => {
    try { await campusApi('/api/timetable-swaps', { method: 'POST', body: JSON.stringify({ timetableId: $('swap-period').value, coveringTeacherId: $('swap-teacher').value, reason: $('swap-reason').value }) }); toast('Cover request sent for approval.'); await loadPeriodsAndSwaps(); }
    catch (err) { feedback(err.message, true); }
  });
  try {
    const swaps = await campusApi('/api/timetable-swaps');
    $('swap-requests').innerHTML = swaps.length ? `<table><thead><tr><th>Period</th><th>Covering teacher</th><th>Reason</th><th>Status</th>${isAdmin(getCurrentUser()) ? '<th>Decision</th>' : ''}</tr></thead><tbody>${swaps.map(s => `<tr><td>${esc(s.timetables?.classes?.class_name || 'Class')} · ${esc(s.timetables?.subjects?.name || 'Subject')}</td><td>${esc(s.covering?.name || 'Teacher')}</td><td>${esc(s.reason)}</td><td>${esc(s.status)}</td>${isAdmin(getCurrentUser()) ? `<td>${s.status === 'pending' ? `<button class="btn-sm-save" data-swap-decision="approved" data-swap-id="${s.id}">Approve</button> <button class="btn-sm-save" data-swap-decision="rejected" data-swap-id="${s.id}">Reject</button>` : '—'}</td>` : ''}</tr>`).join('')}</tbody></table>` : '<p class="muted-cell">No class cover requests.</p>';
    $all('[data-swap-decision]').forEach(button => button.addEventListener('click', async () => {
      try { await campusApi(`/api/timetable-swaps/${button.dataset.swapId}/decision`, { method: 'POST', body: JSON.stringify({ status: button.dataset.swapDecision }) }); toast(`Cover ${button.dataset.swapDecision}.`); await loadPeriodsAndSwaps(); }
      catch (err) { feedback(err.message, true); }
    }));
  } catch (err) { $('swap-requests').innerHTML = `<p class="form-feedback error">${esc(err.message)}</p>`; }
}

window.addEventListener('hma:gate-event', () => { if (!$('view-campus')?.hidden && !isHostelStaff()) loadGateRoster(); });
window.addEventListener('hma:hostel-event', () => { if (!$('view-campus')?.hidden && !isGuard()) loadHostelDashboard(); });
window.addEventListener('hma:residence-updated', () => { if (!$('view-campus')?.hidden) renderCampus(); });
window.addEventListener('hma:swap-updated', () => { if (!$('view-campus')?.hidden) loadPeriodsAndSwaps(); });
window.addEventListener('hma:logout', () => { stopCampusEvents?.(); stopCampusEvents = null; });
