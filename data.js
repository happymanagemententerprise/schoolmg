// ============================================================
//  Happy Man Academy — Data Layer (Supabase-backed)
//
//  Strategy: load everything from Supabase into an in-memory cache
//  on startup, expose a synchronous read API for app.js, and flush
//  writes back to Supabase in the background.
//
//  Curriculum model
//    classes  : level JSS (Grade 7-9) or SS (Grade 10-12),
//               senior classes carry a stream: Science |
//               Commercial | Arts
//    subjects : level JSS | SS | BOTH and group General |
//               Science | Commercial | Arts
//    timetable: generated for the whole school without booking a
//               teacher into two classes at the same time
// ============================================================

// ── Supabase client (inline to avoid module issues in plain HTML) ──
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const _sb = createClient(
  'https://erlhyrswcqpqpqzbgmgb.supabase.co',
  'sb_publishable_khuN_STEq5Pi5VqpfpqYzw_FvHQAgPj'
);

// ── In-memory store ──────────────────────────────────────────
const _cache = {
  session:        null,   // { id, name, currentTerm, uploadOpen, terms[] }
  users:          [],
  subjects:       [],
  classes:        [],
  students:       [],
  mentors:        [],     // teachers who can mentor
  scores:         {},     // { studentId: { subjectId: { term: {test,exam} } } }
  assignments:    [],
  events:         [],
  teacherSubjects:[],
  departments:    [],
  attendance:     {},     // { term: { studentId: { W1: days, ... } } }
  feedback:       {},     // { studentId: { term, text, submitted } }
  timetables:     [],     // generated timetable rows
  timeSlots:      [],
  loaded:         false,
  failed:         []      // tables that could not be read
};

// ── localStorage fallback for session persistence ───────────
const DB = {
  get(key)     { try { return JSON.parse(localStorage.getItem('hma_' + key)); } catch { return null; } },
  set(key, val){ localStorage.setItem('hma_' + key, JSON.stringify(val)); }
};

// ── Query map: one failure must not break the whole app ─────
const _sources = {
  session:      () => _sb.from('sessions').select('*').eq('is_current', true).limit(1),
  terms:        () => _sb.from('terms').select('*'),
  users:        () => _sb.from('users').select('*').order('id'),
  subjects:     () => _sb.from('subjects').select('*').order('name'),
  classes:      () => _sb.from('classes').select('*, teacher_classes(teacher_id)').order('year'),
  students:     () => _sb.from('students').select('*, users(name,initials,tone,phone,email,role), classes(class_name)'),
  parents:      () => _sb.from('parent_students').select('*'),
  teacherSubs:  () => _sb.from('teacher_subjects').select('*'),
  departments:  () => _sb.from('departments').select('*'),
  grades:       () => _sb.from('grades').select('*'),
  attendance:   () => _sb.from('attendance_weekly').select('*'),
  assignments:  () => _sb.from('assignments').select('*'),
  events:       () => _sb.from('events').select('*').order('date'),
  remarks:      () => _sb.from('remarks').select('*'),
  timetables:   () => _sb.from('timetables').select('*'),
  timeSlots:    () => _sb.from('time_slots').select('*')
};

// ── Map raw database rows into the synchronous cache ─────────
// Shared by the live Supabase read and the bundled demo school so both
// paths always produce the same cache shape.
function _hydrate(raw) {
  // ── session + terms
  _cache.session = _mapSession(raw.session, raw.terms);

  // ── subjects
  _cache.subjects = raw.subjects.map(s => ({
    id:    String(s.id),
    name:  s.name,
    code:  s.code || s.name.slice(0, 2).toUpperCase(),
    type:  s.is_core ? 'core' : 'additional',
    color: s.color || 'blue',
    level: s.level  || 'BOTH',            // JSS | SS | BOTH
    group: s.group_name || 'General'      // General | Science | Commercial | Arts
  }));

  // ── classes
  _cache.classes = raw.classes.map(c => ({
    id:             String(c.id),
    name:           c.class_name,
    level:          c.level  || null,     // JSS | SS
    stream:         c.stream || null,     // Science | Commercial | Arts
    year:           c.year   ?? null,     // 7 - 12
    classTeacherId: c.teacher_classes?.[0]?.teacher_id
                      ? String(c.teacher_classes[0].teacher_id)
                      : null
  }));

  // ── students
  _cache.students = raw.students.map(s => ({
    id:          String(s.id),
    _userId:     s.user_id ? String(s.user_id) : null,
    name:        s.users?.name || `Student ${s.id}`,
    initials:    s.users?.initials || avatarInitials(s.users?.name || ''),
    tone:        s.users?.tone || 'blue',
    classId:     String(s.class_id),
    className:   s.classes?.class_name || null,
    mentorId:    s.mentor_id ? String(s.mentor_id) : null,
    gender:      s.gender || 'M',
    admissionNo: s.admission_no
  }));

  // ── users (admins, teachers, students, parents)
  const studentByUser = new Map(_cache.students.map(s => [s._userId, s.id]));
  const childMap = {};
  raw.parents.forEach(p => {
    const key = String(p.parent_id);
    (childMap[key] = childMap[key] || []).push(String(p.student_id));
  });

  _cache.users = raw.users.map(u => ({
    id:           String(u.id),
    role:         _mapRole(u.role, u.staff_role),
    name:         u.name,
    initials:     u.initials || avatarInitials(u.name),
    tone:         u.tone || 'blue',
    email:        u.email,
    phone:        u.phone || null,
    password:     u.password,
    isMentor:     !!u.is_mentor,
    mentorSubject: u.mentor_subject || '',
    mentorBio:    u.mentor_bio || 'Experienced educator and mentor.',
    studentId:    studentByUser.get(String(u.id)) || null,
    childIds:     childMap[String(u.id)] || []
  }));

  // ── teacher_subjects (mapped before mentors so mentor subjects resolve)
  _cache.teacherSubjects = raw.teacherSubs.map(r => ({
    id: r.id ? String(r.id) : null,
    teacherId: String(r.teacher_id),
    subjectId: String(r.subject_id),
    classId:   String(r.class_id)
  }));

  // ── mentors: every teacher can mentor, the flagged ones lead the list
  _cache.mentors = _cache.users
    .filter(u => STAFF_ROLES.includes(u.role))
    .map(u => {
      const taught = _cache.teacherSubjects
        .filter(ts => ts.teacherId === u.id)
        .map(ts => _cache.subjects.find(s => s.id === ts.subjectId)?.code)
        .filter(Boolean);
      return {
        id:       u.id,
        name:     u.name,
        initials: u.initials,
        tone:     u.tone,
        phone:    u.phone,
        role:     u.role,
        isMentor: u.isMentor,
        subject:  u.mentorSubject || ([...new Set(taught)].slice(0, 2).join(', ') || 'General'),
        bio:      u.mentorBio
      };
    })
    .sort((a, b) => Number(b.isMentor) - Number(a.isMentor));

  // ── scores — grades table → nested object
  _cache.scores = {};
  for (const g of raw.grades) {
    const sid = String(g.student_id);
    const sub = String(g.subject_id);
    if (!_cache.scores[sid]) _cache.scores[sid] = {};
    if (!_cache.scores[sid][sub]) _cache.scores[sid][sub] = {};
    _cache.scores[sid][sub][_termNumFromId(g.term_id)] = {
      test: Number(g.ca_score)   || 0,   // continuous assessment, max 40
      exam: Number(g.exam_score) || 0    // examination,        max 60
    };
  }

  // ── assignments
  _cache.assignments = raw.assignments.map(a => ({
    id:        String(a.id),
    title:     a.title,
    subjectId: String(a.subject_id),
    classId:   String(a.class_id),
    teacherId: String(a.teacher_id),
    term:      _termNumFromId(a.term_id),
    due:       a.due_date,
    note:      a.description || ''
  }));

  // ── events
  _cache.events = raw.events.map(e => ({
    id: String(e.id), title: e.title, date: e.date,
    type: e.type || 'academic', note: e.note || ''
  }));

  // ── departments
  _cache.departments = raw.departments.map(d => ({
    id:         String(d.id),
    name:       d.name,
    hodId:      d.hod_id ? String(d.hod_id) : null,
    subjectIds: (d.subject_ids || []).map(String)
  }));

  // ── weekly attendance, grouped per term
  _cache.attendance = {};
  for (const a of raw.attendance) {
    const term = _termNumFromId(a.term_id);
    const sid  = String(a.student_id);
    _cache.attendance[term] = _cache.attendance[term] || {};
    _cache.attendance[term][sid] = _cache.attendance[term][sid] || {};
    _cache.attendance[term][sid][`W${a.week_number || 1}`] = a.days_present || 0;
  }

  // ── teacher remarks — prefer the remark for the current term
  _cache.feedback = {};
  const curTerm = _cache.session?.currentTerm;
  for (const r of raw.remarks) {
    const sid  = String(r.student_id);
    const term = _termNumFromId(r.term_id);
    const existing = _cache.feedback[sid];
    if (!existing || (term === curTerm && existing.term !== curTerm)) {
      _cache.feedback[sid] = {
        term,
        text:      r.teacher_remark || '',
        submitted: !!(r.teacher_remark && r.teacher_remark.trim())
      };
    }
  }

  // ── timetables
  _cache.timeSlots  = raw.timeSlots.map(t => ({
    id: t.id, day: t.day_of_week, start: t.start_time, end: t.end_time
  }));
  _cache.timetables = raw.timetables.map(t => ({
    id:         String(t.id),
    classId:    String(t.class_id),
    subjectId:  String(t.subject_id),
    teacherId:  t.teacher_id ? String(t.teacher_id) : null,
    timeSlotId: t.time_slot_id ? String(t.time_slot_id) : null,
    term:       _termNumFromId(t.term_id)
  }));

  _cache.loaded = true;
}

