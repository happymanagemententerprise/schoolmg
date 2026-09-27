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

The database has to exist before the app shows real data. In the Supabase dashboard, run these two
files **in order** in the SQL editor:

1. `supabase/migrations/20260926_initial_schema.sql` — base tables and open RLS policies.
2. `supabase/migrations/20260927_school_upgrade.sql` — staff roles, class levels and tracks,
   departments, mentors, weekly attendance, events and the timetable.

Then seed the demo school:

3. `supabase/seed.sql` — 34 curriculum subjects, 12 classes, 20 teachers plus an administrator,
   11 students, 1 parent, 174 teacher allocations, two terms of grades, attendance, assignments,
   events and remarks.

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
| **Subject Teacher** | Score management, assignments, mentees and reports for **only the classes they are allocated to**. |
| **Class Teacher** | All of the above, **plus** their own class attendance, feedback, the full all-subject class report and the class timetable. |
| **HOD** | All of the above, **plus** department oversight: subject analytics and a results matrix across every class, filtered to the subjects in the department they head. |
| **Student** | Own results, attendance, assignments, promotion tracker and mentor. |
| **Parent** | Every child's CA and exam scores split out, attendance, mentor contact and school events. |

A **parent's phone number is required** and persisted when a parent is added or edited.

### The `•••` row menu

In the admin Classes table, the `•••` at the end of each class row opens that class's actions:
**View students**, **Full class report**, **Class timetable** and **Assign class teacher**. One
class teacher per class; assigning a new one replaces the old.

## The promotion rule

A student is promoted only when **all three** hold:

1. English total is **50 or above**
2. Mathematics total is **50 or above**
3. Overall term average is **50 or above**

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
