-- =====================================================================
-- Happy Man Academy — Threaded LMS discussions (idempotent)
--
-- lms_posts was a flat list: every post belonged to a discussion and
-- replies sat in one level. Schooldb threads replies, so add a self
-- reference. A NULL parent_id is a top-level post; otherwise the post
-- is a reply to the row it points at.
--
-- Run this file after 20261006_rls_lockdown.sql. Idempotent.
-- =====================================================================

alter table lms_posts
  add column if not exists parent_id bigint references lms_posts(id) on delete cascade;

create index if not exists lms_posts_parent_idx on lms_posts (parent_id);
create index if not exists lms_posts_discussion_idx on lms_posts (discussion_id);
