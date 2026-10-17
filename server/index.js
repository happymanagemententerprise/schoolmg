import dotenv from 'dotenv';
import express from 'express';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });

const app = express();
app.disable('x-powered-by');
const allowedOrigins = new Set((process.env.FRONTEND_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '64kb' }));
const port = Number(process.env.PORT || 8788);
const timezone = process.env.SCHOOL_TIMEZONE || 'Africa/Lagos';
const publicUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!publicUrl || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required by the private API.');
const db = createClient(publicUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const campusEventClients = new Set();
const vapidReady = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
if (vapidReady) webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

const roleMap = { admin: 'admin', teacher: 'teacher', hod: 'teacher', security_guard: 'security_guard', hostel_staff: 'hostel_staff' };
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const dayKey = date => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const localParts = date => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  timeZone: timezone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
}).formatToParts(date).map(p => [p.type, p.value]));
async function currentTermId() {
  const { data, error } = await db.from('terms').select('id').eq('is_current', true).limit(1).maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

async function authenticate(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sign in required.' });
  const { data: authData, error: authError } = await db.auth.getUser(token);
  if (authError || !authData?.user) return res.status(401).json({ error: 'Your session is invalid or expired.' });
  const { data: user, error } = await db.from('users').select('id,name,email,role,staff_role')
    .eq('auth_user_id', authData.user.id).maybeSingle();
  if (error || !user) return res.status(403).json({ error: 'School user account is not linked.' });
  req.schoolUser = { ...user, role: roleMap[user.role] || user.role };
  next();
}
const requireRoles = (...roles) => (req, res, next) => roles.includes(req.schoolUser?.role)
  ? next() : res.status(403).json({ error: 'You do not have permission for this action.' });
const auth = [authenticate];

async function linkedParents(studentId) {
  const { data: links, error } = await db.from('parent_students').select('parent_id').eq('student_id', studentId);
  if (error) throw error;
  const ids = (links || []).map(row => row.parent_id);
  if (!ids.length) return [];
  const { data: parents, error: parentError } = await db.from('users').select('id,name,phone').in('id', ids);
  if (parentError) throw parentError;
  return parents || [];
}

async function sendSms(to, message) {
  const sid = process.env.TWILIO_ACCOUNT_SID, secret = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !secret || !from || !to) return { status: 'not_configured' };
  const form = new URLSearchParams({ To: to, From: from, Body: message });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${sid}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form
  });
  if (!response.ok) return { status: 'failed', error: `SMS provider returned ${response.status}` };
  return { status: 'sent' };
}

async function deliverPush(userId, payload) {
  if (!vapidReady) return;
  const { data: subscriptions, error } = await db.from('push_subscriptions').select('id,subscription').eq('user_id', userId);
  if (error) throw error;
  await Promise.all((subscriptions || []).map(async row => {
    try { await webpush.sendNotification(row.subscription, JSON.stringify(payload)); }
    catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await db.from('push_subscriptions').delete().eq('id', row.id);
      else console.error('[push] delivery failed', err.message);
    }
  }));
}

app.get('/api/health', (_req, res) => res.json({ ok: true, pushEnabled: vapidReady, smsEnabled: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) }));

app.get('/api/campus/events', ...auth, requireRoles('admin', 'teacher', 'security_guard', 'hostel_staff'), asyncRoute(async (req, res) => {
  let hostelIds = [];
  let classIds = [];
  if (req.schoolUser.role === 'hostel_staff') {
    const { data, error } = await db.from('hostel_staff_assignments').select('hostel_id').eq('user_id', req.schoolUser.id);
    if (error) throw error;
    hostelIds = (data || []).map(row => Number(row.hostel_id));
  }
  if (req.schoolUser.role === 'teacher') {
    const [subjectRows, classRows] = await Promise.all([
      db.from('teacher_subjects').select('class_id').eq('teacher_id', req.schoolUser.id),
      db.from('teacher_classes').select('class_id').eq('teacher_id', req.schoolUser.id)
    ]);
    if (subjectRows.error) throw subjectRows.error;
    if (classRows.error) throw classRows.error;
    classIds = [...new Set([...(subjectRows.data || []), ...(classRows.data || [])].map(row => Number(row.class_id)))];
  }
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const client = { userId: Number(req.schoolUser.id), role: req.schoolUser.role, hostelIds, classIds, res };
  campusEventClients.add(client);
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  send('ready', { ok: true });
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  res.on('close', () => { clearInterval(heartbeat); campusEventClients.delete(client); });
}));

