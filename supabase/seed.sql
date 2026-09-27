-- =====================================================================
-- Happy Man Academy — Seed data (re-runnable)
--
-- Run AFTER supabase/migrations/20260927_school_upgrade.sql
--
-- Creates:
--   * Academic session 2026 / 2027 with three terms (1st term current)
--   * Staff: administrator, class teachers, subject teachers, HODs
--   * 34 subjects following the Nigerian curriculum
--       - JSS 1-3 (Grade 7-9): one shared subject list
--       - SS 1-3 (Grade 10-12): Science / Commercial / Arts groups
--   * 12 classes: Grade 7, 8, 9 + Grade 10/11/12 x Science|Commercial|Arts
--   * Teacher -> subject -> class assignments, departments, students,
--     grades, weekly attendance, assignments, events and remarks
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: avatar initials from a full name
-- ---------------------------------------------------------------------
create or replace function hma_initials(fullname text) returns text
language sql immutable as $$
  select upper(
    left(regexp_replace(coalesce(fullname,''), '\s+', ' ', 'g'), 1) ||
    left(split_part(regexp_replace(coalesce(fullname,''), '\s+', ' ', 'g'), ' ', 2), 1)
  );
$$;

-- ---------------------------------------------------------------------
-- Session and terms
-- ---------------------------------------------------------------------
insert into sessions (name, is_current, upload_open)
values ('2026 / 2027', true, '{"test":false,"exam":true}'::jsonb)
on conflict (name) do update set is_current = excluded.is_current,
                                upload_open = excluded.upload_open;

update sessions set is_current = false where name <> '2026 / 2027';

insert into terms (session_id, name, is_current, start_date, end_date)
select s.id, v.name, v.is_current, v.start_date::date, v.end_date::date
  from (values
    ('1st Term', true,  '2026-09-07', '2026-12-18'),
    ('2nd Term', false, '2027-01-11', '2027-04-09'),
    ('3rd Term', false, '2027-04-26', '2027-07-23')
  ) as v(name, is_current, start_date, end_date)
  join sessions s on s.name = '2026 / 2027'
on conflict (session_id, name) do update
  set is_current  = excluded.is_current,
      start_date  = excluded.start_date,
      end_date    = excluded.end_date;

