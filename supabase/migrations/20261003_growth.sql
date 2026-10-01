-- ---------------------------------------------------------------------
-- 20261003_growth.sql
--
-- Supports the Growth & Mastery system (students), the Engaged Guardian
-- Tier (parents), the Educator Recognition Engine (teachers) and the
-- admin's manual promotion decisions. All four are stored records;
-- the XP, skill ranks, badges and leaderboard points are DERIVED from
-- these tables (and from attendance / scores / daily attendance) on
-- every read, so nothing here ever goes stale.
--
--   1. promotion_overrides  — an Administrator's manual promotion call for
--      a student who fell below the 50-mark line during a given session.
--      The app re-checks the admin password before writing/clearing it.
--   2. portfolio_artifacts  — student proof-of-work (code, debate, sport,
--      leadership, other) awaiting verification by the class teacher.
--      Verified artifacts earn Co-Curricular & STEM XP and unlock badges.
--   3. commendations        — mentor/teacher notes that earn a student
--      Leadership & Character XP, and count toward the teacher's points.
--   4. parent_engagements   — parent activity: login, acknowledges results,
--      PTA attendance, early_ payment (Pacesetter tier).
--   5. teacher_recognitions — honors (Master Register, Teacher of the
--      Month, ...) awarded to teachers.
-- ---------------------------------------------------------------------

-- 1. Manual promotion decisions
create table if not exists promotion_overrides (
  id         bigint generated always as identity primary key,
  student_id bigint not null references students(id) on delete cascade,
  session_id bigint not null references sessions(id) on delete cascade,
  decision   text   not null check (decision in ('promoted', 'repeat', 'pooled')),
  reason     text   not null default '',
  set_by     bigint references users(id) on delete set null,
  set_at     timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (student_id, session_id)
);

alter table promotion_overrides enable row level security;
drop policy if exists "anon_all" on promotion_overrides;
create policy "anon_all" on promotion_overrides
  for all to anon using (true) with check (true);

create index if not exists promotion_overrides_session_idx
  on promotion_overrides (session_id);

-- 2. Student portfolio artifacts (proof-of-work)
create table if not exists portfolio_artifacts (
  id          bigint generated always as identity primary key,
  student_id  bigint not null references students(id) on delete cascade,
  kind        text   not null default 'other'
              check (kind in ('code', 'debate', 'sport', 'leadership', 'other')),
  title       text   not null default '',
  note        text   not null default '',
  status      text   not null default 'pending'
              check (status in ('pending', 'verified', 'rejected')),
  created_by  bigint references users(id) on delete set null,
  verified_by bigint references users(id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);

alter table portfolio_artifacts enable row level security;
drop policy if exists "anon_all" on portfolio_artifacts;
create policy "anon_all" on portfolio_artifacts
  for all to anon using (true) with check (true);

create index if not exists portfolio_artifacts_student_idx
  on portfolio_artifacts (student_id);

-- 3. Commendations (mentor notes)
create table if not exists commendations (
  id         bigint generated always as identity primary key,
  student_id bigint not null references students(id) on delete cascade,
  teacher_id bigint not null references users(id) on delete cascade,
  note       text   not null default '',
  created_at timestamptz not null default now()
);

alter table commendations enable row level security;
drop policy if exists "anon_all" on commendations;
create policy "anon_all" on commendations
  for all to anon using (true) with check (true);

create index if not exists commendations_student_idx
  on commendations (student_id);

-- 4. Parent engagements (Engaged Guardian Tier)
create table if not exists parent_engagements (
  id         bigint generated always as identity primary key,
  parent_id  bigint not null references users(id) on delete cascade,
  kind       text   not null check (kind in ('login', 'ack_results', 'pta', 'early_payment')),
  session_id bigint references sessions(id) on delete cascade,
  at         timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table parent_engagements enable row level security;
drop policy if exists "anon_all" on parent_engagements;
create policy "anon_all" on parent_engagements
  for all to anon using (true) with check (true);

create index if not exists parent_engagements_parent_idx
  on parent_engagements (parent_id);

-- 5. Teacher recognitions (Educator Recognition Engine)
create table if not exists teacher_recognitions (
  id         bigint generated always as identity primary key,
  teacher_id bigint not null references users(id) on delete cascade,
  kind       text   not null default 'honor'
              check (kind in ('master_register', 'honor', 'teacher_of_month')),
  session_id bigint references sessions(id) on delete cascade,
  note       text   not null default '',
  awarded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table teacher_recognitions enable row level security;
drop policy if exists "anon_all" on teacher_recognitions;
create policy "anon_all" on teacher_recognitions
  for all to anon using (true) with check (true);

create index if not exists teacher_recognitions_teacher_idx
  on teacher_recognitions (teacher_id);