db.channel('hma-campus-api-events')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'students' }, payload => {
    const event = { studentId: payload.new?.id, residenceStatus: payload.new?.residence_status, hostelId: payload.new?.hostel_id };
    if (!event.studentId) return;
    for (const client of campusEventClients) {
      const allowed = client.role === 'admin' || client.role === 'security_guard'
        || client.role === 'teacher' && client.classIds.includes(Number(payload.new?.class_id))
        || client.role === 'hostel_staff' && (client.hostelIds.includes(Number(payload.new?.hostel_id)) || client.hostelIds.includes(Number(payload.old?.hostel_id)));
      if (allowed) client.res.write(`event: residence-updated\ndata: ${JSON.stringify(event)}\n\n`);
    }
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_events' }, payload => {
    for (const client of campusEventClients) if (['admin', 'security_guard'].includes(client.role)) client.res.write(`event: gate-event\ndata: ${JSON.stringify({ studentId: payload.new?.student_id, eventType: payload.new?.event_type, eventAt: payload.new?.event_at })}\n\n`);
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'hostel_presence_events' }, payload => {
    const event = { studentId: payload.new?.student_id, hostelId: Number(payload.new?.hostel_id), eventType: payload.new?.event_type };
    for (const client of campusEventClients) {
      if (client.role === 'admin' || client.role === 'hostel_staff' && client.hostelIds.includes(event.hostelId)) client.res.write(`event: hostel-event\ndata: ${JSON.stringify(event)}\n\n`);
    }
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'timetable_swaps' }, async payload => {
    const event = { timetableId: payload.new?.timetable_id, teacherId: payload.new?.covering_teacher_id };
    const { data: period } = await db.from('timetables').select('teacher_id').eq('id', event.timetableId).maybeSingle();
    for (const client of campusEventClients) if (client.role === 'admin' || client.role === 'teacher' && (Number(payload.new?.covering_teacher_id) === client.userId || Number(payload.new?.requested_by) === client.userId || Number(period?.teacher_id) === client.userId)) client.res.write(`event: swap-updated\ndata: ${JSON.stringify(event)}\n\n`);
  })
  .subscribe(status => { if (status === 'CHANNEL_ERROR') console.error('[realtime] campus event feed failed to subscribe'); });
app.get('/api/push/vapid-public-key', (_req, res) => vapidReady
  ? res.json({ publicKey: process.env.VAPID_PUBLIC_KEY }) : res.status(503).json({ error: 'Push notifications are not configured.' }));

app.post('/api/push/subscribe', ...auth, asyncRoute(async (req, res) => {
  const subscription = req.body?.subscription;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return res.status(400).json({ error: 'Invalid push subscription.' });
  const { data: existing, error: existingError } = await db.from('push_subscriptions').select('user_id').eq('endpoint', subscription.endpoint).maybeSingle();
  if (existingError) throw existingError;
  if (existing && Number(existing.user_id) !== Number(req.schoolUser.id)) return res.status(409).json({ error: 'This notification endpoint is already registered to another school user.' });
  const { error } = await db.from('push_subscriptions').upsert({
    user_id: req.schoolUser.id, endpoint: subscription.endpoint, subscription, updated_at: new Date().toISOString()
  }, { onConflict: 'endpoint' });
  if (error) throw error;
  res.status(204).end();
}));
app.delete('/api/push/subscribe', ...auth, asyncRoute(async (req, res) => {
  const endpoint = String(req.body?.endpoint || '');
  if (!endpoint) return res.status(400).json({ error: 'Subscription endpoint required.' });
  const { error } = await db.from('push_subscriptions').delete().eq('user_id', req.schoolUser.id).eq('endpoint', endpoint);
  if (error) throw error;
  res.status(204).end();
}));