// ── Bootstrap — called once from DOMContentLoaded ────────────
async function loadFromSupabase() {
  const keys = Object.keys(_sources);
  const settled = await Promise.allSettled(keys.map(k => _sources[k]()));
  const raw = {};
  keys.forEach((k, i) => {
    if (settled[i].status === 'fulfilled' && !settled[i].value.error) raw[k] = settled[i].value.data || [];
    else {
      _cache.failed.push(k);
      raw[k] = [];
    }
  });

  if (!raw.session.length) _ensureSession();
  _hydrate(raw);
  if (_cache.failed.length) console.warn('[HMA] could not read:', _cache.failed.join(', '));
  // Offline, wrong key, or a database that has not been migrated yet
  if (!_cache.users.length && !_cache.students.length) _loadSeedFallback();
  console.log('[HMA] Supabase data loaded ✓');
}

// ── Session mapping ─────────────────────────────────────────
function _mapSession(sessionRows, termRows) {
  const sessRow = (sessionRows || [])[0];
  const name    = sessRow?.name || '2026 / 2027';
  const myTerms = (termRows || []).filter(t => String(t.session_id) === String(sessRow?.id));
  const terms   = myTerms.length
    ? myTerms
        .map(t => ({
          _id:      t.id,
          term:     ['1st Term', '2nd Term', '3rd Term'].indexOf(t.name) + 1,
          name:     t.name,
          isCurrent: !!t.is_current,
          start:    t.start_date,
          end:      t.end_date
        }))
        .sort((a, b) => a.term - b.term)
    : [
        { _id: null, term: 1, name: '1st Term', isCurrent: true,  start: null, end: null },
        { _id: null, term: 2, name: '2nd Term', isCurrent: false, start: null, end: null },
        { _id: null, term: 3, name: '3rd Term', isCurrent: false, start: null, end: null }
      ];
  const current = terms.find(t => t.isCurrent) || terms[0];
  return {
    _id:         sessRow?.id || null,
    name,
    currentTerm: current.term,
    uploadOpen:  sessRow?.upload_open || { test: false, exam: false },
    terms
  };
}

// If the school has no session yet, create the current one.
async function _ensureSession() {
  try {
    const { data: s } = await _sb.from('sessions')
      .insert({ name: '2026 / 2027', is_current: true, upload_open: { test: false, exam: true } })
      .select().single();
    if (!s) return;
    await _sb.from('terms').insert([
      { session_id: s.id, name: '1st Term', is_current: true,  start_date: '2026-09-07', end_date: '2026-12-18' },
      { session_id: s.id, name: '2nd Term', is_current: false, start_date: '2027-01-11', end_date: '2027-04-09' },
      { session_id: s.id, name: '3rd Term', is_current: false, start_date: '2027-04-26', end_date: '2027-07-23' }
    ]);
    console.log('[HMA] created a default academic session');
  } catch (err) {
    console.warn('[HMA] could not create a session:', err?.message || err);
  }
}

