-- =====================================================================
-- Happy Man Academy — Progression, pooling and publication
--
-- Adds the promotion lifecycle built from the school-portal behaviour,
-- plus the supporting tables for score entry, results publication,
-- subject registration, staff approvals and the timetable day layout.
--
--   * classes.selection_mode + the promotion chain (next_class_id)
--   * Grade 10 Pool, the class Grade 9 exits into
--   * students.status / status_reason  (inactive covers both the
--     pool timeout and finishing SS3)
--   * grades.class_id so a mark stays with the class it was earned in
--   * sessions / terms closure, and per-term results publication
--   * promotions, path_requests, subject_selections, student_transfers
--   * approval_requests so a Vice Principal's actions need a Principal
--   * score_uploads, weekly_topics, timetable_settings
--   * student_positions() for arm and year position
--
-- Idempotent: safe to run more than once. Run it before
-- supabase/seed.sql if you are rebuilding from scratch.
-- =====================================================================

-- ---------------------------------------------------------------------
-- classes — selection mode, the chain, and the Grade 10 pool
--
--   chain     the next_class_id target is the automatic next class
--   pool      the target is a staff decision, one student at a time
--   graduate  the class leaves school at the end of the session
--
-- Grade 9 is a checkpoint year: every student leaves it unconditionally
-- at the end of Term 2 for the national exam, so it is a pool and has
-- no single next class. Grade 12 graduates.
-- ---------------------------------------------------------------------

alter table classes add column if not exists selection_mode text
  not null default 'chain'
  check (selection_mode in ('chain','pool','graduate'));

-- The chain is resolved by (year, stream) rather than by id so this
-- stays correct when classes are added. Grade 7 has two arms and only
-- one Grade 8, so both Grade 7 rows collapse onto the same target.
update classes c
   set next_class_id = (
         select min(t.id) from classes t
          where t.year = c.year + 1
            and t.stream is not distinct from c.stream
       )
  where c.year in (7,8,10,11)
    and exists (select 1 from classes t
                 where t.year = c.year + 1
                   and t.stream is not distinct from c.stream);

update classes set selection_mode = 'pool'     where year = 9;
update classes set selection_mode = 'graduate' where year = 12;
update classes set next_class_id = null       where year in (9,12) or year is null;

-- stream stays null here on purpose: classes.stream is constrained to
-- Science / Commercial / Arts, and a null stream is what makes the pool
-- resolve to the full senior subject list while a student is unplaced.
insert into classes (class_name, level, year, stream, selection_mode)
values ('Grade 10 Pool', 'SS', 10, null, 'pool')
on conflict (class_name) do update
  set level = excluded.level,
      year  = excluded.year,
      selection_mode = excluded.selection_mode;

create index if not exists classes_selection_mode_idx on classes (selection_mode);
create index if not exists classes_year_idx on classes (year);

-- ---------------------------------------------------------------------
-- students — lifecycle status
--
-- status_reason separates the two ways a student leaves an active roll:
-- 'pool_timeout'  still in the pool when it closed
-- 'ss3_completed' finished Grade 12
-- ---------------------------------------------------------------------

alter table students add column if not exists status text
  not null default 'active' check (status in ('active','inactive','withdrawn'));
alter table students add column if not exists status_reason text
  check (status_reason in ('pool_timeout','ss3_completed'));
alter table students add column if not exists status_changed_at timestamptz;
alter table students add column if not exists status_session_id bigint
  references sessions(id) on delete set null;

create index if not exists students_status_idx on students (status);

-- ---------------------------------------------------------------------
-- grades — pin each mark to the class it was earned in
--
-- Without this a mark has no year context, so a student's record cannot
-- show a stream change or a promotion that happened mid-session.
-- Nullable because a mark may legitimately predate this column.
-- ---------------------------------------------------------------------

alter table grades add column if not exists class_id bigint
  references classes(id) on delete set null;

update grades g
   set class_id = s.class_id
  from students s
 where s.id = g.student_id
   and g.class_id is null;

create index if not exists grades_class_idx on grades (class_id);

-- ---------------------------------------------------------------------
-- sessions / terms — closure, and per-term results publication
-- ---------------------------------------------------------------------

alter table sessions add column if not exists is_closed boolean not null default false;
alter table sessions add column if not exists closed_at timestamptz;
alter table sessions add column if not exists closed_by bigint
  references users(id) on delete set null;

alter table terms add column if not exists is_closed boolean not null default false;
alter table terms add column if not exists closed_at timestamptz;
alter table terms add column if not exists closed_by bigint
  references users(id) on delete set null;
alter table terms add column if not exists results_published boolean not null default false;
alter table terms add column if not exists published_at timestamptz;
alter table terms add column if not exists published_by bigint
  references users(id) on delete set null;