app.get('/api/campus/roster', ...auth, requireRoles('admin', 'security_guard'), asyncRoute(async (_req, res) => {
  const { data, error } = await db.from('students').select('id,admission_no,class_id,residence_status,status,users!students_user_id_fkey(name),classes(class_name)')
    .neq('status', 'archived').order('admission_no');
  if (error) throw error;
  const ids = (data || []).map(row => row.id);
  const { data: events, error: eventError } = ids.length
    ? await db.from('gate_events').select('student_id,event_type,event_at,parent_sms_status').in('student_id', ids).order('event_at', { ascending: false })
    : { data: [], error: null };
  if (eventError) throw eventError;
  const latest = new Map();
  for (const event of events || []) if (!latest.has(String(event.student_id))) latest.set(String(event.student_id), event);
  res.json((data || []).map(student => ({ ...student, last_gate_event: latest.get(String(student.id)) || null })));
}));

app.get('/api/hostels', ...auth, requireRoles('admin', 'hostel_staff'), asyncRoute(async (req, res) => {
  const { data, error } = await db.from('hostels').select('id,name,active').eq('active', true).order('name');
  if (error) throw error;
  if (req.schoolUser.role === 'admin') return res.json(data || []);
  const { data: links, error: linkError } = await db.from('hostel_staff_assignments').select('hostel_id').eq('user_id', req.schoolUser.id);
  if (linkError) throw linkError;
  const ids = (links || []).map(row => row.hostel_id);
  res.json((data || []).filter(h => ids.includes(h.id)));
}));

app.post('/api/hostels', ...auth, requireRoles('admin'), asyncRoute(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 80) return res.status(400).json({ error: 'Enter a hostel name up to 80 characters.' });
  const { data, error } = await db.from('hostels').insert({ name }).select().single();
  if (error?.code === '23505') return res.status(409).json({ error: 'A hostel with this name already exists.' });
  if (error) throw error;
  res.status(201).json(data);
}));

app.post('/api/hostels/:id/staff', ...auth, requireRoles('admin'), asyncRoute(async (req, res) => {
  const hostelId = Number(req.params.id), userId = Number(req.body?.userId);
  if (![hostelId, userId].every(Number.isInteger)) return res.status(400).json({ error: 'Choose a hostel and hostel supervisor.' });
  const { data: user, error: userError } = await db.from('users').select('id,role').eq('id', userId).maybeSingle();
  if (userError) throw userError;
  if (!user || user.role !== 'hostel_staff') return res.status(400).json({ error: 'Assign a user with the Hostel Supervisor role.' });
  const { error } = await db.from('hostel_staff_assignments').upsert({ hostel_id: hostelId, user_id: userId }, { onConflict: 'hostel_id,user_id' });
  if (error) throw error;
  res.status(204).end();
}));