-- ---------------------------------------------------------------------
-- Staff
--   20 teachers. The curriculum is 174 class+subject pairs and a teacher
--   can take at most 30 periods a week, so this is the minimum number of
--   staff for a whole-school timetable with no double bookings.
--   Subjects offered to every class are split across separate teachers
--   so the generator always has a free teacher to pick.
-- ---------------------------------------------------------------------
insert into users (name, email, password, role, phone, tone, initials, staff_role, is_mentor, mentor_subject, mentor_bio)
values
  ('Amara Mensah',    'admin@happyman.edu',      'admin123',   'admin',   '08031234567', 'coral',  hma_initials('Amara Mensah'),    null,                 false, null, null),
  -- general studies
  ('Adwoa Addo',      'subject@happyman.edu',    'subject123', 'teacher', '08031234569', 'green',  hma_initials('Adwoa Addo'),      'Subject Teacher',   false, null, null),
  ('Samuel Ofori',    'english2@happyman.edu',   'happyman123','teacher', '08031234577', 'blue',   hma_initials('Samuel Ofori'),    'Subject Teacher',   false, null, null),
  ('Daniel Quaye',    'maths2@happyman.edu',     'happyman123','teacher', '08031234578', 'coral',  hma_initials('Daniel Quaye'),    'Subject Teacher',   false, null, null),
  ('Sandra Kumi',     'maths3@happyman.edu',     'happyman123','teacher', '08031234579', 'yellow', hma_initials('Sandra Kumi'),     'Subject Teacher',   false, null, null),
  ('Ibrahim Musa',    'history@happyman.edu',    'happyman123','teacher', '08031234580', 'green',  hma_initials('Ibrahim Musa'),    'Subject Teacher',   false, null, null),
  ('Akosua Frimpong', 'yoruba@happyman.edu',     'happyman123','teacher', '08031234582', 'blue',   hma_initials('Akosua Frimpong'), 'Subject Teacher',   false, null, null),
  ('Kofi Mensah',     'languages@happyman.edu',  'happyman123','teacher', '08031234575', 'blue',   hma_initials('Kofi Mensah'),     'HOD',               true,  'Nigerian History',    'Head of General Studies. Nigerian history and social studies.'),
  ('Vida Nyarko',     'crs@happyman.edu',        'happyman123','teacher', '08031234581', 'coral',  hma_initials('Vida Nyarko'),     'Subject Teacher',   false, null, null),
  ('Joseph Aidoo',    'jss2@happyman.edu',       'happyman123','teacher', '08031234576', 'green',  hma_initials('Joseph Aidoo'),    'Subject Teacher',   false, null, null),
  ('Zainab Haruna',   'islamic@happyman.edu',    'happyman123','teacher', '08031234586', 'yellow', hma_initials('Zainab Haruna'),   'Subject Teacher',   false, null, null),
  -- junior secondary
  ('Kwame Owusu',     'class@happyman.edu',      'class123',   'teacher', '08031234568', 'blue',   hma_initials('Kwame Owusu'),     'Class Teacher',     true,  'Digital Technologies', 'Class teacher of Grade 7. Focused on practical computing and study habits.'),
  ('Abena Sarpong',   'jss@happyman.edu',        'happyman123','teacher', '08031234574', 'yellow', hma_initials('Abena Sarpong'),   'HOD',               true,  'Intermediate Science',  'Head of Junior Secondary. Loves practical experiments with the JSS learners.'),
  ('Michael Tetteh',  'jss3@happyman.edu',       'happyman123','teacher', '08031234587', 'coral',  hma_initials('Michael Tetteh'),  'Subject Teacher',   false, null, null),
  -- science
  ('Dr. Yaw Asante',  'hod@happyman.edu',        'hod123',     'teacher', '08031234570', 'yellow', hma_initials('Dr. Yaw Asante'),  'HOD',               false, null, null),
  ('Peter Asare',     'physics2@happyman.edu',   'happyman123','teacher', '08031234583', 'green',  hma_initials('Peter Asare'),     'Subject Teacher',   false, null, null),
  ('Nii Tetteh',      'science2@happyman.edu',   'happyman123','teacher', '08031234573', 'green',  hma_initials('Nii Tetteh'),      'Class Teacher',     true,  'Health Education',      'Class teacher of Grade 10 Science and mentor to senior students.'),
  -- commercial
  ('Fatima Bello',    'commercial@happyman.edu', 'happyman123','teacher', '08031234571', 'coral',  hma_initials('Fatima Bello'),    'HOD',               false, null, null),
  ('Clement Anane',   'commerce2@happyman.edu',  'happyman123','teacher', '08031234584', 'blue',   hma_initials('Clement Anane'),   'Subject Teacher',   false, null, null),
  -- arts
  ('Emeka Obi',       'arts@happyman.edu',       'happyman123','teacher', '08031234572', 'blue',   hma_initials('Emeka Obi'),       'HOD',               false, null, null),
  ('Ruth Opoku',      'arts2@happyman.edu',      'happyman123','teacher', '08031234585', 'coral',  hma_initials('Ruth Opoku'),      'Subject Teacher',   false, null, null)
on conflict (email) do update
  set name           = excluded.name,
      role           = excluded.role,
      phone          = excluded.phone,
      tone           = excluded.tone,
      initials       = excluded.initials,
      staff_role     = excluded.staff_role,
      is_mentor      = excluded.is_mentor,
      mentor_subject = excluded.mentor_subject,
      mentor_bio     = excluded.mentor_bio;