// ── Helpers ────────────────────────────────────────────────
function _termNumFromId(termId) {
  if (!termId || !_cache.session) return 1;
  const t = _cache.session.terms.find(t => String(t._id) === String(termId));
  return t ? t.term : 1;
}
function _termIdFromNum(num) {
  if (!_cache.session) return null;
  const t = _cache.session.terms.find(t => t.term === Number(num));
  return t ? t._id : null;
}
function avatarInitials(n) {
  if (!n) return '?';
  return n.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

// ── Fallback — used when the database is unreachable or un-migrated ──
// A localStorage mirror wins; with no mirror either, the app boots a
// bundled demo school so the prototype stays explorable without a backend.
function _loadSeedFallback() {
  if (!DB.get('users')?.length) { _loadDemoSchool(); return; }

  _cache.session = DB.get('session') || {
    _id: null, name: '2026 / 2027', currentTerm: 1,
    uploadOpen: { test: false, exam: true },
    terms: [
      { _id: null, term: 1, name: '1st Term', start: null, end: null },
      { _id: null, term: 2, name: '2nd Term', start: null, end: null },
      { _id: null, term: 3, name: '3rd Term', start: null, end: null }
    ]
  };
  _cache.users          = DB.get('users')          || [];
  _cache.subjects       = DB.get('subjects')       || [];
  _cache.classes        = DB.get('classes')        || [];
  _cache.students       = DB.get('students')       || [];
  _cache.assignments    = DB.get('assignments')    || [];
  _cache.events         = DB.get('events')         || [];
  _cache.teacherSubjects= DB.get('teacherSubjects')|| [];
  _cache.departments    = DB.get('departments')    || [];
  _cache.attendance     = DB.get('attendance')     || {};
  _cache.feedback       = DB.get('feedback')       || {};
  _cache.mentors        = _cache.users
    .filter(u => STAFF_ROLES.includes(u.role))
    .map(u => ({ id: u.id, name: u.name, initials: u.initials, tone: u.tone,
                 phone: u.phone, role: u.role, isMentor: !!u.isMentor,
                 subject: u.mentorSubject || 'General', bio: u.mentorBio || '' }));
  _cache.loaded = true;
  console.warn('[HMA] running on local cache — data is read-only');
}

// ── Bundled demo school ───────────────────────────────────────
// Mirrors supabase/seed.sql so every screen has data without a
// backend. Nothing here is persisted; edits stay in memory only.
function _loadDemoSchool() {
  // Deterministic pseudo-random so the demo is stable across reloads
  const rand = seed => { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  const session = [{ id: 1, name: '2026 / 2027', is_current: true, upload_open: { test: false, exam: true } }];
  const terms = [
    { id: 1, session_id: 1, name: '1st Term', is_current: true,  start_date: '2026-09-07', end_date: '2026-12-18' },
    { id: 2, session_id: 1, name: '2nd Term', is_current: false, start_date: '2027-01-11', end_date: '2027-04-09' },
    { id: 3, session_id: 1, name: '3rd Term', is_current: false, start_date: '2027-04-26', end_date: '2027-07-23' }
  ];

  const SUBJECTS = [
    ['English Studies','ENG',true,'BOTH','General','blue'],
    ['Mathematics','MAT',true,'BOTH','General','green'],
    ['Nigerian History','NHI',false,'BOTH','General','coral'],
    ['Yoruba','YOR',false,'BOTH','General','yellow'],
    ['Hausa','HAU',false,'BOTH','General','coral'],
    ['Igbo','IGB',false,'BOTH','General','green'],
    ['Christian Religious Studies','CRS',false,'BOTH','General','blue'],
    ['Islamic Studies','ISL',false,'BOTH','General','green'],
    ['Intermediate Science','ISC',false,'JSS','General','coral'],
    ['Social and Citizenship Studies','SOC',false,'JSS','General','blue'],
    ['Digital Technologies','DGT',false,'JSS','General','yellow'],
    ['Physical & Health Education','PHE',false,'JSS','General','green'],
    ['Cultural & Creative Arts','CCA',false,'JSS','General','coral'],
    ['Business Studies','BUS',false,'JSS','General','yellow'],
    ['Physics','PHY',false,'SS','Science','blue'],
    ['Chemistry','CHM',false,'SS','Science','coral'],
    ['Biology','BIO',false,'SS','Science','green'],
    ['Further Mathematics','FUR',false,'SS','Science','yellow'],
    ['Agricultural Science','AGR',false,'SS','Science','green'],
    ['Technical Drawing','TEC',false,'SS','Science','blue'],
    ['Geography','GEO',false,'SS','Science','coral'],
    ['Foods & Nutrition','FNS',false,'SS','Science','yellow'],
    ['Health Education','HEL',false,'SS','Science','green'],
    ['Financial Accounting','ACC',false,'SS','Commercial','blue'],
    ['Commerce','COM',false,'SS','Commercial','coral'],
    ['Economics','ECO',false,'SS','Commercial','green'],
    ['Marketing','MKT',false,'SS','Commercial','yellow'],
    ['Office Practice','OFF',false,'SS','Commercial','blue'],
    ['Literature-in-English','LIT',false,'SS','Arts','coral'],
    ['Government','GOV',false,'SS','Arts','blue'],
    ['Visual Arts','VAS',false,'SS','Arts','green'],
    ['Music','MUS',false,'SS','Arts','yellow'],
    ['French','FRE',false,'SS','Arts','blue'],
    ['Arabic','ARA',false,'SS','Arts','coral']
  ];
  const subjects = SUBJECTS.map((s, i) => ({
    id: i + 1, name: s[0], code: s[1], is_core: s[2],
    level: s[3], group_name: s[4], color: s[5]
  }));

  const CLASSES = [
    ['Grade 7','JSS',null,7], ['Grade 8','JSS',null,8], ['Grade 9','JSS',null,9],
    ['Grade 10 Science','SS','Science',10], ['Grade 10 Commercial','SS','Commercial',10], ['Grade 10 Arts','SS','Arts',10],
    ['Grade 11 Science','SS','Science',11], ['Grade 11 Commercial','SS','Commercial',11], ['Grade 11 Arts','SS','Arts',11],
    ['Grade 12 Science','SS','Science',12], ['Grade 12 Commercial','SS','Commercial',12], ['Grade 12 Arts','SS','Arts',12]
  ];
  const classes = CLASSES.map((c, i) => ({
    id: i + 1, class_name: c[0], level: c[1], stream: c[2], year: c[3],
    teacher_classes: []
  }));
  const classByName = new Map(classes.map(c => [c.class_name, c]));
  const subjByName  = new Map(subjects.map(s => [s.name, s]));

  // name, email, password, role, phone, tone, staff_role, is_mentor, mentor_subject, mentor_bio
  // 20 teachers. The curriculum is 174 class+subject pairs and a teacher can
  // teach at most 30 periods a week, so the school needs this many staff for
  // a clash-free whole-school timetable.
  const USERS = [
    ['Amara Mensah','admin@happyman.edu','admin123','admin','08031234567','coral',null,false,null,null],
    // general studies
    ['Adwoa Addo','subject@happyman.edu','subject123','teacher','08031234569','green','Subject Teacher',false,null,null],
    ['Samuel Ofori','english2@happyman.edu','happyman123','teacher','08031234577','blue','Subject Teacher',false,null,null],
    ['Daniel Quaye','maths2@happyman.edu','happyman123','teacher','08031234578','coral','Subject Teacher',false,null,null],
    ['Sandra Kumi','maths3@happyman.edu','happyman123','teacher','08031234579','yellow','Subject Teacher',false,null,null],
    ['Ibrahim Musa','history@happyman.edu','happyman123','teacher','08031234580','green','Subject Teacher',false,null,null],
    ['Akosua Frimpong','yoruba@happyman.edu','happyman123','teacher','08031234582','blue','Subject Teacher',false,null,null],
    ['Kofi Mensah','languages@happyman.edu','happyman123','teacher','08031234575','blue','HOD',true,'Nigerian History','Head of General Studies. Nigerian history and social studies.'],
    ['Vida Nyarko','crs@happyman.edu','happyman123','teacher','08031234581','coral','Subject Teacher',false,null,null],
    ['Joseph Aidoo','jss2@happyman.edu','happyman123','teacher','08031234576','green','Subject Teacher',false,null,null],
    ['Zainab Haruna','islamic@happyman.edu','happyman123','teacher','08031234586','yellow','Subject Teacher',false,null,null],
    // junior secondary
    ['Kwame Owusu','class@happyman.edu','class123','teacher','08031234568','blue','Class Teacher',true,'Digital Technologies','Class teacher of Grade 7. Focused on practical computing and study habits.'],
    ['Abena Sarpong','jss@happyman.edu','happyman123','teacher','08031234574','yellow','HOD',true,'Intermediate Science','Head of Junior Secondary. Loves practical experiments with the JSS learners.'],
    ['Michael Tetteh','jss3@happyman.edu','happyman123','teacher','08031234587','coral','Subject Teacher',false,null,null],
    // science
    ['Dr. Yaw Asante','hod@happyman.edu','hod123','teacher','08031234570','yellow','HOD',false,null,null],
    ['Peter Asare','physics2@happyman.edu','happyman123','teacher','08031234583','green','Subject Teacher',false,null,null],
    ['Nii Tetteh','science2@happyman.edu','happyman123','teacher','08031234573','green','Class Teacher',true,'Health Education','Class teacher of Grade 10 Science and mentor to senior students.'],
    // commercial
    ['Fatima Bello','commercial@happyman.edu','happyman123','teacher','08031234571','coral','HOD',false,null,null],
    ['Clement Anane','commerce2@happyman.edu','happyman123','teacher','08031234584','blue','Subject Teacher',false,null,null],
    // arts
    ['Emeka Obi','arts@happyman.edu','happyman123','teacher','08031234572','blue','HOD',false,null,null],
    ['Ruth Opoku','arts2@happyman.edu','happyman123','teacher','08031234585','coral','Subject Teacher',false,null,null]
  ];
  // name, email, phone, tone
  const STUDENT_USERS = [
    ['Ama Osei','ama.osei@happyman.edu','08040000001','coral'],
    ['Yaw Boateng','yaw.boateng@happyman.edu','08040000002','blue'],
    ['Esi Armah','esi.armah@happyman.edu','08040000003','green'],
    ['Kojo Mensah','kojo.mensah@happyman.edu','08040000004','yellow'],
    ['Chidi Nwosu','chidi.nwosu@happyman.edu','08040000005','blue'],
    ['Fatima Yusuf','fatima.yusuf@happyman.edu','08040000006','coral'],
    ['Zainab Lawal','zainab.lawal@happyman.edu','08040000007','green'],
    ['Tunde Bakare','tunde.bakare@happyman.edu','08040000008','blue'],
    ['Amina Garba','amina.garba@happyman.edu','08040000009','yellow'],
    ['Tolu Akinwale','tolu.akinwale@happyman.edu','08040000010','coral'],
    ['Chidinma Eze','chidinma.eze@happyman.edu','08040000011','green']
  ];

  const users = [];
  USERS.forEach((u, i) => users.push({
    id: i + 1, name: u[0], email: u[1], password: u[2], role: u[3], phone: u[4],
    tone: u[5], staff_role: u[6], is_mentor: u[7], mentor_subject: u[8], mentor_bio: u[9]
  }));
  const staffCount = USERS.length;
  STUDENT_USERS.forEach((u, i) => users.push({
    id: staffCount + i + 1, name: u[0], email: u[1], password: 'student123',
    role: 'student', phone: u[2], tone: u[3],
    staff_role: null, is_mentor: false, mentor_subject: null, mentor_bio: null
  }));
  const parentId = users.length + 1;
  users.push({
    id: parentId, name: 'Mrs. Comfort Osei', email: 'parent@happyman.edu', password: 'parent123',
    role: 'parent', phone: '08099887766', tone: 'coral',
    staff_role: null, is_mentor: false, mentor_subject: null, mentor_bio: null
  });
  const uid = email => users.find(u => u.email === email).id;

  // one class teacher per class
  const CLASS_TEACHERS = [
    ['class@happyman.edu','Grade 7'],
    ['jss@happyman.edu','Grade 8'],
    ['languages@happyman.edu','Grade 9'],
    ['science2@happyman.edu','Grade 10 Science'],
    ['commercial@happyman.edu','Grade 11 Commercial'],
    ['arts@happyman.edu','Grade 12 Arts']
  ];
  CLASS_TEACHERS.forEach(([email, className]) => {
    classByName.get(className).teacher_classes = [{ teacher_id: uid(email) }];
  });

  // name, class_name, admission_no, gender, mentor_email
  const STUDENTS = [
    ['Ama Osei','Grade 7','HMA/2026/001','F','class@happyman.edu'],
    ['Yaw Boateng','Grade 7','HMA/2026/002','M','class@happyman.edu'],
    ['Esi Armah','Grade 8','HMA/2026/003','F','jss@happyman.edu'],
    ['Kojo Mensah','Grade 8','HMA/2026/004','M','jss@happyman.edu'],
    ['Chidi Nwosu','Grade 9','HMA/2026/005','M','languages@happyman.edu'],
    ['Fatima Yusuf','Grade 10 Science','HMA/2026/006','F','science2@happyman.edu'],
    ['Zainab Lawal','Grade 10 Science','HMA/2026/007','F','science2@happyman.edu'],
    ['Tunde Bakare','Grade 11 Commercial','HMA/2026/008','M','commercial@happyman.edu'],
    ['Amina Garba','Grade 11 Arts','HMA/2026/009','F','arts@happyman.edu'],
    ['Tolu Akinwale','Grade 12 Science','HMA/2026/010','M','science2@happyman.edu'],
    ['Chidinma Eze','Grade 12 Arts','HMA/2026/011','F','arts@happyman.edu']
  ];
  const students = STUDENTS.map((s, i) => {
    const u = users.find(x => x.name === s[0] && x.role === 'student');
    return {
      id: i + 1, user_id: u.id, class_id: classByName.get(s[1]).id,
      admission_no: s[2], gender: s[3], mentor_id: uid(s[4]),
      users:     { name: u.name, initials: avatarInitials(u.name), tone: u.tone },
      classes:   { class_name: s[1] }
    };
  });

  // ── teacher → subject → class allocations (mirrors seed.sql)
  // Every subject in a class's curriculum has a teacher, and the two
  // core subjects are split across two teachers each so the generator
  // can always find someone free.
  const byName = (...names) => new Set(names);
  const JUNIOR  = ['Grade 7','Grade 8','Grade 9','Grade 10 Science','Grade 10 Commercial','Grade 10 Arts'];
  const SENIOR  = ['Grade 11 Science','Grade 11 Commercial','Grade 11 Arts','Grade 12 Science','Grade 12 Commercial','Grade 12 Arts'];
  const inSet   = set => c => set.has(c.class_name);
  const all     = () => true;
  const JSS     = c => c.level === 'JSS';
  const SCI     = c => c.stream === 'Science';
  const COM     = c => c.stream === 'Commercial';
  const ART     = c => c.stream === 'Arts';
  const RULES = [
    // General studies — offered to every class
    ['subject@happyman.edu',  ['English Studies'], inSet(byName(...JUNIOR))],
    ['english2@happyman.edu', ['English Studies'], inSet(byName(...SENIOR))],
    ['maths2@happyman.edu',   ['Mathematics'],     inSet(byName(...JUNIOR))],
    ['maths3@happyman.edu',   ['Mathematics'],     inSet(byName(...SENIOR))],
    ['history@happyman.edu',  ['Nigerian History'], all],
    ['yoruba@happyman.edu',   ['Yoruba'], all],
    ['languages@happyman.edu',['Hausa'],  all],
    ['crs@happyman.edu',      ['Igbo'],   all],
    ['jss2@happyman.edu',     ['Christian Religious Studies'], all],
    ['islamic@happyman.edu',  ['Islamic Studies'], all],
    // Junior secondary
    ['jss@happyman.edu',   ['Intermediate Science','Social and Citizenship Studies'], JSS],
    ['class@happyman.edu', ['Digital Technologies','Physical & Health Education'], JSS],
    ['jss3@happyman.edu',  ['Cultural & Creative Arts','Business Studies'], JSS],
    // Science
    ['hod@happyman.edu',       ['Physics','Chemistry','Biology'], SCI],
    ['physics2@happyman.edu',  ['Further Mathematics','Geography','Agricultural Science','Technical Drawing'], SCI],
    ['science2@happyman.edu',  ['Health Education','Foods & Nutrition'], SCI],
    // Commercial
    ['commercial@happyman.edu',['Financial Accounting','Commerce','Economics'], COM],
    ['commerce2@happyman.edu', ['Marketing','Office Practice'], COM],
    // Arts
    ['arts@happyman.edu',  ['Literature-in-English','Government','Visual Arts'], ART],
    ['arts2@happyman.edu', ['Music','French','Arabic'], ART]
  ];
  const teacherSubs = [];
  let tsId = 1;
  RULES.forEach(([email, names, match]) => {
    names.forEach(name => {
      classes.filter(match).forEach(c => {
        teacherSubs.push({ id: tsId++, teacher_id: uid(email), subject_id: subjByName.get(name).id, class_id: c.id });
      });
    });
  });

  const departments = [
    { id: 1, name: 'Junior Secondary', hod_id: uid('jss@happyman.edu'),        subject_ids: ['Intermediate Science','Social and Citizenship Studies','Digital Technologies','Physical & Health Education','Cultural & Creative Arts','Business Studies'] },
    { id: 2, name: 'Science',          hod_id: uid('hod@happyman.edu'),        subject_ids: ['Physics','Chemistry','Biology','Further Mathematics','Agricultural Science','Technical Drawing','Geography','Foods & Nutrition','Health Education'] },
    { id: 3, name: 'Commercial',       hod_id: uid('commercial@happyman.edu'), subject_ids: ['Financial Accounting','Commerce','Economics','Marketing','Office Practice'] },
    { id: 4, name: 'Arts',             hod_id: uid('arts@happyman.edu'),       subject_ids: ['Literature-in-English','Government','Visual Arts','Music','French','Arabic'] },
    { id: 5, name: 'General Studies',  hod_id: uid('languages@happyman.edu'),  subject_ids: ['English Studies','Mathematics','Nigerian History','Yoruba','Hausa','Igbo','Christian Religious Studies','Islamic Studies'] }
  ].map(d => ({ ...d, subject_ids: d.subject_ids.map(n => subjByName.get(n).id) }));

  // ── grades — top three are strong so the promotion rule is visible
  const grades = [];
  let gId = 1;
  students.forEach((st, r) => {
    const strength = r < 3 ? 0.80 : (r === 3 ? 0.22 : 0.42 + rand(r * 7.7) * 0.20);
    const subsInClass = subjects.filter(s => teacherSubs.some(t => t.class_id === st.class_id && t.subject_id === s.id));
    subsInClass.forEach(s => {
      [1, 2].forEach(termId => {
        const wobble = (rand(r * 31 + s.id * 13 + termId * 5) - 0.5) * 0.12;
        const base = clamp(strength + wobble, 0.05, 0.98);
        grades.push({
          id: gId++, student_id: st.id, subject_id: s.id, term_id: termId,
          ca_score: clamp(Math.round(base * 40 + rand(s.id + termId) * 3), 0, 40),
          exam_score: clamp(Math.round(base * 60 + rand(s.id * 2 + termId) * 4), 0, 60)
        });
      });
    });
  });

  // ── weekly attendance
  const attendance = [];
  let aId = 1;
  students.forEach((st, r) => {
    [1, 2].forEach(termId => {
      [1, 2, 3, 4, 5].forEach(w => {
        const present = clamp(Math.round(5 - rand(r * 17 + w * 3 + termId) * 3), 0, 5);
        attendance.push({ id: aId++, student_id: st.id, term_id: termId, week_number: w, days_present: present });
      });
    });
  });

  const REMARKS = [
    'Very consistent effort. Keep participating in class discussion.',
    'A quiet learner who needs more confidence. Encourage extra reading.',
    'Excellent in practical work. Leadership qualities are showing.',
    'Needs to focus more on written assignments.',
    'Steady progress. Watch the weak topics in the next topic.',
    'Hardworking and respectful. Aim higher in Mathematics.',
    'Good classroom behaviour. More practice in exam conditions will help.',
    'Improving steadily. Continue the evening reading routine.',
    'Talented in the arts. Balance with core subjects.',
    'Solid performance. Prepare carefully for the coming examinations.',
    'Talented and responsible. Could contribute more in group work.'
  ];
  const remarks = students.map((st, i) => ({
    id: i + 1, student_id: st.id, term_id: 1, teacher_remark: REMARKS[i]
  }));

  const assignments = [];
  classes.forEach((c, ci) => {
    const subsInClass = subjects.filter(s => teacherSubs.some(t => t.class_id === c.id && t.subject_id === s.id));
    subsInClass.slice(0, 2).forEach((s, k) => {
      const t = teacherSubs.find(x => x.class_id === c.id && x.subject_id === s.id);
      assignments.push({
        id: ci * 2 + k + 1, title: `${s.name} — Assignment ${k + 1}`,
        subject_id: s.id, class_id: c.id, teacher_id: t.teacher_id, term_id: 1,
        due_date: `2026-1${k}-15`, description: `Complete the exercises on ${s.name.toLowerCase()} and submit before the deadline.`
      });
    });
  });

  const events = [
    { id: 1, title: 'Inter-house sports',            date: '2026-10-12', type: 'sports',   note: 'All classes report to the field by 8:00am.' },
    { id: 2, title: 'Mid-term break',                date: '2026-10-26', type: 'academic', note: 'Schools resume on 3 November 2026.' },
    { id: 3, title: 'Parent–teacher conference',     date: '2026-11-09', type: 'meeting',  note: 'Book a slot with your child’s class teacher.' },
    { id: 4, title: 'Mathematics quiz competition',  date: '2026-11-20', type: 'academic', note: 'Selected students from Grades 7 to 12.' }
  ];

  _hydrate({
    session, terms, users, subjects, classes, students, parents: [
      { parent_id: parentId, student_id: students[0].id },
      { parent_id: parentId, student_id: students[5].id }
    ],
    teacherSubs, departments, grades, attendance, assignments, events, remarks,
    timetables: [],
    timeSlots: [
      { id: 1, day_of_week: 1, start_time: '08:00', end_time: '08:45' },
      { id: 2, day_of_week: 1, start_time: '08:45', end_time: '09:30' },
      { id: 3, day_of_week: 1, start_time: '10:15', end_time: '11:00' }
    ]
  });
  console.warn('[HMA] Supabase unavailable — started the bundled demo school (edits are not saved)');
}

// ============================================================
//  SYNCHRONOUS DATA API  (app.js calls these directly)
// ============================================================
const Data = {

  // ── Session ───────────────────────────────────────────────
  session()  { return _cache.session; },
  saveSession(s) {
    _cache.session = s;
    DB.set('session', s);
    if (!s._id) return;
    _sb.from('sessions').update({ name: s.name, upload_open: s.uploadOpen })
       .eq('id', s._id).then(() => {});
    const termRow = s.terms?.find(t => t.term === s.currentTerm);
    if (termRow?._id) {
      _sb.from('terms').update({ is_current: true }).eq('id', termRow._id).then(() => {});
      s.terms.filter(t => t.term !== s.currentTerm).forEach(t => {
        if (t._id) _sb.from('terms').update({ is_current: false }).eq('id', t._id).then(() => {});
      });
    }
  },
  failedSources() { return _cache.failed.slice(); },

  // ── Users ─────────────────────────────────────────────────
  users()            { return _cache.users; },
  userByEmail(email) { return _cache.users.find(u => u.email === email) || null; },
  user(id)           { return _cache.users.find(u => u.id === String(id)) || null; },
  teachers()         { return _cache.users.filter(u => ['Subject Teacher','Class Teacher','HOD'].includes(u.role)); },

  async addUser(u) {
    const payload = {
      name: u.name, email: u.email, password: u.password,
      role: _unmapRole(u.role), staff_role: u.role === 'Administrator' || ['Student','Parent'].includes(u.role) ? null : u.role,
      phone: u.phone || null, tone: u.tone || 'blue',
      initials: u.initials || avatarInitials(u.name),
      is_mentor: !!u.isMentor
    };
    // Add locally first so the caller can redraw without waiting on the
    // network, then reconcile with the row the database returns.
    const record = { ...u, id: u.id || uid('U'), studentId: null, childIds: [] };
    _cache.users.push(record);
    DB.set('users', _cache.users);
    try {
      const { data, error } = await _sb.from('users').insert(payload).select().single();
      if (error) throw error;
      Object.assign(record, {
        id: String(data.id), role: _mapRole(data.role, data.staff_role),
        name: data.name, initials: data.initials || record.initials,
        tone: data.tone || record.tone, email: data.email, phone: data.phone,
        password: data.password, isMentor: !!data.is_mentor,
        mentorSubject: data.mentor_subject || '', mentorBio: data.mentor_bio || ''
      });
      DB.set('users', _cache.users);
    } catch (err) {
      console.warn('[HMA] user not saved remotely:', err?.message || err);
    }
    return record;
  },

  async updateUser(id, patch) {
    const user = this.user(id);
    if (!user) return null;
    Object.assign(user, patch);
    DB.set('users', _cache.users);
    const payload = {};
    if (patch.phone      !== undefined) payload.phone = patch.phone;
    if (patch.name       !== undefined) payload.name = patch.name;
    if (patch.isMentor   !== undefined) { payload.is_mentor = patch.isMentor; }
    if (patch.role !== undefined) {
      payload.role = _unmapRole(patch.role);
      const isStaff = STAFF_ROLES.includes(patch.role);
      payload.staff_role = isStaff ? patch.role : null;
      // A user who is no longer staff cannot mentor. Keep the existing
      // flag when the role is unchanged and no flag was supplied.
      if (!isStaff) { payload.is_mentor = false; user.isMentor = false; }
      else if (patch.isMentor === undefined) { user.isMentor = !!user.isMentor; }
    }
    if (patch.mentorSubject !== undefined) payload.mentor_subject = patch.mentorSubject;
    if (patch.mentorBio  !== undefined) payload.mentor_bio = patch.mentorBio;
    if (Object.keys(payload).length) {
      _sb.from('users').update(payload).eq('id', Number(id)).then(() => {});
    }
    return user;
  },

  // ── Students ──────────────────────────────────────────────
  students()           { return _cache.students; },
  student(id)          { return _cache.students.find(s => s.id === String(id)) || null; },
  studentsByClass(cid) { return _cache.students.filter(s => s.classId === String(cid)); },

  async addStudent({ name, classId, gender = 'M', admissionNo, email, password = 'student123', phone = null, mentorId = null }) {
    let classIdNum = Number(classId);
    if (!Number.isFinite(classIdNum)) {
      const { data } = await _sb.from('classes').select('id').eq('class_name', classId).maybeSingle();
      classIdNum = data?.id;
    }
    const userRow = await this.addUser({
      name, email, password, phone, role: 'Student', tone: 'blue', initials: avatarInitials(name)
    });
    const adm = admissionNo || `HMA/${new Date().getFullYear()}/${String(_cache.students.length + 1).padStart(3, '0')}`;
    let studentId = null;
    try {
      const { data, error } = await _sb.from('students').insert({
        user_id: Number(userRow.id), class_id: classIdNum, admission_no: adm,
        gender, mentor_id: mentorId ? Number(mentorId) : null
      }).select().single();
      if (error) throw error;
      studentId = String(data.id);
    } catch (err) {
      console.warn('[HMA] student not saved remotely:', err?.message || err);
    }
    const record = {
      id: studentId || uid('S'), _userId: userRow.id, name, initials: avatarInitials(name),
      tone: 'blue', classId: String(classId), className: Data.cls(classId)?.name || null,
      mentorId: mentorId ? String(mentorId) : null, gender, admissionNo: adm
    };
    _cache.students.push(record);
    userRow.studentId = record.id;
    DB.set('students', _cache.students);
    DB.set('users', _cache.users);
    return record;
  },

  // ── Classes ───────────────────────────────────────────────
  classes()  { return _cache.classes; },
  cls(id)    { return _cache.classes.find(c => c.id === String(id)) || null; },
  classNameOf(id) { return this.cls(id)?.name || '—'; },
  juniorClasses() { return _cache.classes.filter(c => c.level === 'JSS'); },
  seniorClasses() { return _cache.classes.filter(c => c.level === 'SS'); },

  async addClass({ name, level, stream, year, classTeacherId }) {
    const record = { id: uid('CL'), name, level: level || null, stream: stream || null,
                     year: year ?? null, classTeacherId: classTeacherId || null };
    // Add locally first so the caller can redraw without waiting on the
    // network, then swap in the real id once the database confirms.
    _cache.classes.push(record);
    DB.set('classes', _cache.classes);
    try {
      const { data, error } = await _sb.from('classes')
        .insert({ class_name: name, level: level || null, stream: stream || null, year: year ?? null })
        .select().single();
      if (error) throw error;
      record.id = String(data.id);
      if (classTeacherId) {
        await _sb.from('teacher_classes')
          .insert({ class_id: data.id, teacher_id: Number(classTeacherId) });
      }
      DB.set('classes', _cache.classes);
    } catch (err) {
      console.warn('[HMA] class not saved remotely:', err?.message || err);
    }
    return record;
  },

  // A class has exactly one class teacher: clear every other row, then set ours.
  async assignClassTeacher(classId, teacherId) {
    const klass = this.cls(classId);
    if (!klass) return null;
    const cid = Number(klass.id);
    const tid = teacherId ? Number(teacherId) : null;
    // Only this class is affected; other classes keep their own teacher.
    // Applied before the network call so the UI can redraw immediately.
    klass.classTeacherId = tid === null ? null : String(tid);
    DB.set('classes', _cache.classes);

    if (!Number.isFinite(cid) || String(klass.id).startsWith('CL')) {
      console.warn('[HMA] class teacher not saved remotely: local-only class');
    } else {
      try {
        const { error: delErr } = await _sb.from('teacher_classes').delete().eq('class_id', cid);
        if (delErr) throw delErr;
        if (tid !== null) {
          const { error: insErr } = await _sb.from('teacher_classes')
            .insert({ class_id: cid, teacher_id: tid });
          if (insErr) throw insErr;
        }
      } catch (err) {
        console.warn('[HMA] class teacher not saved remotely:', err?.message || err);
      }
    }
    return klass;
  },

  // ── Subjects ──────────────────────────────────────────────
  subjects()  { return _cache.subjects; },
  subject(id) { return _cache.subjects.find(s => s.id === String(id)) || null; },
  subjectsByLevel(level) {
    return _cache.subjects.filter(s => !level || level === 'ALL' || s.level === 'BOTH' || s.level === level);
  },
  // Subjects offered by a class, honouring level and senior stream
  subjectsForClass(classId) {
    const cl = this.cls(classId);
    if (!cl) return _cache.subjects;
    return _cache.subjects.filter(s => {
      const levelOk = !cl.level || s.level === 'BOTH' || s.level === cl.level;
      const groupOk = !cl.stream || s.group === 'General' || s.group === cl.stream;
      return levelOk && groupOk;
    });
  },

  async addSubject({ name, code, type = 'additional', color = 'blue', level = 'BOTH', group = 'General' }) {
    let record = { id: uid('SUB'), name, code, type, color, level, group };
    try {
      const { data, error } = await _sb.from('subjects')
        .insert({ name, code, is_core: type === 'core', color, level, group_name: group })
        .select().single();
      if (error) throw error;
      record.id = String(data.id);
    } catch (err) {
      console.warn('[HMA] subject not saved remotely:', err?.message || err);
    }
    _cache.subjects.push(record);
    DB.set('subjects', _cache.subjects);
    return record;
  },

  // ── Scores ────────────────────────────────────────────────
  studentScores(sid)   { return _cache.scores[String(sid)] || {}; },
  saveScores(obj)      { _cache.scores = obj; DB.set('scores', obj); },

  // ── Mentors ───────────────────────────────────────────────
  mentors()  { return _cache.mentors; },
  mentor(id) { return _cache.mentors.find(m => m.id === String(id)) || null; },
  mentorOf(studentId)  { return this.mentor(this.student(studentId)?.mentorId); },
  mentees(teacherId)   { return _cache.students.filter(s => s.mentorId === String(teacherId)); },
  async setMentor(studentId, teacherId) {
    const s = this.student(studentId);
    if (!s) return null;
    s.mentorId = teacherId ? String(teacherId) : null;
    DB.set('students', _cache.students);
    try {
      await _sb.from('students')
        .update({ mentor_id: teacherId ? Number(teacherId) : null })
        .eq('id', Number(studentId));
    } catch (err) {
      console.warn('[HMA] mentor not saved remotely:', err?.message || err);
    }
    return this.mentor(s.mentorId);
  },

  // ── Assignments ───────────────────────────────────────────
  assignments()  { return _cache.assignments; },
  async addAssignment(a) {
    const termId = _termIdFromNum(a.term);
    let record = { id: uid('A'), ...a };
    try {
      const { data, error } = await _sb.from('assignments').insert({
        title: a.title, subject_id: Number(a.subjectId), class_id: Number(a.classId),
        teacher_id: Number(a.teacherId), term_id: termId, due_date: a.due
      }).select().single();
      if (error) throw error;
      record.id = String(data.id);
    } catch (err) {
      console.warn('[HMA] assignment not saved remotely:', err?.message || err);
    }
    _cache.assignments.push(record);
    DB.set('assignments', _cache.assignments);
    return record;
  },

  // ── Events ────────────────────────────────────────────────
  events()  { return _cache.events; },
  async addEvent(e) {
    let record = { id: uid('EV'), ...e };
    try {
      const { data, error } = await _sb.from('events')
        .insert({ title: e.title, date: e.date, type: e.type, note: e.note })
        .select().single();
      if (error) throw error;
      record.id = String(data.id);
    } catch (err) {
      console.warn('[HMA] event not saved remotely:', err?.message || err);
    }
    _cache.events.push(record);
    _cache.events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    DB.set('events', _cache.events);
    return record;
  },

  // ── Teacher assignments ───────────────────────────────────
  teacherSubjects() { return _cache.teacherSubjects; },
  teacherFor(subjectId, classId) {
    const row = _cache.teacherSubjects.find(
      ts => ts.subjectId === String(subjectId) && ts.classId === String(classId)
    );
    return row ? row.teacherId : null;
  },
  async saveTeacherSubjects(arr) {
    _cache.teacherSubjects = arr;
    DB.set('teacherSubjects', arr);
    try {
      await _sb.from('teacher_subjects').delete().neq('id', 0);
      if (arr.length) {
        const { error } = await _sb.from('teacher_subjects').insert(arr.map(r => ({
          teacher_id: Number(r.teacherId), subject_id: Number(r.subjectId), class_id: Number(r.classId)
        })));
        if (error) throw error;
      }
    } catch (err) {
      console.warn('[HMA] teacher assignments not saved remotely:', err?.message || err);
    }
  },

  // ── Departments ───────────────────────────────────────────
  departments()  { return _cache.departments; },
  department(id) { return _cache.departments.find(d => d.id === String(id)) || null; },
  departmentOf(userId) { return _cache.departments.find(d => d.hodId === String(userId)) || null; },
  departmentSubjects(deptId) {
    const dept = this.department(deptId);
    if (!dept) return [];
    return dept.subjectIds.map(id => this.subject(id)).filter(Boolean);
  },
  async saveDepartments(arr) {
    _cache.departments = arr;
    DB.set('departments', arr);
    try {
      for (const d of arr) {
        const payload = { name: d.name, hod_id: d.hodId ? Number(d.hodId) : null, subject_ids: d.subjectIds };
        if (d.id && !isNaN(Number(d.id))) await _sb.from('departments').update(payload).eq('id', Number(d.id));
        else await _sb.from('departments').insert(payload);
      }
    } catch (err) {
      console.warn('[HMA] departments not saved remotely:', err?.message || err);
    }
  },

  // ── Attendance (weekly) ───────────────────────────────────
  attendance(term) { return _cache.attendance[term || this.currentTerm()] || {}; },
  studentAttendance(sid, term) { return (this.attendance(term)[String(sid)]) || {}; },
  async saveAttendance(obj, term) {
    const t = term || this.currentTerm();
    _cache.attendance[t] = obj;
    DB.set('attendance', _cache.attendance);
    const termId = _termIdFromNum(t);
    const rows = [];
    for (const [sid, weeks] of Object.entries(obj)) {
      for (const [week, days] of Object.entries(weeks)) {
        rows.push({
          student_id: Number(sid), term_id: termId,
          week_number: parseInt(String(week).replace('W', ''), 10), days_present: days
        });
      }
    }
    if (!rows.length || !termId) return;
    try {
      const { error } = await _sb.from('attendance_weekly')
        .upsert(rows, { onConflict: 'student_id,term_id,week_number' });
      if (error) throw error;
    } catch (err) {
      console.warn('[HMA] attendance not saved remotely:', err?.message || err);
    }
  },
  currentTerm() { return _cache.session?.currentTerm || 1; },

  // ── Feedback / remarks ────────────────────────────────────
  feedback()          { return _cache.feedback; },
  async saveFeedback(obj) {
    _cache.feedback = obj;
    DB.set('feedback', obj);
    const termId = _termIdFromNum(_cache.session?.currentTerm || 1);
    if (!termId) return;
    const rows = Object.entries(obj).map(([sid, fb]) => ({
      student_id: Number(sid), term_id: termId, teacher_remark: fb.text
    }));
    if (!rows.length) return;
    try {
      const { error } = await _sb.from('remarks')
        .upsert(rows, { onConflict: 'student_id,term_id' });
      if (error) throw error;
    } catch (err) {
      console.warn('[HMA] remarks not saved remotely:', err?.message || err);
    }
  },

  // ── Timetable ─────────────────────────────────────────────
  timetables() { return _cache.timetables; },
  timeSlots()  { return _cache.timeSlots; },

  // Replace the timetable for a term with the generated schedules
  async saveTimetable(schedules, term) {
    const t      = term || this.currentTerm();
    const termId = _termIdFromNum(t);
    if (!termId) { console.warn('[HMA] no term id — timetable not saved'); return 0; }
    if (!schedules.length) return 0;

    // 1. make sure the time slots exist
    const sample  = schedules[0].days[0].periods;
    const first   = sample[0] || { start: '08:00', end: '08:45' };
    const periods = sample.length;
    const startHour = Number(String(first.start).slice(0, 2));
    const minutes   = Math.max(20, _mins(first.end) - _mins(first.start));
    const slotIds   = await this._ensureTimeSlots(Timetable.slotTimes(periods, startHour, minutes));

    // 2. clear the old rows for this term
    try { await _sb.from('timetables').delete().eq('term_id', termId); } catch {}

    // 3. write the new rows
    const rows = [];
    schedules.forEach(schedule => {
      schedule.days.forEach(day => {
        day.periods.forEach(period => {
          const slotId = slotIds[`${day.day}|${period.start}|${period.end}`];
          if (!slotId) return;
          rows.push({
            term_id: termId, class_id: Number(schedule.classId),
            subject_id: Number(period.subjectId),
            teacher_id: period.teacherId ? Number(period.teacherId) : null,
            time_slot_id: Number(slotId)
          });
        });
      });
    });
    if (rows.length) {
      const { data, error } = await _sb.from('timetables').insert(rows).select();
      if (error) throw error;
      _cache.timetables = data.map(row => ({
        id: String(row.id), classId: String(row.class_id), subjectId: String(row.subject_id),
        teacherId: row.teacher_id ? String(row.teacher_id) : null,
        timeSlotId: String(row.time_slot_id), term: t
      }));
    }
    return rows.length;
  },

  async _ensureTimeSlots(slots) {
    const map = {};
    _cache.timeSlots.forEach(s => { map[`${s.day}|${_hm(s.start)}|${_hm(s.end)}`] = s.id; });
    const missing = slots.filter(s => !map[`${s.day}|${s.start}|${s.end}`]);
    if (missing.length) {
      const { data, error } = await _sb.from('time_slots').insert(
        missing.map(s => ({ day_of_week: s.day, start_time: s.start, end_time: s.end }))
      ).select();
      if (!error && data) {
        data.forEach(row => {
          const key = `${row.day_of_week}|${_hm(row.start_time)}|${_hm(row.end_time)}`;
          map[key] = row.id;
          _cache.timeSlots.push({ id: row.id, day: row.day_of_week, start: _hm(row.start_time), end: _hm(row.end_time) });
        });
      }
    }
    return map;
  }
};

// 'HH:MM:SS' → 'HH:MM'
function _hm(t) { return String(t || '').slice(0, 5); }
function _mins(t) {
  const [h, m] = _hm(t).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// ── Role name mapping ────────────────────────────────────────
const STAFF_ROLES = ['Class Teacher', 'Subject Teacher', 'HOD'];

function _mapRole(dbRole, staffRole) {
  if (dbRole === 'teacher') return staffRole || 'Subject Teacher';
  return { admin: 'Administrator', teacher: 'Subject Teacher', student: 'Student', parent: 'Parent' }[dbRole] || dbRole;
}
function _unmapRole(appRole) {
  return {
    'Administrator': 'admin', 'Class Teacher': 'teacher', 'Subject Teacher': 'teacher',
    'HOD': 'teacher', 'Student': 'student', 'Parent': 'parent'
  }[appRole] || 'teacher';
}

// ============================================================
//  ACADEMIC LOGIC
// ============================================================
const Academic = {
  MAX_CA:   40,   // continuous assessment
  MAX_EXAM: 60,   // examination
  PASS_MARK: 50,  // promotion threshold

  subjectScore(studentId, subjectId, term) {
    const entry = Data.studentScores(studentId)[String(subjectId)]?.[term];
    return entry ? entry.test + entry.exam : null;
  },

  // Subjects a student sits — filtered by the level and stream of their class
  classSubjects(classId) { return Data.subjectsForClass(classId); },

  termScores(studentId, term) {
    const student = Data.student(studentId);
    const subs    = student ? this.classSubjects(student.classId) : Data.subjects();
    const sc      = Data.studentScores(studentId);
    return subs.map(sub => {
      const entry = sc[sub.id]?.[term];
      return {
        subjectId: sub.id,
        name:      sub.name,
        code:      sub.code,
        color:     sub.color,
        type:      sub.type,
        group:     sub.group,
        ca:        entry ? entry.test : null,
        exam:      entry ? entry.exam : null,
        score:     entry ? entry.test + entry.exam : null
      };
    });
  },

  termAverage(studentId, term) {
    const scores = this.termScores(studentId, term).map(s => s.score).filter(s => s !== null);
    if (!scores.length) return 0;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  },

  // Promotion rule: English and Mathematics 50 and above,
  // and an overall average of 50 and above.
  promotionCheck(studentId, term) {
    const rows  = this.termScores(studentId, term);
    const total = name => rows.find(r => r.name.toLowerCase().includes(name));
    const en = total('english');
    const ma = total('math');
    const avg = this.termAverage(studentId, term);
    return {
      en, ma, avg,
      english: en?.score ?? 0,
      maths:  ma?.score ?? 0,
      enPass: (en?.score ?? 0) >= this.PASS_MARK,
      maPass: (ma?.score ?? 0) >= this.PASS_MARK,
      avgPass: avg >= this.PASS_MARK,
      pass: (en?.score ?? 0) >= this.PASS_MARK
         && (ma?.score ?? 0) >= this.PASS_MARK
         && avg >= this.PASS_MARK
    };
  },

  canPromote(studentId, term) { return this.promotionCheck(studentId, term).pass; },

  promotionStatus(studentId, term) {
    const check = this.promotionCheck(studentId, term);
    if (check.pass) return 'Promoted';
    if (check.avg >= 40) return 'Review';
    return 'Repeat';
  },

  attendancePct(studentId, term) {
    const days = Object.values(Data.studentAttendance(studentId, term));
    if (!days.length) return '0%';
    const total   = days.length * 5;
    const present = days.reduce((a, b) => a + b, 0);
    return Math.round((present / total) * 100) + '%';
  },

  subjectAnalytics(classId, subjectId, term) {
    const students = Data.studentsByClass(classId);
    const scores   = students
      .map(s => this.subjectScore(s.id, subjectId, term))
      .filter(s => s !== null);
    if (!scores.length) return { max: 0, min: 0, avg: 0, stddev: 0, count: 0 };
    const avg      = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / scores.length;
    return {
      max:    Math.max(...scores),
      min:    Math.min(...scores),
      avg:    Math.round(avg),
      stddev: Math.round(Math.sqrt(variance) * 10) / 10,
      count:  scores.length
    };
  },

  classAverage(classId, term) {
    const avgs = Data.studentsByClass(classId)
      .map(s => this.termAverage(s.id, term)).filter(a => a > 0);
    if (!avgs.length) return 0;
    return Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length);
  },

  // Whole-class report: every student against every subject of the class
  classReport(classId, term) {
    const subjects = this.classSubjects(classId);
    const students = Data.studentsByClass(classId);
    return {
      classId,
      term,
      subjects,
      students: students.map(s => {
        const scores = this.termScores(s.id, term);
        const byId   = Object.fromEntries(scores.map(r => [r.subjectId, r]));
        return {
          student:   s,
          rows:      subjects.map(sub => byId[sub.id] || {
            subjectId: sub.id, name: sub.name, code: sub.code, color: sub.color,
            ca: null, exam: null, score: null
          }),
          average:   this.termAverage(s.id, term),
          status:    this.promotionStatus(s.id, term),
          attendance: this.attendancePct(s.id, term),
          remark:    Data.feedback()[s.id]?.text || ''
        };
      })
    };
  }
};

// ============================================================
//  TIMETABLE GENERATOR
//  Builds a schedule for every class in the school while making
//  sure no teacher is booked into two classes at the same time.
// ============================================================
const Timetable = {
  DAYS: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],

  // Time slots for one day
  slotTimes(periodsPerDay, startHour, periodMinutes) {
    const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return Array.from({ length: periodsPerDay }, (_, p) => {
      const startMin = startHour * 60 + p * periodMinutes;
      const endMin   = startMin + periodMinutes;
      return {
        period: p + 1,
        start: fmt(startMin),
        end:   fmt(endMin),
        time:  `${fmt(startMin)} – ${fmt(endMin)}`
      };
    });
  },

  // The whole school at once. Returns one schedule per class.
  // A teacher is never scheduled in two places at once, and a subject with
  // no teacher allocated is reported instead of being timetabled.
  generateAll({ periodsPerDay = 6, startHour = 8, periodMinutes = 45 } = {}) {
    const slots  = this.slotTimes(periodsPerDay, startHour, periodMinutes);
    const busy   = new Map();          // "day-period-teacher" → true
    const absent = [];                 // classes without any staffed subject
    const unstaffed = {};              // class name → [subject, ...]
    const schedules = [];
    let freePeriods = 0;

    Data.classes().forEach(cl => {
      const curriculum = Academic.classSubjects(cl.id);
      const subjects = curriculum.filter(s => Data.teacherFor(s.id, cl.id));
      const missing  = curriculum.filter(s => !Data.teacherFor(s.id, cl.id));
      if (missing.length) unstaffed[cl.name] = missing.map(s => s.name);
      if (!subjects.length) { absent.push(cl.name); return; }

      // core subjects appear twice as often in the pool
      const pool = subjects.flatMap(s => s.type === 'core' ? [s, s] : [s]);
      const days = this.DAYS.map((day, dayIdx) => {
        const queue = shuffle(pool, `${cl.id}:${dayIdx}`);
        const periods = slots.map((slot, slotIdx) => {
          const key = `${dayIdx}-${slotIdx}`;
          // first subject in the queue whose teacher is free in this slot
          const pick = queue.findIndex(s => {
            const tid = Data.teacherFor(s.id, cl.id);
            return !tid || !busy.get(`${key}-${tid}`);
          });

          if (pick < 0) {
            freePeriods++;
            return { ...slot, free: true, subjectId: null, subject: 'Free period',
                     code: '', color: 'free', teacherId: null, teacher: '' };
          }

          const chosen = queue[pick];
          const teacherId = Data.teacherFor(chosen.id, cl.id);
          if (teacherId) busy.set(`${key}-${teacherId}`, true);

          queue.splice(pick, 1);
          if (!queue.length) queue.push(...shuffle(pool, `${cl.id}:${dayIdx}:${slotIdx}`));

          return {
            ...slot,
            free: false,
            subjectId:  chosen.id,
            subject:    chosen.name,
            code:       chosen.code,
            color:      chosen.color,
            teacherId,
            teacher:    teacherId ? (Data.user(teacherId)?.name || '—') : 'Unassigned'
          };
        });
        return { day, periods };
      });

      schedules.push({ classId: cl.id, name: cl.name, level: cl.level, stream: cl.stream, days });
    });

    return { schedules, slots, absent, unstaffed, freePeriods };
  },

  // Single class (reuses the same rules)
  generate(classId, periodsPerDay = 6, startHour = 8, periodMinutes = 45) {
    const all = this.generateAll({ periodsPerDay, startHour, periodMinutes });
    return all.schedules.find(s => s.classId === String(classId)) || null;
  }
};

// Deterministic shuffle so the same class always gets the same timetable
function shuffle(list, seed) {
  const out = list.slice();
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rand = () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Unique ID helper ─────────────────────────────────────────
function uid(prefix) {
  return prefix + Date.now().toString(36).toUpperCase();
}

// ── Export to global scope (app.js uses globals) ─────────────
window.Data       = Data;
window.Academic   = Academic;
window.Timetable  = Timetable;
window.uid        = uid;
window.DB         = DB;
window.loadFromSupabase = loadFromSupabase;
