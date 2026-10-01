-- ---------------------------------------------------------------------
-- attendance_daily — per-student, per-school-day attendance as the class
-- teacher marks it: present / late / absent for Monday–Friday of each week.
-- The weekly roll-up (attendance_weekly.days_present) is derived from these
-- rows by the app every time a week is uploaded, so the class teacher, the
-- student, the parent and the admin all read one consistent record.
-- ---------------------------------------------------------------------

create table if not exists attendance_daily (
  id          bigint generated always as identity primary key,
  student_id  bigint not null references students(id) on delete cascade,
  term_id     bigint not null references terms(id)    on delete cascade,
  week_number int    not null check (week_number between 1 and 16),
  day_index   int    not null check (day_index between 0 and 4),
  status      text   not null default 'present'
              check (status in ('present', 'late', 'absent')),
  created_at  timestamptz not null default now(),
  unique (student_id, term_id, week_number, day_index)
);

alter table attendance_daily enable row level security;
drop policy if exists "anon_all" on attendance_daily;
create policy "anon_all" on attendance_daily
  for all to anon using (true) with check (true);

create index if not exists attendance_daily_term_week_idx
  on attendance_daily (term_id, week_number);