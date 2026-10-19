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
let activeGateRoster = [];
let gateSubmitting = false;
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
    const parents = Data.users().filter(user => user.role === 'Parent');
    const dayStudents = students.filter(s => s.residenceStatus === 'DAY_STUDENT' && s.status !== 'archived').map(s => ({
      id: s.id, admission_no: s.admissionNo, users: { name: s.name }, classes: { class_name: s.className || Data.cls(s.classId)?.name || '—' },
      guardians: parents.filter(parent => (parent.childIds || []).map(String).includes(String(s.id))).map(parent => ({ id: parent.id, name: parent.name }))
    }));
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
  activeGateRoster = roster;
  wireGateStudentPicker();
  drawGateRoster(roster.map(student => ({ ...student, last_gate_event: demoGateEvents.get(String(student.id)) || null })));
  wireGateForm(async payload => {
    const student = activeGateRoster.find(row => String(row.id) === String(payload.studentId));
    if (!student) throw new Error('Choose a day student from the list.');
    const guardian = (student.guardians || []).find(parent => String(parent.id) === String(payload.parentId));
    if (!guardian) throw new Error('Choose a parent linked to this student.');
    const demoPin = localStorage.getItem('hma_demo_pickup_pin') || '123456';
    if (payload.dropoffByType === 'non_parent' && payload.pickupPin !== demoPin) throw new Error('The local demo pickup PIN is incorrect. A parent can set it in the parent dashboard (default: 123456).');
    const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const who = payload.dropoffByType === 'parent' ? guardian.name : `${payload.caregiverName} on behalf of ${guardian.name}`;
    const message = `${student.users?.name || 'Student'} ${payload.eventType === 'arrival' ? 'dropped off' : 'picked up'} by ${who} in ${payload.vehicleColor} ${payload.vehicleModel} with number plate ${payload.vehiclePlate} at ${time}.`;
    const event = { type: payload.eventType, time, vehicle_color: payload.vehicleColor, vehicle_model: payload.vehicleModel, vehicle_plate: payload.vehiclePlate, dropoff_by_name: payload.dropoffByType === 'parent' ? guardian.name : payload.caregiverName, notification_message: message, parent_sms_status: 'demo' };
    demoGateEvents.set(String(student.id), event);
    drawGateRoster(activeGateRoster.map(row => ({ ...row, last_gate_event: demoGateEvents.get(String(row.id)) || null })));
    toast('Local demo event recorded. No SMS was sent.');
  });
}

