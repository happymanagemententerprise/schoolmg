-- =====================================================================
-- Happy Man Academy — Full Schema (Postgres / Supabase)
-- Converted from MySQL schema
-- Roles: admin, teacher, student, parent
-- =====================================================================

-- ---------------------------------------------------------------------
-- Supabase ships the anon / authenticated / service_role roles itself.
-- Create them when missing so this file also runs on a plain Postgres
-- (local development, CI, the schema check in the README).
-- ---------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Core identity
-- ---------------------------------------------------------------------

create table if not exists users (
  id         bigint generated always as identity primary key,
  name       text        not null,
  email      text        not null unique,
  password   text        not null,
  role       text        not null check (role in ('admin','teacher','student','parent')),
  phone      text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Academic calendar
-- ---------------------------------------------------------------------

create table if not exists sessions (
  id         bigint generated always as identity primary key,
  name       text    not null unique,   -- e.g. "2026/2027"
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists terms (
  id         bigint generated always as identity primary key,
  session_id bigint not null references sessions(id) on delete cascade,
  name       text   not null check (name in ('1st Term','2nd Term','3rd Term')),
  is_current boolean not null default false,
  unique (session_id, name)
);

-- ---------------------------------------------------------------------
-- Classes & Subjects
-- ---------------------------------------------------------------------

create table if not exists classes (
  id            bigint generated always as identity primary key,
  class_name    text   not null unique,  -- e.g. "JHS 1A", "SS2"
  next_class_id bigint references classes(id) on delete set null
);

create table if not exists subjects (
  id      bigint generated always as identity primary key,
  name    text    not null unique,
  is_core boolean not null default false  -- true for Math & English
);

-- ---------------------------------------------------------------------
-- Students & Teacher assignments
-- ---------------------------------------------------------------------

create table if not exists students (
  id           bigint generated always as identity primary key,
  user_id      bigint not null unique references users(id) on delete cascade,
  class_id     bigint not null references classes(id) on delete restrict,
  admission_no text   not null unique
);

-- Class Teacher: one teacher owns a class
create table if not exists teacher_classes (
  id         bigint generated always as identity primary key,
  teacher_id bigint not null references users(id) on delete cascade,
  class_id   bigint not null unique references classes(id) on delete cascade
);

-- Subject Teacher: a teacher teaches a subject in a class
create table if not exists teacher_subjects (
  id         bigint generated always as identity primary key,
  teacher_id bigint not null references users(id) on delete cascade,
  subject_id bigint not null references subjects(id) on delete cascade,
  class_id   bigint not null references classes(id) on delete cascade,
  unique (teacher_id, subject_id, class_id)
);

-- Parent <-> Student (many-to-many)
create table if not exists parent_students (
  id         bigint generated always as identity primary key,
  parent_id  bigint not null references users(id) on delete cascade,
  student_id bigint not null references students(id) on delete cascade,
  unique (parent_id, student_id)
);

-- ---------------------------------------------------------------------
-- Grades, attendance, assignments, remarks
-- ---------------------------------------------------------------------

create table if not exists grades (
  id         bigint generated always as identity primary key,
  student_id bigint         not null references students(id) on delete cascade,
  subject_id bigint         not null references subjects(id) on delete cascade,
  term_id    bigint         not null references terms(id)    on delete cascade,
  ca_score   numeric(5,2)   not null default 0,
  exam_score numeric(5,2)   not null default 0,
  unique (student_id, subject_id, term_id)
);

create table if not exists attendance (
  id         bigint generated always as identity primary key,
  student_id bigint not null references students(id) on delete cascade,
  term_id    bigint not null references terms(id)    on delete cascade,
  date       date   not null,
  status     text   not null check (status in ('present','absent','late')),
  unique (student_id, date)
);

create table if not exists assignments (
  id          bigint generated always as identity primary key,
  subject_id  bigint not null references subjects(id) on delete cascade,
  class_id    bigint not null references classes(id)  on delete cascade,
  teacher_id  bigint not null references users(id)    on delete cascade,
  term_id     bigint not null references terms(id)    on delete cascade,
  title       text   not null,
  description text,
  due_date    date   not null,
  created_at  timestamptz not null default now()
);

create table if not exists remarks (
  id                bigint generated always as identity primary key,
  student_id        bigint not null references students(id) on delete cascade,
  term_id           bigint not null references terms(id)    on delete cascade,
  teacher_remark    text,
  principal_remark  text,
  unique (student_id, term_id)
);

-- ---------------------------------------------------------------------
-- Timetable
-- ---------------------------------------------------------------------

create table if not exists rooms (
  id        bigint generated always as identity primary key,
  room_name text not null,
  capacity  int  not null default 30
);

create table if not exists time_slots (
  id          bigint generated always as identity primary key,
  day_of_week text   not null check (day_of_week in ('Monday','Tuesday','Wednesday','Thursday','Friday')),
  start_time  time   not null,
  end_time    time   not null
);

create table if not exists timetables (
  id           bigint generated always as identity primary key,
  term_id      bigint not null references terms(id)      on delete cascade,
  class_id     bigint not null references classes(id)    on delete cascade,
  subject_id   bigint not null references subjects(id)   on delete cascade,
  teacher_id   bigint not null references users(id)      on delete cascade,
  room_id      bigint not null references rooms(id)      on delete cascade,
  time_slot_id bigint not null references time_slots(id) on delete cascade,
  -- prevent double-booking
  unique (term_id, teacher_id, time_slot_id),
  unique (term_id, room_id, time_slot_id),
  unique (term_id, class_id, time_slot_id)
);

-- =====================================================================
-- Enable RLS on every table
-- =====================================================================

alter table users            enable row level security;
alter table sessions         enable row level security;
alter table terms            enable row level security;
alter table classes          enable row level security;
alter table subjects         enable row level security;
alter table students         enable row level security;
alter table teacher_classes  enable row level security;
alter table teacher_subjects enable row level security;
alter table parent_students  enable row level security;
alter table grades           enable row level security;
alter table attendance       enable row level security;
alter table assignments      enable row level security;
alter table remarks          enable row level security;
alter table rooms            enable row level security;
alter table time_slots       enable row level security;
alter table timetables       enable row level security;

-- =====================================================================
-- RLS Policies — open access for now (app handles its own auth logic)
-- Tighten these once Supabase Auth is wired in
-- =====================================================================

do $$ declare t text;
begin
  foreach t in array array[
    'users','sessions','terms','classes','subjects','students',
    'teacher_classes','teacher_subjects','parent_students',
    'grades','attendance','assignments','remarks',
    'rooms','time_slots','timetables'
  ] loop
    execute format('drop policy if exists "anon_all" on %I', t);
    execute format(
      'create policy "anon_all" on %I for all to anon using (true) with check (true)', t
    );
  end loop;
end $$;
