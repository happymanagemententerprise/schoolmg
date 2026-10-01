import { readFileSync } from 'node:fs';

let src = readFileSync('data.js', 'utf8')
  .replace(/^import \{ createClient \} from .*?;\n/gm, 'const createClient = () => ({});\n')
  .replace(/^const _sb = createClient\([\s\S]*?\);\n/gm,
    "const _sbChain = () => new Proxy({}, { get: (t, k) => (k === 'then' ? undefined : _sbChain) });\n" +
    'const _sb = { from: () => _sbChain(), rpc: () => Promise.resolve({ data: [], error: null }) };\n');

globalThis.window = globalThis;
globalThis.localStorage = (() => { const m = new Map(); return {
  getItem: k => m.has(k) ? m.get(k) : null,
  setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k)
}; })();

const harness = `
  // ── synthetic school ─────────────────────────────────────────
  const raw = {
    session: [{ id: 1, name: '2026 / 2027', is_current: true, upload_open: { test: false, exam: true }, midterm_break: { start: '2026-10-26', end: '2026-11-02' } }],
    terms: [
      { id: 1, session_id: 1, name: '1st Term', is_current: true,  results_published: false },
      { id: 2, session_id: 1, name: '2nd Term', is_current: false, results_published: false },
      { id: 3, session_id: 1, name: '3rd Term', is_current: false, results_published: false }
    ],
    subjects: [
      { id: 1, name: 'English Studies', code: 'ENG', is_core: true,  color: 'blue',  level: 'BOTH', group_name: 'General' },
      { id: 2, name: 'Mathematics',     code: 'MAT', is_core: true,  color: 'green', level: 'BOTH', group_name: 'General' },
      { id: 3, name: 'History',         code: 'HIS', is_core: false, color: 'coral', level: 'BOTH', group_name: 'General' }
    ],
    classes: [
      { id: 10, class_name: 'Grade 7A', level: 'JSS', year: 7,  stream: null,  selection_mode: 'normal', next_class_id: 15, teacher_classes: [{ teacher_id: 1002 }] },
      { id: 15, class_name: 'Grade 8',  level: 'JSS', year: 8,  stream: null,  selection_mode: 'normal', next_class_id: 11 },
      { id: 11, class_name: 'Grade 9',  level: 'JSS', year: 9,  stream: null,  selection_mode: 'normal', next_class_id: null },
      { id: 12, class_name: 'Grade 10 Pool', level: 'SS', year: 10, stream: null, selection_mode: 'pool', next_class_id: null },
      { id: 13, class_name: 'Grade 10 Science', level: 'SS', year: 10, stream: 'Science', selection_mode: 'normal', next_class_id: 99 },
      { id: 14, class_name: 'Grade 12 Art', level: 'SS', year: 12, stream: 'Arts', selection_mode: 'graduate', next_class_id: null }
    ],
    students: [
      { id: 1, class_id: 10, admission_no: '001' },  // A full session (T1..T3)
      { id: 2, class_id: 10, admission_no: '002' },  // B joined Term 2
      { id: 3, class_id: 10, admission_no: '003' },  // C joined Term 3
      { id: 4, class_id: 11, admission_no: '004' },  // D Grade 9
      { id: 5, class_id: 14, admission_no: '005' },  // E Grade 12
      { id: 6, class_id: 10, admission_no: '006' },  // F failing maths
      { id: 7, class_id: 10, admission_no: '007' },  // G passing
      { id: 8, class_id: 12, admission_no: '008' },  // P pool entrant
      { id: 9, class_id: 15, admission_no: '009' },  // exactly 50 everywhere -> passes the line
      { id: 10, class_id: 15, admission_no: '010' }  // above 50 everywhere -> promoted
    ],
    users: [
      { id: 1, name: 'Amara Mensah', role: 'admin', staff_role: null, password: 'x' },
      { id: 1002, name: 'Class Teacher', role: 'teacher', staff_role: 'Class Teacher', password: 'x' },
      { id: 4, name: 'Student D', role: 'student', staff_role: null, password: 'x' },
      { id: 6, name: 'Student F', role: 'student', staff_role: null, password: 'x' },
      { id: 10, name: 'Teacher 10', role: 'teacher', staff_role: 'Subject Teacher', password: 'x' },
      { id: 15, name: 'Teacher 15', role: 'teacher', staff_role: 'Subject Teacher', password: 'x' },
      { id: 11, name: 'Teacher 11', role: 'teacher', staff_role: 'Subject Teacher', password: 'x' },
      { id: 13, name: 'Teacher 13', role: 'teacher', staff_role: 'Subject Teacher', password: 'x' },
      { id: 14, name: 'Teacher 14', role: 'teacher', staff_role: 'Subject Teacher', password: 'x' },
      { id: 2000, name: 'Mrs Parent', role: 'parent', staff_role: null, password: 'x' }
    ],
    parents: [{ parent_id: 2000, student_id: 1 }], departments: [],
    teacherSubs: [10, 15, 11, 13, 14].flatMap(c => [1, 2, 3].map(sub => ({ teacher_id: c, subject_id: sub, class_id: c }))),
    attendance: [], assignments: [], events: [], remarks: [],
    // daily attendance (mirrors migration 20260930_attendance_daily.sql)
    attendanceDaily: [
      { id: 1, student_id: 1, term_id: 1, week_number: 1, day_index: 0, status: 'present' },
      { id: 2, student_id: 1, term_id: 1, week_number: 1, day_index: 1, status: 'present' },
      { id: 3, student_id: 1, term_id: 1, week_number: 1, day_index: 2, status: 'late' },
      { id: 4, student_id: 1, term_id: 1, week_number: 1, day_index: 3, status: 'absent' },
      { id: 5, student_id: 1, term_id: 1, week_number: 2, day_index: 0, status: 'present' }
    ],
    timetables: [], timeSlots: [],
    // LMS (mirrors migration 20260929_lms.sql)
    lmsLessons: [
      { id: 1, session_id: 1, term_id: 1, subject_id: 1, class_id: 10, teacher_id: 1002,
        title: 'Nouns', content: 'A noun names a thing.', created_at: '2026-09-18T09:00:00Z' }
    ],
    lmsQuizzes: [
      { id: 1, session_id: 1, term_id: 1, subject_id: 1, class_id: 10, teacher_id: 1002,
        title: 'Parts of speech', description: 'Quick check', is_published: true, created_at: '2026-09-20T09:00:00Z' }
    ],
    lmsQuestions: [
      { id: 1, quiz_id: 1, question_text: 'Which is a noun?', question_type: 'mc',
        option_a: 'run', option_b: 'book', option_c: 'jump', option_d: null,
        correct_answer: 'book', points: 1, position: 0 },
      { id: 2, quiz_id: 1, question_text: 'Verbs are action words.', question_type: 'tf',
        option_a: 'True', option_b: 'False', option_c: null, option_d: null,
        correct_answer: 'True', points: 2, position: 1 }
    ],
    lmsAttempts: [
      { id: 1, quiz_id: 1, student_id: 1, score: 1, total: 3,
        answers: { '1': 'book', '2': 'False' }, submitted_at: '2026-09-21T11:00:00Z' }
    ],
    lmsDiscussions: [
      { id: 1, session_id: 1, term_id: 1, subject_id: 1, class_id: 10, teacher_id: 1002,
        title: 'Why read?', body: 'Tell us.', created_at: '2026-09-19T10:00:00Z' }
    ],
    lmsPosts: [
      { id: 1, discussion_id: 1, user_id: 1002,
        body: 'Reading is fun.', created_at: '2026-09-19T12:00:00Z' }
    ],
    // rows
  };
  const sc = (sid, sub, term, ca, ex) => raw.grades.push({ student_id: sid, subject_id: sub, term_id: term, ca_score: ca, exam_score: ex });
  raw.grades = [];
  // A (full session): T1 80/60/70 · T2 70/50/60 · T3 70/50/60
  //   term avgs -> (70 + 60 + 60)/3 = 63; session EN (80+70+70)/3 = 73, MA (60+50+50)/3 = 53 -> promoted
  sc(1, 1, 1, 32, 48); sc(1, 2, 1, 24, 36); sc(1, 3, 1, 28, 42);
  for (const t of [2, 3]) { sc(1, 1, t, 28, 42); sc(1, 2, t, 20, 30); sc(1, 3, t, 24, 36); }
  // B: term2 80 avg · term3 40 avg, joined Term 2 -> (80+40)/2 = 60; EN (70+40)/2=55, MA90/30 -> 60 -> promoted
  sc(2, 1, 2, 28, 42); sc(2, 2, 2, 36, 54); sc(2, 3, 2, 32, 48);   // term2 avg 80
  sc(2, 1, 3, 16, 24); sc(2, 2, 3, 12, 18); sc(2, 3, 3, 20, 30);   // term3 avg 40
  // C: only term 3 -> avg/1
  sc(3, 1, 3, 16, 24); sc(3, 2, 3, 19, 27); sc(3, 3, 3, 24, 36);   // term3 avg (40+46+60)/3=48.67 -> 49
  // D grade9, E grade12: give a couple marks so they aren't 'no_marks'
  [[4,2],[5,3]].forEach(([sid, term]) => { sc(sid, 1, term, 32, 48); sc(sid, 2, term, 24, 36); sc(sid, 3, term, 28, 42); });
  // F failing maths across all terms: EN70 MA30 OTH50 -> avg 50 but MA fail -> repeat
  for (const t of [1,2,3]) { sc(6,1,t, 28,42); sc(6,2,t, 12,18); sc(6,3,t, 20,30); }
  // G passing: EN70 MA60 OTH50 all terms
  for (const t of [1,2,3]) { sc(7,1,t, 28,42); sc(7,2,t, 24,36); sc(7,3,t, 20,30); }
  // 9 exactly on the line: 50 in English, Maths and every subject (avg 50) -> fails
  sc(9, 1, 1, 20, 30); sc(9, 2, 1, 20, 30); sc(9, 3, 1, 20, 30);
  // 10 above the line: EN65 MA64 OTH40 -> avg 56 -> promoted
  sc(10, 1, 1, 25, 40); sc(10, 2, 1, 24, 40); sc(10, 3, 1, 15, 25);

  _hydrate(raw);

  let ok = 0, fail = 0;
  const eq = (label, got, want) => { const pass = JSON.stringify(got) === JSON.stringify(want); pass ? ok++ : fail++; console.log((pass ? 'PASS ' : 'FAIL ') + label + (pass ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };

  // The ÷ rule
  eq('A attendedTerms', Progression.attendedTerms(1), [1,2,3]);
  eq('A sessionAverage (÷3)', Progression.sessionAverage(1), 63);
  eq('B attendedTerms (joined Term2)', Progression.attendedTerms(2), [2,3]);
  eq('B sessionAverage (÷2 = 60)', Progression.sessionAverage(2), 60);
  eq('B english session (55)', Progression.subjectSessionScore(2, 'english'), 55);
  eq('C attendedTerms (joined Term3)', Progression.attendedTerms(3), [3]);
  eq('C sessionAverage (÷1)', Progression.sessionAverage(3), 49);
  eq('C decision', Progression.decision(3).outcome, 'repeat');

  // Policies & decisions
  eq('D grade9 decision', Progression.decision(4).outcome, 'pooled');
  eq('E grade12 decision', Progression.decision(5).outcome, 'graduated');
  eq('F maths fail -> repeat', Progression.decision(6).outcome, 'repeat');
  eq('G pass -> promoted', Progression.decision(7).outcome, 'promoted');
  eq('A pass -> promoted', Progression.decision(1).outcome, 'promoted');
  // Promotion rule: a mark must be AT LEAST 50 (exactly 50 passes). The
  // average is plain sum-of-scores / number-of-subjects. 9 sits on the line
  // everywhere, 10 is just above it.
  eq('exactly 50 -> promoted',      Progression.decision(9).outcome, 'promoted');
  eq('exactly 50 term gate passes', Academic.promotionCheck(9, 1).pass, true);
  eq('exactly 50 avg passes',       Academic.promotionCheck(9, 1).avgPass, true);
  eq('above 50 -> promoted',      Progression.decision(10).outcome, 'promoted');
  eq('above 50 term gate passes', Academic.promotionCheck(10, 1).pass, true);
  eq('avg = sum / subjects',      Academic.termAverage(10, 1), 56);
  eq('policy(9) checkpoint', Progression.policy(9), 'checkpoint');
  eq('policy(12) exit', Progression.policy(12), 'exit');
  eq('canChoose year7 false', Progression.canChoose(7), false);
  eq('canChoose year10 true', Progression.canChoose(10), true);

  // Pool
  eq('poolClass found', Progression.poolClassName(), 'Grade 10 Pool');
  eq('isPoolEntrant(8)', Progression.isPoolEntrant(8), true);
  eq('isPoolEntrant(1)', Progression.isPoolEntrant(1), false);
  eq('poolEntrants', Progression.poolEntrants().map(s => s.id), ['8']);

  // chain
  eq('classAfter(7A)', Progression.classAfter('10'), '15');
  eq('classAfter(pool) null', Progression.classAfter('12'), null);

  // publish
  eq('published term1', Data.published(1), false);

  // mid-term break (admin session setting) + scores shape for the report
  eq('midtermBreak start', Data.session().midtermBreak?.start, '2026-10-26');
  eq('midtermBreak end',   Data.session().midtermBreak?.end,   '2026-11-02');
  const mt = Data.studentScores('1')[1]?.[1];
  eq('midterm CA vehicle', mt && Number.isFinite(mt.test) ? true : false, true);

  // day structure via the generator
  const slots = Timetable.slotTimes(Timetable.dayStructure());
  eq('default dayStructure slots', slots.length, 9);
  eq('break slot 1 label', slots[3].label, 'Short Break');
  eq('break slot 1 isBreak', slots[3].isBreak, true);
  eq('after-school break label', slots[8].label, 'After School');
  eq('break at 10:00 - 10:20', slots[3].time, '10:00 – 10:20');
  eq('period4 starts 10:20', slots[4].start, '10:20');
  eq('after-school 13:00-13:45', slots[8].time, '13:00 – 13:45');

  // generateAll: one schedule per class, breaks present per day
  const all = Timetable.generateAll();
  eq('schedules count', all.schedules.length, raw.classes.length - 1); // pool class has no subjects -> absent
  eq('absent singles out pool', all.absent.join(',').includes('Grade 10 Pool'), true);
  const one = all.schedules.find(s => s.classId === '10');
  eq('day periods include break', one.days[0].periods[3].isBreak, true);
  eq('break subject label', one.days[0].periods[3].subject, 'Short Break');
  eq('5 days generated', one.days.length, 5);

  // coverage shape
  const cov = Progression.coverage(1);
  eq('coverage class10 stu count', cov['10'].students, 5);
  eq('coverage class10 subject count', cov['10'].subjects.length, 3);

  // main back-compat slot call used by saveTimetable
  const legacy = Timetable.slotTimes(6, 8, 45);
  eq('legacy no-break slots', legacy.length, 6);
  eq('legacy first slot', legacy[0].time, '08:00 – 08:45');

  // ── passwords ──────────────────────────────────────────────
  // Legacy plaintext rows (pre-migration shape) still sign in
  eq('legacy plaintext matches',  Data.passwordMatches(Data.user('10'), 'x'), true);
  eq('legacy plaintext wrong',    Data.passwordMatches(Data.user('10'), 'zz'), false);

  // Our JS sha256 agrees with Node's crypto, which is the same digest the
  // SQL migration's backfill uses (hex(sha256(salt || password)))
  const { createHash } = await import('node:crypto');
  const salt  = '4f6b0a1c2d3e4f5099aabbccddeeff0011'; // 32 hex chars
  const pw    = 'hunter2!';
  const wantH = createHash('sha256').update(salt + pw).digest('hex');
  const u1    = Data.user('1');
  u1.passwordHash = wantH; u1.passwordSalt = salt; u1.password = null;
  eq('hash matches node sha256', Data.passwordMatches(u1, pw), true);
  eq('hash wrong password',      Data.passwordMatches(u1, 'wrong!'), false);

  // Admin may reset a staff member who forgot their password
  const okStaff = await Data.resetPassword('15', 'newpw1', Data.user('1'));
  eq('admin can reset staff',               !!okStaff, true);
  eq('admin reset persists hash',           Data.passwordMatches(Data.user('15'), 'newpw1'), true);
  eq('admin reset invalidates old',         Data.passwordMatches(Data.user('15'), 'x'), false);

  // Class teacher may reset a student in their own class
  const okStu = await Data.resetPassword('6', 'stu123', Data.user('1002'));
  eq('class teacher resets own student',    !!okStu, true);
  eq('reset student login works',           Data.passwordMatches(Data.user('6'), 'stu123'), true);
  eq('generated temp password is long',     (Data.generateTempPassword?.() || 'x').length > 5, true);

  // ...and nothing else
  eq('teacher cannot reset staff',          await Data.resetPassword('15', 'x', Data.user('1002')), null);
  eq('teacher cannot reset other class',    await Data.resetPassword('4',  'x', Data.user('1002')), null);
  eq('non-class-teacher cannot reset',      await Data.resetPassword('6',  'x', Data.user('10')),  null);

  // ── subject registration ─────────────────────────────────────
  // Pool entrant (year 10) picks subjects: effective immediately
  eq('year10 no selection yet', Progression.effectiveSubjects(8), null);
  await Progression.chooseSubjects(8, ['1', '2'], { status: 'effective', userId: 1 });
  eq('year10 selection status',  Progression.selectionFor(8).status, 'effective');
  eq('year10 effective ids',     Progression.effectiveSubjects(8).sort(), ['1', '2']);

  // Grade 12 adjustment -> pending + approval request for the class teacher
  await Progression.chooseSubjects(5, ['1'], { status: 'pending', userId: 5 });
  await Progression.requestApproval({
    actionType: 'subject_change', entityType: 'subject_selection', entityId: 5,
    payload: { subjectIds: ['1'], previous: ['2', '3'] },
    summary: 'Student E requested a subject change.'
  }, 5);
  eq('pending approval created',       Progression.pendingApprovals().some(a => a.entityId === '5'), true);
  eq('requesting student hidden',      Progression.approvalsFor('5').length, 0);

  const a1 = Progression.pendingApprovals().find(a => a.entityId === '5');
  await Progression.chooseSubjects(5, ['1'], { status: 'effective', userId: 1002 });
  await Progression.decideApproval(a1.id, true, 1002, 'Approved by class teacher');
  eq('approved leaves pending',        Progression.pendingApprovals().some(a => a.id === a1.id), false);
  eq('approved becomes effective',     Progression.effectiveSubjects(5), ['1']);

  // Rejecting restores the previous effective list
  await Progression.chooseSubjects(5, ['1', '2'], { status: 'pending', userId: 5 });
  await Progression.requestApproval({
    actionType: 'subject_change', entityType: 'subject_selection', entityId: 5,
    payload: { subjectIds: ['1', '2'], previous: ['1'] }, summary: 'trying two'
  }, 5);
  const a2 = Progression.pendingApprovals().find(a => a.entityId === '5');
  await Progression.chooseSubjects(5, a2.payload.previous, { status: 'effective', userId: 1002 });
  await Progression.decideApproval(a2.id, false, 1002, 'Declined by class teacher');
  eq('reject restores previous',       Progression.effectiveSubjects(5), ['1']);
  eq('no pending subject changes left', Progression.pendingApprovals().filter(a => a.actionType === 'subject_change').length, 0);

  // ── weekly topics ────────────────────────────────────────────
  await Progression.addWeeklyTopic({ classId: '13', subjectId: '1', week: 3, topic: 'Algebra',   summary: 'quadratics' }, 15);
  await Progression.addWeeklyTopic({ classId: '13', subjectId: '1', week: 4, topic: 'Proportions', summary: '' }, 15);
  eq('topicsFor newest first', Progression.topicsFor('13', '1')[0].topic, 'Proportions');
  eq('topicsFor count',        Progression.topicsFor('13', '1').length, 2);
  await Progression.addWeeklyTopic({ classId: '13', subjectId: '1', week: 4, topic: 'Rates', summary: 'updated' }, 15);
  eq('same week replaces, no dup', Progression.topicsFor('13', '1').length, 2);
  eq('upsert keeps newest',        Progression.topicsFor('13', '1')[0].topic, 'Rates');

  // ── pool close ──────────────────────────────────────────────
  const closed = await Progression.closePool(null);
  eq('close pool marks unplaced entrant(s)', closed, 1);
  eq('pool empty after close',  Progression.poolEntrants().length, 0);
  eq('entrant status inactive', Data.student('8').status, 'inactive');

  // ── learning management (migration 20260929_lms.sql) ─────────
  eq('lessons hydrated',     Data.lmsLessons().length, 1);
  eq('lessonsFor class10',   Data.lessonsFor('10').length, 1);
  eq('lessonsFor other class nil', Data.lessonsFor('11').length, 0);
  eq('quizzesFor class10',   Data.quizzesFor('10').length, 1);
  eq('qns ordered by position', Data.questionsForQuiz('1').map(q => q.questionText),
    ['Which is a noun?', 'Verbs are action words.']);
  eq('qns point kept',       Data.questionsForQuiz('1')[1].points, 2);
  eq('existing attempt 1/3', Data.attemptFor('1', '1').score, 1);
  eq('student6 not attempted', Data.attemptFor('1', '6'), null);

  // A new attempt grades correctly (Q1 book=1pt, Q2 True=2pts)
  const taken = await Data.submitQuizAttempt('1', '6', { '1': 'book', '2': 'True' });
  eq('take all correct',     taken.score, 3);
  eq('take total',           taken.total, 3);
  eq('attempt persisted',    Data.attemptFor('1', '6').score, 3);

  // Resubmission replaces the same row (unique quiz_id+student_id)
  const retry = await Data.submitQuizAttempt('1', '6', { '1': 'run', '2': 'False' });
  eq('resubmission regrades', retry.score, 0);
  eq('still one attempt row', Data.lmsAttempts().filter(a => a.quizId === '1' && a.studentId === '6').length, 1);

  // Teacher creates a draft quiz, adds questions, publishes
  await Data.createQuiz({ subjectId: '1', classId: '10', title: 'Nouns test', description: 'x' }, '1002');
  const nq = Data.lmsQuizzes().find(q => q.title === 'Nouns test');
  eq('new quiz starts draft', nq.isPublished, false);
  await Data.saveQuizQuestions(nq.id, [
    { questionText: 'Cat is a noun.', questionType: 'tf',
      options: { A: 'True', B: 'False' }, correctAnswer: 'True', points: 1 }
  ]);
  eq('saved questions',    Data.questionsForQuiz(nq.id).length, 1);
  eq('tf forces options',  Data.questionsForQuiz(nq.id)[0].options.A, 'True');
  await Data.setQuizPublished(nq.id, true);
  eq('publish flips',      Data.lmsQuizzes().find(q => q.id === nq.id).isPublished, true);
  eq('visible for class',  Data.quizzesFor('10').some(q => q.title === 'Nouns test'), true);
  await Data.deleteQuiz(nq.id);
  eq('quiz deleted', Data.lmsQuizzes().some(q => q.title === 'Nouns test'), false);
  eq('questions deleted with quiz', Data.questionsForQuiz(nq.id).length, 0);

  // Lessons add / delete
  const before = Data.lessonsFor('10').length;
  await Data.addLesson({ subjectId: '1', classId: '10', title: 'Verbs', content: 'running' }, '1002');
  eq('lesson added',      Data.lessonsFor('10').length, before + 1);
  eq('newest first',      Data.lessonsFor('10')[0].title, 'Verbs');
  const addedLesson = Data.lmsLessons().find(l => l.title === 'Verbs');
  await Data.deleteLesson(addedLesson.id, '1002');
  eq('lesson deleted',    Data.lessonsFor('10').length, before);

  // Discussions + posts
  eq('discussionsFor class', Data.discussionsFor('10').length, 1);
  eq('postsFor initial',     Data.postsFor('1').length, 1);
  await Data.addDiscussionPost('1', '6', 'Great thread!');
  eq('post added',           Data.postsFor('1').length, 2);
  eq('post author',          Data.postsFor('1').find(p => p.userId === '6').body, 'Great thread!');
  await Data.openDiscussion({ subjectId: '1', classId: '10', title: 'Poetry time', body: '' }, '1002');
  eq('discussion opened',    Data.discussionsFor('10').length, 2);
  const newDisc = Data.lmsDiscussions().find(d => d.title === 'Poetry time');
  await Data.deleteDiscussion(newDisc.id, '1002');
  eq('discussion deleted',   Data.discussionsFor('10').length, 1);

  // ── pathway requests (20260928 path_requests) ────────────────
  eq('grade9 no request yet', Progression.pathRequest('4'), null);
  await Progression.requestPathway('4', 'Science', 'I love physics', '1002');
  const pr = Progression.pathRequest('4');
  eq('grade9 request stream', pr.stream, 'Science');
  eq('grade9 request status', pr.status, 'pending');
  eq('grade9 note saved',     pr.note, 'I love physics');
  eq('unknown student nil',   Progression.pathRequest('99'), null);

  await Progression.requestPathway('4', 'Arts', '', '1002');
  const pr2 = Progression.pathRequest('4');
  eq('upsert single row',     pr2.stream, 'Arts');
  eq('upsert clears note',    pr2.note, '');
  eq('one row per student',   Data.pathRequests().filter(r => r.studentId === '4').length, 1);

  // ── daily attendance (migration 20260930_attendance_daily.sql) ──
  eq('dayStatus present',   Data.dayStatus('1', 1, 0, 1), 'present');
  eq('dayStatus late',      Data.dayStatus('1', 1, 2, 1), 'late');
  eq('dayStatus absent',    Data.dayStatus('1', 1, 3, 1), 'absent');
  eq('dayStatus unmarked',  Data.dayStatus('1', 1, 4, 1), null);
  eq('dayStatus other week nil', Data.dayStatus('1', 3, 0, 1), null);
  eq('weekly not derived until save', Data.studentAttendance('1', 1).W1, undefined);

  // Upload a week: P/L roll up as present, A and blanks do not
  await Data.saveDailyWeek(3, { '2': ['present', 'present', 'late', '', 'absent'] }, 1);
  eq('rollup present from daily',  Data.studentAttendance('2', 1).W3, 3);
  eq('dayStatus after save',       Data.dayStatus('2', 3, 4, 1), 'absent');
  eq('untouched student untouched', Data.studentAttendance('1', 1).W3, undefined);

  await Data.saveDailyWeek(1, { '1': ['late', 'late', 'late', '', ''], '2': ['present', 'present', 'present', 'present', 'present'] }, 1);
  eq('late counts as attended', Data.studentAttendance('1', 1).W1, 3);
  eq('full week present',       Data.studentAttendance('2', 1).W1, 5);

  // A manual weekly summary edit backfills the daily register
  const full  = { '1': Data.studentAttendance('1', 1), '2': Data.studentAttendance('2', 1), '3': { W4: 4 } };
  await Data.saveAttendance(full, 1);
  eq('manual weekly persists',  Data.studentAttendance('3', 1).W4, 4);
  eq('backfill first days present', Data.dayStatus('3', 4, 0, 1), 'present');
  eq('backfill day 3 (0-idx) present', Data.dayStatus('3', 4, 3, 1), 'present');
  eq('backfill leaves day 4 (0-idx) blank', Data.dayStatus('3', 4, 4, 1), null);

  // Uploading a second time replaces that week (snapshot, not accumulate)
  await Data.saveDailyWeek(4, { '3': ['present', 'absent', 'absent', '', ''] }, 1);
  eq('re-upload replaces week',  Data.studentAttendance('3', 1).W4, 1);

  // The day-based register: one save marks the whole class for one weekday
  const week2day3 = {}; week2day3['2'] = 'present'; week2day3['3'] = 'absent';
  await Data.saveDailyDay(2, 3, week2day3, 1);
  eq('single day present',     Data.dayStatus('3', 2, 3, 1), 'absent');
  eq('single day absent',      Data.dayStatus('2', 2, 3, 1), 'present');
  eq('keeps unmarked days',    Data.dayStatus('2', 2, 1, 1), null);
  eq('day roll-up counts day', Data.studentAttendance('2', 1).W2, 1);
  eq('absent adds no days',    Data.studentAttendance('3', 1).W2, 0);
  eq('untouched student kept', Data.dayStatus('1', 2, 0, 1), 'present');
  eq('removed day gone',         Data.dayStatus('3', 4, 3, 1), null);

  // ── promotion gate: decisions only after the final term is published ──
  eq('gate locked before term 3',   Data.promotionsGate().open, false);
  eq('gate names the final term',   Data.promotionsGate().term, 3);
  Data.session().currentTerm = 3;
  eq('gate locked pre-publish',     Data.promotionsGate().open, false);
  await Progression.setTermPublished(3, true, 1);
  eq('term 3 published flag',       Data.published(3), true);
  eq('gate unlocks on term-3 publish', Data.promotionsGate().open, true);

  // ── admin manual promotion decisions (promotion_overrides) ──
  eq('no override at rest',          Progression.overrideOf('6'), null);
  eq('F rule says repeat',           Progression.decision('6').outcome, 'repeat');
  await Progression.setOverride('6', 'promoted', 'Academic board discretion', 1);
  eq('override stored',              Progression.overrideOf('6').decision, 'promoted');
  eq('override flips decision',      Progression.decision('6').outcome, 'promoted');
  eq('override notes the reason',    Progression.decision('6').reason, 'admin_override');
  await Progression.clearOverride('6');
  eq('override cleared -> rule back', Progression.decision('6').outcome, 'repeat');

  // ── start a new academic session ───────────────────────────
  const next = await Data.startNewSession({ name: '2027 / 2028', userId: 1 });
  eq('new session created',           !!next, true);
  eq('new session name',              Data.session().name, '2027 / 2028');
  eq('new session opens term 1',      Data.session().currentTerm, 1);
  eq('new session has three terms',   Data.session().terms.length, 3);
  eq('new term 1 is current',         Data.session().terms[0].isCurrent, true);
  eq('new published flags reset',     Data.published(1) || Data.published(2) || Data.published(3), false);
  eq('promotions snapshot written',   Data.promotionsFor('1').length >= 1, true);
  eq('promotion outcome recorded',    Data.promotionsFor('1')[0].outcome, 'promoted');

  // Gated again for the brand-new year (nothing published yet).
  Data.session().currentTerm = 1;
  eq('new year gate locked',          Data.promotionsGate().open, false);

  // ── archive a student ──────────────────────────────────────
  eq('login allowed while active',    Data.accountBlocked({ role: 'Student', studentId: '2' }), false);
  await Data.setStudentStatus('2', 'archived', 'archived', { userId: 1 });
  eq('student now archived',          Data.student('2').status, 'archived');
  eq('archived login blocked',        Data.accountBlocked({ role: 'Student', studentId: '2' }), true);
  eq('admin/parent not blocked',      Data.accountBlocked({ role: 'Administrator', studentId: '2' }), false);
  await Data.setStudentStatus('2', 'active', null, { userId: 1 });
  eq('restore returns to active',     Data.student('2').status, 'active');
  eq('restored student may sign in',  Data.accountBlocked({ role: 'Student', studentId: '2' }), false);

  // ── Growth & Mastery system ─────────────────────────────────
  // Fresh accounts start at zero: no artifacts, commendations, perfect
  // attendance weeks or improvements in the brand-new session.
  eq('fresh student XP zero',     Growth.studentXp('1').total, 0);
  eq('fresh student rank dash',   Growth.studentXp('1').rank, '—');

  // Verified portfolio artifact -> +150 co-curricular XP + Code Crafter
  await Growth.addArtifact({ studentId: '1', kind: 'code', title: 'Robot rover', note: '', createdBy: '1' });
  const art = Data.artifacts().find(a => a.title === 'Robot rover');
  eq('artifact starts pending',   art.status, 'pending');
  eq('pending adds no XP',        Growth.studentXp('1').categories.coCurricular, 0);
  await Growth.decideArtifact(art.id, true, '1002');
  eq('artifact verified',         Data.artifacts().find(a => a.id === art.id).status, 'verified');
  eq('verified adds 150 XP',      Growth.studentXp('1').categories.coCurricular, 150);
  eq('code crafter badge owned',  Growth.badges('1').some(b => b.key === 'code_crafter'), true);

  // Commendation -> +75 leadership XP, Scholar rank at 225 XP
  await Growth.addCommendation({ studentId: '1', teacherId: '1002', note: 'Led the reading corner.' });
  eq('commendation adds 75 XP',   Growth.studentXp('1').categories.leadership, 75);
  eq('total XP',                  Growth.studentXp('1').total, 225);
  eq('level 1 from 225 XP',       Growth.studentXp('1').level, 1);
  eq('rank Scholar',              Growth.studentXp('1').rank, 'Scholar');

  // Level boundaries (250 XP per level)
  eq('0 XP is level 0',           Growth.levelOf(0), 0);
  eq('250 XP is level 2',         Growth.levelOf(250), 2);
  eq('1500 XP is level 7',        Growth.levelOf(1500), 7);
  eq('rank Explorer at 6',        Growth.rankOf(6), 'Explorer');
  eq('rank Innovator at 11',      Growth.rankOf(11), 'Innovator');
  eq('rank Vanguard at 16',       Growth.rankOf(16), 'Vanguard / Master');

  // Parent · Engaged Guardian Tier
  await Growth.recordParentEngagement('2000', 'login');
  await Growth.recordParentEngagement('2000', 'ack_results');
  await Growth.recordParentEngagement('2000', 'ack_results');
  await Growth.recordParentEngagement('2000', 'ack_results');
  await Growth.recordParentEngagement('2000', 'pta');
  await Growth.recordParentEngagement('2000', 'early_payment');
  const pp = Growth.parentProfile('2000');
  eq('parent login counted',       pp.loginCount, 1);
  eq('pacesetter badge owned',     pp.badges.some(b => b.key === 'pacesetter'), true);
  eq('active guardian badge owned', pp.badges.some(b => b.key === 'active_guardian'), true);
  eq('parent children linked',     pp.childIds.includes('1'), true);

  // Educator Recognition Engine
  const rec = Growth.teacherRecognition('1002');
  eq('mentor notes counted',       rec.mentorNotes, 1);
  eq('verifications counted',      rec.verifications, 1);
  await Growth.recordTeacherRecognition({ teacherId: '1002', kind: 'master_register', note: 'All grades in early.' });
  eq('master register honored',    Growth.teacherRecognition('1002').masterRegister, true);
  eq('points = 10+25+50',          Growth.teacherRecognition('1002').points, 85);
  eq('leaderboard top teacher',    Growth.leaderboard()[0].teacherId, '1002');
  eq('passport code shape',        /^HMA-\\d{4}-\\d{4}$/.test(Growth.passportCode('1')), true);

  console.log((fail ? 'SMOKE FAILED: ' : 'SMOKE OK: ') + ok + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
`;

await import('node:url').then(async ({ pathToFileURL }) => {
  // run data.js + harness in one module scope
  const full = src + harness;
  const url = pathToFileURL('hma-run.mjs').href;
  const mod = await import('node:module');
  // build a one-off module from string
  const dataUri = 'data:text/javascript;base64,' + Buffer.from(full).toString('base64');
  await import(dataUri);
});