-- ---------------------------------------------------------------------
-- promotions — one auditable decision per student per session
--
-- outcome records why a student moved:
--   promoted  advanced along the chain
--   repeat    did not meet the rule, stays put
--   pooled    Grade 9 checkpoint exit into the pool
--   graduated Grade 12 finished
--   inactive  left the roll without advancing
--
-- rule_version is stored per row so changing the rule later cannot
-- silently re-interpret a past decision.
-- ---------------------------------------------------------------------

create table if not exists promotions (
  id              bigint generated always as identity primary key,
  student_id      bigint      not null references students(id) on delete cascade,
  session_id      bigint      not null references sessions(id) on delete cascade,
  term_id         bigint      not null references terms(id)    on delete cascade,
  from_class_id   bigint               references classes(id)  on delete set null,
  to_class_id     bigint               references classes(id)  on delete set null,
  outcome         text        not null
                  check (outcome in ('promoted','repeat','graduated','pooled','inactive')),
  avg             numeric(5,2),
  en_score        numeric(5,2),
  ma_score        numeric(5,2),
  class_position  int,
  year_position   int,
  rule_version    text        not null default 'en50-ma50-avg50',
  decision_source text        not null default 'rule'
                  check (decision_source in ('rule','manual')),
  decided_by      bigint               references users(id)    on delete set null,
  created_at      timestamptz not null default now(),
  unique (student_id, session_id)
);

create index if not exists promotions_session_idx  on promotions (session_id, outcome);
create index if not exists promotions_student_idx  on promotions (student_id);

-- ---------------------------------------------------------------------
-- path_requests — the pool placement decision, one per student per
-- session. Approved means registered for the next session; the student
-- stays in the pool until the session rolls over.
-- ---------------------------------------------------------------------

create table if not exists path_requests (
  id               bigint generated always as identity primary key,
  student_id       bigint      not null references students(id) on delete cascade,
  session_id       bigint      not null references sessions(id) on delete cascade,
  term_id          bigint               references terms(id)    on delete set null,
  requested_stream text        check (requested_stream in ('Science','Commercial','Arts')),
  target_class_id  bigint               references classes(id)  on delete set null,
  status           text        not null default 'pending'
                   check (status in ('pending','approved','rejected')),
  requested_by     bigint               references users(id)    on delete set null,
  decided_by       bigint               references users(id)    on delete set null,
  decided_at       timestamptz,
  note             text,
  created_at       timestamptz not null default now(),
  unique (student_id, session_id)
);

create index if not exists path_requests_session_idx on path_requests (session_id, status);

-- ---------------------------------------------------------------------
-- subject_selections — SS registration
--
--   effective  counts toward the student's record
--   pending    a Grade 11 or 12 adjustment waiting on the class teacher
--   rejected   declined, the student keeps what they had
--
-- Grade 10 entrants submit straight to 'effective'; they were placed by
-- an administrator who already decided their stream.
-- ---------------------------------------------------------------------

create table if not exists subject_selections (
  id            bigint generated always as identity primary key,
  student_id    bigint      not null references students(id) on delete cascade,
  session_id    bigint      not null references sessions(id) on delete cascade,
  term_id       bigint               references terms(id)   on delete set null,
  subject_id    bigint      not null references subjects(id) on delete cascade,
  status        text        not null default 'effective'
                check (status in ('pending','effective','rejected')),
  requested_by  bigint               references users(id)   on delete set null,
  decided_by    bigint               references users(id)   on delete set null,
  decision_note text,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (student_id, session_id, subject_id)
);

create index if not exists subject_selections_student_idx on subject_selections (student_id, session_id, status);

-- What a student may pick. Core subjects (English Studies, Mathematics)
-- are added automatically and are not part of these counts.
create table if not exists subject_selection_rules (
  id            smallint primary key default 1 check (id = 1),
  general_count smallint not null default 1 check (general_count between 0 and 6),
  stream_count  smallint not null default 5 check (stream_count  between 0 and 8),
  min_total     smallint not null default 8 check (min_total     between 1 and 14),
  updated_by    bigint   references users(id) on delete set null,
  updated_at    timestamptz not null default now()
);

