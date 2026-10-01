# Happy Man Academy

A dependency-free front-end prototype for a school management system, backed by Supabase. There is
no build step and no package manager — `index.html`, `styles.css`, `data.js` and `app.js` are the
whole app.

`data.js` imports the Supabase JS SDK from a CDN, so the page must be served over HTTP rather than
opened as a `file://` URL. Any static server works, for example:

```
python -m http.server 8940
```

Then browse to `http://127.0.0.1:8940/`.

## Setup

The database has to exist before the app shows real data. In the Supabase dashboard, run these files
**in order** in the SQL editor:

1. `supabase/migrations/20260926_initial_schema.sql` — base tables and open RLS policies.
2. `supabase/migrations/20260927_school_upgrade.sql` — staff roles, class levels and tracks,
   departments, mentors, weekly attendance, events and the timetable.
3. `supabase/migrations/20260928_promotion.sql` — the promotion decision engine: standing rules,
   student status, class `selection_mode`, position views/functions, `subject_selections`,
   `weekly_topics`, and `path_requests` (students choose Science / Commercial / Arts at the
   Grade 9 checkpoint and in the Grade 10 placement pool).
4. `supabase/migrations/20260929_lms.sql` — learning management: lessons, quizzes, questions,
   attempts, discussions and posts.
5. `supabase/migrations/20260930_attendance_daily.sql` — per-student, per-school-day attendance
   (`present` / `late` / `absent`) as the class teacher marks it.
6. `supabase/migrations/20261001_midterm_report.sql` — the session's mid-term break dates
   (`sessions.midterm_break`), the admin-editable setting behind the mid-term report.
7. `supabase/migrations/20261002_end_of_session.sql` — student status and status reason
   constraints now admit `archived` (an archived student is kept in the school's records but can
   no longer sign in) and `pool_unplaced` (already written by the placement pool but previously
   missing from the constraint).
8. `supabase/migrations/20261003_growth.sql` — the growth and honours records behind the
   promotion override, the student Growth & Mastery system, the parent Engaged Guardian tier
   and the teacher Educator Recognition engine: `promotion_overrides`, `portfolio_artifacts`,
   `commendations`, `parent_engagements` and `teacher_recognitions`.

Then seed the demo school:

8. `supabase/seed.sql` — 34 curriculum subjects, 12 classes, 20 teachers plus an administrator,
   11 students, 1 parent, 174 teacher allocations, two terms of grades, attendance, assignments,
   events, remarks, plus Grade 7 English learning content (lessons, a quiz, an attempt and a
   discussion) and daily attendance rows for every week. It also seeds the growth records:
   Ama Osei's verified portfolio artifacts, a commendation and a master-register recognition for
   the class teacher, plus the same parent's engagements (logins, result acknowledgement, PTA,
   early payment).

Every statement in the upgrade and the seed is idempotent, so both are safe to re-run. The app
reports any table it could not read in the browser console (`[HMA] unreachable tables: …`).

## Running without a database

The app works with no backend at all. If Supabase is unreachable, the key is rejected, or the
database has not been migrated yet, `data.js` loads a **complete demo school that is bundled into
the script itself** — the same school the seed file creates. Nothing is read from the network, so
every screen, report, export and timetable is fully explorable offline.

