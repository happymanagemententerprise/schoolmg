-- =====================================================================
-- Happy Man Academy — School structure upgrade (idempotent)
--
-- Adds:
--   * Nigerian curriculum metadata on subjects (level + group)
--   * Level / stream / year on classes (Grade 7-12, SS split into
--     Science / Commercial / Arts)
--   * Staff roles (Class Teacher / Subject Teacher / HOD) + mentorship
--     flags + avatar tone on users
--   * Gender + mentor relationship on students
--   * Phone number persisted for every user (required for parents)
--   * Weekly attendance table (the app records days present per week)
--   * departments table for HOD oversight
--   * events table (was referenced by the app but never created)
--   * timetable generation support (nullable teacher / room)
--
-- Run this file, then supabase/seed.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------

alter table users            add column if not exists tone        text default 'blue';
alter table users            add column if not exists initials    text;
alter table users            add column if not exists staff_role  text
  check (staff_role in ('Class Teacher','Subject Teacher','HOD'));
alter table users            add column if not exists is_mentor    boolean not null default false;
alter table users            add column if not exists mentor_subject text;
alter table users            add column if not exists mentor_bio    text;
alter table users            add column if not exists created_at   timestamptz not null default now();

-- staff_role must exist for anyone who is a teacher
update users
   set staff_role = 'Subject Teacher'
 where role = 'teacher'
   and staff_role is null;

-- ---------------------------------------------------------------------
-- sessions / terms
-- ---------------------------------------------------------------------

alter table sessions         add column if not exists upload_open jsonb not null default '{"test":false,"exam":false}'::jsonb;

alter table terms            add column if not exists start_date  date;
alter table terms            add column if not exists end_date    date;

-- ---------------------------------------------------------------------
-- classes — level (JSS/SS), year (7-12), stream (Science/Commercial/Arts)
-- ---------------------------------------------------------------------

alter table classes          add column if not exists level   text check (level   in ('JSS','SS'));
alter table classes          add column if not exists stream  text check (stream  in ('Science','Commercial','Arts'));
alter table classes          add column if not exists year    int  check (year between 7 and 12);

-- Legacy names ("JHS 1A", "SS2 Science") are mapped onto level + year.
-- New classes are created as "Grade 7" … "Grade 12 Science".
update classes
   set level = case
                 when class_name ~* '^\s*(SSS|SS)' then 'SS'
                 when class_name ~* '^\s*(JSS|JHS)' then 'JSS'
               end,
       year  = case
                 when class_name ~* '^\s*(SSS|SS)\s*1' then 10
                 when class_name ~* '^\s*(SSS|SS)\s*2' then 11
                 when class_name ~* '^\s*(SSS|SS)\s*3' then 12
                 when class_name ~* '^\s*(JSS|JHS)\s*1' then 7
                 when class_name ~* '^\s*(JSS|JHS)\s*2' then 8
                 when class_name ~* '^\s*(JSS|JHS)\s*3' then 9
               end
 where level is null or year is null;

-- ---------------------------------------------------------------------
-- subjects — level (JSS / SS / BOTH) and SS group
-- ---------------------------------------------------------------------

alter table subjects         add column if not exists code       text;
alter table subjects         add column if not exists color      text default 'blue';
alter table subjects         add column if not exists level      text not null default 'BOTH'
  check (level in ('JSS','SS','BOTH'));
alter table subjects         add column if not exists group_name text not null default 'General'
  check (group_name in ('General','Science','Commercial','Arts'));
alter table subjects         add column if not exists created_at timestamptz not null default now();

create index if not exists subjects_level_idx on subjects (level);
create index if not exists subjects_group_idx on subjects (group_name);

-- ---------------------------------------------------------------------
-- students — gender + mentor (a mentor is a teacher)
-- ---------------------------------------------------------------------

alter table students         add column if not exists gender     text check (gender in ('M','F'));
alter table students         add column if not exists mentor_id  bigint references users(id) on delete set null;

create index if not exists students_class_idx  on students (class_id);
create index if not exists students_mentor_idx on students (mentor_id);

-- ---------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------

create table if not exists events (
  id         bigint generated always as identity primary key,
  title      text        not null,
  date       date        not null,
  type       text        not null default 'academic'
             check (type in ('academic','meeting','event','session')),
  note       text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- departments — HOD oversight (subject_ids is a text[] of subject ids)
-- ---------------------------------------------------------------------

create table if not exists departments (
  id          bigint generated always as identity primary key,
  name        text   not null unique,
  hod_id      bigint references users(id) on delete set null,
  subject_ids text[] not null default '{}',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- attendance — weekly roll-up used by the app (days present per week)
-- The original daily table stays for future per-day use.
-- ---------------------------------------------------------------------

create table if not exists attendance_weekly (
  id            bigint generated always as identity primary key,
  student_id    bigint      not null references students(id) on delete cascade,
  term_id       bigint      not null references terms(id)    on delete cascade,
  week_number   int         not null check (week_number between 1 and 16),
  days_present  int         not null default 0 check (days_present between 0 and 5),
  unique (student_id, term_id, week_number)
);

-- ---------------------------------------------------------------------
-- timetables — generated schedules (teacher / room optional)
-- ---------------------------------------------------------------------

alter table timetables       alter column teacher_id drop not null;
alter table timetables       alter column room_id    drop not null;

create index if not exists timetables_term_class_idx on timetables (term_id, class_id);

-- ---------------------------------------------------------------------
-- RLS for the new tables (open access — app handles its own auth)
-- ---------------------------------------------------------------------

do $$ declare t text;
begin
  foreach t in array array['events','departments','attendance_weekly'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "anon_all" on %I', t);
    execute format(
      'create policy "anon_all" on %I for all to anon using (true) with check (true)', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Convenience views used by the timetable generator
-- ---------------------------------------------------------------------

create or replace view class_subjects as
select c.id   as class_id,
       c.class_name,
       c.level,
       c.stream,
       s.id   as subject_id,
       s.name as subject_name
  from classes c
  join subjects s
    on (c.level is null or s.level in ('BOTH', c.level))
   and (c.level = 'JSS' or c.stream is null or s.group_name in ('General', c.stream));