insert into subject_selection_rules overriding system value (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- users — administrator tiers
--
-- role stays 'admin' and admin_tier splits it. A null tier keeps full
-- rights so the existing administrator is not locked out of anything.
-- ---------------------------------------------------------------------

alter table users add column if not exists admin_tier text
  check (admin_tier in ('principal','vice_principal'));

-- ---------------------------------------------------------------------
-- approval_requests — the single queue a Principal works from
--
-- A Vice Principal's action writes a pending row and stops. On approval
-- the app runs the same function the direct path would have run, so
-- there is only one implementation of each action.
-- ---------------------------------------------------------------------

create table if not exists approval_requests (
  id            bigint generated always as identity primary key,
  action_type   text        not null check (action_type in (
                  'pool_placement','results_publish','end_of_session_run',
                  'pool_close','reclassify','reactivate')),
  entity_type   text        not null check (entity_type in ('student','term','session','pool')),
  entity_id     bigint,
  payload       jsonb       not null default '{}'::jsonb,
  status        text        not null default 'pending'
                check (status in ('pending','approved','rejected','expired')),
  requested_by  bigint      not null references users(id) on delete cascade,
  decided_by    bigint               references users(id) on delete set null,
  decision_note text,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists approval_requests_queue_idx on approval_requests (status, created_at desc);

-- ---------------------------------------------------------------------
-- student_transfers — administrator reclassification
--
-- Deliberately separate from promotions: a promotion is end-of-session
-- advancement, a transfer is a mid-session academic decision. Together
-- they are what a student's year-by-year record is built from.
-- ---------------------------------------------------------------------

create table if not exists student_transfers (
  id            bigint generated always as identity primary key,
  student_id    bigint      not null references students(id) on delete cascade,
  session_id    bigint      not null references sessions(id) on delete cascade,
  term_id       bigint      not null references terms(id)    on delete cascade,
  from_class_id bigint               references classes(id)  on delete set null,
  to_class_id   bigint      not null references classes(id)  on delete restrict,
  reason        text        not null check (reason in (
                  'academic_performance','stream_change','section_change',
                  'admin_correction','appeal')),
  reason_note   text,
  status        text        not null default 'pending_approval'
                check (status in ('pending_approval','approved','rejected')),
  requested_by  bigint      not null references users(id) on delete cascade,
  approved_by   bigint               references users(id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists student_transfers_student_idx on student_transfers (student_id, session_id);

-- ---------------------------------------------------------------------
-- time_slots — breaks live here, not in timetables
--
-- timetables.subject_id is not null, so a break cannot be a lesson row.
-- The same reason free periods are skipped. A break is a slot with no
-- lesson pointing at it.
-- ---------------------------------------------------------------------

alter table time_slots add column if not exists is_break boolean not null default false;
alter table time_slots add column if not exists label text;

-- ---------------------------------------------------------------------
-- timetable_settings — the school day, admin editable
--
-- A single row: time_slots has no session_id, so per-session layouts
-- would collide in one shared slot table. Changing this after a
-- timetable has been saved invalidates it — the app must warn first,
-- because timetables.time_slot_id cascades.
-- ---------------------------------------------------------------------

create table if not exists timetable_settings (
  id              smallint primary key default 1 check (id = 1),
  periods_per_day smallint not null default 7 check (periods_per_day between 4 and 12),
  start_time      time    not null default '08:00',
  period_minutes  smallint not null default 45 check (period_minutes between 20 and 120),
  breaks          jsonb   not null default '[{"after":3,"minutes":20,"label":"Short Break"},{"after":7,"minutes":45,"label":"After School"}]'::jsonb,
  updated_by      bigint  references users(id) on delete set null,
  updated_at      timestamptz not null default now()
);

insert into timetable_settings overriding system value (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- score_uploads — what was uploaded, by whom, and when
--
-- One row per session x term x class x subject x kind. This is what
-- makes "which class report was uploaded" answerable, and it is the
-- coverage the admin sees before publishing results.
--
-- A class with no teacher for a subject can never reach 'submitted';
-- the coverage view reports that as unstaffed rather than missing.
-- ---------------------------------------------------------------------

create table if not exists score_uploads (
  id           bigint generated always as identity primary key,
  session_id   bigint      not null references sessions(id) on delete cascade,
  term_id      bigint      not null references terms(id)    on delete cascade,
  class_id     bigint      not null references classes(id)  on delete cascade,
  subject_id   bigint      not null references subjects(id) on delete cascade,
  teacher_id   bigint               references users(id)    on delete set null,
  kind         text        not null check (kind in ('ca','exam')),
  status       text        not null default 'not_started'
               check (status in ('not_started','in_progress','submitted','locked')),
  row_count    int         not null default 0,
  submitted_by bigint               references users(id)    on delete set null,
  submitted_at timestamptz,
  updated_at   timestamptz not null default now(),
  unique (session_id, term_id, class_id, subject_id, kind)
);

create index if not exists score_uploads_coverage_idx on score_uploads (session_id, term_id, status);

-- ---------------------------------------------------------------------
-- weekly_topics — what a subject teacher covered this week
--
-- Keyed by class as well as subject, because the topic covered in
-- Grade 10 Science is not the topic in Grade 11 Science. The unique
-- constraint stops two teachers overwriting each other.
-- ---------------------------------------------------------------------

create table if not exists weekly_topics (
  id         bigint generated always as identity primary key,
  session_id bigint      not null references sessions(id) on delete cascade,
  term_id    bigint      not null references terms(id)    on delete cascade,
  class_id   bigint      not null references classes(id)  on delete cascade,
  subject_id bigint      not null references subjects(id) on delete cascade,
  teacher_id bigint               references users(id)    on delete set null,
  week_no    int         not null check (week_no between 1 and 16),
  topic      text        not null,
  summary    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, term_id, class_id, subject_id, week_no)
);

create index if not exists weekly_topics_student_lookup_idx
  on weekly_topics (class_id, subject_id, week_no desc);

-- ---------------------------------------------------------------------
-- student_positions — arm and year position
--
-- Deliberately a function rather than client-side arithmetic: the app
-- loads every grade into the browser for every signed-in user, so a
-- position computed there would sit in a student's devtools no matter
-- what the UI hides. Only administrators call this, and only lazily.
--
-- Ranking is on session_avg, the mean of the terms the student
-- actually attended: a student who joined in Term 2 averages (T2+T3)/2,
-- one who joined in Term 3 averages T3/1. Dividing by attended terms
-- rather than the full year keeps a mid-year entrant comparable.
--
-- Grade 9 naturally averages its two terms. Grade 12 is not measured:
-- it leaves the school without a promotion decision.
--
-- Ties share a position and the next rank skips (1, 2, 2, 4).
-- Inactive students and students with no marks are left out entirely.
-- ---------------------------------------------------------------------

create or replace function student_positions(p_session_id bigint, p_term_id bigint)
returns table (
  student_id     bigint,
  class_id       bigint,
  year           integer,
  class_position integer,
  year_position  integer,
  term_avg       numeric,
  session_avg    numeric,
  terms_counted  integer
)
language sql stable security definer set search_path = public as $$
  with cohort as (
    select st.id as sid, st.class_id, c.year
      from students st
      join classes c on c.id = st.class_id
     where st.status = 'active'
       and c.year is not null
  ),
  marks as (
    select c.sid, g.term_id, g.ca_score + g.exam_score as mark
      from cohort c
      join grades g on g.student_id = c.sid
      join terms  t on t.id = g.term_id
     where t.session_id = p_session_id
  ),
  per_term as (
    select sid, term_id, round(avg(mark), 2) as term_avg
      from marks
     group by sid, term_id
  ),
  rolled as (
    select c.sid, c.class_id, c.year,
           max(pt.term_avg) filter (where pt.term_id = p_term_id) as t_avg,
           round(avg(pt.term_avg), 2) as s_avg,
           count(*) as n_terms
      from cohort c
      join per_term pt on pt.sid = c.sid
     group by c.sid, c.class_id, c.year
  )
  select r.sid, r.class_id, r.year,
         rank() over (partition by r.class_id order by r.s_avg desc)::int as class_position,
         rank() over (partition by r.year     order by r.s_avg desc)::int as year_position,
         r.t_avg, r.s_avg, r.n_terms::int
    from rolled r
$$;

-- ---------------------------------------------------------------------
-- RLS for the new tables — open access, matching the rest of the schema
--
-- The app does its own checking in the browser. That is not a security
-- boundary: with anon_all and plaintext passwords, restricting
-- positions or approvals properly needs Supabase Auth and per-role
-- RLS policies, which this file deliberately does not attempt.
-- ---------------------------------------------------------------------

do $$ declare t text;
begin
  foreach t in array array[
    'promotions','path_requests','subject_selections','subject_selection_rules',
    'approval_requests','student_transfers','score_uploads','weekly_topics',
    'timetable_settings'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "anon_all" on %I', t);
    execute format(
      'create policy "anon_all" on %I for all to anon using (true) with check (true)', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Passwords — replace plaintext with salted SHA-256 hashes
--
--   users.password        : kept (nullable) so legacy rows stay readable
--                           only until the backfill below clears them
--   users.password_hash   : hex(sha256(password_salt || password))
--   users.password_salt   : 16 random bytes as hex
--
-- The app hashes with the same scheme before writing new passwords, and
-- verifies sha256(salt + typed) === password_hash at login. Nothing is
-- ever stored in the clear once this runs.
--
-- Who may rewrite a password (client-side rule, matching the app):
--   - Administrator -> any staff/parent/student account
--   - Class Teacher -> students in their own class
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;

alter table users add column if not exists password_hash text;
alter table users add column if not exists password_salt text;
alter table users alter column password drop not null;

-- Backfill existing plaintext passwords into salted hashes (two passes so
-- every row gets one stable salt, since SET clauses read old column values),
-- then drop the plaintext so nothing sits in the clear.
update users
   set password_salt = encode(gen_random_bytes(16), 'hex')
 where password is not null and password_hash is null and password_salt is null;

update users
   set password_hash = encode(digest(password_salt || password, 'sha256'), 'hex')
 where password is not null and password_hash is null;

update users set password = null where password_hash is not null;
