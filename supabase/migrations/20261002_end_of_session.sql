-- ---------------------------------------------------------------------
-- 20261002_end_of_session.sql
--
-- Supports the end-of-session admin flow:
--   1. students.status gains 'archived'  — an archived student can no
--      longer sign in, but every academic record (scores, attendance,
--      promotions, transfers) stays in the database for the admin.
--   2. students.status_reason admits 'archived' and 'pool_unplaced' (the
--      latter was already written by closePool but not allowed here).
-- ---------------------------------------------------------------------

alter table students drop constraint if exists students_status_check;
alter table students add constraint students_status_check
  check (status in ('active','inactive','withdrawn','archived'));

alter table students drop constraint if exists students_status_reason_check;
alter table students add constraint students_status_reason_check
  check (status_reason in ('pool_timeout','ss3_completed','pool_unplaced','archived'));