-- ---------------------------------------------------------------------
-- Mid-term break (session setting) + mid-term report
-- ---------------------------------------------------------------------
-- The mid-term break is just an admin-editable date range on the current
-- session; the mid-term report reuses the CA test scores already uploaded
-- via the score sheet (scores.test) and never invents exam marks.
-- ---------------------------------------------------------------------

alter table sessions
  add column if not exists midterm_break jsonb not null default '{}'::jsonb;