-- ---------------------------------------------------------------------
-- Subjects — Nigerian curriculum
--   level: JSS | SS | BOTH      group: General | Science | Commercial | Arts
-- ---------------------------------------------------------------------
insert into subjects (name, code, is_core, level, group_name, color)
values
  -- shared by JSS and SS
  ('English Studies',                 'ENG', true,  'BOTH', 'General',    'blue'),
  ('Mathematics',                     'MAT', true,  'BOTH', 'General',    'green'),
  ('Nigerian History',                'NHI', false, 'BOTH', 'General',    'coral'),
  ('Yoruba',                          'YOR', false, 'BOTH', 'General',    'yellow'),
  ('Hausa',                           'HAU', false, 'BOTH', 'General',    'coral'),
  ('Igbo',                            'IGB', false, 'BOTH', 'General',    'green'),
  ('Christian Religious Studies',     'CRS', false, 'BOTH', 'General',    'blue'),
  ('Islamic Studies',                 'ISL', false, 'BOTH', 'General',    'green'),

  -- Junior Secondary (Grade 7-9) only
  ('Intermediate Science',            'ISC', false, 'JSS',  'General',    'coral'),   -- Basic Science + Basic Technology
  ('Social and Citizenship Studies',  'SOC', false, 'JSS',  'General',    'blue'),    -- Social Studies + Civic Education
  ('Digital Technologies',            'DGT', false, 'JSS',  'General',    'yellow'),  -- former Computer Studies / ICT
  ('Physical & Health Education',     'PHE', false, 'JSS',  'General',    'green'),
  ('Cultural & Creative Arts',        'CCA', false, 'JSS',  'General',    'coral'),
  ('Business Studies',                'BUS', false, 'JSS',  'General',    'yellow'),

  -- Senior Secondary · Science group (Grade 10-12)
  ('Physics',                         'PHY', false, 'SS',   'Science',    'blue'),
  ('Chemistry',                       'CHM', false, 'SS',   'Science',    'coral'),
  ('Biology',                         'BIO', false, 'SS',   'Science',    'green'),
  ('Further Mathematics',             'FUR', false, 'SS',   'Science',    'yellow'),
  ('Agricultural Science',            'AGR', false, 'SS',   'Science',    'green'),
  ('Technical Drawing',               'TEC', false, 'SS',   'Science',    'blue'),
  ('Geography',                       'GEO', false, 'SS',   'Science',    'coral'),
  ('Foods & Nutrition',               'FNS', false, 'SS',   'Science',    'yellow'),
  ('Health Education',                'HEL', false, 'SS',   'Science',    'green'),

  -- Senior Secondary · Commercial group (Grade 10-12)
  ('Financial Accounting',            'ACC', false, 'SS',   'Commercial', 'blue'),
  ('Commerce',                        'COM', false, 'SS',   'Commercial', 'coral'),
  ('Economics',                       'ECO', false, 'SS',   'Commercial', 'green'),
  ('Marketing',                       'MKT', false, 'SS',   'Commercial', 'yellow'),
  ('Office Practice',                 'OFF', false, 'SS',   'Commercial', 'blue'),

  -- Senior Secondary · Arts group (Grade 10-12)
  ('Literature-in-English',           'LIT', false, 'SS',   'Arts',       'coral'),
  ('Government',                      'GOV', false, 'SS',   'Arts',       'blue'),
  ('Visual Arts',                     'VAS', false, 'SS',   'Arts',       'green'),
  ('Music',                           'MUS', false, 'SS',   'Arts',       'yellow'),
  ('French',                          'FRE', false, 'SS',   'Arts',       'blue'),
  ('Arabic',                          'ARA', false, 'SS',   'Arts',       'coral')
on conflict (name) do update
  set code       = excluded.code,
      is_core    = excluded.is_core,
      level      = excluded.level,
      group_name = excluded.group_name,
      color      = excluded.color;

-- ---------------------------------------------------------------------
-- Classes — Grade 7-9 (junior) and Grade 10-12 x Science/Commercial/Arts
-- ---------------------------------------------------------------------
insert into classes (class_name, level, stream, year)
values
  ('Grade 7',            'JSS', null,         7),
  ('Grade 8',            'JSS', null,         8),
  ('Grade 9',            'JSS', null,         9),
  ('Grade 10 Science',    'SS', 'Science',    10),
  ('Grade 10 Commercial', 'SS', 'Commercial', 10),
  ('Grade 10 Arts',       'SS', 'Arts',       10),
  ('Grade 11 Science',    'SS', 'Science',    11),
  ('Grade 11 Commercial', 'SS', 'Commercial', 11),
  ('Grade 11 Arts',       'SS', 'Arts',       11),
  ('Grade 12 Science',    'SS', 'Science',    12),
  ('Grade 12 Commercial', 'SS', 'Commercial', 12),
  ('Grade 12 Arts',       'SS', 'Arts',       12)