app.post('/api/users/campus-staff', ...auth, requireRoles('admin'), asyncRoute(async (req, res) => {
  const name = String(req.body?.name || '').trim(), email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || ''), phone = String(req.body?.phone || '').trim() || null;
  const role = req.body?.role, initials = String(req.body?.initials || '').slice(0, 4);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6 || !['security_guard', 'hostel_staff'].includes(role)) {
    return res.status(400).json({ error: 'Enter a name, valid email, six-character password and a campus staff role.' });
  }
  const { data: created, error: authError } = await db.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: name }
  });
  if (authError) return res.status(409).json({ error: authError.message || 'Could not create the account.' });
  const { data, error } = await db.from('users').insert({
    auth_user_id: created.user.id, name, email, role, staff_role: null, phone,
    initials, tone: 'blue', is_mentor: false, password: null, password_hash: null, password_salt: null
  }).select('id,name,email,role,phone,initials,tone').single();
  if (error) {
    await db.auth.admin.deleteUser(created.user.id).catch(() => {});
    if (error.code === '23505') return res.status(409).json({ error: 'A school account with this email already exists.' });
    throw error;
  }
  res.status(201).json(data);
}));

app.post('/api/users/:id/password', ...auth, requireRoles('admin'), asyncRoute(async (req, res) => {
  const userId = Number(req.params.id), password = String(req.body?.password || '');
  if (!Number.isInteger(userId) || password.length < 6) return res.status(400).json({ error: 'Use a password with at least six characters.' });
  const { data: user, error } = await db.from('users').select('auth_user_id,role').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!user || !['security_guard', 'hostel_staff'].includes(user.role) || !user.auth_user_id) return res.status(404).json({ error: 'Campus staff account is not linked to Supabase Auth.' });
  const { error: updateError } = await db.auth.admin.updateUserById(user.auth_user_id, { password });
  if (updateError) return res.status(400).json({ error: updateError.message || 'Password update failed.' });
  res.status(204).end();
}));

app.post('/api/students/:id/residence', ...auth, requireRoles('admin'), asyncRoute(async (req, res) => {
  const studentId = Number(req.params.id), residence = req.body?.residenceStatus, hostelId = req.body?.hostelId ? Number(req.body.hostelId) : null;
  if (!Number.isInteger(studentId) || !['BOARDER', 'DAY_STUDENT'].includes(residence) || residence === 'BOARDER' && !Number.isInteger(hostelId)) return res.status(400).json({ error: 'Boarders must be assigned to a hostel.' });
  const { data, error } = await db.from('students').update({ residence_status: residence, hostel_id: residence === 'BOARDER' ? hostelId : null }).eq('id', studentId).select('id,residence_status,hostel_id').maybeSingle();
  if (error) throw error;
  if (!data) return res.status(404).json({ error: 'Student not found.' });
  res.json(data);
}));

app.get('/api/timetable-swaps', ...auth, requireRoles('admin', 'teacher'), asyncRoute(async (req, res) => {
  let query = db.from('timetable_swaps').select('*,timetables(class_id,subject_id,time_slot_id,teacher_id,subjects(name),classes(class_name)),covering:users!timetable_swaps_covering_teacher_id_fkey(name),requester:users!timetable_swaps_requested_by_fkey(name)').order('created_at', { ascending: false }).limit(100);
  if (req.schoolUser.role !== 'admin') query = query.or(`requested_by.eq.${req.schoolUser.id},covering_teacher_id.eq.${req.schoolUser.id}`);
  const { data, error } = await query;
  if (error) throw error;
  res.json(data || []);
}));

