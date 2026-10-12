-- =====================================================================
-- Happy Man Academy — Teacher-remark approval workflow (idempotent)
--
-- Schooldb lets a teacher author end-of-term remarks and a principal
-- approve them before they appear on a report. HMA previously wrote the
-- remark straight through and showed it immediately. This adds the
-- missing approval state to the existing remarks row.
--
--   status        draft | pending | approved | rejected
--                 Existing rows default to 'approved' so nothing that was
--                 already published disappears.
--   submitted_by  the teacher who sent it for review
--   decided_by    the admin who approved or rejected it
--   reject_reason the admin's reason when a remark is sent back
--
-- Run this file after 20261006_rls_lockdown.sql. Idempotent.
-- =====================================================================

alter table remarks
  add column if not exists status        text   not null default 'approved'
             check (status in ('draft','pending','approved','rejected')),
  add column if not exists submitted_by  bigint references users(id) on delete set null,
  add column if not exists submitted_at  timestamptz,
  add column if not exists decided_by    bigint references users(id) on delete set null,
  add column if not exists decided_at    timestamptz,
  add column if not exists reject_reason text;

create index if not exists remarks_status_idx on remarks (status);