on conflict (class_name) do update
  set level  = excluded.level,
      stream = excluded.stream,
      year   = excluded.year;

-- ---------------------------------------------------------------------
-- Class teachers — one teacher owns one class
-- ---------------------------------------------------------------------
insert into teacher_classes (teacher_id, class_id)
select u.id, c.id
  from (values
    ('class@happyman.edu',     'Grade 7'),
    ('jss@happyman.edu',       'Grade 8'),
    ('languages@happyman.edu', 'Grade 9'),
    ('science2@happyman.edu',  'Grade 10 Science'),
    ('commercial@happyman.edu','Grade 11 Commercial'),
    ('arts@happyman.edu',      'Grade 12 Arts')
  ) as v(email, class_name)
  join users   u on u.email = v.email
  join classes c on c.class_name = v.class_name
on conflict (class_id) do update set teacher_id = excluded.teacher_id;

-- ---------------------------------------------------------------------
-- Teacher -> subject -> class assignments
--   Every subject in a class's curriculum must have a teacher, otherwise
--   the timetable generator has to leave it out. The two core subjects
--   are split across two teachers each so the generator can always find
--   someone free and never double-book anybody.
-- ---------------------------------------------------------------------

-- Adwoa Addo and Samuel Ofori - English Studies, split across the school
insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'subject@happyman.edu'
   and s.name  = 'English Studies'
   and c.class_name in ('Grade 7','Grade 8','Grade 9','Grade 10 Science','Grade 10 Commercial','Grade 10 Arts')
on conflict do nothing;

insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'english2@happyman.edu'
   and s.name  = 'English Studies'
   and c.class_name in ('Grade 11 Science','Grade 11 Commercial','Grade 11 Arts',
                        'Grade 12 Science','Grade 12 Commercial','Grade 12 Arts')
on conflict do nothing;

-- Daniel Quaye and Sandra Kumi - Mathematics, split across the school
insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'maths2@happyman.edu'
   and s.name  = 'Mathematics'
   and c.class_name in ('Grade 7','Grade 8','Grade 9','Grade 10 Science','Grade 10 Commercial','Grade 10 Arts')
on conflict do nothing;

insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'maths3@happyman.edu'
   and s.name  = 'Mathematics'
   and c.class_name in ('Grade 11 Science','Grade 11 Commercial','Grade 11 Arts',
                        'Grade 12 Science','Grade 12 Commercial','Grade 12 Arts')
on conflict do nothing;

-- One general-studies teacher per remaining universal subject
insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'history@happyman.edu'
   and s.name  = 'Nigerian History'
on conflict do nothing;

insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'yoruba@happyman.edu'
   and s.name  = 'Yoruba'
on conflict do nothing;

insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'languages@happyman.edu'
   and s.name  = 'Hausa'
on conflict do nothing;

insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'crs@happyman.edu'
   and s.name  = 'Igbo'
on conflict do nothing;

insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'jss2@happyman.edu'
   and s.name  = 'Christian Religious Studies'
on conflict do nothing;

insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'islamic@happyman.edu'
   and s.name  = 'Islamic Studies'
on conflict do nothing;

-- Junior Secondary - three teachers share the six JSS subjects
insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'jss@happyman.edu'
   and s.name in ('Intermediate Science','Social and Citizenship Studies')
   and c.level = 'JSS'
on conflict do nothing;

insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'class@happyman.edu'
   and s.name in ('Digital Technologies','Physical & Health Education')
   and c.level = 'JSS'
on conflict do nothing;

insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'jss3@happyman.edu'
   and s.name in ('Cultural & Creative Arts','Business Studies')
   and c.level = 'JSS'
on conflict do nothing;

-- Science department
insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'hod@happyman.edu'
   and s.name in ('Physics','Chemistry','Biology')
   and c.stream = 'Science'
on conflict do nothing;

insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'physics2@happyman.edu'
   and s.name in ('Further Mathematics','Geography','Agricultural Science','Technical Drawing')
   and c.stream = 'Science'
on conflict do nothing;

insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'science2@happyman.edu'
   and s.name in ('Health Education','Foods & Nutrition')
   and c.stream = 'Science'
on conflict do nothing;

-- Commercial department
insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'commercial@happyman.edu'
   and s.name in ('Financial Accounting','Commerce','Economics')
   and c.stream = 'Commercial'
on conflict do nothing;

insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'commerce2@happyman.edu'
   and s.name in ('Marketing','Office Practice')
   and c.stream = 'Commercial'
on conflict do nothing;

-- Arts department
insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'arts@happyman.edu'
   and s.name in ('Literature-in-English','Government','Visual Arts')
   and c.stream = 'Arts'
on conflict do nothing;

insert into teacher_subjects (teacher_id, subject_id, class_id)
select u.id, s.id, c.id
  from users u
  cross join subjects s
  cross join classes c
 where u.email = 'arts2@happyman.edu'
   and s.name in ('Music','French','Arabic')
   and c.stream = 'Arts'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Departments — HOD oversight
-- ---------------------------------------------------------------------
insert into departments (name, hod_id, subject_ids)
select v.name, u.id,
       array(select s.id::text from subjects s where s.name = any(v.subjects))
  from (values
    ('Junior Secondary', 'jss@happyman.edu',        array['Intermediate Science','Social and Citizenship Studies','Digital Technologies','Physical & Health Education','Cultural & Creative Arts','Business Studies']),
    ('Science',          'hod@happyman.edu',        array['Physics','Chemistry','Biology','Further Mathematics','Agricultural Science','Technical Drawing','Geography','Foods & Nutrition','Health Education']),
    ('Commercial',       'commercial@happyman.edu', array['Financial Accounting','Commerce','Economics','Marketing','Office Practice']),
    ('Arts',             'arts@happyman.edu',       array['Literature-in-English','Government','Visual Arts','Music','French','Arabic']),
    ('General Studies',  'languages@happyman.edu',  array['English Studies','Mathematics','Nigerian History','Yoruba','Hausa','Igbo','Christian Religious Studies','Islamic Studies'])
  ) as v(name, email, subjects)
  join users u on u.email = v.email
on conflict (name) do update
  set hod_id      = excluded.hod_id,
      subject_ids = excluded.subject_ids;

-- ---------------------------------------------------------------------
-- Students
-- ---------------------------------------------------------------------
insert into users (name, email, password, role, phone, tone, initials)
select v.name, v.email, 'student123', 'student', v.phone, v.tone, hma_initials(v.name)
  from (values
    ('Ama Osei',        'ama.osei@happyman.edu',        '08040000001', 'coral'),
    ('Yaw Boateng',     'yaw.boateng@happyman.edu',     '08040000002', 'blue'),
    ('Esi Armah',       'esi.armah@happyman.edu',       '08040000003', 'green'),
    ('Kojo Mensah',     'kojo.mensah@happyman.edu',     '08040000004', 'yellow'),
    ('Chidi Nwosu',     'chidi.nwosu@happyman.edu',     '08040000005', 'blue'),
    ('Fatima Yusuf',    'fatima.yusuf@happyman.edu',    '08040000006', 'coral'),
    ('Zainab Lawal',    'zainab.lawal@happyman.edu',    '08040000007', 'green'),
    ('Tunde Bakare',    'tunde.bakare@happyman.edu',    '08040000008', 'blue'),
    ('Amina Garba',     'amina.garba@happyman.edu',     '08040000009', 'yellow'),
    ('Tolu Akinwale',   'tolu.akinwale@happyman.edu',   '08040000010', 'coral'),
    ('Chidinma Eze',    'chidinma.eze@happyman.edu',    '08040000011', 'green')
  ) as v(name, email, phone, tone)
on conflict (email) do update
  set name = excluded.name, phone = excluded.phone, tone = excluded.tone;

