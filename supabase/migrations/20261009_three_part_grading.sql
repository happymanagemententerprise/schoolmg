-- Three-part grading: mid-term (20) + second-half CA (20) + exam (60).
-- NULL means a legacy grade that predates the separate mid-term field; its
-- original CA (40) + exam (60) score must remain unchanged in reports.
alter table public.grades
  add column if not exists midterm_score numeric(5,2)
  check (midterm_score is null or midterm_score between 0 and 20);

alter table public.grades
  drop constraint if exists grades_ca_score_check;
alter table public.grades
  add constraint grades_ca_score_check check (ca_score between 0 and 40);

alter table public.attendance_daily
  add column if not exists attendance_date date;

-- Preserve old marks with a NULL attendance_date. New UI writes an explicit
-- school date and stores unmarked state so cleared current-day marks remain
-- distinguishable from absences.
alter table public.attendance_daily
  drop constraint if exists attendance_daily_status_check;
alter table public.attendance_daily
  add constraint attendance_daily_status_check
  check (status in ('present', 'late', 'absent', 'unmarked'));

create index if not exists attendance_daily_term_date_idx
  on public.attendance_daily (term_id, attendance_date);

-- Keep the database-side promotion positions in sync with all three marks.
create or replace function public.student_positions(p_session_id bigint, p_term_id bigint)
returns table (
  student_id bigint, class_id bigint, year integer,
  class_position integer, year_position integer,
  term_avg numeric, session_avg numeric, terms_counted integer
)
language sql stable security definer set search_path = public as $$
  with cohort as (
    select st.id as sid, st.class_id, c.year
      from students st join classes c on c.id = st.class_id
     where st.status = 'active' and c.year is not null
  ), marks as (
    select c.sid, g.term_id,
           coalesce(g.midterm_score, 0) + g.ca_score + g.exam_score as mark
      from cohort c
      join grades g on g.student_id = c.sid
      join terms t on t.id = g.term_id
     where t.session_id = p_session_id
  ), per_term as (
    select sid, term_id, round(avg(mark), 2) as term_avg
      from marks group by sid, term_id
  ), rolled as (
    select c.sid, c.class_id, c.year,
           max(pt.term_avg) filter (where pt.term_id = p_term_id) as t_avg,
           round(avg(pt.term_avg), 2) as s_avg,
           count(*) as n_terms
      from cohort c join per_term pt on pt.sid = c.sid
     group by c.sid, c.class_id, c.year
  )
  select r.sid, r.class_id, r.year,
         rank() over (partition by r.class_id order by r.s_avg desc)::int,
         rank() over (partition by r.year order by r.s_avg desc)::int,
         r.t_avg, r.s_avg, r.n_terms::int
    from rolled r
$$;
