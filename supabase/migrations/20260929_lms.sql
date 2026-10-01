-- =====================================================================
-- Happy Man Academy — Learning management (idempotent)
--
-- Brings the school-portal learning tools into the HMA schema:
--   * lms_lessons      teacher-published lesson notes per subject+class
--   * lms_quizzes      one published/draft quiz per subject+class
--   * lms_questions    the quiz bank (multiple-choice / true-false)
--   * lms_attempts     one graded attempt per student per quiz
--   * lms_discussions  a class discussion thread opened by a teacher
--   * lms_posts        the replies inside a discussion
--
-- Run this file, then supabase/seed.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Lessons — published notes teachers post for a subject and class
-- ---------------------------------------------------------------------

create table if not exists lms_lessons (
  id         bigint generated always as identity primary key,
  session_id bigint references sessions(id) on delete cascade,
  term_id    bigint references terms(id)    on delete cascade,
  subject_id bigint      not null references subjects(id) on delete cascade,
  class_id   bigint      not null references classes(id)  on delete cascade,
  teacher_id bigint               references users(id)    on delete set null,
  title      text        not null,
  content    text        not null,
  created_at timestamptz not null default now()
);

create index if not exists lms_lessons_class_idx on lms_lessons (class_id);
create index if not exists lms_lessons_subject_idx on lms_lessons (subject_id);

-- ---------------------------------------------------------------------
-- Quizzes — one row per quiz; questions live in lms_questions
-- ---------------------------------------------------------------------

create table if not exists lms_quizzes (
  id           bigint generated always as identity primary key,
  session_id   bigint references sessions(id) on delete cascade,
  term_id      bigint references terms(id)    on delete cascade,
  subject_id   bigint      not null references subjects(id) on delete cascade,
  class_id     bigint      not null references classes(id)  on delete cascade,
  teacher_id   bigint               references users(id)    on delete set null,
  title        text        not null,
  description  text        not null default '',
  is_published boolean     not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists lms_quizzes_class_idx on lms_quizzes (class_id);
create index if not exists lms_quizzes_subject_idx on lms_quizzes (subject_id);

-- ---------------------------------------------------------------------
-- Questions — the quiz bank, ordered by position
-- ---------------------------------------------------------------------

create table if not exists lms_questions (
  id             bigint generated always as identity primary key,
  quiz_id        bigint not null references lms_quizzes(id) on delete cascade,
  question_text  text   not null,
  question_type  text   not null default 'mc'
                 check (question_type in ('mc','tf')),
  option_a       text,
  option_b       text,
  option_c       text,
  option_d       text,
  correct_answer text   not null,
  points         int    not null default 1,
  position       int    not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists lms_questions_quiz_idx on lms_questions (quiz_id);

-- ---------------------------------------------------------------------
-- Attempts — one graded attempt per student per quiz; the answers map
-- stores { questionId: answer } as jsonb. Resubmission replaces the row.
-- ---------------------------------------------------------------------

create table if not exists lms_attempts (
  id           bigint generated always as identity primary key,
  quiz_id      bigint      not null references lms_quizzes(id) on delete cascade,
  student_id   bigint      not null references students(id)    on delete cascade,
  score        int         not null default 0,
  total        int         not null default 0,
  answers      jsonb       not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  unique (quiz_id, student_id)
);

create index if not exists lms_attempts_quiz_idx on lms_attempts (quiz_id);
create index if not exists lms_attempts_student_idx on lms_attempts (student_id);

-- ---------------------------------------------------------------------
-- Discussions — a thread a teacher opens for a subject and class
-- ---------------------------------------------------------------------

create table if not exists lms_discussions (
  id         bigint generated always as identity primary key,
  session_id bigint references sessions(id) on delete cascade,
  term_id    bigint references terms(id)    on delete cascade,
  subject_id bigint      not null references subjects(id) on delete cascade,
  class_id   bigint      not null references classes(id)  on delete cascade,
  teacher_id bigint               references users(id)    on delete set null,
  title      text        not null,
  body       text        not null default '',
  created_at timestamptz not null default now()
);

create index if not exists lms_discussions_class_idx on lms_discussions (class_id);

-- ---------------------------------------------------------------------
-- Posts — replies to a discussion
-- ---------------------------------------------------------------------

create table if not exists lms_posts (
  id            bigint generated always as identity primary key,
  discussion_id bigint not null references lms_discussions(id) on delete cascade,
  user_id       bigint references users(id) on delete set null,
  body          text   not null,
  created_at    timestamptz not null default now()
);

create index if not exists lms_posts_discussion_idx on lms_posts (discussion_id);

-- ---------------------------------------------------------------------
-- RLS — open access, matching the rest of the schema
--
-- The app does its own checking in the browser. That is not a security
-- boundary (see 20260928_promotion.sql): with no row-level filtering,
-- restricting the LMS needs Supabase Auth and per-role policies, which
-- this file deliberately does not attempt.
-- ---------------------------------------------------------------------

do $$ declare t text;
begin
  foreach t in array array[
    'lms_lessons','lms_quizzes','lms_questions','lms_attempts',
    'lms_discussions','lms_posts'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "anon_all" on %I', t);
    execute format(
      'create policy "anon_all" on %I for all to anon using (true) with check (true)', t
    );
  end loop;
end $$;