insert into students (user_id, class_id, admission_no, gender, mentor_id)
select u.id, c.id, v.admission_no, v.gender, m.id
  from (values
    ('Ama Osei',      'F', 'HMA/2026/001', 'Grade 7',            'class@happyman.edu'),
    ('Yaw Boateng',   'M', 'HMA/2026/002', 'Grade 7',            'class@happyman.edu'),
    ('Esi Armah',     'F', 'HMA/2026/003', 'Grade 8',            'jss@happyman.edu'),
    ('Kojo Mensah',   'M', 'HMA/2026/004', 'Grade 8',            'jss@happyman.edu'),
    ('Chidi Nwosu',   'M', 'HMA/2026/005', 'Grade 9',            'languages@happyman.edu'),
    ('Fatima Yusuf',  'F', 'HMA/2026/006', 'Grade 10 Science',   'science2@happyman.edu'),
    ('Zainab Lawal',  'F', 'HMA/2026/007', 'Grade 10 Science',   'science2@happyman.edu'),
    ('Tunde Bakare',  'M', 'HMA/2026/008', 'Grade 11 Commercial','commercial@happyman.edu'),
    ('Amina Garba',   'F', 'HMA/2026/009', 'Grade 11 Arts',      'arts@happyman.edu'),
    ('Tolu Akinwale', 'M', 'HMA/2026/010', 'Grade 12 Science',   'science2@happyman.edu'),
    ('Chidinma Eze',  'F', 'HMA/2026/011', 'Grade 12 Arts',      'arts@happyman.edu')
  ) as v(name, gender, admission_no, class_name, mentor_email)
  join users   u on u.name  = v.name
  join classes c on c.class_name = v.class_name
  join users   m on m.email = v.mentor_email
on conflict (user_id) do update
  set class_id    = excluded.class_id,
      gender      = excluded.gender,
      mentor_id   = excluded.mentor_id,
      admission_no = excluded.admission_no;

-- ---------------------------------------------------------------------
-- Parent — phone number is required, children are linked here
-- ---------------------------------------------------------------------
insert into users (name, email, password, role, phone, tone, initials)
values ('Mrs. Comfort Osei', 'parent@happyman.edu', 'parent123', 'parent', '08099887766', 'coral', hma_initials('Mrs. Comfort Osei'))
on conflict (email) do update
  set name = excluded.name, phone = excluded.phone, role = 'parent';

insert into parent_students (parent_id, student_id)
select p.id, s.id
  from users p
  join students s on s.admission_no in ('HMA/2026/001', 'HMA/2026/006')
 where p.email = 'parent@happyman.edu'
on conflict (parent_id, student_id) do nothing;

-- ---------------------------------------------------------------------
-- Grades — CA (max 40) + Exam (max 60) for terms 1 and 2
-- Deterministic pseudo-random values so the demo is reproducible.
-- The three best students are boosted so the promotion rule is visible.
-- ---------------------------------------------------------------------
with st as (
  select s.id, s.class_id, s.admission_no,
         row_number() over (order by s.admission_no) as rn
    from students s
),
cs as (
  select c.id as class_id, sub.id as subject_id
    from classes c
    join subjects sub
      on sub.level in ('BOTH', c.level)
     and (c.level = 'JSS' or c.stream is null or sub.group_name in ('General', c.stream))
)
insert into grades (student_id, subject_id, term_id, ca_score, exam_score)
select st.id,
       cs.subject_id,
       t.id,
       least(40, 17 + mod(abs(hashtext(st.admission_no || cs.subject_id::text || t.id::text)), 5) * 5
                   + case when st.rn <= 3 then 5 else 0 end),
       least(60, 24 + mod(abs(hashtext(cs.subject_id::text || t.id::text || st.admission_no)), 7) * 5
                   + case when st.rn <= 3 then 5 else 0 end)
  from st
  join cs on cs.class_id = st.class_id
  cross join terms t
 where t.name in ('1st Term', '2nd Term')
on conflict (student_id, subject_id, term_id) do nothing;

-- ---------------------------------------------------------------------
-- Weekly attendance (days present per week, max 5)
-- ---------------------------------------------------------------------
insert into attendance_weekly (student_id, term_id, week_number, days_present)
select s.id, t.id, w,
       case
         when mod(abs(hashtext(s.admission_no || t.id::text || w::text)), 7) = 0 then 3
         when mod(abs(hashtext(s.admission_no || w::text)), 7) = 0 then 4
         else 5
       end
  from students s
  cross join terms t
  cross join generate_series(1, 4) as w
 where t.name in ('1st Term', '2nd Term')
