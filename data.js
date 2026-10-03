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
import { createClient } from '@supabase/supabase-js';

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
  attendanceDaily:{},     // { term: { Wk: { studentId: [P/L/A per weekday] } } }
  feedback:       {},     // { studentId: { term, text, submitted } }
  timetables:     [],     // generated timetable rows
  timeSlots:      [],
  lmsLessons:     [],
  lmsQuizzes:     [],
  lmsQuestions:   [],
  lmsAttempts:    [],
  lmsDiscussions: [],
  lmsPosts:       [],
  promotionOverrides: [],   // admin manual promotion decisions
  artifacts:          [],   // student portfolio proof-of-work
  commendations:      [],   // teacher/mentor leadership notes
  parentEngagements: [],   // parent logins, acknowledges, PTA, early payments
  teacherRecognitions: [], // educator recognition awards
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
  classes:      () => _sb.from('classes').select('*').order('year'),
  teacherClasses: () => _sb.from('teacher_classes').select('teacher_id, class_id'),
  // students has two foreign keys into users (user_id and mentor_id), so the
  // relationship has to be named or PostgREST cannot pick one.
  students:     () => _sb.from('students').select('*, users!students_user_id_fkey(name,initials,tone,phone,email,role), classes(class_name)'),
  parents:      () => _sb.from('parent_students').select('*'),
  teacherSubs:  () => _sb.from('teacher_subjects').select('*'),
  departments:  () => _sb.from('departments').select('*'),
  grades:       () => _sb.from('grades').select('*'),
  attendance:   () => _sb.from('attendance_weekly').select('*'),
  attendanceDaily:() => _sb.from('attendance_daily').select('*'),
  assignments:  () => _sb.from('assignments').select('*'),
  events:       () => _sb.from('events').select('*').order('date'),
  remarks:      () => _sb.from('remarks').select('*'),
  timetables:   () => _sb.from('timetables').select('*'),
  timeSlots:    () => _sb.from('time_slots').select('*'),
  promotions:   () => _sb.from('promotions').select('*'),
  pathRequests: () => _sb.from('path_requests').select('*'),
  subjectSelections: () => _sb.from('subject_selections').select('*'),
  selectionRules: () => _sb.from('subject_selection_rules').select('*').limit(1),
  approvalRequests: () => _sb.from('approval_requests').select('*'),
  transfers:   () => _sb.from('student_transfers').select('*'),
  scoreUploads:() => _sb.from('score_uploads').select('*'),
  weeklyTopics:() => _sb.from('weekly_topics').select('*'),
  lmsLessons:    () => _sb.from('lms_lessons').select('*').order('created_at', { ascending: false }),
  lmsQuizzes:    () => _sb.from('lms_quizzes').select('*'),
  lmsQuestions:  () => _sb.from('lms_questions').select('*').order('position'),
  lmsAttempts:   () => _sb.from('lms_attempts').select('*'),
  lmsDiscussions:() => _sb.from('lms_discussions').select('*'),
  lmsPosts:      () => _sb.from('lms_posts').select('*'),
  ttSettings:  () => _sb.from('timetable_settings').select('*').limit(1),
  promotionOverrides: () => _sb.from('promotion_overrides').select('*'),
  artifacts:  () => _sb.from('portfolio_artifacts').select('*'),
  commendations: () => _sb.from('commendations').select('*'),
  parentEngagements: () => _sb.from('parent_engagements').select('*'),
  teacherRecognitions: () => _sb.from('teacher_recognitions').select('*')
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
  // Build a map of class_id → teacher_id from the separately-fetched
  // teacher_classes table (more reliable than the embedded select which
  // can return empty arrays when RLS blocks the nested query).
  const teacherClassMap = new Map(
    (raw.teacherClasses || []).map(r => [String(r.class_id), String(r.teacher_id)])
  );

  _cache.classes = raw.classes.map(c => ({
    id:             String(c.id),
    name:           c.class_name,
    level:          c.level  || null,     // JSS | SS
    stream:         c.stream || null,     // Science | Commercial | Arts
    year:           c.year   ?? null,     // 7 - 12
    selectionMode:  c.selection_mode || 'normal',  // normal | pool | graduate
    nextClassId:    c.next_class_id ? String(c.next_class_id) : null,
    classTeacherId: teacherClassMap.get(String(c.id)) || null
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
    admissionNo: s.admission_no,
    status:      s.status || 'active',     // active | inactive | withdrawn | archived
    statusReason: s.status_reason || null  // pool_timeout | ss3_completed | archived ...
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
    // password column is always NULL after the hash migration — never read it
    passwordHash: u.password_hash || null,
    passwordSalt: u.password_salt || null,
    isMentor:     !!u.is_mentor,
    mentorSubject: u.mentor_subject || '',
    mentorBio:    u.mentor_bio || 'Experienced educator and mentor.',
    studentId:    studentByUser.get(String(u.id)) || null,
    childIds:     childMap[String(u.id)] || [],
    adminTier:    u.admin_tier || null      // principal | vice_principal (null = full rights)
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

  // ── daily attendance, grouped per term / week / student
  _cache.attendanceDaily = {};
  for (const a of raw.attendanceDaily) {
    const term  = _termNumFromId(a.term_id);
    const wk    = `W${a.week_number || 1}`;
    const sid   = String(a.student_id);
    _cache.attendanceDaily[term] = _cache.attendanceDaily[term] || {};
    _cache.attendanceDaily[term][wk] = _cache.attendanceDaily[term][wk] || {};
    const arr = _cache.attendanceDaily[term][wk][sid] || [];
    arr[a.day_index] = a.status;
    _cache.attendanceDaily[term][wk][sid] = arr;
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

  // ── term results-publish flags (from the summary fields on terms)
  _cache.published = {};
  for (const t of (raw.terms || [])) _cache.published[_termNumFromId(t.id)] = !!t.results_published;

  // ── promotions — one row per student per session, end-of-session decisions
  _cache.promotions = (raw.promotions || []).map(p => ({
    id:          String(p.id),
    studentId:   String(p.student_id),
    sessionId:   String(p.session_id),
    termId:      p.term_id ? String(p.term_id) : null,
    fromClassId: p.from_class_id ? String(p.from_class_id) : null,
    toClassId:   p.to_class_id   ? String(p.to_class_id)   : null,
    outcome:     p.outcome || 'promoted',
    avg:         p.avg ?? null,
    en:          p.en_score ?? null,
    ma:          p.ma_score ?? null,
    classPosition: p.class_position ?? null,
    yearPosition:  p.year_position  ?? null,
    decidedBy:   p.decided_by ? String(p.decided_by) : null
  }));

  // ── path requests — stream/subject requests from the student portal
  _cache.pathRequests = (raw.pathRequests || []).map(r => ({
    id:         String(r.id),
    studentId:  String(r.student_id),
    sessionId:  String(r.session_id),
    stream:     r.requested_stream || null,
    targetClassId: r.target_class_id ? String(r.target_class_id) : null,
    status:     r.status || 'pending',
    requestedBy: r.requested_by ? String(r.requested_by) : null,
    decidedBy:  r.decided_by ? String(r.decided_by) : null,
    note:       r.note || '',
    at:         r.created_at || null
  }));

  // ── subject selections — one row per chosen subject; group per student
  _cache.subjectSelections = {};
  for (const s of (raw.subjectSelections || [])) {
    const sid = String(s.student_id);
    const cur = _cache.subjectSelections[sid] || { status: 'effective', subjectIds: [] };
    if (s.status === 'effective' || cur.status !== 'effective') cur.status = s.status;
    cur.subjectIds.push(String(s.subject_id));
    cur.id        = s.id ? String(s.id) : cur.id;
    cur.termId    = s.term_id ? String(s.term_id) : cur.termId;
    cur.decidedBy = s.decided_by ? String(s.decided_by) : cur.decidedBy;
    _cache.subjectSelections[sid] = cur;
  }

  // ── subject selection rules (single row; UI falls back to defaults)
  _cache.selectionRules = (raw.selectionRules || [])[0] || null;

  // ── approval requests — every privileged action a VP makes
  _cache.approvalRequests = (raw.approvalRequests || []).map(a => ({
    id:         String(a.id),
    actionType: a.action_type,
    entityType: a.entity_type,
    entityId:   a.entity_id ? String(a.entity_id) : null,
    payload:    a.payload || {},
    status:     a.status || 'pending',
    requestedBy: a.requested_by ? String(a.requested_by) : null,
    decidedBy:  a.decided_by ? String(a.decided_by) : null,
    note:       a.decision_note || '',
    at:         a.created_at || null
  }));

  // ── student transfers — administrator reclassification, also feeds records
  _cache.transfers = (raw.transfers || []).map(t => ({
    id:         String(t.id),
    studentId:  String(t.student_id),
    sessionId:  String(t.session_id),
    termId:     t.term_id ? String(t.term_id) : null,
    fromClassId: t.from_class_id ? String(t.from_class_id) : null,
    toClassId:  t.to_class_id ? String(t.to_class_id) : null,
    reason:     t.reason || 'admin_correction',
    note:       t.reason_note || '',
    status:     t.status || 'pending_approval',
    requestedBy: t.requested_by ? String(t.requested_by) : null,
    approvedBy: t.approved_by ? String(t.approved_by) : null
  }));

  // ── score upload markers — part of the publish-coverage picture
  _cache.scoreUploads = (raw.scoreUploads || []).map(u => ({
    id:        String(u.id),
    sessionId: String(u.session_id),
    classId:   String(u.class_id),
    subjectId: String(u.subject_id),
    kind:      u.kind || 'ca',
    status:    u.status || 'not_started',
    rowCount:  u.row_count || 0,
    teacherId: u.teacher_id ? String(u.teacher_id) : null,
    at:        u.submitted_at || null
  }));

  // ── weekly topics — what a subject teacher covered each week
  _cache.weeklyTopics = (raw.weeklyTopics || []).map(t => ({
    id:        String(t.id),
    sessionId: String(t.session_id),
    classId:   String(t.class_id),
    subjectId: String(t.subject_id),
    week:      t.week_no || 0,
    topic:     t.topic || '',
    summary:   t.summary || '',
    teacherId: t.teacher_id ? String(t.teacher_id) : null
  }));

  // ── LMS — lessons, quizzes, questions, attempts, discussions, posts
  _cache.lmsLessons = (raw.lmsLessons || []).map(l => ({
    id:        String(l.id),
    sessionId: l.session_id ? String(l.session_id) : null,
    termId:    l.term_id   ? String(l.term_id)   : null,
    subjectId: String(l.subject_id),
    classId:   String(l.class_id),
    teacherId: l.teacher_id ? String(l.teacher_id) : null,
    title:     l.title,
    content:   l.content,
    createdAt: l.created_at || null
  }));

  _cache.lmsQuizzes = (raw.lmsQuizzes || []).map(q => ({
    id:          String(q.id),
    sessionId:   q.session_id ? String(q.session_id) : null,
    termId:      q.term_id    ? String(q.term_id)    : null,
    subjectId:   String(q.subject_id),
    classId:     String(q.class_id),
    teacherId:   q.teacher_id ? String(q.teacher_id) : null,
    title:       q.title,
    description: q.description || '',
    isPublished: !!q.is_published,
    createdAt:   q.created_at || null
  }));

  _cache.lmsQuestions = (raw.lmsQuestions || []).map(q => ({
    id:            String(q.id),
    quizId:        String(q.quiz_id),
    questionText:  q.question_text,
    questionType:  q.question_type || 'mc',
    options: {
      A: q.option_a || '', B: q.option_b || '',
      C: q.option_c || '', D: q.option_d || ''
    },
    correctAnswer: q.correct_answer || '',
    points:        Number(q.points) || 1,
    position:      Number(q.position) || 0
  }));

  _cache.lmsAttempts = (raw.lmsAttempts || []).map(a => ({
    id:          String(a.id),
    quizId:      String(a.quiz_id),
    studentId:   String(a.student_id),
    score:       Number(a.score) || 0,
    total:       Number(a.total) || 0,
    answers:     a.answers || {},
    submittedAt: a.submitted_at || null
  }));

  _cache.lmsDiscussions = (raw.lmsDiscussions || []).map(d => ({
    id:        String(d.id),
    sessionId: d.session_id ? String(d.session_id) : null,
    termId:    d.term_id    ? String(d.term_id)    : null,
    subjectId: String(d.subject_id),
    classId:   String(d.class_id),
    teacherId: d.teacher_id ? String(d.teacher_id) : null,
    title:     d.title,
    body:      d.body || '',
    createdAt: d.created_at || null
  }));

  _cache.lmsPosts = (raw.lmsPosts || []).map(p => ({
    id:           String(p.id),
    discussionId: String(p.discussion_id),
    userId:       p.user_id ? String(p.user_id) : null,
    body:         p.body,
    createdAt:    p.created_at || null
  }));

  // ── growth system — portfolio artifacts, commendations, parent
  // engagements, teacher recognition and manual promotion overrides.
  _cache.promotionOverrides = (raw.promotionOverrides || []).map(o => ({
    id:          String(o.id),
    studentId:   String(o.student_id),
    sessionId:   String(o.session_id),
    decision:    o.decision,
    reason:      o.reason || '',
    setBy:       o.set_by ? String(o.set_by) : null,
    setAt:       o.set_at || null
  }));

  _cache.artifacts = (raw.artifacts || []).map(a => ({
    id:          String(a.id),
    studentId:   String(a.student_id),
    kind:        a.kind || 'other',        // code | debate | sport | leadership | other
    title:       a.title || '',
    note:        a.note || '',
    status:      a.status || 'pending',    // pending | verified | rejected
    createdBy:   a.created_by ? String(a.created_by) : null,
    verifiedBy:  a.verified_by ? String(a.verified_by) : null,
    decidedAt:   a.decided_at || null,
    createdAt:   a.created_at || null
  }));

  _cache.commendations = (raw.commendations || []).map(c => ({
    id:          String(c.id),
    studentId:   String(c.student_id),
    teacherId:   String(c.teacher_id),
    note:        c.note || '',
    createdAt:   c.created_at || null
  }));

  _cache.parentEngagements = (raw.parentEngagements || []).map(p => ({
    id:        String(p.id),
    parentId:  String(p.parent_id),
    kind:      p.kind || 'login',          // login | ack_results | pta | early_payment
    sessionId: p.session_id ? String(p.session_id) : null,
    at:        p.at || p.created_at || null
  }));

  _cache.teacherRecognitions = (raw.teacherRecognitions || []).map(t => ({
    id:         String(t.id),
    teacherId:  String(t.teacher_id),
    kind:       t.kind || 'honor',         // master_register | honor | teacher_of_month
    sessionId:  t.session_id ? String(t.session_id) : null,
    note:       t.note || '',
    awardedAt:  t.awarded_at || t.created_at || null
  }));

  // ── timetable_settings — the school day (single row, else defaults)
  const tt = (raw.ttSettings || [])[0] || null;
  _cache.ttSettings = tt ? {
    periods:  Number(tt.periods_per_day) || 7,
    start:    (tt.start_time || '08:00').slice(0, 5),
    minutes:  Number(tt.period_minutes) || 45,
    breaks:   Array.isArray(tt.breaks) ? tt.breaks : []
  } : null;

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

  // Fall back to the bundled demo school when the database cannot supply a
  // usable one: offline, a rejected key, or a database that has not been
  // migrated. Checking only for "no users" is not enough, because a partly
  // migrated database can hold a handful of people and nothing else, which
  // looks like a working school but silently breaks every report.
  const thin = [];
  if (!_cache.users.length)    thin.push('users');
  if (!_cache.students.length) thin.push('students');
  if (!_cache.classes.length)  thin.push('classes');
  if (!_cache.subjects.length) thin.push('subjects');
  if (thin.length) {
    console.warn('[HMA] database has no usable school (missing: ' + thin.join(', ') +
                 ') - loading the bundled demo school instead');
    _loadSeedFallback();
  }
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
    _id:          sessRow?.id || null,
    name,
    currentTerm:  current.term,
    uploadOpen:   sessRow?.upload_open || { test: false, exam: false },
    midtermBreak: sessRow?.midterm_break || { start: null, end: null },
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

// Next academic-year label for "2026 / 2027" -> "2027 / 2028".
function nextSessionLabel(name) {
  const years = String(name || '').match(/\d{4}/g) || [];
  const end = years.length ? Math.max(...years.map(Number)) : new Date().getFullYear();
  return `${end} / ${end + 1}`;
}

// Shift the current session's term dates forward one year for the new year.
function nextTermDates(terms) {
  return (terms || []).slice(0, 3).map(t => {
    const shift = s => { if (!s) return null; const d = new Date(s); if (isNaN(d.getTime())) return null; d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); };
    return { start: shift(t.start), end: shift(t.end) };
  });
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
    midtermBreak: { start: null, end: null },
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
  _cache.attendanceDaily= DB.get('attendanceDaily')|| {};
  _cache.feedback       = DB.get('feedback')       || {};
  _cache.mentors        = _cache.users
    .filter(u => STAFF_ROLES.includes(u.role))
    .map(u => ({ id: u.id, name: u.name, initials: u.initials, tone: u.tone,
                 phone: u.phone, role: u.role, isMentor: !!u.isMentor,
                 subject: u.mentorSubject || 'General', bio: u.mentorBio || '' }));
  _cache.promotions        = DB.get('promotions')     || [];
  _cache.pathRequests      = DB.get('pathRequests')   || [];
  _cache.subjectSelections = DB.get('subjectSelections') || {};
  _cache.selectionRules    = DB.get('selectionRules') || null;
  _cache.approvalRequests  = DB.get('approvalRequests') || [];
  _cache.transfers         = DB.get('transfers')      || [];
  _cache.scoreUploads      = DB.get('scoreUploads')   || [];
  _cache.weeklyTopics      = DB.get('weeklyTopics')   || [];
  _cache.lmsLessons     = DB.get('lmsLessons')     || [];
  _cache.lmsQuizzes     = DB.get('lmsQuizzes')     || [];
  _cache.lmsQuestions   = DB.get('lmsQuestions')   || [];
  _cache.lmsAttempts    = DB.get('lmsAttempts')    || [];
  _cache.lmsDiscussions = DB.get('lmsDiscussions') || [];
  _cache.lmsPosts       = DB.get('lmsPosts')       || [];
  _cache.ttSettings        = DB.get('ttSettings')     || null;
  _cache.promotionOverrides= DB.get('promotionOverrides') || [];
  _cache.artifacts         = DB.get('artifacts')         || [];
  _cache.commendations     = DB.get('commendations')     || [];
  _cache.parentEngagements = DB.get('parentEngagements') || [];
  _cache.teacherRecognitions = DB.get('teacherRecognitions') || [];
  _cache.published         = DB.get('published')      || {};
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

  const session = [{ id: 1, name: '2026 / 2027', is_current: true, upload_open: { test: false, exam: true }, midterm_break: { start: '2026-10-26', end: '2026-10-30' } }];
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
    ['Chidinma Eze','chidinma.eze@happyman.edu','08040000011','green'],
    // Repeated student — failed Grade 8 last session, still in Grade 8
    ['Emeka Okafor','emeka.okafor@happyman.edu','08040000012','yellow']
  ];

  const users = [];
  USERS.forEach((u, i) => {
    const salt = newSalt();
    const hash = hashPassword(u[2], salt);
    users.push({
      id: i + 1, name: u[0], email: u[1],
      password_hash: hash, password_salt: salt,
      role: u[3], phone: u[4],
      tone: u[5], staff_role: u[6], is_mentor: u[7], mentor_subject: u[8], mentor_bio: u[9]
    });
  });
  const staffCount = USERS.length;
  STUDENT_USERS.forEach((u, i) => {
    const salt = newSalt();
    const hash = hashPassword('student123', salt);
    users.push({
      id: staffCount + i + 1, name: u[0], email: u[1],
      password_hash: hash, password_salt: salt,
      role: 'student', phone: u[2], tone: u[3],
      staff_role: null, is_mentor: false, mentor_subject: null, mentor_bio: null
    });
  });
  const parentId = users.length + 1;
  const _pSalt = newSalt();
  users.push({
    id: parentId, name: 'Mrs. Comfort Osei', email: 'parent@happyman.edu',
    password_hash: hashPassword('parent123', _pSalt), password_salt: _pSalt,
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
    ['Chidinma Eze','Grade 12 Arts','HMA/2026/011','F','arts@happyman.edu'],
    // Repeated: failed Grade 8 last session (avg 34%), now repeating Grade 8
    ['Emeka Okafor','Grade 8','HMA/2025/012','M','jss@happyman.edu']
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

  // ── Emeka Okafor — repeated Grade 8 student
  // His scores from last session were low (avg ~34%). Seed two terms of
  // current-session scores at a "recovery" level (~42%) so teachers and
  // parents can see him catching up but still below the 50% gate.
  const emeka = students.find(s => s.users.name === 'Emeka Okafor');
  if (emeka) {
    const emekaStrength = 0.34;   // last-session failure level
    const emekaRecovery = 0.42;   // current session — improving but not there yet
    const subsInEmeka = subjects.filter(s =>
      teacherSubs.some(t => t.class_id === emeka.class_id && t.subject_id === s.id));
    subsInEmeka.forEach(s => {
      [1, 2].forEach(termId => {
        const base = clamp(emekaRecovery + (rand(emeka.id * 31 + s.id * 13 + termId * 5) - 0.5) * 0.10, 0.05, 0.55);
        grades.push({
          id: gId++, student_id: emeka.id, subject_id: s.id, term_id: termId,
          ca_score:   clamp(Math.round(base * 40), 0, 40),
          exam_score: clamp(Math.round(base * 60), 0, 60)
        });
      });
    });
  }

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

  // ── daily attendance derived from the weekly roll-up, so the class
  // teacher's daily register agrees with the weekly summaries.
  const attendanceDaily = [];
  let adId = 1;
  students.forEach((st, r) => {
    [1, 2].forEach(termId => {
      [1, 2, 3, 4, 5].forEach(w => {
        const present = clamp(Math.round(5 - rand(r * 17 + w * 3 + termId) * 3), 0, 5);
        for (let d = 0; d < present; d++) {
          attendanceDaily.push({
            id: adId++, student_id: st.id, term_id: termId,
            week_number: w, day_index: d,
            status: (d === present - 1 && present < 5 && rand(r * 31 + w * 7 + d + termId) > 0.55)
              ? 'late' : 'present'
          });
        }
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

  // ── LMS demo content (mirrors the seed: English · Grade 7)
  const g7   = classes.find(c => c.class_name === 'Grade 7');
  const eng  = subjByName.get('English Studies');
  const engT = uid('subject@happyman.edu');
  const lmsLessons = g7 && eng ? [{
    id: 1, session_id: 1, term_id: 1, subject_id: eng.id, class_id: g7.id,
    teacher_id: engT, title: 'Nouns and their types',
    content: 'A noun names a person, place, thing or idea.\n\nCommon nouns name general things (girl, town, book), proper nouns name specific ones (Ama, Kumasi, Treasure Island).\n\nRead the short passage and list five common nouns and two proper nouns you find.',
    created_at: '2026-09-18T09:00:00Z'
  }] : [];
  const lmsQuizzes = g7 && eng ? [{
    id: 1, session_id: 1, term_id: 1, subject_id: eng.id, class_id: g7.id,
    teacher_id: engT, title: 'Parts of speech',
    description: 'Quick check on nouns and verbs from this week\'s work.',
    is_published: true, created_at: '2026-09-20T09:00:00Z'
  }] : [];
  const lmsQuestions = g7 && eng ? [
    { id: 1, quiz_id: 1, question_text: 'Which word is a proper noun?', question_type: 'mc', option_a: 'town', option_b: 'Ama', option_c: 'book', option_d: 'idea', correct_answer: 'Ama', points: 1, position: 0 },
    { id: 2, quiz_id: 1, question_text: 'Which phrase is a collective noun?', question_type: 'mc', option_a: 'a flock of birds', option_b: 'a red car', option_c: 'a tall tree', option_d: 'a sweet mango', correct_answer: 'a flock of birds', points: 1, position: 1 },
    { id: 3, quiz_id: 1, question_text: 'A verb is an action word.', question_type: 'tf', option_a: 'True', option_b: 'False', option_c: '', option_d: '', correct_answer: 'True', points: 1, position: 2 }
  ] : [];
  const lmsAttempts = g7 && eng && students.length ? [{
    id: 1, quiz_id: 1, student_id: students[0].id, score: 2, total: 3,
    answers: { '1': 'Ama', '2': 'a flock of birds', '3': 'False' },
    submitted_at: '2026-09-21T11:00:00Z'
  }] : [];
  const lmsDiscussions = g7 && eng ? [{
    id: 1, session_id: 1, term_id: 1, subject_id: eng.id, class_id: g7.id,
    teacher_id: engT, title: 'Why do you like reading?',
    body: 'Tell us about a book or story you loved this term and why. Keep it to three or four sentences.',
    created_at: '2026-09-19T10:00:00Z'
  }] : [];
  const lmsPosts = g7 && eng ? [{
    id: 1, discussion_id: 1, user_id: engT,
    body: 'I loved Treasure Island best — the map and the pirates make it exciting.',
    created_at: '2026-09-19T12:00:00Z'
  }] : [];

  // ── Growth system demo content — a few verified artifacts, one pending
  // project, commendations, parent engagements and a recognition award so
  // the passports, badges and leaderboard have something to show.
  const demoTeacherId = uid('class@happyman.edu');
  const artifacts = [
    // Ama Osei (id 1) — matches the sample passport
    { id: 1, student_id: students[0].id, kind: 'code', title: 'Automated Access Log Application',
      note: 'Built a custom vehicle traffic logging tool using Google Apps Script for campus security access control.',
      status: 'verified', created_by: demoTeacherId, verified_by: demoTeacherId,
      decided_at: '2026-09-25T10:00:00Z', created_at: '2026-09-20T09:00:00Z' },
    { id: 2, student_id: students[0].id, kind: 'leadership', title: 'Assistant Head Prefect',
      note: 'Appointed for the 2026/2027 session. Managed student council and organized inter-house debates.',
      status: 'verified', created_by: demoTeacherId, verified_by: demoTeacherId,
      decided_at: '2026-09-25T10:05:00Z', created_at: '2026-09-15T09:00:00Z' },
    // Fatima Yusuf (id 6) earned the Sportsperson badge
    { id: 3, student_id: students[5].id, kind: 'sport', title: 'Inter-house athletics team',
      note: 'Represented Grade 10 in the annual inter-house athletics championships.',
      status: 'verified', created_by: demoTeacherId, verified_by: demoTeacherId,
      decided_at: '2026-10-01T10:00:00Z', created_at: '2026-09-28T09:00:00Z' },
    // Yaw Boateng (id 2) — a pending project awaiting teacher verification
    { id: 4, student_id: students[1].id, kind: 'code', title: 'Class timetable helper',
      note: 'A small website that turns a paper timetable into a clean weekly grid.',
      status: 'pending', created_by: students[1].user_id,
      verified_by: null, decided_at: null, created_at: '2026-10-05T09:00:00Z' }
  ];
  const commendations = [
    { id: 1, student_id: students[0].id, teacher_id: demoTeacherId,
      note: 'Took the lead organising the class reading corner this term.', created_at: '2026-09-30T11:00:00Z' }
  ];
  const parentEngagements = [
    { id: 1, parent_id: parentId, kind: 'login',          session_id: 1, at: '2026-09-08T08:00:00Z' },
    { id: 2, parent_id: parentId, kind: 'login',          session_id: 1, at: '2026-09-22T08:00:00Z' },
    { id: 3, parent_id: parentId, kind: 'early_payment',  session_id: 1, at: '2026-09-12T09:00:00Z' },
    { id: 4, parent_id: parentId, kind: 'ack_results',    session_id: 1, at: '2026-09-21T18:00:00Z' },
    { id: 5, parent_id: parentId, kind: 'pta',            session_id: 1, at: '2026-09-15T15:00:00Z' }
  ];
  const teacherRecognitions = [
    { id: 1, teacher_id: demoTeacherId, kind: 'master_register', session_id: 1,
      note: 'Submitted every CA and Exam score ahead of the deadline.', awarded_at: '2026-09-30T12:00:00Z' }
  ];

  // ── Emeka Okafor's previous-session promotion record (Repeat)
  // session_id 0 = the previous academic year (before the current session=1).
  // This appears in his history chips on the report drawer and admin view.
  const emekaPromotion = emeka ? [{
    id: 1,
    student_id:   emeka.id,
    session_id:   0,               // previous session
    from_class_id: emeka.class_id, // stayed in Grade 8
    to_class_id:   emeka.class_id, // same class — repeated
    outcome:      'repeat',
    avg:          34,
    en_score:     28,
    ma_score:     30,
    class_position: null,
    year_position:  null,
    decided_by:   null
  }] : [];

  // Build the flat teacherClasses array from the class objects
  const teacherClasses = classes
    .filter(c => c.teacher_classes?.[0]?.teacher_id)
    .map(c => ({ class_id: c.id, teacher_id: c.teacher_classes[0].teacher_id }));

  _hydrate({
    session, terms, users, subjects, classes, students, parents: [
      { parent_id: parentId, student_id: students[0].id },
      { parent_id: parentId, student_id: students[5].id }
    ],
    teacherClasses,
    teacherSubs, departments, grades, attendance, assignments, events, remarks,
    attendanceDaily,
    lmsLessons, lmsQuizzes, lmsQuestions, lmsAttempts, lmsDiscussions, lmsPosts,
    promotionOverrides: [], promotions: emekaPromotion,
    artifacts, commendations, parentEngagements, teacherRecognitions,
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
    _sb.from('sessions').update({ name: s.name, upload_open: s.uploadOpen, midterm_break: s.midtermBreak })
       .eq('id', s._id).then(() => {});
    const termRow = s.terms?.find(t => t.term === s.currentTerm);
    if (termRow?._id) {
      _sb.from('terms').update({ is_current: true }).eq('id', termRow._id).then(() => {});
      s.terms.filter(t => t.term !== s.currentTerm).forEach(t => {
        if (t._id) _sb.from('terms').update({ is_current: false }).eq('id', t._id).then(() => {});
      });
    }
  },

  // ── Promotion gate ─────────────────────────────────────────
  // Promotions ("Promote / Pool / Graduate / Repeat") are only shown once
  // the admin closes the session by publishing the final term's results.
  promotionsGate() {
    const sess = this.session();
    const terms = (sess?.terms || []).slice();
    const last  = terms.length ? Math.max(...terms.map(t => t.term)) : 3;
    const name  = terms.find(t => t.term === last)?.name || `Term ${last}`;
    if (!sess || !terms.length)
      return { open: false, term: last, reason: 'No session is configured yet.' };
    if ((sess.currentTerm || 0) < last)
      return { open: false, term: last, reason: `${name} has not begun — promotion decisions unlock after you close the session on ${name} results.` };
    if (!this.published(last))
      return { open: false, term: last, reason: `${name} results are not published yet — publish them to close the session and unlock promotion decisions.` };
    return { open: true, term: last, reason: `${name} results are published — promotion decisions are unlocked.` };
  },

  // Cached promotion records for one student (any session they were in).
  promotionsFor(studentId) {
    return (_cache.promotions || []).filter(p => String(p.studentId) === String(studentId));
  },

  // True when an account is barred from signing in (archived student).
  accountBlocked(user) {
    if (!user || user.role !== 'Student') return false;
    return this.student(user.studentId)?.status === 'archived';
  },

  // Next academic-year label, e.g. "2026 / 2027" -> "2027 / 2028".
  nextSessionLabel() { return nextSessionLabel(this.session()?.name); },

  // ── New academic session ───────────────────────────────────
  // The end-of-session close. Final promotion records are snapshot for the
  // year just ending, the sessions row is closed, and a brand-new sessions
  // row + three terms are opened. Classes, teachers and student placements
  // carry over (they were already moved by the promotion commit); scores,
  // attendance and term content belong to the new term ids, so the new year
  // starts clean while all previous records remain in the database.
  async startNewSession({ name, userId } = {}) {
    const sess     = this.session();
    const terms    = (sess?.terms || []).slice();
    const gate     = this.promotionsGate();
    if (!gate.open) return null;

    // 1. Final promotion records for the closing year (all active students).
    const rows = Data.students()
      .filter(s => s.status === 'active')
      .map(s => {
        const d = Progression.decision(s.id);
        const poolId = Progression.poolClass()?.id || null;
        return {
          studentId: s.id,
          fromClassId: s.classId,
          toClassId: d.outcome === 'pooled' ? poolId
            : d.outcome === 'promoted' ? Progression.classAfter(s.classId) : null,
          outcome:  d.outcome,
          avg:      d.check?.avg      ?? null,
          en:       d.check?.english  ?? null,
          ma:       d.check?.maths    ?? null
        };
      });
    if (rows.length) await Progression.snapshotPromotions(rows);

    // 2. Close the current session.
    if (sess && sess._id) {
      try {
        await _sb.from('sessions')
          .update({ is_current: false, is_closed: true, closed_at: new Date().toISOString(), closed_by: Number(userId) || null })
          .eq('id', Number(sess._id));
      } catch (err) {
        console.warn('[HMA] session close not saved:', err?.message || err);
      }
    }

    // 3. Open the next year: a fresh session + three terms (dates shifted
    //    a year forward from the current session where available).
    const label = name || nextSessionLabel(sess?.name);
    const dates = nextTermDates(terms);
    let newId = null, termRows = [];
    try {
      const { data: s } = await _sb.from('sessions')
        .insert({ name: label, is_current: true, upload_open: { test: false, exam: false }, midterm_break: null })
        .select().single();
      newId = s?.id ?? null;
      if (newId) {
        await _sb.from('terms').insert([
          { session_id: Number(newId), name: '1st Term', is_current: true,  start_date: dates[0]?.start || null, end_date: dates[0]?.end || null },
          { session_id: Number(newId), name: '2nd Term', is_current: false, start_date: dates[1]?.start || null, end_date: dates[1]?.end || null },
          { session_id: Number(newId), name: '3rd Term', is_current: false, start_date: dates[2]?.start || null, end_date: dates[2]?.end || null }
        ]);
        const { data: ts } = await _sb.from('terms').select('id,name,start_date,end_date,is_current').eq('session_id', Number(newId));
        termRows = Array.isArray(ts) ? ts : [];
      }
    } catch (err) {
      console.warn('[HMA] new session not saved:', err?.message || err);
    }

    // 4. Point the cache at the new session so the page renders the same
    //    year without waiting for a reload (a reload re-reads everything).
    const def = t => ({ _id: null, term: t, name: ['1st Term','2nd Term','3rd Term'][t - 1], isCurrent: t === 1, start: null, end: null });
    const fromDb = num => {
      const r = termRows.find(x => x.name === ['1st Term','2nd Term','3rd Term'][num - 1]);
      return r ? { _id: String(r.id), term: num, name: r.name, isCurrent: !!r.is_current, start: r.start_date, end: r.end_date } : def(num);
    };
    _cache.session = {
      _id: newId ? String(newId) : null,
      name: label,
      currentTerm: 1,
      uploadOpen: { test: false, exam: false },
      midtermBreak: { start: null, end: null },
      terms: termRows.length ? [1, 2, 3].map(fromDb) : [def(1), def(2), def(3)]
    };
    _cache.published = { 1: false, 2: false, 3: false };
    DB.set('session', _cache.session);
    DB.set('published', _cache.published);
    return _cache.session;
  },

  // ── Student lifecycle ──────────────────────────────────────
  // Active ⇄ archived. An archived student cannot sign in, but scores,
  // attendance, promotions and transfers are never deleted, so the admin
  // can still open their full records.
  async setStudentStatus(studentId, status, reason, { userId } = {}) {
    const st = this.student(studentId);
    if (!st) return null;
    st.status = status;
    st.statusReason = reason || null;
    DB.set('students', _cache.students);
    try {
      await _sb.from('students').update({
        status,
        status_reason: reason || null,
        status_changed_at: new Date().toISOString(),
        status_session_id: Data.session()?._id ? Number(Data.session()._id) : null
      }).eq('id', Number(studentId));
    } catch (err) {
      console.warn('[HMA] student status not saved:', err?.message || err);
    }
    return st;
  },

  failedSources() { return _cache.failed.slice(); },

  // ── Users ─────────────────────────────────────────────────
  users()            { return _cache.users; },
  userByEmail(email) { return _cache.users.find(u => u.email === email) || null; },
  user(id)           { return _cache.users.find(u => u.id === String(id)) || null; },
  teachers()         { return _cache.users.filter(u => ['Subject Teacher','Class Teacher','HOD'].includes(u.role)); },

  // True when `typed` is the right password for this account.
  // All accounts now use salted SHA-256 — plaintext fallback removed.
  passwordMatches(user, typed) {
    if (!user) return false;
    if (user.passwordHash && user.passwordSalt) {
      return hashPassword(typed, user.passwordSalt) === user.passwordHash;
    }
    // No hash present — account has never had a password set or migration
    // hasn't run yet; deny access rather than allow an unguarded login.
    return false;
  },

  generateTempPassword: () => generateTempPassword(),

  // Write a new password for an account. Who may do this:
  //   - an Administrator may reset anyone (staff who forgot their password)
  //   - a Class Teacher may reset students in their own class
  // Everything else is refused client-side (the same best-effort boundary
  // as the rest of the app).
  async resetPassword(userId, newPassword, actor) {
    const user = this.user(userId);
    const actorRec = actor ? this.user(actor.id) : null;
    if (!user || !actorRec) return null;
    const targetIsStaff = STAFF_ROLES.includes(user.role) || user.role === 'Administrator';
    if (actorRec.role !== 'Administrator') {
      if (targetIsStaff) return null;
      const cls = this.classes().find(c => c.classTeacherId === String(actorRec.id));
      const stu = this.student(userId);
      if (!cls || !stu || String(stu.classId) !== String(cls.id)) return null;
    }
    const salt = newSalt();
    const hash = hashPassword(newPassword, salt);
    user.passwordHash = hash; user.passwordSalt = salt;
    DB.set('users', _cache.users);
    await _sb.from('users')
      .update({ password: null, password_hash: hash, password_salt: salt })
      .eq('id', Number(userId));
    return { ok: true };
  },

  async addUser(u) {
    const salt = newSalt();
    const hash = u.password != null && u.password !== '' ? hashPassword(u.password, salt) : null;
    const payload = {
      name: u.name, email: u.email,
      role: _unmapRole(u.role), staff_role: u.role === 'Administrator' || ['Student','Parent'].includes(u.role) ? null : u.role,
      phone: u.phone || null, tone: u.tone || 'blue',
      initials: u.initials || avatarInitials(u.name),
      is_mentor: !!u.isMentor
    };
    // Add locally first so the caller can redraw without waiting on the
    // network, then reconcile with the row the database returns.
    const record = { ...u, id: u.id || uid('U'), studentId: null, childIds: [],
      passwordHash: hash, passwordSalt: hash ? salt : null };
    _cache.users.push(record);
    DB.set('users', _cache.users);
    try {
      const { data, error } = await _sb.from('users')
        .insert({ ...payload, password: null, password_hash: hash, password_salt: salt })
        .select().single();
      if (error) throw error;
      if (data) {
        Object.assign(record, {
          id: String(data.id), role: _mapRole(data.role, data.staff_role),
          name: data.name, initials: data.initials || record.initials,
          tone: data.tone || record.tone, email: data.email, phone: data.phone,
          passwordHash: hash, passwordSalt: hash ? salt : null,
          isMentor: !!data.is_mentor,
          mentorSubject: data.mentor_subject || '', mentorBio: data.mentor_bio || ''
        });
        DB.set('users', _cache.users);
      }
    } catch (err) {
      console.warn('[HMA] user not saved remotely:', err?.message || err);
    }
    return record;
  },

  async updateUser(id, patch) {
    const user = this.user(id);
    if (!user) return null;
    const rest = { ...patch };
    delete rest.password;
    Object.assign(user, rest);
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
    // Setting a password (always a fresh hash, never stored in the clear)
    if (patch.password !== undefined && patch.password !== null && patch.password !== '') {
      const salt = newSalt();
      const hash = hashPassword(patch.password, salt);
      user.passwordHash = hash; user.passwordSalt = salt;
      payload.password = null; payload.password_hash = hash; payload.password_salt = salt;
    }
    if (Object.keys(payload).length) {
      _sb.from('users').update(payload).eq('id', Number(id)).then(r => {
        if (r?.error) console.warn('[HMA] updateUser not saved:', r.error?.message || r.error);
      });
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
  classes()  {
    // Always return sorted by year (7→12) so all dropdowns and tables
    // display Grade 7 before Grade 8 regardless of insertion order.
    return [..._cache.classes].sort((a, b) => {
      const ya = a.year ?? 99, yb = b.year ?? 99;
      if (ya !== yb) return ya - yb;
      return (a.stream || '').localeCompare(b.stream || '');
    });
  },
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
    // A teacher may lead at most ONE class. Releasing any other class the
    // teacher currently leads keeps that rule true no matter when this runs.
    const released = [];
    if (tid !== null) {
      _cache.classes.forEach(c => {
        if (c.id !== String(classId) && c.classTeacherId && String(c.classTeacherId) === String(tid)) {
          c.classTeacherId = null;
          released.push(Number(c.id));
        }
      });
    }
    // Applied before the network call so the UI can redraw immediately.
    klass.classTeacherId = tid === null ? null : String(tid);
    DB.set('classes', _cache.classes);

    if (Number.isFinite(cid) && !String(klass.id).startsWith('CL')) {
      try {
        for (const rid of released) {
          const { error: relErr } = await _sb.from('teacher_classes').delete().eq('class_id', rid);
          if (relErr) throw relErr;
        }
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
    } else {
      console.warn('[HMA] class teacher not saved remotely: local-only class');
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

  // Write a single CA/exam entry for one student+subject+term to both the
  // in-memory cache and the Supabase grades table.
  async saveGrade(studentId, subjectId, term, ca, exam) {
    const sid  = String(studentId);
    const sub  = String(subjectId);
    const termId = _termIdFromNum(term);
    if (!termId) { console.warn('[HMA] saveGrade: unknown term', term); return false; }
    // Update cache immediately so the UI reflects the change without a reload
    if (!_cache.scores[sid]) _cache.scores[sid] = {};
    if (!_cache.scores[sid][sub]) _cache.scores[sid][sub] = {};
    _cache.scores[sid][sub][term] = { test: Number(ca) || 0, exam: Number(exam) || 0 };
    try {
      const { error } = await _sb.from('grades').upsert({
        student_id: Number(sid),
        subject_id: Number(sub),
        term_id:    Number(termId),
        ca_score:   Math.min(40, Math.max(0, Number(ca)  || 0)),
        exam_score: Math.min(60, Math.max(0, Number(exam) || 0))
      }, { onConflict: 'student_id,subject_id,term_id' });
      if (error) throw error;
      return true;
    } catch (err) {
      console.warn('[HMA] grade not saved:', err?.message || err);
      return false;
    }
  },

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
        // keep the daily register in step with a manual weekly edit
        this._writeWeekDaily(t, sid, parseInt(String(week).replace('W', ''), 10),
                             Math.min(5, Math.max(0, +days || 0)), termId);
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

  // ── Attendance (daily) ────────────────────────────────────
  dailyAttendance(term) { return _cache.attendanceDaily[term || this.currentTerm()] || {}; },
  dayStatus(sid, week, dayIdx, term) {
    const arr = this.dailyAttendance(term)[`W${week || 1}`]?.[String(sid)];
    return (arr && arr[dayIdx]) || null;
  },
  // Upload a full week of daily marks. rows: { studentId: [status ×5] }.
  async saveDailyWeek(week, rows, term) {
    const t   = term || this.currentTerm();
    const wk  = `W${week}`;
    const termId = _termIdFromNum(t);
    const day   = this.dailyAttendance(t);
    day[wk] = day[wk] || {};
    const inserts = [];
    const touched = [];
    const weekly  = [];
    for (const [sid, statuses] of Object.entries(rows)) {
      const arr = [];
      let any = false;
      for (let d = 0; d < 5; d++) {
        const st = statuses && statuses[d];
        if (st === 'present' || st === 'late' || st === 'absent') { arr[d] = st; any = true; }
        else arr[d] = '';
      }
      day[wk][String(sid)] = arr;
      if (!any) continue;
      const presentDays = arr.filter(st => st && st !== 'absent').length;
      touched.push(Number(sid));
      weekly.push({ student_id: Number(sid), term_id: termId, week_number: week, days_present: presentDays });
      // roll the touched students into the weekly summary
      const att = _cache.attendance[t] || {};
      att[String(sid)] = att[String(sid)] || {};
      att[String(sid)][wk] = presentDays;
      _cache.attendance[t] = att;
      for (let d = 0; d < 5; d++) {
        if (arr[d]) inserts.push({ student_id: Number(sid), term_id: termId, week_number: week, day_index: d, status: arr[d] });
      }
    }
    DB.set('attendanceDaily', _cache.attendanceDaily);
    DB.set('attendance', _cache.attendance);
    if (!termId || !touched.length) return;
    try {
      // a snapshot: delete the week for these students, re-insert the marks,
      // and push the derived weekly roll-up.
      await _sb.from('attendance_daily').delete()
        .eq('term_id', termId).eq('week_number', week)
        .in('student_id', touched);
      const { error } = await _sb.from('attendance_daily').insert(inserts);
      if (error) throw error;
      const { error: wErr } = await _sb.from('attendance_weekly')
        .upsert(weekly, { onConflict: 'student_id,term_id,week_number' });
      if (wErr) throw wErr;
    } catch (err) {
      console.warn('[HMA] daily attendance not saved remotely:', err?.message || err);
    }
  },
  // Mark one school day for the whole class.
  // marks = { studentId: 'present' | 'absent' }; the week's roll-up and the
  // student/parent/admin views all update from this single save.
  async saveDailyDay(week, dayIdx, marks, term) {
    const t      = term || this.currentTerm();
    const wk     = `W${week}`;
    const termId = _termIdFromNum(t);
    const day    = this.dailyAttendance(t);
    day[wk] = day[wk] || {};
    const upsert = [];
    const weekly = [];
    for (const [sid, st] of Object.entries(marks)) {
      if (st !== 'present' && st !== 'late' && st !== 'absent') continue;
      const arr = (day[wk][String(sid)] || []).slice();
      arr[dayIdx] = st;
      day[wk][String(sid)] = arr;
      upsert.push({
        student_id: Number(sid), term_id: termId,
        week_number: Number(week), day_index: Number(dayIdx), status: st
      });
      // recompute that student's week from the five cells now that the day is in
      const presentDays = arr.filter(x => x && x !== 'absent').length;
      weekly.push({ student_id: Number(sid), term_id: termId, week_number: Number(week), days_present: presentDays });
      const att = _cache.attendance[t] || {};
      att[String(sid)] = att[String(sid)] || {};
      att[String(sid)][wk] = presentDays;
      _cache.attendance[t] = att;
    }
    DB.set('attendanceDaily', _cache.attendanceDaily);
    DB.set('attendance', _cache.attendance);
    if (!termId || !upsert.length) return;
    try {
      const { error } = await _sb.from('attendance_daily')
        .upsert(upsert, { onConflict: 'student_id,term_id,week_number,day_index' });
      if (error) throw error;
      const { error: wErr } = await _sb.from('attendance_weekly')
        .upsert(weekly, { onConflict: 'student_id,term_id,week_number' });
      if (wErr) throw wErr;
    } catch (err) {
      console.warn('[HMA] daily attendance not saved remotely:', err?.message || err);
    }
  },
  // Derive a week of daily marks from a manually-entered weekly total.
  _writeWeekDaily(term, sid, week, days, termId) {
    const t  = term || this.currentTerm();
    const wk = `W${week}`;
    const arr = [];
    for (let d = 0; d < 5; d++) arr[d] = d < days ? 'present' : '';
    const day = this.dailyAttendance(t);
    day[wk] = day[wk] || {};
    day[wk][String(sid)] = arr;
    DB.set('attendanceDaily', _cache.attendanceDaily);
    if (!termId) return;
    (async () => {
      try {
        await _sb.from('attendance_daily').delete()
          .eq('student_id', Number(sid)).eq('term_id', termId).eq('week_number', week);
        if (days) {
          await _sb.from('attendance_daily').insert(
            Array.from({ length: days }, (_, d) => ({
              student_id: Number(sid), term_id: termId, week_number: week,
              day_index: d, status: 'present'
            })));
        }
      } catch (err) {
        console.warn('[HMA] attendance daily not synced remotely:', err?.message || err);
      }
    })();
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

  // ── Progression (promotions, requests, selections, day structure) ──
  promotions()        { return _cache.promotions || []; },
  promotionFor(sid)   { return this.promotions().find(p => p.studentId === String(sid)) || null; },
  pathRequests()      { return _cache.pathRequests || []; },
  subjectSelections() { return _cache.subjectSelections || {}; },
  selectionRules()    { return _cache.selectionRules; },
  approvalRequests()  { return _cache.approvalRequests || []; },
  transfers()         { return _cache.transfers || []; },
  scoreUploads()      { return _cache.scoreUploads || []; },
  weeklyTopics()      { return _cache.weeklyTopics || []; },
  promotionOverrides() { return _cache.promotionOverrides || []; },
  artifacts()          { return _cache.artifacts || []; },
  commendations()      { return _cache.commendations || []; },
  parentEngagements()  { return _cache.parentEngagements || []; },
  teacherRecognitions(){ return _cache.teacherRecognitions || []; },
  ttSettings()        { return _cache.ttSettings || null; },
  published(term)     { return !!(_cache.published || {})[term || this.currentTerm()]; },

  // The school day. Admin-editable via the single-row timetable_settings.
  // Changing it invalidates any saved timetable, so callers must warn first.
  async saveTimetableSettings(s, userId) {
    const cfg = {
      periods: Number(s.periods)  || 7,
      start:   (s.start || '08:00').slice(0, 5),
      minutes: Number(s.minutes)  || 45,
      breaks:  Array.isArray(s.breaks) ? s.breaks : []
    };
    _cache.ttSettings = cfg;
    try {
      await _sb.from('timetable_settings').upsert({
        id: 1,
        periods_per_day: cfg.periods,
        start_time:      cfg.start,
        period_minutes:  cfg.minutes,
        breaks:          cfg.breaks,
        updated_by:      userId ? Number(userId) : null
      }, { onConflict: 'id' });

      // Mirror the breaks into time_slots as is_break rows so reports can
      // reference them and the school day survives a regenerate. Period rows
      // are repopulated whenever a timetable is generated and saved.
      const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const brkRows = [];
      [1, 2, 3, 4, 5].forEach(day => {
        let cursor = _mins(cfg.start);
        for (let p = 1; p <= cfg.periods; p++) {
          cursor += cfg.minutes;
          cfg.breaks.forEach(b => {
            if (Number(b.after) !== p) return;
            const len = Number(b.minutes) || 15;
            brkRows.push({
              day_of_week: day,
              start_time:  fmt(cursor),
              end_time:    fmt(cursor + len),
              is_break:    true,
              label:       b.label || 'Break'
            });
            cursor += len;
          });
        }
      });
      await _sb.from('time_slots').upsert(brkRows, { onConflict: 'day_of_week,start_time,is_break' });
    } catch (err) {
      console.warn('[HMA] day structure not saved:', err?.message || err);
    }
  },

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
          // A free period is the absence of a lesson, so there is nothing to
          // store. Writing it as subject_id 0 would break the foreign key and
          // fail the whole save.
          if (period.free || !period.subjectId) return;
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
    // Snapshot only the numbered periods: breaks already live in time_slots
    // as is_break rows written by saveTimetableSettings.
    const missing = slots
      .filter(s => !s.isBreak)
      .filter(s => !map[`${s.day}|${s.start}|${s.end}`]);
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
  },

  // ── Learning management — lessons, quizzes, discussions ─────
  lmsLessons()     { return _cache.lmsLessons || []; },
  lmsQuizzes()     { return _cache.lmsQuizzes || []; },
  lmsQuestions()   { return _cache.lmsQuestions || []; },
  lmsAttempts()    { return _cache.lmsAttempts || []; },
  lmsDiscussions() { return _cache.lmsDiscussions || []; },
  lmsPosts()       { return _cache.lmsPosts || []; },

  lessonsFor(classId, subjectId) {
    return this.lmsLessons().filter(l =>
      (!classId || l.classId === String(classId)) &&
      (!subjectId || l.subjectId === String(subjectId))
    ).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  },
  quizzesFor(classId, subjectId) {
    return this.lmsQuizzes().filter(q =>
      (!classId || q.classId === String(classId)) &&
      (!subjectId || q.subjectId === String(subjectId))
    );
  },
  questionsForQuiz(quizId) {
    return this.lmsQuestions().filter(q => q.quizId === String(quizId))
      .sort((a, b) => (a.position || 0) - (b.position || 0));
  },
  attemptFor(quizId, studentId) {
    return this.lmsAttempts().find(a => a.quizId === String(quizId)
      && a.studentId === String(studentId)) || null;
  },
  discussionsFor(classId, subjectId) {
    return this.lmsDiscussions().filter(d =>
      (!classId || d.classId === String(classId)) &&
      (!subjectId || d.subjectId === String(subjectId))
    ).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  },
  postsFor(discussionId) {
    return this.lmsPosts().filter(p => p.discussionId === String(discussionId))
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  },

  async addLesson({ subjectId, classId, title, content }, userId) {
    const sessionId = Data.session()._id;
    let record = {
      id: uid('les_'), sessionId: sessionId ? String(sessionId) : null,
      subjectId: String(subjectId), classId: String(classId),
      teacherId: userId ? String(userId) : null, title, content,
      createdAt: new Date().toISOString()
    };
    try {
      const { data, error } = await _sb.from('lms_lessons').insert({
        session_id: record.sessionId ? Number(record.sessionId) : null,
        term_id:    _termIdFromNum(Data.currentTerm()),
        subject_id: Number(subjectId), class_id: Number(classId),
        teacher_id: userId ? Number(userId) : null, title, content
      }).select().single();
      if (error) throw error;
      record.id = String(data.id); record.createdAt = data.created_at;
    } catch (err) {
      console.warn('[HMA] lesson not saved remotely:', err?.message || err);
    }
    _cache.lmsLessons = [record, ...(_cache.lmsLessons || [])];
    DB.set('lmsLessons', _cache.lmsLessons);
    return record;
  },
  async deleteLesson(id, userId) {
    _cache.lmsLessons = (_cache.lmsLessons || []).filter(l => l.id !== String(id));
    DB.set('lmsLessons', _cache.lmsLessons);
    try { await _sb.from('lms_lessons').delete().eq('id', Number(id)); }
    catch (err) { console.warn('[HMA] lesson not deleted remotely:', err?.message || err); }
  },
  async createQuiz({ subjectId, classId, title, description }, userId) {
    const sessionId = Data.session()._id;
    let record = {
      id: uid('qz_'), sessionId: sessionId ? String(sessionId) : null,
      subjectId: String(subjectId), classId: String(classId),
      teacherId: userId ? String(userId) : null, title, description: description || '',
      isPublished: false, createdAt: new Date().toISOString()
    };
    try {
      const { data, error } = await _sb.from('lms_quizzes').insert({
        session_id: record.sessionId ? Number(record.sessionId) : null,
        term_id:    _termIdFromNum(Data.currentTerm()),
        subject_id: Number(subjectId), class_id: Number(classId),
        teacher_id: userId ? Number(userId) : null, title, description: description || '',
        is_published: false
      }).select().single();
      if (error) throw error;
      record.id = String(data.id); record.createdAt = data.created_at;
    } catch (err) {
      console.warn('[HMA] quiz not saved remotely:', err?.message || err);
    }
    _cache.lmsQuizzes = [record, ...(_cache.lmsQuizzes || [])];
    DB.set('lmsQuizzes', _cache.lmsQuizzes);
    return record;
  },
  async saveQuizQuestions(quizId, questions) {
    const clean = questions
      .filter(q => q.questionText && String(q.questionText).trim())
      .map((q, i) => ({
        id: uid('qq_'), quizId: String(quizId),
        questionText: String(q.questionText).trim(),
        questionType: q.questionType === 'tf' ? 'tf' : 'mc',
        options: {
          A: q.questionType === 'tf' ? 'True' : (q.options?.A || ''),
          B: q.questionType === 'tf' ? 'False' : (q.options?.B || ''),
          C: q.questionType === 'tf' ? '' : (q.options?.C || ''),
          D: q.questionType === 'tf' ? '' : (q.options?.D || '')
        },
        correctAnswer: q.correctAnswer || '',
        points: Number(q.points) || 1
      }));
    _cache.lmsQuestions = [
      ...(_cache.lmsQuestions || []).filter(q => q.quizId !== String(quizId)),
      ...clean
    ];
    DB.set('lmsQuestions', _cache.lmsQuestions);
    try {
      await _sb.from('lms_questions').delete().eq('quiz_id', Number(quizId));
      if (clean.length) {
        const { error } = await _sb.from('lms_questions').insert(clean.map((q, i) => ({
          quiz_id: Number(quizId), question_text: q.questionText,
          question_type: q.questionType,
          option_a: q.options.A || null, option_b: q.options.B || null,
          option_c: q.options.C || null, option_d: q.options.D || null,
          correct_answer: q.correctAnswer, points: q.points, position: i
        })));
        if (error) throw error;
      }
    } catch (err) {
      console.warn('[HMA] quiz questions not saved:', err?.message || err);
    }
    return clean;
  },
  async setQuizPublished(quizId, isPublished) {
    const quiz = this.lmsQuizzes().find(q => q.id === String(quizId));
    if (!quiz) return;
    quiz.isPublished = !!isPublished;
    DB.set('lmsQuizzes', _cache.lmsQuizzes);
    try {
      await _sb.from('lms_quizzes').update({ is_published: !!isPublished }).eq('id', Number(quizId));
    } catch (err) {
      console.warn('[HMA] quiz status not saved:', err?.message || err);
    }
  },
  async deleteQuiz(quizId) {
    _cache.lmsQuizzes   = (_cache.lmsQuizzes || []).filter(q => q.id !== String(quizId));
    _cache.lmsQuestions = (_cache.lmsQuestions || []).filter(q => q.quizId !== String(quizId));
    _cache.lmsAttempts  = (_cache.lmsAttempts || []).filter(a => a.quizId !== String(quizId));
    DB.set('lmsQuizzes', _cache.lmsQuizzes);
    DB.set('lmsQuestions', _cache.lmsQuestions);
    DB.set('lmsAttempts', _cache.lmsAttempts);
    try { await _sb.from('lms_quizzes').delete().eq('id', Number(quizId)); }
    catch (err) { console.warn('[HMA] quiz not deleted remotely:', err?.message || err); }
  },
  async submitQuizAttempt(quizId, studentId, answers) {
    const questions = this.questionsForQuiz(quizId);
    if (!questions.length) return null;
    const map = answers || {};
    let score = 0, total = 0;
    const detail = questions.map(q => {
      const got = String(map[q.id] ?? '').trim();
      const right = got.toLowerCase() === String(q.correctAnswer).toLowerCase();
      if (right) score += q.points;
      total += q.points;
      return {
        questionId: q.id, questionText: q.questionText,
        studentAnswer: got, correctAnswer: q.correctAnswer,
        points: q.points, isCorrect: right
      };
    });
    if (!total) return null;
    const existing = this.attemptFor(quizId, studentId);
    const record = {
      id: existing?.id || uid('att_'), quizId: String(quizId), studentId: String(studentId),
      score, total, answers: map, submittedAt: new Date().toISOString()
    };
    _cache.lmsAttempts = [
      ...(_cache.lmsAttempts || []).filter(a =>
        !(a.quizId === record.quizId && a.studentId === record.studentId)),
      record
    ];
    DB.set('lmsAttempts', _cache.lmsAttempts);
    try {
      const { data, error } = await _sb.from('lms_attempts').upsert({
        quiz_id: Number(quizId), student_id: Number(studentId),
        score, total, answers: map, submitted_at: new Date().toISOString()
      }, { onConflict: 'quiz_id,student_id' }).select().single();
      if (error) throw error;
      record.id = String(data.id);
    } catch (err) {
      console.warn('[HMA] attempt not saved remotely:', err?.message || err);
    }
    return { score, total, detail };
  },
  async openDiscussion({ subjectId, classId, title, body }, userId) {
    const sessionId = Data.session()._id;
    let record = {
      id: uid('thr_'), sessionId: sessionId ? String(sessionId) : null,
      subjectId: String(subjectId), classId: String(classId),
      teacherId: userId ? String(userId) : null, title, body: body || '',
      createdAt: new Date().toISOString()
    };
    try {
      const { data, error } = await _sb.from('lms_discussions').insert({
        session_id: record.sessionId ? Number(record.sessionId) : null,
        term_id:    _termIdFromNum(Data.currentTerm()),
        subject_id: Number(subjectId), class_id: Number(classId),
        teacher_id: userId ? Number(userId) : null, title, body: body || ''
      }).select().single();
      if (error) throw error;
      record.id = String(data.id); record.createdAt = data.created_at;
    } catch (err) {
      console.warn('[HMA] discussion not saved remotely:', err?.message || err);
    }
    _cache.lmsDiscussions = [record, ...(_cache.lmsDiscussions || [])];
    DB.set('lmsDiscussions', _cache.lmsDiscussions);
    return record;
  },
  async deleteDiscussion(id, userId) {
    _cache.lmsDiscussions = (_cache.lmsDiscussions || []).filter(d => d.id !== String(id));
    _cache.lmsPosts       = (_cache.lmsPosts || []).filter(p => p.discussionId !== String(id));
    DB.set('lmsDiscussions', _cache.lmsDiscussions);
    DB.set('lmsPosts', _cache.lmsPosts);
    try { await _sb.from('lms_discussions').delete().eq('id', Number(id)); }
    catch (err) { console.warn('[HMA] discussion not deleted remotely:', err?.message || err); }
  },
  async addDiscussionPost(discussionId, userId, body) {
    let record = { id: uid('pst_'), discussionId: String(discussionId),
      userId: userId ? String(userId) : null, body, createdAt: new Date().toISOString() };
    try {
      const { data, error } = await _sb.from('lms_posts').insert({
        discussion_id: Number(discussionId), user_id: userId ? Number(userId) : null, body
      }).select().single();
      if (error) throw error;
      record.id = String(data.id); record.createdAt = data.created_at;
    } catch (err) {
      console.warn('[HMA] post not saved remotely:', err?.message || err);
    }
    _cache.lmsPosts = [...(_cache.lmsPosts || []), record];
    DB.set('lmsPosts', _cache.lmsPosts);
    return record;
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
  PASS_MARK: 50,  // promotion threshold — a mark must be AT LEAST this to pass

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

  // Promotion rule (live badge, shown per-term in dashboards):
  //   overall score per subject = avg of all terms that have data
  //   session average = sum of subject overalls / number of subjects ≥ 50%
  //   English overall ≥ 50 AND Maths overall ≥ 50
  promotionCheck(studentId, term) {
    const student = Data.student(studentId);
    const subs    = student ? this.classSubjects(student.classId) : Data.subjects();
    const sc      = Data.studentScores(studentId);

    // Build per-subject session overall (avg across all terms with data, up to the given term)
    const termsToCheck = [1, 2, 3].filter(t => t <= term);
    const subjectOveralls = subs.map(sub => {
      const vals = termsToCheck
        .map(t => { const e = sc[sub.id]?.[t]; return e ? e.test + e.exam : null; })
        .filter(v => v !== null);
      return { sub, overall: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
    });

    const validOveralls = subjectOveralls.filter(s => s.overall !== null);
    const avg = validOveralls.length
      ? Math.round(validOveralls.reduce((a, b) => a + b.overall, 0) / validOveralls.length)
      : 0;

    const findSubject = needle => subjectOveralls.find(s => s.sub.name.toLowerCase().includes(needle));
    const enEntry = findSubject('english');
    const maEntry = findSubject('math');
    const enScore = enEntry?.overall ?? null;
    const maScore = maEntry?.overall ?? null;
    // Missing score = no data yet; don't penalise
    const enPass  = enScore === null || enScore >= this.PASS_MARK;
    const maPass  = maScore === null || maScore >= this.PASS_MARK;

    return {
      avg,
      english:  enScore !== null ? Math.round(enScore) : 0,
      maths:    maScore !== null ? Math.round(maScore) : 0,
      enPass,
      maPass,
      avgPass:  avg >= this.PASS_MARK,
      pass:     enPass && maPass && avg >= this.PASS_MARK
    };
  },

  canPromote(studentId, term) { return this.promotionCheck(studentId, term).pass; },

  promotionStatus(studentId, term) {
    const check = this.promotionCheck(studentId, term);
    if (check.pass) return 'Promoted';
    // Review: avg is close but English or Maths is borderline
    if (check.avg >= 45) return 'Review';
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
//  PROGRESSION
//  Promotion, the Grade 9 checkpoint pool, subject registration,
//  approvals, positions and the school day. Pure decision logic in
//  here; the admin/student views in app.js orchestrate and present.
// ============================================================
const Progression = {

  RULES: {
    threshold: 50,   // a mark must be AT LEAST this to pass
    core: ['English Studies', 'Mathematics'],
    // 9 is a national-exam checkpoint year (two terms, no path choice
    // until next session); 12 leaves the school without a decision
    yearPolicy: { 7: 'gated', 8: 'gated', 9: 'checkpoint', 10: 'gated', 11: 'gated', 12: 'exit' }
  },

  yearOf(studentId) {
    const st = Data.student(studentId);
    if (!st) return null;
    return Data.cls(st.classId)?.year ?? null;
  },
  policy(year)  { return this.RULES.yearPolicy[Number(year)] || 'gated'; },
  isCheckpoint(year) { return this.policy(year) === 'checkpoint'; },   // grade 9
  exits(year)        { return this.policy(year) === 'exit'; },         // grade 12

  // Terms the student actually has marks for. A student who joined in
  // Term 2 attends (2, 3): that is what keeps their promotion average fair.
  attendedTerms(studentId) {
    return Data.session().terms
      .map(t => t.term)
      .filter(t => Academic.termScores(studentId, t).some(s => s.score !== null));
  },

  // Session average uses the correct promotion formula:
  //   1. Per subject: overall_score = (term1_score + term2_score + term3_score) / 3
  //      (only terms that have a score are included in the average)
  //   2. Session average = sum of all subject overall_scores / number of subjects
  // This is the end-of-session figure used for the promotion gate.
  sessionAverage(studentId) {
    const student = Data.student(studentId);
    if (!student) return null;
    const subs = this.classSubjects(student.classId);
    const sc   = Data.studentScores(studentId);
    const allTerms = [1, 2, 3];
    const subjectOveralls = subs.map(sub => {
      const termScores = allTerms
        .map(t => { const e = sc[sub.id]?.[t]; return e ? e.test + e.exam : null; })
        .filter(v => v !== null);
      if (!termScores.length) return null;
      return termScores.reduce((a, b) => a + b, 0) / termScores.length;
    }).filter(v => v !== null);
    if (!subjectOveralls.length) return null;
    return Math.round(subjectOveralls.reduce((a, b) => a + b, 0) / subjectOveralls.length);
  },

  // Subject session score for promotion display (English / Maths check):
  //   overall = average of that subject's score across all attended terms
  subjectSessionScore(studentId, needle) {
    const student = Data.student(studentId);
    if (!student) return null;
    const subs = this.classSubjects(student.classId);
    const sc   = Data.studentScores(studentId);
    const sub  = subs.find(s => s.name.toLowerCase().includes(needle));
    if (!sub) return null;
    const allTerms = [1, 2, 3];
    const termScores = allTerms
      .map(t => { const e = sc[sub.id]?.[t]; return e ? e.test + e.exam : null; })
      .filter(v => v !== null);
    if (!termScores.length) return null;
    return Math.round(termScores.reduce((a, b) => a + b, 0) / termScores.length);
  },

  // The end-of-session gate: English AT LEAST 50, Maths AT LEAST 50, session
// avg AT LEAST 50. Exactly 50 passes. Avg here is the whole-session average,
// unlike Academic.promotionCheck which only looks at one term for the live
// badges.
  promotionCheckFor(studentId) {
    const en  = this.subjectSessionScore(studentId, 'english');
    const ma  = this.subjectSessionScore(studentId, 'math');
    const avg = this.sessionAverage(studentId);
    if (en === null || ma === null || avg === null) {
      return { ready: false, pass: false, english: en, maths: ma, avg };
    }
    const t = this.RULES.threshold;
    return {
      ready: true,
      pass:  en >= t && ma >= t && avg >= t,
      english: en, maths: ma, avg
    };
  },

  // What happens to this student at the end of the session. An
  // administrator's manual decision (promotion_overrides) wins over the
  // rule — the "admin can still promote a student who scored below 50"
  // path. Overrides are looked up for the CURRENT session only, so a past
  // year's manual decisions never leak into a new one.
  decision(studentId) {
    const st = Data.student(studentId);
    if (!st) return null;
    const year   = this.yearOf(studentId);
    const policy = this.policy(year);
    const ov     = this.overrideOf(studentId);
    if (ov) {
      return {
        outcome: ov.decision,
        reason:  'admin_override',
        note:    ov.reason || 'Administrator manual decision',
        year, policy, check: this.promotionCheckFor(studentId),
        override: true
      };
    }
    if (this.exits(year)) {
      return { outcome: 'graduated', reason: 'ss3_completed', year, policy, check: null };
    }
    // Grade 9 (JSS 3) is a checkpoint year in Nigeria - all students go to the pool
    // to choose their senior secondary path (Science, Commercial, or Arts) before
    // being assigned to Grade 10 classes by the admin.
    if (this.isCheckpoint(year)) {
      return { outcome: 'pooled', reason: 'jss3_checkpoint', year, policy, check: null };
    }
    const check = this.promotionCheckFor(studentId);
    return {
      outcome: check.pass ? 'promoted' : 'repeat',
      reason:  check.pass ? 'rule' : (check.ready ? 'rule_failed' : 'no_marks'),
      year, policy, check
    };
  },

  // ── Manual (admin-only) promotion decisions ─────────────────
  // An administrator may promote a student who fell below the rule, or
  // force any other outcome. Only an Administrator may write these, and
  // the app re-checks the admin password before committing.
  overrideOf(studentId) {
    const sessId = Data.session()._id;
    const sid    = String(studentId);
    const ovs    = Data.promotionOverrides().filter(o => o.studentId === sid);
    if (!sessId) return ovs[0] || null;
    return ovs.find(o => String(o.sessionId) === String(sessId)) || null;
  },
  async setOverride(studentId, decision, reason, userId) {
    const sid      = String(studentId);
    const sessId   = Data.session()._id;
    if (!sessId) return null;
    const existing = this.overrideOf(sid);
    const record = {
      id: existing?.id || uid('ovr_'), studentId: sid, sessionId: String(sessId),
      decision, reason: reason || '', setBy: userId ? String(userId) : null,
      setAt: new Date().toISOString()
    };
    _cache.promotionOverrides = [
      ...(_cache.promotionOverrides || []).filter(o => !(o.studentId === sid && String(o.sessionId) === String(sessId))),
      record
    ];
    try {
      await _sb.from('promotion_overrides').upsert({
        student_id: Number(sid), session_id: Number(sessId),
        decision, reason: reason || '',
        set_by: userId ? Number(userId) : null, set_at: record.setAt
      }, { onConflict: 'student_id,session_id' });
    } catch (err) {
      console.warn('[HMA] promotion override not saved:', err?.message || err);
    }
    return record;
  },
  async clearOverride(studentId) {
    const sid    = String(studentId);
    const sessId = Data.session()._id;
    if (!sessId) return;
    _cache.promotionOverrides = (_cache.promotionOverrides || [])
      .filter(o => !(o.studentId === sid && String(o.sessionId) === String(sessId)));
    try {
      await _sb.from('promotion_overrides')
        .delete().eq('student_id', Number(sid)).eq('session_id', Number(sessId));
    } catch (err) {
      console.warn('[HMA] promotion override not cleared:', err?.message || err);
    }
  },

  nextClass(classId) { return Data.cls(classId)?.nextClassId || null; },
  nextClassName(classId) {
    const n = this.nextClass(classId);
    return n ? Data.classNameOf(n) : null;
  },
  classAfter(classId) {
    // First choice is the explicit chain; otherwise move one year up
    const chain = this.nextClass(classId);
    if (chain) return chain;
    const c = Data.cls(classId);
    return Data.classes().find(x =>
      x.year == Number(c?.year) + 1 && x.level === c?.level && x.stream === c?.stream)?.id || null;
  },

  // ── Grade 10 Pool ────────────────────────────────────────
  poolClass()     { return Data.classes().find(c => c.selectionMode === 'pool') || null; },
  poolClassName() { return this.poolClass()?.name || 'Grade 10 Pool'; },
  isPoolEntrant(studentId) {
    const st = Data.student(studentId);
    return !!st && !!st.classId && this.poolClass()?.id === st.classId;
  },
  poolEntrants() {
    const pool = this.poolClass();
    if (!pool) return [];
    return Data.studentsByClass(pool.id).filter(s => s.status === 'active');
  },

  // A student's preferred stream for the senior path (pool placement).
  pathRequest(studentId) {
    const sid    = String(studentId);
    const sessId = Data.session()._id ? String(Data.session()._id) : null;
    const mine   = (Data.pathRequests() || []).filter(r => r.studentId === sid);
    if (!mine.length) return null;
    return (sessId && mine.find(r => r.sessionId === sessId)) || mine[mine.length - 1];
  },
  async requestPathway(studentId, stream, note, userId) {
    const sid       = String(studentId);
    const sessionId = Data.session()._id;
    const existing  = this.pathRequest(sid);
    const record = {
      id: existing?.id || uid('pth_'), studentId: sid,
      sessionId: sessionId ? String(sessionId) : null,
      stream: stream || null, status: 'pending',
      requestedBy: userId ? String(userId) : null, note: note || '', at: new Date().toISOString()
    };
    _cache.pathRequests = [
      ...(_cache.pathRequests || []).filter(r => r.studentId !== sid),
      record
    ];
    if (!sessionId) return record;
    try {
      await _sb.from('path_requests').upsert({
        student_id: Number(sid), session_id: Number(sessionId),
        requested_stream: stream || null, status: 'pending',
        requested_by: userId ? Number(userId) : null,
        decided_by: null, decided_at: null, note: note || ''
      }, { onConflict: 'student_id,session_id' });
    } catch (err) {
      console.warn('[HMA] path request not saved:', err?.message || err);
    }
    return record;
  },

  // End the Grade 10 Pool: any entrant still unplaced is marked inactive in
  // the roll (status_reason = pool_unplaced). Returns how many were closed.
  async closePool(userId) {
    const pool = this.poolClass();
    const entrants = this.poolEntrants();
    if (!pool || !entrants.length) return 0;
    const ids = entrants.map(s => Number(s.id));
    _cache.students = _cache.students.map(s =>
      entrants.some(e => e.id === s.id) ? { ...s, status: 'inactive' } : s);
    try {
      await _sb.from('students')
        .update({ status: 'inactive', status_reason: 'pool_unplaced' })
        .in('id', ids);
    } catch (err) {
      console.warn('[HMA] pool close not saved:', err?.message || err);
    }
    return entrants.length;
  },

  // ── Positions ────────────────────────────────────────────
  async positions(term) {
    const termId    = term || Data.currentTerm();
    const sessionId = Data.session()._id;
    const key = `pos:${sessionId}:${termId}`;
    if (this._pos && this._pos.key === key) return this._pos.rows;
    if (!sessionId) return [];
    try {
      const { data, error } = await _sb.rpc('student_positions', {
        p_session_id: Number(sessionId),
        p_term_id:    Number(_termIdFromNum(termId))
      });
      if (error) throw error;
      this._pos = { key, rows: (data || []).map(r => ({
        studentId:  String(r.student_id),
        classId:    String(r.class_id),
        year:       r.year,
        classPosition: r.class_position,
        yearPosition:  r.year_position,
        termAvg:    Number(r.term_avg)  ?? null,
        sessionAvg: Number(r.session_avg) ?? null,
        termsCounted: r.terms_counted
      })) };
    } catch (err) {
      console.warn('[HMA] positions unavailable:', err?.message || err);
      this._pos = { key, rows: [] };
    }
    return this._pos.rows;
  },

  // ── Results publication ──────────────────────────────────

  // ── Records (applied live, mirrored to cache) ────────────
  async snapshotPromotions(promotions) {
    const sessionId = Data.session()._id;
    const additions = [];
    promotions.forEach(p => {
      const rec = {
        studentId:   p.studentId,
        sessionId:   String(sessionId),
        termId:      p.termId || _termIdFromNum(Data.currentTerm()),
        fromClassId: p.fromClassId || null,
        toClassId:   p.toClassId   || null,
        outcome:     p.outcome,
        avg:         p.avg ?? null,
        en:          p.en  ?? null,
        ma:          p.ma  ?? null,
        classPosition: p.classPosition ?? null,
        yearPosition:  p.yearPosition  ?? null
      };
      _cache.promotions = _cache.promotions.filter(x => x.studentId !== rec.studentId);
      _cache.promotions.push(rec);
      additions.push(rec);
    });
    if (!sessionId) return;
    try {
      await _sb.from('promotions')
        .upsert(additions.map(r => ({
          student_id:   Number(r.studentId),
          session_id:   Number(r.sessionId),
          term_id:      Number(r.termId),
          from_class_id: r.fromClassId ? Number(r.fromClassId) : null,
          to_class_id:   r.toClassId   ? Number(r.toClassId)   : null,
          outcome:       r.outcome,
          avg:           r.avg,
          en_score:      r.en,
          ma_score:      r.ma,
          class_position: r.classPosition,
          year_position:  r.yearPosition,
          decided_by:     currentUserActiveId() || null
        })), { onConflict: 'student_id,session_id' });
    } catch (err) {
      console.warn('[HMA] promotions not saved:', err?.message || err);
    }
  },

  async setTermPublished(termNum, published, userId) {
    _cache.published = _cache.published || {};
    _cache.published[termNum] = published;
    const term = Data.session().terms.find(t => t.term === Number(termNum));
    if (!term?._id) return;
    try {
      await _sb.from('terms').update({
        results_published: published,
        published_by:      published ? (Number(userId) || null) : null,
        published_at:      published ? new Date().toISOString() : null
      }).eq('id', term._id);
    } catch (err) {
      console.warn('[HMA] publish flag not saved:', err?.message || err);
    }
  },

  // ── Assign a student to another class (pool placement, stream
  // placement, reclassification). Writes a transfer and moves the student.
  async assignClass(studentId, toClassId, { reason = 'stream_change', note = '', userId } = {}) {
    const st = Data.student(studentId);
    if (!st || String(st.classId) === String(toClassId)) return false;
    const fromClassId = st.classId;
    const fromCls = Data.cls(fromClassId);
    const toCls   = Data.cls(toClassId);
    const movedStream = !!fromCls?.stream && !!toCls?.stream && fromCls.stream !== toCls.stream;

    _cache.students = _cache.students.map(s => s.id === String(studentId)
      ? { ...s, classId: String(toClassId), className: toCls?.name || s.className } : s);

    const sessionId = Data.session()._id;
    const termId    = _termIdFromNum(Data.currentTerm());
    try {
      await _sb.from('students').update({ class_id: Number(toClassId) }).eq('id', Number(studentId));
      if (sessionId && termId) {
        const { data, error } = await _sb.from('student_transfers').insert({
          student_id:    Number(studentId),
          session_id:    Number(sessionId),
          term_id:       Number(termId),
          from_class_id: fromClassId ? Number(fromClassId) : null,
          to_class_id:   Number(toClassId),
          reason,
          reason_note:   note,
          status:        'approved',
          requested_by:  userId ? Number(userId) : null,
          approved_by:   userId ? Number(userId) : null
        }).select();
        if (!error && data?.[0]) {
          _cache.transfers.push({
            id: String(data[0].id), studentId: String(studentId), sessionId: String(sessionId),
            termId: String(termId), fromClassId, toClassId: String(toClassId),
            reason, note, status: 'approved'
          });
        }
      }
    } catch (err) {
      console.warn('[HMA] class assignment not saved:', err?.message || err);
    }

    // A stream change makes the old subject registration meaningless.
    if (movedStream) {
      delete _cache.subjectSelections[String(studentId)];
      try { await _sb.from('subject_selections').delete().eq('student_id', Number(studentId)); }
      catch (err) { console.warn('[HMA] selections not cleared:', err?.message || err); }
    }
    return true;
  },

  // ── Subject registration ─────────────────────────────────
  selectionFor(studentId)  { return _cache.subjectSelections?.[String(studentId)] || null; },
  effectiveSubjects(studentId) {
    const sel = this.selectionFor(studentId);
    return sel && sel.status === 'effective' ? sel.subjectIds : null;
  },
  canChoose(year) {
    // Grade 10 pool entrants choose during placement; 11/12 may adjust.
    return Number(year) >= 10;
  },
  async chooseSubjects(studentId, subjectIds, { status = 'effective', userId } = {}) {
    const st = Data.student(studentId);
    _cache.subjectSelections = _cache.subjectSelections || {};
    _cache.subjectSelections[String(studentId)] = {
      id: _cache.subjectSelections[String(studentId)]?.id || null,
      term: Data.currentTerm(),
      subjectIds: subjectIds.map(String),
      status,
      decidedBy: status === 'effective' ? (userId ? String(userId) : null) : null
    };
    const sessionId = Data.session()._id;
    if (!sessionId || !st) return;
    try {
      await _sb.from('subject_selections').delete().eq('student_id', Number(studentId));
      if (subjectIds.length) {
        await _sb.from('subject_selections').insert(subjectIds.map(sid => ({
          student_id: Number(studentId),
          session_id: Number(sessionId),
          term_id:    _termIdFromNum(Data.currentTerm()),
          subject_id: Number(sid),
          status,
          requested_by: userId ? Number(userId) : null,
          decided_by:   status === 'effective' ? (userId ? Number(userId) : null) : null
        })));
      }
    } catch (err) {
      console.warn('[HMA] subject selection not saved:', err?.message || err);
    }
  },

  // Rule counts are the soft constraints the subject screen enforces.
  selectionCounts() {
    const r = Data.selectionRules();
    return r ? {
      minTotal: Number(r.min_total) ?? 8,
      general:  Number(r.general_count) ?? 1,
      stream:   Number(r.stream_count) ?? 5
    } : { minTotal: 8, general: 1, stream: 5 };
  },

  // ── Approvals (VP proposes, principal disposes) ───────────
  approvals()   { return _cache.approvalRequests || []; },
  pendingApprovals() { return this.approvals().filter(a => a.status === 'pending'); },
  approvalsFor(userId) {
    return this.pendingApprovals()
      .filter(a => !userId || String(a.requestedBy) !== String(userId));
  },
  async requestApproval({ actionType, entityType, entityId, payload, summary = '' }, userId) {
    _cache.approvalRequests = _cache.approvalRequests || [];
    const record = {
      id: uid('apr_'), actionType, entityType, entityId: entityId ? String(entityId) : null,
      payload, status: 'pending', requestedBy: userId ? String(userId) : null,
      note: summary, at: new Date().toISOString()
    };
    _cache.approvalRequests.unshift(record);
    try {
      await _sb.from('approval_requests').insert({
        action_type:  actionType,
        entity_type:  entityType,
        entity_id:    entityId ? Number(entityId) : null,
        payload:      payload || {},
        requested_by: userId ? Number(userId) : null,
        decision_note: summary
      });
    } catch (err) {
      console.warn('[HMA] approval request not saved:', err?.message || err);
    }
  },
  async decideApproval(id, approved, userId, note = '') {
    _cache.approvalRequests = (_cache.approvalRequests || []).map(a => a.id === String(id)
      ? { ...a, status: approved ? 'approved' : 'rejected', decidedBy: userId ? String(userId) : null, note }
      : a);
    try {
      await _sb.from('approval_requests').update({
        status: approved ? 'approved' : 'rejected',
        decided_by: userId ? Number(userId) : null,
        decision_note: note || null,
        decided_at: new Date().toISOString()
      }).eq('id', Number(id));
    } catch (err) {
      console.warn('[HMA] approval decision not saved:', err?.message || err);
    }
  },

  // ── Score entry coverage ─────────────────────────────────
  // entered/total per subject per class — what publish waits for.
  coverage(term) {
    term = term || Data.currentTerm();
    const out = {};
    Data.classes().forEach(cl => {
      const students = Data.studentsByClass(cl.id).filter(s => s.status === 'active');
      const perSubject = Academic.classSubjects(cl.id).map(sub => {
        const entered = students.filter(s => {
          const sc = Data.studentScores(s.id)[sub.id];
          return sc && sc[term] && (sc[term].test || sc[term].exam);
        }).length;
        return { subjectId: sub.id, code: sub.code, name: sub.name, entered, total: students.length };
      });
      out[cl.id] = { classId: cl.id, class: cl.name, students: students.length, subjects: perSubject };
    });
    return out;
  },

  // ── Weekly topics ────────────────────────────────────────
  topicsFor(classId, subjectId) {
    return (_cache.weeklyTopics || [])
      .filter(t => t.classId === String(classId) && (!subjectId || t.subjectId === String(subjectId)))
      .sort((a, b) => b.week - a.week);
  },
  async addWeeklyTopic({ classId, subjectId, week, topic, summary }, userId) {
    const sessionId = Data.session()._id;
    const topicRow = {
      id: uid('wtop_'), sessionId: sessionId ? String(sessionId) : null,
      classId: String(classId), subjectId: String(subjectId), week: Number(week),
      topic, summary: summary || '',
      teacherId: userId ? String(userId) : null
    };
    _cache.weeklyTopics = _cache.weeklyTopics || [];
    _cache.weeklyTopics = [
      ..._cache.weeklyTopics.filter(t =>
        !(t.classId === topicRow.classId && t.subjectId === topicRow.subjectId && t.week === topicRow.week)),
      topicRow
    ];
    if (!sessionId) return;
    try {
      await _sb.from('weekly_topics').upsert({
        session_id: Number(sessionId),
        term_id:    Number(_termIdFromNum(Data.currentTerm())),
        class_id:   Number(classId),
        subject_id: Number(subjectId),
        week_no:    Number(week),
        topic,
        summary:    summary || '',
        teacher_id: userId ? Number(userId) : null
      }, { onConflict: 'session_id,term_id,class_id,subject_id,week_no' });
    } catch (err) {
      console.warn('[HMA] weekly topic not saved:', err?.message || err);
    }
  },

  // Mark a score sheet as uploaded (drove publish coverage).
  async markUploaded({ classId, subjectId, kind, rowCount = 0 }, userId) {
    const sessionId = Data.session()._id;
    if (!sessionId) return;
    try {
      const { data, error } = await _sb.from('score_uploads').upsert({
        session_id:  Number(sessionId),
        term_id:     Number(_termIdFromNum(Data.currentTerm())),
        class_id:    Number(classId),
        subject_id:  Number(subjectId),
        kind,
        status:      'submitted',
        row_count:   Number(rowCount) || 0,
        teacher_id:  userId ? Number(userId) : null,
        submitted_by: userId ? Number(userId) : null
      }, { onConflict: 'session_id,term_id,class_id,subject_id,kind' }).select();
      if (!error && data?.[0]) {
        _cache.scoreUploads = _cache.scoreUploads || [];
        _cache.scoreUploads.push({
          id: String(data[0].id), sessionId: String(sessionId), classId: String(classId),
          subjectId: String(subjectId), kind, status: 'submitted',
          teacherId: userId ? String(userId) : null
        });
      }
    } catch (err) {
      console.warn('[HMA] score upload marker not saved:', err?.message || err);
    }
  }
};

// ── Current signed-in user for live writes (set by app.js) ──
let _activeUserId = null;
function currentUserActiveId() { return _activeUserId ? Number(_activeUserId) : null; }
function setActiveUserForData(user) { _activeUserId = user ? String(user.id || user) : null; }

// ============================================================
//  TIMETABLE GENERATOR
//  Builds a schedule for every class in the school while making
//  sure no teacher is booked into two classes at the same time.
// ============================================================
const Timetable = {
  DAYS: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],

  DAY_DEFAULTS: {
    periods: 7,
    start:   '08:00',
    minutes: 40,
    breaks:  [
      { after: 3, minutes: 20, label: 'Short Break' },
      { after: 7, minutes: 45, label: 'After School' }
    ]
  },

  // The school day from timetable_settings, or the agreed defaults:
  // 7 periods · 3 + Short Break(20) + 4 · After School(45).
  dayStructure() {
    const s = Data.ttSettings();
    if (!s) return this.DAY_DEFAULTS;
    return {
      periods: Number(s.periods) || this.DAY_DEFAULTS.periods,
      start:   (s.start || this.DAY_DEFAULTS.start).slice(0, 5),
      minutes: Number(s.minutes) || this.DAY_DEFAULTS.minutes,
      breaks:  Array.isArray(s.breaks) && s.breaks.length ? s.breaks : this.DAY_DEFAULTS.breaks
    };
  },

  // Time slots for one day. Accepts a structure object or the legacy
  // positional (periods, startHour, minutes) used by saveTimetable.
  slotTimes(...args) {
    let s;
    if (args.length === 1 && args[0] && typeof args[0] === 'object' && 'periods' in args[0]) {
      s = args[0];
    } else if (args.length === 1 && args[0] && typeof args[0] === 'object') {
      const o = args[0];
      s = {
        periods: +o.periodsPerDay || 6,
        start:   String(o.startHour ?? 8).padStart(2, '0') + ':00',
        minutes: +o.periodMinutes || 45,
        breaks:  o.breaks || []
      };
    } else {
      const [periods, startHour, periodMinutes, breaks = []] = args;
      s = { periods, start: String(startHour ?? 8).padStart(2, '0') + ':00', minutes: periodMinutes, breaks };
    }

    const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const out = [];
    let cursor = _mins(s.start);
    for (let p = 1; p <= Number(s.periods); p++) {
      const startMin = cursor;
      const endMin   = cursor + Number(s.minutes);
      out.push({
        period:  p,
        start:   fmt(startMin),
        end:     fmt(endMin),
        time:    `${fmt(startMin)} – ${fmt(endMin)}`,
        isBreak: false,
        label:   ''
      });
      cursor = endMin;
      (s.breaks || []).forEach(b => {
        if (Number(b.after) !== p) return;
        const len = Number(b.minutes) || 15;
        out.push({
          period:  null,
          start:   fmt(cursor),
          end:     fmt(cursor + len),
          time:    `${fmt(cursor)} – ${fmt(cursor + len)}`,
          isBreak: true,
          label:   b.label || 'Break'
        });
        cursor += len;
      });
    }
    return out;
  },

  // The whole school at once. Returns one schedule per class.
  // A teacher is never scheduled in two places at once, and a subject with
  // no teacher allocated is reported instead of being timetabled. Breaks
  // from the day structure appear as labeled rows across every day.
  // Each class also gets its own dedicated room, so no two classes occupy
  // the same room at the same time.
  generateAll(opts = {}) {
    const explicit = opts.periodsPerDay !== undefined;
    const cfg = explicit
      ? { periods: +opts.periodsPerDay || 6, start: String(+opts.startHour || 8).padStart(2, '0') + ':00', minutes: +opts.periodMinutes || 45, breaks: opts.breaks || [] }
      : this.dayStructure();
    const slots  = this.slotTimes(cfg);
    const busy   = new Map();          // "day-period-teacher" → true
    const absent = [];                 // classes without any staffed subject
    const unstaffed = {};              // class name → [subject, ...]
    const schedules = [];
    let freePeriods = 0;
    // Assign each class its own room (classrooms are numbered sequentially)
    let roomIndex = 1;
    const classRooms = new Map();      // classId → room label

    Data.classes().forEach(cl => {
      classRooms.set(cl.id, `Room ${roomIndex++}`);
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
          // Breaks are school-wide pauses: no lesson, no teacher booking.
          if (slot.isBreak) {
            return {
              ...slot,
              free: true,
              subjectId: null,
              subject: slot.label || 'Break',
              code: '',
              color: 'break',
              teacherId: null,
              teacher: ''
            };
          }

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
            teacher:    teacherId ? (Data.user(teacherId)?.name || '—') : 'Unassigned',
            room:       classRooms.get(cl.id) || '—'
          };
        });
        return { day, periods };
      });

      schedules.push({ classId: cl.id, name: cl.name, level: cl.level, stream: cl.stream, room: classRooms.get(cl.id), days });
    });

    return { schedules, slots, absent, unstaffed, freePeriods };
  },

  // Single class (reuses the same rules)
  generate(classId, optsOrPeriods = {}, startHour, periodMinutes) {
    const opts = typeof optsOrPeriods === 'object'
      ? optsOrPeriods
      : { periodsPerDay: optsOrPeriods, startHour, periodMinutes };
    const all = this.generateAll(opts);
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

// ── Password hashing ─────────────────────────────────────────
// SHA-256 hex, byte-for-byte identical to the SQL scheme
// (hex(digest(salt || password, 'sha256'))) used by the migration
// backfill, so hashes written here and hashes written in SQL
// verify against each other. Pure JS so it works in any browser
// context, not just secure ones.
const _sha256Hex = (() => {
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  const rot  = (x, c) => (x >>> c) | (x << (32 - c));
  const H0 = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  return (str) => {
    const bytes = [...new TextEncoder().encode(str)];
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, 8 * i)) & 0xff);
    const h = H0.slice();
    for (let i = 0; i < bytes.length; i += 64) {
      const w = new Array(64);
      for (let j = 0; j < 16; j++) {
        w[j] = ((bytes[i + j*4]     & 0xff) << 24) |
               ((bytes[i + j*4 + 1] & 0xff) << 16) |
               ((bytes[i + j*4 + 2] & 0xff) << 8)  |
               ( bytes[i + j*4 + 3] & 0xff);
      }
      for (let j = 16; j < 64; j++) {
        w[j] = (w[j-16] + (rot(w[j-15], 7) ^ rot(w[j-15], 18) ^ (w[j-15] >>> 3))
                       + w[j-7] + (rot(w[j-2], 17) ^ rot(w[j-2], 19) ^ (w[j-2] >>> 10))) | 0;
      }
      let a=h[0], b=h[1], c=h[2], d=h[3], e=h[4], f=h[5], g=h[6], hh=h[7];
      for (let j = 0; j < 64; j++) {
        const t1 = (hh + (rot(e,6) ^ rot(e,11) ^ rot(e,25)) + ((e & f) ^ (~e & g)) + K[j] + w[j]) | 0;
        const t2 = ((rot(a,2) ^ rot(a,13) ^ rot(a,22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
      }
      h[0]=(h[0]+a)|0; h[1]=(h[1]+b)|0; h[2]=(h[2]+c)|0; h[3]=(h[3]+d)|0;
      h[4]=(h[4]+e)|0; h[5]=(h[5]+f)|0; h[6]=(h[6]+g)|0; h[7]=(h[7]+hh)|0;
    }
    return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  };
})();

function newSalt() {
  let s = '';
  for (let i = 0; i < 16; i++) s += '0123456789abcdef'[(Math.random() * 16) | 0];
  return s;
}
function hashPassword(plain, salt) { return _sha256Hex((salt || '') + (plain || '')); }
function generateTempPassword(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[(Math.random() * chars.length) | 0];
  return s;
}

// ============================================================
//  GROWTH & MASTERY
//  Student XP, skill ranks, dynamic badges, the portfolio
//  artifact pipeline, parent guardian-tier and the educator
//  recognition engine. XP and badges are DERIVED on read from
//  attendance, score-history, verified artifacts and
//  commendations, so a badge can never go stale, but awarded
//  records (artifacts, commendations, engagements) are stored.
// ============================================================
const Growth = {

  // Points per behaviour (per spec).
  XP: { consistency: 50, attendance: 100, coCurricular: 150, leadership: 75 },

  // Cumulative XP -> level -> rank. 250 XP per level, so five levels of
  // Scholar (1-5), Explorer (6-10), Innovator (11-15) and Vanguard/Master
  // (16+). Exact spacing is a school policy knob (see README).
  levelOf(xp)   { return xp <= 0 ? 0 : 1 + Math.floor((xp || 0) / 250); },
  rankOf(level) { return level >= 16 ? 'Vanguard / Master'
                : level >= 11 ? 'Innovator'
                : level >= 6  ? 'Explorer'
                : level >= 1  ? 'Scholar'
                : '—'; },

  artifactsOf(sid) {
    return (Data.artifacts() || [])
      .filter(a => String(a.studentId) === String(sid))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  },
  commendationsOf(sid) {
    return (Data.commendations() || []).filter(c => String(c.studentId) === String(sid));
  },

  // Weeks (across all session terms) with a perfect 5/5 attendance.
  attendanceStreakWeeks(sid) {
    let weeks = 0;
    (Data.session().terms || []).forEach(t => {
      const byWeek = Data.studentAttendance(sid, t.term) || {};
      Object.values(byWeek).forEach(d => { if (Number(d) === 5) weeks++; });
    });
    return weeks;
  },

  // Consecutive term pairs with recorded scores; used for the +50
  // consistency points and the Phoenix (>= +15%) badge.
  improvements(sid) {
    const terms = (Data.session().terms || []).map(t => t.term)
      .filter(t => Academic.termScores(sid, t).some(s => s.score !== null))
      .sort((a, b) => a - b);
    const pairs = [];
    for (let i = 1; i < terms.length; i++) {
      const prev = Academic.termAverage(sid, terms[i - 1]);
      const curr = Academic.termAverage(sid, terms[i]);
      if (prev > 0) pairs.push({
        from: terms[i - 1], to: terms[i], prev, curr,
        delta: curr - prev, pct: Math.round(((curr - prev) / prev) * 1000) / 10
      });
    }
    return pairs;
  },

  // Terms where every recorded week was a perfect 5/5 (Iron Clad).
  ironCladTerms(sid) {
    const out = [];
    (Data.session().terms || []).forEach(t => {
      const byWeek = Data.studentAttendance(sid, t.term) || {};
      const days   = Object.values(byWeek);
      if (days.length && days.every(d => Number(d) === 5)) out.push(t.term);
    });
    return out;
  },

  studentXp(sid) {
    const consistency  = this.improvements(sid).filter(p => p.curr > p.prev).length * this.XP.consistency;
    const attendance   = this.attendanceStreakWeeks(sid) * this.XP.attendance;
    const coCurricular = this.artifactsOf(sid).filter(a => a.status === 'verified').length * this.XP.coCurricular;
    const leadership   = this.commendationsOf(sid).length * this.XP.leadership;
    const total = consistency + attendance + coCurricular + leadership;
    const level = this.levelOf(total);
    return {
      total, level, rank: this.rankOf(level), nextAt: level === 0 ? 250 : (level * 250),
      categories: { consistency, attendance, coCurricular, leadership },
      streakWeeks: this.attendanceStreakWeeks(sid),
      improvements: this.improvements(sid),
      ironCladTerms: this.ironCladTerms(sid)
    };
  },

  // Dynamic badges — unlocked when their recorded source exists.
  badges(sid) {
    const xp   = this.studentXp(sid);
    const arts = this.artifactsOf(sid).filter(a => a.status === 'verified');
    const out  = [];
    if (arts.some(a => a.kind === 'code'))     out.push({ key: 'code_crafter',  icon: '🛡️', label: 'Code Crafter',  note: 'Uploaded a verified software/STEM project.' });
    if (arts.some(a => a.kind === 'debate'))   out.push({ key: 'debate_orator', icon: '📜', label: 'Debate Orator', note: 'Represented the school in a debate.' });
    if (arts.some(a => a.kind === 'sport'))    out.push({ key: 'sportsperson',  icon: '🏃', label: 'Sportsperson', note: 'Represented the school in a sporting activity.' });
    if (xp.ironCladTerms.length)               out.push({ key: 'iron_clad',    icon: '⚡', label: 'Iron Clad',    note: `100% attendance across an entire term (Term ${xp.ironCladTerms.join(', ')}).` });
    if (xp.improvements.some(p => p.pct >= 15)) out.push({ key: 'phoenix',     icon: '📈', label: 'Phoenix Award', note: 'Most improved average — a +15% or higher term-on-term jump.' });
    return out;
  },

  // ── Parent · Engaged Guardian Tier ─────────────────────────
  parentProfile(parentUserId) {
    const pid = String(parentUserId);
    const parent = Data.user(pid);
    const eng  = (Data.parentEngagements() || []).filter(e => String(e.parentId) === pid);
    const sessId = Data.session()._id;
    const loginCount = eng.filter(e => e.kind === 'login').length;
    const thisSessSlog = eng.filter(e =>
      (e.kind === 'ack_results' || e.kind === 'pta') &&
      e.sessionId && String(e.sessionId) === String(sessId)).length;
    const ackPta = eng.filter(e => e.kind === 'ack_results' || e.kind === 'pta');
    const earlyPayment = eng.some(e => e.kind === 'early_payment');
    const badges = [];
    if (earlyPayment) badges.push({ key: 'pacesetter', icon: '💳', label: 'Pacesetter Parent', note: 'Settled tuition within the first two weeks of a term — priority seats and a 2–5% fee discount next term.' });
    if (ackPta.length >= 3) badges.push({ key: 'active_guardian', icon: '🛡️', label: '3-Term Active Guardian', note: 'Attends PTA meetings and acknowledges terminal results within 48 hours, term after term.' });
    return {
      parentId: pid, name: parent?.name, childIds: parent?.childIds || [],
      loginCount, thisSessSlog, ackPta: ackPta.length,
      earlyPayment, badges, engagementTotal: eng.length
    };
  },

  // ── Educator Recognition Engine ────────────────────────────
  // Points: every mentor note (+10), every verified portfolio artifact
  // (+25), plus +50 for a Master Register. Honors are stored records;
  // the points are derived so the leaderboard stays honest.
  teacherRecognition(teacherId) {
    const tid = String(teacherId);
    const mentorNotes  = (Data.commendations() || []).filter(c => String(c.teacherId) === tid).length;
    const verifications = (Data.artifacts() || []).filter(a => a.status === 'verified' && String(a.verifiedBy) === tid).length;
    const sessId = Data.session()._id;
    const honors = (Data.teacherRecognitions() || [])
      .filter(r => String(r.teacherId) === tid && (r.sessionId ? String(r.sessionId) === String(sessId) : true));
    const masterRegister = !!honors.find(h => h.kind === 'master_register');
    const points = mentorNotes * 10 + verifications * 25 + (masterRegister ? 50 : 0);
    return { teacherId: tid, mentorNotes, verifications, masterRegister, honors, points };
  },
  leaderboard() {
    return Data.users()
      .filter(u => ['Subject Teacher', 'Class Teacher', 'HOD'].includes(u.role))
      .map(u => ({ teacherId: u.id, name: u.name, initials: u.initials, tone: u.tone, rec: this.teacherRecognition(u.id) }))
      .sort((a, b) => b.rec.points - a.rec.points);
  },
  bestTeacher() { return this.leaderboard()[0] || null; },

  // ── Writers (stored records the derivation reads) ──────────
  async addArtifact({ studentId, kind, title, note, createdBy } = {}) {
    const record = {
      id: uid('art_'), studentId: String(studentId), kind: kind || 'other',
      title: title || '', note: note || '', status: 'pending',
      createdBy: createdBy ? String(createdBy) : null,
      verifiedBy: null, decidedAt: null, createdAt: new Date().toISOString()
    };
    _cache.artifacts = [...(_cache.artifacts || []), record];
    try {
      await _sb.from('portfolio_artifacts').insert({
        student_id: Number(record.studentId), kind: record.kind, title: record.title,
        note: record.note, status: 'pending', created_by: createdBy ? Number(createdBy) : null,
        created_at: record.createdAt
      });
    } catch (err) { console.warn('[HMA] artifact not saved:', err?.message || err); }
    return record;
  },
  async decideArtifact(artifactId, approved, userId) {
    const stale = (Data.artifacts() || []).find(a => String(a.id) === String(artifactId));
    if (!stale) return false;
    const record = { ...stale, status: approved ? 'verified' : 'rejected',
      verifiedBy: userId ? String(userId) : null, decidedAt: new Date().toISOString() };
    _cache.artifacts = (_cache.artifacts || []).map(a => String(a.id) === String(artifactId) ? record : a);
    try {
      await _sb.from('portfolio_artifacts').update({
        status: record.status, verified_by: userId ? Number(userId) : null, decided_at: record.decidedAt
      }).eq('id', Number(stale.id));
    } catch (err) { console.warn('[HMA] artifact decision not saved:', err?.message || err); }
    return record;
  },
  async addCommendation({ studentId, teacherId, note } = {}) {
    const record = {
      id: uid('cmd_'), studentId: String(studentId), teacherId: String(teacherId),
      note: note || '', createdAt: new Date().toISOString()
    };
    _cache.commendations = [...(_cache.commendations || []), record];
    try {
      await _sb.from('commendations').insert({
        student_id: Number(record.studentId), teacher_id: Number(record.teacherId),
        note: record.note, created_at: record.createdAt
      });
    } catch (err) { console.warn('[HMA] commendation not saved:', err?.message || err); }
    return record;
  },
  async recordParentEngagement(parentUserId, kind) {
    const sessId = Data.session()._id;
    const record = {
      id: uid('eng_'), parentId: String(parentUserId), kind,
      sessionId: sessId ? String(sessId) : null, at: new Date().toISOString()
    };
    _cache.parentEngagements = [...(_cache.parentEngagements || []), record];
    try {
      await _sb.from('parent_engagements').insert({
        parent_id: Number(record.parentId), kind, session_id: sessId ? Number(sessId) : null, at: record.at
      });
    } catch (err) { console.warn('[HMA] parent engagement not saved:', err?.message || err); }
    return record;
  },
  async recordTeacherRecognition({ teacherId, kind, note } = {}) {
    const sessId = Data.session()._id;
    const record = {
      id: uid('trc_'), teacherId: String(teacherId), kind: kind || 'honor',
      sessionId: sessId ? String(sessId) : null, note: note || '', awardedAt: new Date().toISOString()
    };
    _cache.teacherRecognitions = [...(_cache.teacherRecognitions || []), record];
    try {
      await _sb.from('teacher_recognitions').insert({
        teacher_id: Number(record.teacherId), kind: record.kind,
        session_id: sessId ? Number(sessId) : null, note: record.note, awarded_at: record.awardedAt
      });
    } catch (err) { console.warn('[HMA] recognition not saved:', err?.message || err); }
    return record;
  },

  // Verification code for the passport footer.
  passportCode(studentId) {
    const year = (Data.session()?.name || '2026').split('/')[0].trim();
    return `HMA-${String(studentId).padStart(4, '0')}-${year}`;
  }
};

// ── Export to global scope (app.js uses globals) ─────────────
window.Data       = Data;
window.Academic   = Academic;
window.Progression = Progression;
window.Growth     = Growth;
window.Timetable  = Timetable;
window.uid        = uid;
window.DB         = DB;
window.setActiveUserForData = setActiveUserForData;
window.loadFromSupabase = loadFromSupabase;