function drawGateRoster(roster) {
  const root = $('gate-roster');
  if (!root) return;
  root.innerHTML = roster.length ? `<div class="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Admission no.</th><th>Last gate event</th></tr></thead><tbody>${roster.map(student => {
    const event = student.last_gate_event;
    const details = event ? `${event.event_type === 'arrival' || event.type === 'arrival' ? 'Dropped off' : 'Picked up'} · ${event.dropoff_person_name || event.dropoff_by_name || '—'} · ${[event.vehicle_color, event.vehicle_model, event.vehicle_plate].filter(Boolean).join(' ')} · ${event.event_at ? new Date(event.event_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : event.time || ''} · ${event.parent_sms_status || ''}` : '—';
    return `<tr><td>${esc(student.users?.name || 'Student')}</td><td>${esc(student.classes?.class_name || '—')}</td><td>${esc(student.admission_no)}</td><td>${esc(details)}</td></tr>`;
  }).join('')}</tbody></table></div>` : '<p class="muted-cell">No day students are available in the roster.</p>';
}

function wireGateStudentPicker() {
  const list = $('gate-student-list');
  const options = activeGateRoster.map(student => `<option value="${esc(student.admission_no)}" label="${esc(student.users?.name || 'Student')} · ${esc(student.classes?.class_name || '—')} · ID ${esc(student.id)}"></option>`).join('');
  if (list) list.innerHTML = options;
  const parentSelect = $('gate-parent-id');
  const syncGuardians = () => {
    const value = $('gate-student-query')?.value.trim().toLowerCase();
    const student = activeGateRoster.find(row => [String(row.id), String(row.admission_no || '').toLowerCase()].includes(value));
    if (parentSelect) parentSelect.innerHTML = '<option value="">Choose linked parent</option>' + (student?.guardians || []).map(parent => `<option value="${esc(parent.id)}">${esc(parent.name)}</option>`).join('');
    if ($('gate-selected-student')) $('gate-selected-student').textContent = student ? `${student.users?.name || 'Student'} · ${student.classes?.class_name || 'Class'}` : '';
  };
  $('gate-student-query')?.addEventListener('input', syncGuardians);
  $('gate-dropoff-type')?.addEventListener('change', () => {
    const nonParent = $('gate-dropoff-type').querySelector('input:checked')?.value === 'non_parent';
    $('gate-caregiver-fields').hidden = !nonParent;
    $('gate-caregiver-name').required = nonParent;
    $('gate-pickup-pin').required = nonParent;
    $('gate-actor-label').textContent = nonParent ? 'Parent authorizing this adult' : 'Parent dropping off';
  });
  syncGuardians();
}

function wireGateForm(onSave) {
  const form = $('gate-checkin-form');
  if (!form) return;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (gateSubmitting) return;
    const submit = $('gate-record-btn');
    const payload = {
      studentId: activeGateRoster.find(row => String(row.admission_no).toLowerCase() === $('gate-student-query').value.trim().toLowerCase() || String(row.id) === $('gate-student-query').value.trim())?.id,
      eventType: $('gate-event-type').value,
      method: $('gate-method').value,
      dropoffByType: $('gate-dropoff-type').querySelector('input:checked')?.value || 'parent',
      parentId: $('gate-parent-id').value,
      caregiverName: $('gate-caregiver-name').value.trim(),
      pickupPin: $('gate-pickup-pin').value,
      vehicleColor: $('gate-vehicle-color').value,
      vehicleModel: $('gate-vehicle-model').value.trim(),
      vehiclePlate: $('gate-vehicle-plate').value.trim().toUpperCase(),
      idempotencyKey: crypto.randomUUID()
    };
    if (!payload.studentId) return feedback('Choose a listed student by admission number.', true);
    if (!payload.parentId) return feedback('Choose the linked parent.', true);
    gateSubmitting = true;
    if (submit) { submit.disabled = true; submit.textContent = 'Saving check-in…'; }
    try { await onSave(payload); form.reset(); $('gate-caregiver-fields').hidden = true; $('gate-caregiver-name').required = false; $('gate-pickup-pin').required = false; $('gate-dropoff-type').dispatchEvent(new Event('change')); $('gate-student-query').dispatchEvent(new Event('input')); feedback(''); }
    catch (error) { feedback(error.message || 'Could not save the gate event.', true); }
    finally { gateSubmitting = false; if (submit) { submit.disabled = false; submit.textContent = 'Check in and notify parent'; } }
  });
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
    <div class="panel-heading"><div><h2>Vehicle check-in</h2><p class="muted-cell">Confirm the student and vehicle. Linked guardians receive the event details by SMS when messaging is configured.</p></div><span class="read-only-badge">Gate staff</span></div>
    <form id="gate-checkin-form" class="gate-checkin-form mt16">
      <div class="form-row"><label>Student ID / admission number<input id="gate-student-query" type="search" list="gate-student-list" autocomplete="off" required placeholder="Scan or enter admission number"><datalist id="gate-student-list"></datalist><small id="gate-selected-student" class="muted-cell"></small></label><label>Gate action<select id="gate-event-type"><option value="arrival">Check-in (drop-off)</option><option value="pickup">Check-out (pick-up)</option></select></label><label>Capture method<select id="gate-method"><option value="manual">Manual</option><option value="qr">QR code</option><option value="rfid">RFID</option></select></label></div>
      <div class="form-row mt16"><fieldset id="gate-dropoff-type" class="gate-actor-toggle"><legend>Drop-off by</legend><label><input type="radio" name="gate-dropoff-type" value="parent" checked> Parent</label><label><input type="radio" name="gate-dropoff-type" value="non_parent"> Non-parent / authorized adult</label></fieldset><label id="gate-actor-label">Parent dropping off<select id="gate-parent-id" required><option value="">Choose linked parent</option></select></label></div>
      <div id="gate-caregiver-fields" class="form-row mt16" hidden><label>Adult's full name<input id="gate-caregiver-name" maxlength="100" autocomplete="name" placeholder="Name of person bringing student"></label><label>Parent pickup PIN<input id="gate-pickup-pin" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="6-digit PIN"></label></div>
      <h3 class="mt16">Vehicle entry</h3><div class="form-row mt8"><label>Vehicle color<select id="gate-vehicle-color" required><option value="">Choose color</option>${['Black','White','Silver','Grey','Blue','Red','Green','Brown','Other'].map(color => `<option>${color}</option>`).join('')}</select></label><label>Vehicle make / model<input id="gate-vehicle-model" maxlength="80" required placeholder="e.g. Toyota Corolla"></label><label>Number plate<input id="gate-vehicle-plate" maxlength="20" required autocomplete="off" placeholder="e.g. ABC-123-DE"></label></div>
      <div class="mt16"><button class="btn-primary gate-submit" id="gate-record-btn" type="submit">Check in and notify parent</button></div><div class="form-feedback mt8" id="campus-feedback" role="status" hidden></div>
    </form>
    <div class="mt24"><h3>Recent day-student gate events</h3><div class="mt8" id="gate-roster"><p class="muted-cell">Loading student roster…</p></div></div>
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
    activeGateRoster = roster;
    wireGateStudentPicker();
    drawGateRoster(roster);
    wireGateForm(recordGate);
  } catch (err) { $('gate-roster').innerHTML = `<p class="form-feedback error">${esc(err.message)}</p>`; }
}

async function recordGate(payload) {
  try {
    const event = await campusApi('/api/gate/events', { method: 'POST', body: JSON.stringify(payload) });
    const student = activeGateRoster.find(row => String(row.id) === String(payload.studentId));
    if (student) student.last_gate_event = event;
    drawGateRoster(activeGateRoster);
    toast(`Gate event saved · guardian SMS ${event.parent_sms_status}.`);
    window.dispatchEvent(new CustomEvent('hma:gate-event', { detail: event }));
  } catch (err) { throw err; }
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