app.get('/api/teacher/periods', ...auth, requireRoles('admin', 'teacher'), asyncRoute(async (req, res) => {
  const now = new Date(), weekday = localParts(now).weekday, date = dayKey(now);
  const termId = await currentTermId();
  if (!termId) return res.json([]);
  const { data: slots, error: slotError } = await db.from('time_slots').select('id,start_time,end_time').eq('day_of_week', weekday).order('start_time');
  if (slotError) throw slotError;
  if (!(slots || []).length) return res.json([]);
  const { data: periods, error } = await db.from('timetables').select('id,class_id,subject_id,teacher_id,time_slot_id,subjects(name),classes(class_name)').eq('term_id', termId).in('time_slot_id', slots.map(s => s.id));
  if (error) throw error;
  const results = [];
  for (const period of periods || []) {
    const { data: swap } = await db.from('timetable_swaps').select('covering_teacher_id,status').eq('timetable_id', period.id).eq('effective_date', date).eq('status', 'approved').order('decided_at', { ascending: false }).limit(1).maybeSingle();
    const effectiveTeacherId = Number(swap?.covering_teacher_id || period.teacher_id);
    if (req.schoolUser.role !== 'admin' && effectiveTeacherId !== Number(req.schoolUser.id)) continue;
    const { data: students, error: studentsError } = await db.from('students').select('id,admission_no,users!students_user_id_fkey(name)').eq('class_id', period.class_id).neq('status', 'archived').order('admission_no');
    if (studentsError) throw studentsError;
    const { data: attendance, error: attendanceError } = await db.from('class_period_attendance').select('student_id,status').eq('timetable_id', period.id).eq('attendance_date', date);
    if (attendanceError) throw attendanceError;
    const marks = new Map((attendance || []).map(a => [String(a.student_id), a.status]));
    const slot = slots.find(s => Number(s.id) === Number(period.time_slot_id));
    results.push({ ...period, effectiveTeacherId, slot, students: (students || []).map(s => ({ id: s.id, name: s.users?.name, admission_no: s.admission_no, status: marks.get(String(s.id)) || null })) });
  }
  results.sort((a, b) => String(a.slot.start_time).localeCompare(String(b.slot.start_time)));
  res.json(results);
}));

app.post('/api/gate/events', ...auth, requireRoles('admin', 'security_guard'), asyncRoute(async (req, res) => {
  const studentId = Number(req.body?.studentId), eventType = req.body?.eventType, method = req.body?.method || 'manual';
  if (!Number.isInteger(studentId) || !['arrival', 'pickup'].includes(eventType) || !['manual', 'qr', 'rfid'].includes(method)) return res.status(400).json({ error: 'Student, event type and capture method are required.' });
  const { data: student, error: studentError } = await db.from('students').select('id,residence_status,users!students_user_id_fkey(name)').eq('id', studentId).maybeSingle();
  if (studentError) throw studentError;
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  if (student.residence_status !== 'DAY_STUDENT') return res.status(409).json({ error: 'Gate arrival and pickup are only for day students.' });
  const { data: event, error } = await db.from('gate_events').insert({ student_id: studentId, event_type: eventType, method, recorded_by: req.schoolUser.id }).select().single();
  if (error) throw error;
  const parents = await linkedParents(studentId);
  const message = `${student.users?.name || 'Your child'} ${eventType === 'arrival' ? 'arrived at school' : 'was picked up from school'} at ${new Date(event.event_at).toLocaleTimeString('en-NG', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })}.`;
  const sends = await Promise.all(parents.filter(p => p.phone).map(p => sendSms(p.phone, message)));
  const statuses = sends.map(r => r.status);
  const smsStatus = !statuses.length ? 'not_configured' : statuses.includes('failed') ? 'failed' : statuses.includes('sent') ? 'sent' : 'not_configured';
  await db.from('gate_events').update({ parent_sms_status: smsStatus, parent_sms_error: sends.find(r => r.error)?.error || null }).eq('id', event.id);
  await Promise.all(parents.map(p => deliverPush(p.id, { title: 'School gate update', body: message, url: '/' }).catch(() => {})));
  res.status(201).json({ ...event, parent_sms_status: smsStatus });
}));

