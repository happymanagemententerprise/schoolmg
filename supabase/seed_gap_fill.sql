-- =====================================================================
-- Gap-fill for the live database: re-runs the sections of seed.sql whose
-- statements did not execute when the seed was pasted (the lms, daily
-- attendance and growth blocks). Every statement is guarded and runs
-- exactly the same as it does in seed.sql, so this is safe to run and to
-- re-run. Ends with a SELECT that shows the resulting row counts.
-- =====================================================================

-- LMS lessons
insert into lms_lessons (session_id, term_id, subject_id, class_id, teacher_id, title, content)
select s.id, t.id, sub.id, c.id, u.id, v.title, v.content
  from (values
    ('Nouns and their types',
     'A noun names a person, place, thing or idea.\n\nCommon nouns name general things (girl, town, book), proper nouns name specific ones (Ama, Kumasi, Treasure Island).\n\nRead the short passage and list five common nouns and two proper nouns you find.'),
    ('Collective nouns',
     'Collective nouns name a group as a single unit: a team of players, a flock of birds, a bunch of keys.\n\nWrite three sentences, each using one of the collective nouns above.')
  ) as v(title, content)
  join sessions s on s.name = '2026 / 2027'
  join terms    t on t.name = '1st Term'
  join subjects sub on sub.name = 'English Studies'
  join classes  c on c.class_name = 'Grade 7'
  join users    u on u.email = 'subject@happyman.edu'
 where not exists (select 1 from lms_lessons l
                    where l.subject_id = sub.id
                      and l.class_id   = c.id
                      and l.title      = v.title);

-- LMS quiz
insert into lms_quizzes (session_id, term_id, subject_id, class_id, teacher_id, title, description, is_published)
select s.id, t.id, sub.id, c.id, u.id, 'Parts of speech', 'Quick check on nouns and verbs from this week''s work.', true
  from sessions s
  join terms    t on t.name = '1st Term'
  join subjects sub on sub.name = 'English Studies'
  join classes  c on c.class_name = 'Grade 7'
  join users    u on u.email = 'subject@happyman.edu'
 where not exists (select 1 from lms_quizzes q where q.title = 'Parts of speech');

-- LMS questions
insert into lms_questions (
  quiz_id, question_text, question_type,
  option_a, option_b, option_c, option_d,
  correct_answer, points, position
)
select q.id, v.question_text, v.question_type,
       v.option_a, v.option_b, v.option_c, v.option_d,
       v.correct_answer, v.points, v.position
  from (values
    ('Which word is a proper noun?', 'mc', 'town', 'Ama', 'book', 'idea', 'Ama', 1, 0),
    ('Which phrase is a collective noun?', 'mc', 'a flock of birds', 'a red car', 'a tall tree', 'a sweet mango', 'a flock of birds', 1, 1),
    ('A verb is an action word.', 'tf', 'True', 'False', null, null, 'True', 1, 2)
  ) as v(question_text, question_type, option_a, option_b, option_c, option_d, correct_answer, points, position)
  join lms_quizzes q on q.title = 'Parts of speech'
 where not exists (
   select 1
     from lms_questions lq
    where lq.quiz_id = q.id
      and lq.position = v.position
 );

-- LMS attempt
insert into lms_attempts (
  quiz_id, student_id, score, total, answers, submitted_at
)
select q.id, s.id, 2, 3, answer_map.answers,
       now() - interval '2 hours'
  from lms_quizzes q
  join students s on s.admission_no = 'HMA/2026/001'
  cross join lateral (
    select jsonb_object_agg(lq.id::text, v.answer) as answers
      from (values
        ('Which word is a proper noun?', 'Ama'),
        ('Which phrase is a collective noun?', 'a flock of birds'),
        ('A verb is an action word.', 'False')
      ) as v(question_text, answer)
      join lms_questions lq
        on lq.quiz_id = q.id
       and lq.question_text = v.question_text
  ) as answer_map
 where q.title = 'Parts of speech'
   and answer_map.answers is not null
on conflict (quiz_id, student_id) do nothing;

-- LMS discussion and post
insert into lms_discussions (session_id, term_id, subject_id, class_id, teacher_id, title, body)
select s.id, t.id, sub.id, c.id, u.id, 'Why do you like reading?',
       'Tell us about a book or story you loved this term and why. Keep it to three or four sentences.'
  from sessions s
  join terms    t on t.name = '1st Term'
  join subjects sub on sub.name = 'English Studies'
  join classes  c on c.class_name = 'Grade 7'
  join users    u on u.email = 'subject@happyman.edu'
 where not exists (select 1 from lms_discussions d where d.title = 'Why do you like reading?');