Writes made in this mode update the local cache and are logged as
`[HMA] … not saved remotely`, so nothing is silently lost. To reset, clear the site's local storage.

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@happyman.edu` | `admin123` |
| Class Teacher | `class@happyman.edu` | `class123` |
| Subject Teacher | `subject@happyman.edu` | `subject123` |
| HOD | `hod@happyman.edu` | `hod123` |
| Student | `ama.osei@happyman.edu` | `student123` |
| Parent | `parent@happyman.edu` | `parent123` |


## Roles and what each one can do

Roles are additive — nobody loses access when they take on a bigger job. A Subject Teacher, Class
Teacher and HOD are all stored as `teacher` in the database; the extra powers come from the class
they own (`teacher_classes`) and the department they head (`departments.hod_id`), not the role string.

| Role | Sees |
| --- | --- |
| **Administrator** | Everything: people, classes, subjects, timetable, analytics, events, settings. |
| **Subject Teacher** | Score management, assignments, mentees and reports for **only the classes they are allocated to**, plus **Lessons, Quizzes and Discussions** they publish for those classes. |
| **Class Teacher** | All of the above, **plus** their own class attendance — upload each day's marks for every student, review the weekly roll-up, feedback, the full all-subject class report and the class timetable. |
| **HOD** | All of the above, **plus** department oversight: subject analytics and a results matrix across every class, filtered to the subjects in the department they head. |
| **Student** | Own results, attendance (per-day marks and weekly totals), assignments, promotion tracker, mentor, **Choose my path**, the lessons and quizzes their teachers publish, class discussions, and their weekly timetable. |
| **Parent** | Every child's CA and exam scores split out, attendance (per-day marks and weekly totals), assignments, timetable, mentor contact and school events. |
| **Administrator** | The same attendance performance as everyone else, school-wide: per-class weekly totals and ratings on the Analytics page. |

A **parent's phone number is required** and persisted when a parent is added or edited.

### The `•••` row menu

In the admin Classes table, the `•••` at the end of each class row opens that class's actions:
**View students**, **Full class report**, **Class timetable** and **Assign class teacher**. One class
teacher per class, and a teacher may lead **only one class** — assigning a teacher to a different
class automatically releases the one they led before (the toast says which).

## The promotion rule

A student is promoted only when **all three** hold — each must be **strictly above 50** (a mark of
exactly 50 does not pass):

1. English total is **above 50**
2. Mathematics total is **above 50**
3. Overall average — the sum of every subject total divided by how many subjects the student sits —
   is **above 50**

Subject total = **CA (40) + Exam (60)**. CA and exam are recorded and displayed separately
everywhere — the class register, the report drawer, the student results page, the parent portal and
every downloadable CSV.

## Curriculum

Nigerian junior and senior secondary structure.

- **Grade 7 – Grade 9 (Year 7 – Year 9)** — one common subject list for every junior class.
- **Grade 10 – Grade 12 (Year 10 – Year 12)** — split into three tracks: **Science**,
  **Commercial**, **Arts**. English Studies and General Mathematics are carried by every track.

Subjects carry a `level` (`JSS` / `SS` / `BOTH`) and a `group` (`General` / `Science` /
`Commercial` / `Arts`), and classes carry a level, a track and a year. A class's subject list is
derived from those fields, so the timetable, class register, register matrix and reports all follow
the class curriculum rather than a flat subject list. The `class_subjects` view exposes the same
mapping to SQL.

## Whole-school timetable

`Generate for ALL classes` builds the entire school in one pass. It walks each class's curriculum,
places every subject, and **never** schedules one teacher into two classes at the same day and
period — a teacher who is already busy in that slot is passed over, and the class takes a free
period instead. A subject with no teacher allocated is left out of the grid and reported as
unstaffed rather than being given a stand-in, because silently inventing a teacher would hide a
real staffing gap. The single-class generator is available to everyone; the whole-school pass and
a CSV of every class are administrator only, and a class teacher's timetable is locked to their own
class.

## Mentorship

Any teacher can mentor a student, so the roster of mentors is every member of staff. The mentor
appears on the student's dashboard and report drawer, on the parent's child cards, and in a
"My mentees" panel on the teacher's dashboard. The assignment is persisted and can be changed or
cleared at any time.

## Learning management

Teachers publish **Lessons** (title + body, per subject and class), **Quizzes** (optional
description, any number of multiple-choice or true/false questions, each with points) and open
**Discussion** threads for the classes they teach. Lessons and threads are visible to students
straight away; a quiz stays a **draft** until the teacher publishes it, and students see it only
then. A quiz is attempted once — one graded attempt per student, with a question-by-question
review afterwards — and the teacher's **Results** table lists every active student in the class
with their score or "Not attempted". Discussions are open to anyone in the class: teachers,
students and administrators can all reply.

## Attendance

Attendance is recorded **daily**, not as a lump figure. On the class teacher's Attendance page, a
register is taken one school day at a time: pick a week (1–4) and a weekday (Monday–Friday), and
toggle each student on the list to **Present** or **Absent** (an **All present** shortcut fills the
whole day in one click). **Save day** persists the whole class to `attendance_daily` and rolls it
into the weekly summary (`attendance_weekly.days_present`) — a late arrival still counts as
attended for the weekly total. Editing a weekly total the old way backfills that week's daily marks
so the two views never disagree.

The same record is then read everywhere: the class teacher's register, the **student's** "My
attendance" (per-day P/L/A chips plus weekly totals), the **parent's** attendance page for each
child, and the **administrator's** Analytics page, which lists every student's weekly days,
percentage and an Excellent / Good / Fair / At-risk rating per class and term.

## Mid-term break & report

The mid-term break is an **admin session setting** (School Setup → Session settings): a from/to
date range stored on the current session (`sessions.midterm_break`). It is shown in the analytics
panel and sits alongside the seeded calendar event.

The **mid-term report** (Administrator → Analytics, per class and term) lists **only the CA test
scores that subject teachers have actually uploaded** through the score sheet — one column per
subject, plus a CA-only average. Exam marks and un-uploaded gaps are never shown or guessed, so the
report is honest about what has been recorded so far. The score sheet download itself now also carries
a **Feedback** column with that student's class-teacher remark for the term.

## End of session & promotion decisions

Promotion decisions only appear after the admin closes the session. The gate is the final term:
decisions ("Promote / Pool / Graduate / Repeat") unlock when the current term is the **last term**
and the admin has **published the last term's results**. Until then the progression page shows the
gate message ("Term 3 results are not published yet…"), the summary shows `—`, and the commit button
stays disabled.

Once that close has happened, School Setup · **End of session · Start new session** offers the
current year's label (e.g. "2027 / 2028") in a sensitive confirmation. It snapshots the promotion
decisions for every active student into `promotions`, closes the current `sessions` row
(`is_current`/`is_closed`/`closed_at`/`closed_by`), and opens a fresh session — three new terms dated
a year later, term 1 current, all publish flags reset — so the next academic year starts clean.

### The promotion rule & the admin override

A student is **promoted** when the promotion-rule checks all pass. The rule counts a subject mark as a
pass when it is **at least 50% — exactly 50 passes** — for English, Mathematics and the
student's overall average across their examinable subjects. A Grade 9 student who passes the
checkpoint gate goes to the **pool**; a Grade 12 student who passes graduates instead. Anyone failing
a check repeats the year. Year levels in the middle jump straight to the next year.

The decisions table (School Setup · Progression) also carries a **Manual override** action for
students whose checks fall short. Overriding is a two-step, password-confirmed action (the
Administrator is re-prompted for their password), it applies to a single student for the current
session, and the decision column shows a small "admin ↓" tag with the reason `admin_override`.
Because an override is its own record (`promotion_overrides`), it never mutates the underlying
grades — a student can still be told honestly where the shortfall is.

## Student Growth & Mastery

Every displayed student dashboard adds a **Growth & Mastery** panel: a live XP bar with the next
rank, a rank badge (Scholar → Explorer → Innovator → Vanguard/Master), the XP breakdown, and any
badges earned. XP is derived on read from what the student has actually done, so nothing is stored
and the numbers cannot go stale:

- **Academic consistency** +50 — every term whose results were published.
- **Attendance** +100 — a full-session attendance rate of at least 90%.
- **Co-curricular & STEM** +150 — a portfolio artifact verified by a teacher (student submissions
  land in _pending_ until a teacher verifies or rejects them).
- **Leadership & character** +75 — a commendation written by a teacher.

A level is `1 + floor(XP / 250)` (tweak `RANKS` in `data.js` to tune). Badges (code crafter,
debate orator, sportsperson, iron clad, phoenix) unlock from the same signals. The **Student
Achievement Passport** button opens a printable one-pager — head crest, profile banner, subject
snapshot, 360° competency bars, verified proof-of-work cards and an offline verification code
`HMA-YYYY-XXXX` — that prints, or saves as PDF, cleanly with only the sheet on the page.

## Parents & the Engaged Guardian tier

The parent dashboard shows an **Engaged Guardian** panel with the tier (baby-step → steady → Pacesetter + 3-Term Active Guardian),
the ack-count progress bar, and buttons to **Acknowledge results** and mark **PTA attendance**.
Logging in at least once in a term is tracked automatically. Signs of engagement:

- login in the current term (automatic),
- acknowledging results (`ack_results`) and PTA-attending (`pta`) — each +1,
- paying on time (`early_payment`) — unlocks the **Pacesetter** tier.

## Educator Recognition

Administrators see a **★ Recognition** page: a leaderboard of Educator Points (mentor notes ×10,
verified portfolio artifacts ×25, master-register mark ×50), a log of every recognition row
(mentor notes with confirmed 1:1 conversations, artifact verifications, and the master-register
mark for a complete register), and an **Award Educator Points** form. It is the teacher-facing
counterpart of the student gamification — the same verified facts, one screen.

## Archiving a student

Administrators can **Archive** a student from the People tab's row menu and **Restore** them later.
An archived student is marked (`students.status = 'archived'`, remember **status_reason** and the
date/session that archived them) but never deleted: every past report, score and attendance row stays
visible in the report drawer's "Previous sessions" history. The block is on sign-in only —
`accountBlocked()` rejects the archived student at the login screen ("This account has been archived
and can no longer sign in. Contact the school office."). Archived students are left out of the
current year's operational lists (class attendance register, class dashboard, feedback, class
students modal) so the school keeps working on the live cohort with the archive safely in the past.

## Choosing a path

At the **Grade 9 checkpoint** and in the **Grade 10 placement pool**, students open their
**Choose my path** page and pick a track — **Science**, **Commercial** or **Arts** — with an
optional note to the school. The choice lands in `path_requests` (one pending request per student
per session, resubmit replaces it) and is shown back to the student until the school places them;
once placed into a stream class, the page reads "Path decided". At other years the page explains
that the school sets the class directly.

## Project layout

```
index.html                          markup for every role view
styles.css                          all styling, no framework
data.js                             Supabase client, cache, academic logic, timetable generator
app.js                              role dashboards, routing, rendering, CSV export
supabase/migrations/*.sql           schema, applied in filename order
supabase/seed.sql                   re-runnable demo data
```

## Known limitations

This is a client-side prototype. The publishable key ships in `data.js` and the RLS policies are
permissive, so **authentication and server-side permissions are not real yet** — any visitor can
read and write the tables. Passwords are stored in plain text in `users.password` and checked in the
browser. Spreadsheet upload currently only reports the chosen filename; it does not parse the file.
The Supabase JS SDK is loaded from a CDN, so first load needs internet access even when no database
is configured. Before this is used for real data, move authentication to Supabase Auth, tighten RLS
to per-role policies, and hash passwords.