app.get('/api/hostel/dashboard', ...auth, requireRoles('admin', 'hostel_staff'), asyncRoute(async (req, res) => {
  const { data: hostels, error: hostelError } = await db.from('hostels').select('id,name,active').eq('active', true);
  if (hostelError) throw hostelError;
  let assigned = hostels || [];
  if (req.schoolUser.role !== 'admin') {
    const { data: links, error } = await db.from('hostel_staff_assignments').select('hostel_id').eq('user_id', req.schoolUser.id);
    if (error) throw error;
    const ids = (links || []).map(x => x.hostel_id);
    assigned = assigned.filter(h => ids.includes(h.id));
  }
  const date = dayKey(new Date());
  const result = await Promise.all(assigned.map(async hostel => {
    const { data: students, error: studentError } = await db.from('students').select('id,admission_no,residence_status,users!students_user_id_fkey(name),classes(class_name)')
      .eq('residence_status', 'BOARDER').eq('hostel_id', hostel.id).neq('status', 'archived');
    if (studentError) throw studentError;
    const ids = (students || []).map(s => s.id);
    const { data: events, error: eventsError } = ids.length
      ? await db.from('hostel_presence_events').select('*').eq('hostel_id', hostel.id).eq('event_date', date).in('student_id', ids).order('created_at')
      : { data: [], error: null };
    if (eventsError) throw eventsError;
    const lastByStudent = new Map();
    for (const event of events || []) lastByStudent.set(String(event.student_id), event);
    const roster = (students || []).map(s => ({ ...s, name: s.users?.name, class_name: s.classes?.class_name, presence: lastByStudent.get(String(s.id))?.event_type === 'check_in' ? 'present' : 'out' }));
    const { data: summary, error: summaryError } = await db.from('hostel_daily_summaries').select('*').eq('hostel_id', hostel.id).eq('summary_date', date).maybeSingle();
    if (summaryError) throw summaryError;
    return { ...hostel, date, roster, summary: summary || { checked_in_count: 0, checked_out_count: 0, auto_checkout_count: 0 } };
  }));
  res.json(result);
}));