insert into lms_posts (discussion_id, user_id, body)
select d.id, u.id, 'I loved Treasure Island best - the map and the pirates make it exciting.'
  from lms_discussions d
  join users u on u.email = 'subject@happyman.edu'
 where d.title = 'Why do you like reading?'
   and not exists (select 1 from lms_posts p where p.discussion_id = d.id and p.body like 'I loved Treasure Island%');

-- Daily attendance (per school day), derived from the weekly roll-up
insert into attendance_daily (student_id, term_id, week_number, day_index, status)
select base.student_id, base.term_id, base.w, d,
       case
         when mod(abs(hashtext(s2.admission_no || base.term_id::text || base.w::text || d::text)), 13) = 0
              and d = base.present - 1 then 'late'
         else 'present'
       end
  from (
    select s.id as student_id, t.id as term_id, w,
           case
             when mod(abs(hashtext(s.admission_no || t.id::text || w::text)), 7) = 0 then 3
             when mod(abs(hashtext(s.admission_no || w::text)), 7) = 0 then 4
             else 5
           end as present
      from students s
      cross join terms t
      cross join generate_series(1, 4) as w
     where t.name in ('1st Term', '2nd Term')
  ) base
  join students s2 on s2.id = base.student_id
  cross join generate_series(0, 4) as d
 where d < base.present
   and not exists (
     select 1 from attendance_daily ad
      where ad.student_id   = base.student_id
        and ad.term_id      = base.term_id
        and ad.week_number  = base.w
        and ad.day_index    = d);

-- Portfolio artifacts (Growth & Mastery)
insert into portfolio_artifacts (student_id, kind, title, note, status)
select s.id, v.kind, v.title, v.note, 'verified'
  from (values
    ('HMA/2026/001', 'code',      'Scratch rover project',   'Programmed a sensor-driven rover and logging dashboard.'),
    ('HMA/2026/001', 'leadership','Library prefect',         'Ran the term-one book drive; 112 books donated.')
  ) as v(admission_no, kind, title, note)
  join students s on s.admission_no = v.admission_no
 where not exists (
   select 1 from portfolio_artifacts a
    where a.student_id = s.id and a.title = v.title);

insert into portfolio_artifacts (student_id, kind, title, note, status)
select s.id, v.kind, v.title, v.note, v.status
  from (values
    ('HMA/2026/006', 'sport', '100m inter-house gold', 'Track and field: took the 100m in 12.4s at inter-house sports.', 'verified'),
    ('HMA/2026/002', 'code',  'Quiz app (pending review)', 'Three-subject revision app built with Scratch.', 'pending')
  ) as v(admission_no, kind, title, note, status)
  join students s on s.admission_no = v.admission_no
 where not exists (
   select 1 from portfolio_artifacts a
    where a.student_id = s.id and a.title = v.title);

-- Commendation
insert into commendations (student_id, teacher_id, note)
select s.id, t.id, 'Led the reading corner every Friday and helped peers with English revision.'
  from students s
  join users t on t.email = 'class@happyman.edu'
 where s.admission_no = 'HMA/2026/001'
   and not exists (
     select 1 from commendations c
      where c.student_id = s.id and c.note like 'Led the reading corner%');

-- Teacher recognition (Master Register)
insert into teacher_recognitions (teacher_id, kind, session_id, note)
select t.id, 'master_register', s.id, 'All three terms kept within 48 hours of the deadline.'
  from users t
  join sessions s on s.name = '2026 / 2027'
 where t.email = 'class@happyman.edu'
   and not exists (
     select 1 from teacher_recognitions tr
      where tr.teacher_id = t.id and tr.kind = 'master_register');

-- Verification — copy the numbers this returns back
select 'lms_lessons' table_name,        count(*) rows from lms_lessons
union all select 'lms_quizzes',          count(*) from lms_quizzes
union all select 'lms_questions',        count(*) from lms_questions
union all select 'lms_attempts',         count(*) from lms_attempts
union all select 'lms_discussions',      count(*) from lms_discussions
union all select 'lms_posts',            count(*) from lms_posts
union all select 'attendance_daily',     count(*) from attendance_daily
union all select 'portfolio_artifacts',  count(*) from portfolio_artifacts
union all select 'commendations',        count(*) from commendations
union all select 'teacher_recognitions', count(*) from teacher_recognitions;