on conflict (student_id, term_id, week_number) do nothing;

-- ---------------------------------------------------------------------
-- Assignments - two per class, always set by the teacher who is
-- actually allocated to that subject and class.
-- ---------------------------------------------------------------------
insert into assignments (title, description, subject_id, class_id, teacher_id, term_id, due_date)
select v.subject || ' — Assignment ' || v.rn,
       'Complete the exercises on ' || lower(v.subject) || ' and submit before the deadline.',
       s.id, c.id, u.id, t.id, (date '2026-10-16' + (v.rn * 7)::int)::date
  from (
    select ts.class_id, ts.subject_id, ts.teacher_id, s.name as subject,
           row_number() over (partition by ts.class_id
                              order by s.is_core desc, s.name) as rn
      from teacher_subjects ts
      join subjects s on s.id = ts.subject_id
  ) v
  join subjects s on s.id = v.subject_id
  join classes  c on c.id = v.class_id
  join users    u on u.id = v.teacher_id
  join terms    t on t.name = '1st Term'
 where v.rn <= 2
   and not exists (
     select 1 from assignments a
      where a.class_id = v.class_id
        and a.subject_id = v.subject_id
        and a.term_id = t.id);

-- ---------------------------------------------------------------------
-- School calendar
-- ---------------------------------------------------------------------
insert into events (title, date, type, note)
select v.title, v.date::date, v.type, v.note
  from (values
    ('Mid-term break',              '2026-10-12', 'session',  'School closed for one week'),
    ('Parent–Teacher Conference',   '2026-11-20', 'meeting',  'Main hall · 9:00 AM'),
    ('Inter-house sports',          '2026-12-05', 'event',    'Sports field · 8:00 AM'),
    ('First Term Examination',      '2026-12-07', 'academic', 'All candidates · 8:30 AM')
  ) as v(title, date, type, note)
 where not exists (select 1 from events e where e.title = v.title);

-- ---------------------------------------------------------------------
-- End-of-term remarks from class teachers
-- ---------------------------------------------------------------------
insert into remarks (student_id, term_id, teacher_remark)
select s.id, t.id, v.remark
  from (values
    ('HMA/2026/001', 'Ama Osei is attentive and respectful. She should keep reading widely to improve her comprehension.'),
    ('HMA/2026/002', 'Yaw Boateng works hard in class. More practice with written work will lift his Mathematics.'),
    ('HMA/2026/006', 'Fatima Yusuf is a focused science student. She needs to build more confidence during practicals.'),
    ('HMA/2026/007', 'Zainab Lawal has excellent attendance. She should participate more in class discussion.')
  ) as v(admission_no, remark)
  join students s on s.admission_no = v.admission_no
  join terms    t on t.name = '1st Term'
on conflict (student_id, term_id) do nothing;

insert into remarks (student_id, term_id, teacher_remark)
select s.id, t.id, v.remark
  from (values
    ('HMA/2026/003', 'Esi Armah is a quiet learner who needs more confidence. Encourage her to ask questions in class.'),
    ('HMA/2026/004', 'Kojo Mensah is improving steadily. Continue the evening reading routine.'),
    ('HMA/2026/005', 'Chidi Nwosu is talented and responsible. He could contribute more in group work.'),
    ('HMA/2026/008', 'Tunde Bakare has strong commercial awareness. He should practise past questions for the examination.'),
    ('HMA/2026/009', 'Amina Garba is creative in the arts. Balance that with the core subjects.'),
    ('HMA/2026/010', 'Tolu Akinwale is steady and well-mannered. Aim higher in Mathematics and Physics.'),
    ('HMA/2026/011', 'Chidinma Eze works hard and is well mannered. More practice under exam conditions will help.')
  ) as v(admission_no, remark)
  join students s on s.admission_no = v.admission_no
  join terms    t on t.name = '1st Term'
on conflict (student_id, term_id) do nothing;
