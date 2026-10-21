# Happy Man Academy

Happy Man Academy is a Vite single-page school management app using Supabase for authentication
and PostgreSQL data. The browser experience lives in `src/`, its design system is in
`src/styles.css`, and the shared data layer is `data.js`. `npm run dev` serves the app locally and
`npm run build` creates the Cloudflare Pages output in `dist/`. Campus safety, SMS and scheduled
push features are provided by the Supabase Edge Function in `supabase/functions/campus-api/`.

Serve the app over HTTP rather than opening it as a `file://` URL. Run `npm install` and
`npm run dev`, then browse to `http://localhost:8000/`.

## Setup

The database must be set up before the app can show school data. For a **new Supabase project**,
run every migration below in the Supabase SQL Editor, in this exact filename order. Run
`supabase/seed.sql` only after all migrations succeed. Enable the Data API, but keep automatic
table exposure disabled; the final migration grants authenticated roles only the operations
backed by RLS policies.

1. `supabase/migrations/20260926_initial_schema.sql` — core school tables and initial policies.
2. `supabase/migrations/20260927_school_upgrade.sql` — staff roles, departments, mentors,
   attendance, events and timetable.
3. `supabase/migrations/20260928_promotion.sql` — promotion rules, student status, class streams,
   positions, subject selections and path requests.
4. `supabase/migrations/20260929_lms.sql` — lessons, quizzes, questions, attempts and discussions.
5. `supabase/migrations/20260930_attendance_daily.sql` — per-student daily attendance.
6. `supabase/migrations/20261001_midterm_report.sql` — mid-term break dates.
7. `supabase/migrations/20261002_end_of_session.sql` — archived and unplaced student statuses.
8. `supabase/migrations/20261003_growth.sql` — promotion overrides, portfolios, commendations,
   parent engagements and teacher recognition.
9. `supabase/migrations/20261004_rls_policies.sql` — transitional policies. **Do not stop here:**
   this migration includes broad anonymous policies that are removed by the later lockdown.
10. `supabase/migrations/20261005_supabase_auth.sql` — Supabase Auth identity mapping and policies.
11. `supabase/migrations/20261006_rls_lockdown.sql` — authenticated, role-scoped policies across
    the school and LMS tables.
12. `supabase/migrations/20261007_remarks_approval.sql` — approval workflow for remarks.
13. `supabase/migrations/20261008_threaded_discussions.sql` — threaded discussion support.
14. `supabase/migrations/20261009_three_part_grading.sql` — mid-term, CA and exam grading.
15. `supabase/migrations/20261017104739_attendance_safety_pwa.sql` — residence status, hostel and
    gate events, cover scheduling, period attendance and PWA support.
16. `supabase/migrations/20261018090000_vehicle_gate_checkin.sql` — vehicle details, guardian
    authorization and private pickup PIN storage.
17. `supabase/migrations/20261019091035_security_hardening.sql` — restricts user privilege edits,
    protects quiz answer keys, and scopes LMS and workflow reads.
18. `supabase/migrations/20261019094328_grade_subject_access.sql` — restricts grade reads to each
    student's own records, a parent's linked children, a teacher's assigned subject/class (or a
    class teacher's own class), and administrators; grade writes require an explicit subject
    assignment or administrator access. It also closes anonymous access to the school-wide ranking
    RPC and limits that report to administrators.
19. `supabase/migrations/20261019120000_authenticated_api_grants.sql` — grants authenticated users
    only the table operations covered by their RLS policies, grants sequences only for insertable
    tables, and keeps quiz answer keys and profile updates restricted.

Then run `supabase/seed.sql` to create the demo school (34 subjects, 12 classes, 20 teachers, an
administrator, 11 students, a parent, sample grades, attendance and LMS content).

For an **existing database**, do not blindly replay the full list. Compare the deployed schema with
the migrations and apply only the missing changes in order. The two 20261019 security migrations
and the authenticated-grants migration have been applied to the empty
`happyman-academy-staging` project and verified with 22 role-scope assertions. The existing
`happyman-academy` project was not changed; reconcile its migration history and review its schema
before planning a production rollout. Applying migrations through the SQL Editor does not
automatically record Supabase CLI migration history.