app.post('/api/hostel/presence', ...auth, requireRoles('admin', 'hostel_staff'), asyncRoute(async (req, res) => {
  const hostelId = Number(req.body?.hostelId), studentId = Number(req.body?.studentId), eventType = req.body?.eventType;
  if (![hostelId, studentId].every(Number.isInteger) || !['check_in', 'check_out'].includes(eventType)) return res.status(400).json({ error: 'Hostel, student and presence event are required.' });
  if (req.schoolUser.role !== 'admin') {
    const { data, error } = await db.from('hostel_staff_assignments').select('id').eq('hostel_id', hostelId).eq('user_id', req.schoolUser.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(403).json({ error: 'You are not assigned to this hostel.' });
  }
  const { data: student, error: studentError } = await db.from('students').select('residence_status,hostel_id').eq('id', studentId).maybeSingle();
  if (studentError) throw studentError;
  if (!student || student.residence_status !== 'BOARDER' || Number(student.hostel_id) !== hostelId) return res.status(409).json({ error: 'This student is not assigned to the selected hostel.' });
  const { data, error } = await db.from('hostel_presence_events').insert({ hostel_id: hostelId, student_id: studentId, event_type: eventType, recorded_by: req.schoolUser.id, event_date: dayKey(new Date()) }).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

app.post('/api/timetable-swaps', ...auth, requireRoles('admin', 'teacher'), asyncRoute(async (req, res) => {
  const timetableId = Number(req.body?.timetableId), coveringTeacherId = Number(req.body?.coveringTeacherId), reason = String(req.body?.reason || '').trim();
  if (![timetableId, coveringTeacherId].every(Number.isInteger) || reason.length < 3) return res.status(400).json({ error: 'Choose a period, covering teacher and reason.' });
  const { data: period, error: periodError } = await db.from('timetables').select('id,teacher_id').eq('id', timetableId).maybeSingle();
  if (periodError) throw periodError;
  if (!period) return res.status(404).json({ error: 'Timetable period not found.' });
  if (req.schoolUser.role !== 'admin' && Number(period.teacher_id) !== Number(req.schoolUser.id)) return res.status(403).json({ error: 'Only the assigned teacher can request cover for this period.' });
  const { data: cover, error: coverError } = await db.from('users').select('id,role').eq('id', coveringTeacherId).maybeSingle();
  if (coverError) throw coverError;
  if (!cover || !['teacher', 'hod'].includes(cover.role)) return res.status(400).json({ error: 'Cover must be an active teacher.' });
  const { data, error } = await db.from('timetable_swaps').insert({ timetable_id: timetableId, covering_teacher_id: coveringTeacherId, requested_by: req.schoolUser.id, reason, effective_date: dayKey(new Date()), status: req.schoolUser.role === 'admin' ? 'approved' : 'pending', approved_by: req.schoolUser.role === 'admin' ? req.schoolUser.id : null, decided_at: req.schoolUser.role === 'admin' ? new Date().toISOString() : null }).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

app.post('/api/timetable-swaps/:id/decision', ...auth, requireRoles('admin'), asyncRoute(async (req, res) => {
  const status = req.body?.status;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Decision must be approved or rejected.' });
  const { data, error } = await db.from('timetable_swaps').update({ status, approved_by: req.schoolUser.id, decided_at: new Date().toISOString() }).eq('id', Number(req.params.id)).eq('status', 'pending').select().maybeSingle();
  if (error) throw error;
  if (!data) return res.status(404).json({ error: 'Pending cover request not found.' });
  res.json(data);
}));

app.post('/api/period-attendance', ...auth, requireRoles('admin', 'teacher'), asyncRoute(async (req, res) => {
  const timetableId = Number(req.body?.timetableId), studentId = Number(req.body?.studentId), status = req.body?.status, date = req.body?.date || dayKey(new Date());
  if (![timetableId, studentId].every(Number.isInteger) || !['present', 'absent', 'late', 'excused'].includes(status) || date !== dayKey(new Date())) return res.status(400).json({ error: 'Valid period, student, status and current school date are required.' });
  const { data: period, error } = await db.from('timetables').select('id,class_id,teacher_id').eq('id', timetableId).maybeSingle();
  if (error) throw error;
  if (!period) return res.status(404).json({ error: 'Period not found.' });
  let effectiveTeacher = Number(period.teacher_id);
  const { data: swap, error: swapError } = await db.from('timetable_swaps').select('covering_teacher_id').eq('timetable_id', timetableId).eq('effective_date', date).eq('status', 'approved').order('decided_at', { ascending: false }).limit(1).maybeSingle();
  if (swapError) throw swapError;
  if (swap) effectiveTeacher = Number(swap.covering_teacher_id);
  if (req.schoolUser.role !== 'admin' && Number(req.schoolUser.id) !== effectiveTeacher) return res.status(403).json({ error: 'Only the assigned or approved covering teacher can mark this period.' });
  const { data: student, error: studentError } = await db.from('students').select('id,class_id').eq('id', studentId).maybeSingle();
  if (studentError) throw studentError;
  if (!student || Number(student.class_id) !== Number(period.class_id)) return res.status(400).json({ error: 'Student is not in this period’s class.' });
  const { data, error: writeError } = await db.from('class_period_attendance').upsert({ timetable_id: timetableId, student_id: studentId, attendance_date: date, status, recorded_by: req.schoolUser.id }, { onConflict: 'timetable_id,student_id,attendance_date' }).select().single();
  if (writeError) throw writeError;
  res.status(200).json(data);
}));

async function dispatchUpcomingClasses() {
  if (!vapidReady) return;
  const termId = await currentTermId();
  if (!termId) return;
  const now = new Date(), local = localParts(now);
  const target = new Date(now.getTime() + 5 * 60 * 1000), targetLocal = localParts(target);
  if (local.weekday !== targetLocal.weekday) return;
  const { data: slots, error: slotError } = await db.from('time_slots').select('id,end_time').eq('day_of_week', targetLocal.weekday);
  if (slotError) throw slotError;
  const minuteOfDay = Number(targetLocal.hour) * 60 + Number(targetLocal.minute);
  const dueSlots = (slots || []).filter(slot => {
    const [h, m] = String(slot.end_time).split(':').map(Number);
    return h * 60 + m === minuteOfDay;
  });
  if (!dueSlots.length) return;
  const { data: periods, error } = await db.from('timetables').select('id,teacher_id,subject_id,class_id,subjects(name),classes(class_name)')
    .eq('term_id', termId).in('time_slot_id', dueSlots.map(s => s.id));
  if (error) throw error;
  for (const period of periods || []) {
    const date = dayKey(now);
    const { data: swap } = await db.from('timetable_swaps').select('covering_teacher_id').eq('timetable_id', period.id).eq('effective_date', date).eq('status', 'approved').order('decided_at', { ascending: false }).limit(1).maybeSingle();
    if (!swap?.covering_teacher_id && !period.teacher_id) continue;
    const teacherId = Number(swap?.covering_teacher_id || period.teacher_id);
    const dispatchKey = `attendance:${period.id}:${date}:${teacherId}`;
    const { error: insertError } = await db.from('notification_dispatches').insert({ dispatch_key: dispatchKey, user_id: teacherId, notification_type: 'period_attendance_due' });
    if (insertError?.code === '23505') continue;
    if (insertError) throw insertError;
    await deliverPush(teacherId, {
      title: 'Attendance due soon',
      body: `${period.subjects?.name || 'Class'} · ${period.classes?.class_name || 'your class'} ends in 5 minutes. Please submit attendance.`,
      url: '/'
    });
  }
}

async function autoCheckoutHostels() {
  const now = new Date(), local = localParts(now), date = dayKey(now);
  const closeAt = process.env.HOSTEL_CHECKOUT_LOCAL_TIME || '22:00';
  const hm = `${local.hour}:${local.minute}`;
  if (hm < closeAt) return;
  const { data: hostels, error } = await db.from('hostels').select('id').eq('active', true);
  if (error) throw error;
  for (const hostel of hostels || []) {
    const { data: students, error: studentError } = await db.from('students').select('id').eq('residence_status', 'BOARDER').eq('hostel_id', hostel.id).neq('status', 'archived');
    if (studentError) throw studentError;
    for (const student of students || []) {
      const { data: last, error: lastError } = await db.from('hostel_presence_events').select('event_type').eq('hostel_id', hostel.id).eq('student_id', student.id).eq('event_date', date).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (lastError) throw lastError;
      if (last?.event_type !== 'check_in') continue;
      await db.from('hostel_presence_events').insert({ hostel_id: hostel.id, student_id: student.id, event_type: 'auto_checkout', event_date: date, note: 'Automatic day close.' });
    }
    const { data: todayEvents, error: summaryError } = await db.from('hostel_presence_events').select('event_type').eq('hostel_id', hostel.id).eq('event_date', date);
    if (summaryError) throw summaryError;
    const events = todayEvents || [];
    const summary = {
      hostel_id: hostel.id, summary_date: date,
      checked_in_count: events.filter(e => e.event_type === 'check_in').length,
      checked_out_count: events.filter(e => e.event_type === 'check_out').length,
      auto_checkout_count: events.filter(e => e.event_type === 'auto_checkout').length
    };
    await db.from('hostel_daily_summaries').upsert(summary, { onConflict: 'hostel_id,summary_date' });
  }
}

app.use((err, _req, res, _next) => {
  console.error('[school-api]', err?.message || err);
  res.status(500).json({ error: 'The request could not be completed.' });
});

const httpServer = app.listen(port, () => console.log(`[school-api] listening on :${port}; timezone=${timezone}; push=${vapidReady}`));
httpServer.requestTimeout = 0;
setInterval(() => dispatchUpcomingClasses().catch(err => console.error('[scheduler] class reminders:', err.message)), 30_000);
setInterval(() => autoCheckoutHostels().catch(err => console.error('[scheduler] hostel close:', err.message)), 60_000);