For local development, `supabase start` and `supabase db reset` apply the migrations and configured
seed to the local Supabase database. Then run `supabase test db` to execute the pgTAP checks under
`supabase/tests/`. **`supabase db reset` deletes and rebuilds local database data.** Do not use it
against a hosted project. The app reports unreadable tables in the browser console
(`[HMA] unreachable tables: …`).

## Running without a database

If Supabase cannot supply school data, `data.js` can load the bundled demo school for exploration.
Signing in still requires a valid Supabase Auth session. Attendance can be queued offline after the
real school roster has loaded; queued changes are not applied to demo data.

Writes made in this mode update the local cache and are logged as
`[HMA] … not saved remotely`, so nothing is silently lost. To reset, clear the site's local storage.

### Demo accounts

Choose a role on the login screen to enter the bundled local demo school. Demo access does not
require a password or Supabase Auth account. Changes are kept in the browser and are not written
to the school database. To use an actual school account, sign in with its email and password.


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
index.html                          application shell and route containers
src/main.js                         Vite entry, authentication bootstrap, PWA bootstrap
src/styles.css                      shared visual system
src/views/*.js                      admin, teacher, student, parent, campus operations
src/react/components/               interactive registers and reports
data.js                             Supabase client, cache and academic logic
server/index.js                     campus API, notifications and scheduled workflows
supabase/migrations/*.sql           schema, applied in filename order
supabase/seed.sql                   re-runnable demo data
```

## Campus API security boundary

Campus safety routes validate Supabase Auth access tokens and derive roles from `public.users`;
they do not trust role claims sent by the browser. Keep the service-role key, VAPID private key and
Twilio credentials server-side. The Edge Function validates Supabase Auth access tokens and derives
roles from `public.users`; it does not trust role claims sent by the browser.
# Campus attendance, safety and PWA deployment

The browser app is deployed as a Vite/Cloudflare Pages site. Supabase provides the database,
authentication and campus API. Never put a Supabase secret/service-role key, VAPID private key or
Twilio credentials in frontend variables.

## Apply the Supabase changes

Follow the complete 19-file migration order in [Setup](#setup), including vehicle check-in and the
security and explicit-grants migrations. The attendance migration adds the `students.residence_status`
classification (`BOARDER` / `DAY_STUDENT`), optional hostel assignment, scoped presence/event tables,
approved timetable cover records, period attendance, push subscription storage and an end-of-day
summary. The security migrations have been applied and role-scope checks have passed on the empty
staging project; production deployment remains pending.

Create one or more hostels from **Campus safety → Hostel setup**, then add users with the **Hostel Supervisor** or **Security Guard** role from People. Assign supervisors to hostels in Campus safety, then classify each student and assign boarders to a hostel from People → Students. Parent SMS requires parent phone numbers and Twilio credentials.

## Run the campus API locally

Copy `server/.env.example` to `server/.env` and set the Supabase URL, server-only service-role key, frontend origin(s), school timezone and optional VAPID/Twilio settings. Install and run the service from the repo root:

```sh
npm --prefix server install
npm --prefix server run dev
```

Set the Pages build variable `VITE_CAMPUS_API_URL` to
`https://erlhyrswcqpqpqzbgmgb.supabase.co/functions/v1/campus-api`. The Pages origin is
`https://happyman-academy.pages.dev`. For local development, the Vite dev server proxies `/api` to
`http://localhost:8788`. Configure the once-per-minute Supabase Cron job using
[`supabase/scheduler_setup.sql`](supabase/scheduler_setup.sql). Store the project URL and the
existing `CAMPUS_SCHEDULER_SECRET` in Supabase Vault as `campus_scheduler_url` and
`CAMPUS_SCHEDULER_SECRET` before running the script. Keep the token server-side; do not put it in
Pages.

Generate a fresh VAPID pair with `npx web-push generate-vapid-keys`, then store the public key, private key and contact subject as Supabase Edge Function secrets. The private key must never be committed or exposed in frontend variables. Parent SMS delivery uses Twilio's REST API when all three Twilio secrets are configured. Without these provider credentials the rest of the app remains available and notification status is surfaced in the gate register.

The attendance outbox is stored in IndexedDB, falling back to localStorage. It is applied back to the on-device register after reload and synced when the app regains connectivity. Browser Background Sync is best-effort and asks an open app client to flush the queue; browsers that do not support Background Sync sync on the next `online` event while the app is open. PWA push reminders require the campus API and user permission.
