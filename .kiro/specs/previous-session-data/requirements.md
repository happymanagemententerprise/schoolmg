# Requirements Document

## Introduction

Happy Man Academy currently loads academic data for the current session only. This feature adds access to previous-session academic records — grades, attendance, and promotion outcomes — for all roles that can already view a student's report. A session selector (dropdown) appears wherever scores are displayed; past sessions are listed by name and are only shown when the student has grades recorded in that session. Previous session data is fetched lazily from Supabase the first time a user selects that session, keeping the initial page-load cost unchanged.

The feature touches two surfaces: the shared Student Report Drawer (opened from Admin, Class Teacher, Subject Teacher, HOD, Student, and Parent views) and the Student → Results view. Both surfaces gain the same session selector and the same read-only score display.

## Glossary

- **Session**: An academic year record in the `sessions` table. The active session has `is_current = true`; completed sessions have `is_current = false, is_closed = true`.
- **Previous_Session**: Any session where `is_current = false` and `is_closed = true`.
- **Session_Selector**: A `<select>` dropdown that lists the Current_Session first, followed by each Previous_Session for which the student has at least one grade row.
- **Current_Session**: The session with `is_current = true` in the `sessions` table.
- **Previous_Session_Cache**: An in-memory map keyed by `(studentId, sessionId)` that stores lazily fetched score data so repeated selection of the same past session does not trigger a second network request.
- **Score_Row**: A single subject's CA score, Exam score, computed Total (CA + Exam), Grade label, and Pass/Fail status for one term.
- **Report_Drawer**: The `StudentReportDrawer` React component mounted at `#react-report-drawer`, opened via `openStudentReport(studentId)` in `reports.js`.
- **Results_View**: The `#view-student-results` page rendered by `renderStudentResults()` in `student.js`, visible only to the Student role.
- **T3_Average**: The 3-term average computed as `round((T1_total + T2_total + T3_total) / number_of_terms_with_data)` per subject, displayed only when Term 3 of a session is selected.
- **Lazy_Fetch**: A network request to Supabase that is deferred until the user first selects a specific session, rather than executed at app startup.
- **Consumer_Role**: A Student or Parent user, for whom published-results gating still applies.
- **Staff_Role**: An Admin, Class Teacher, Subject Teacher, or HOD user, for whom published-results gating does not apply.

---

## Decisions (confirmed 2026-10-04)

- **Term navigation**: Show T1, T2, T3 overall averages as summary score cards at the top of the past session view. A term selector (tabs or dropdown) lets the user drill into the full subject-by-subject breakdown for each term.
- **Attendance + achievements**: Include per-term attendance % and the Growth badges/XP the student earned during that session in the past session view.
- **Results view migration**: Migrate `#view-student-results` to React (same pattern as other migrated views). The `<PreviousSessionView>` component is shared between the drawer and the Results view, written once.


### Requirement 1: Enumerate Available Previous Sessions

**User Story:** As any user who can open a student's report, I want to see which past sessions have grades for that student, so that I know which historical records I can access.

#### Acceptance Criteria

1. WHEN the Report_Drawer is opened for a student, THE Session_Selector SHALL be populated with the Current_Session as the first and default option, followed by each Previous_Session in descending chronological order (most recent past session first).
2. WHEN populating the Session_Selector, THE Session_Selector SHALL include a Previous_Session as an option only if at least one grade row exists for the student in any term of that session in the Supabase `grades` table.
3. WHEN no Previous_Session has any grade row for the student, THE Session_Selector SHALL NOT render a dropdown and SHALL display the Current_Session label as plain text.
4. THE Session_Selector SHALL display each session using the `name` field from the `sessions` table (for example, "2024 / 2025").
5. WHEN the Results_View is rendered for a Student role user, THE Results_View SHALL include the same Session_Selector populated by the same rules as acceptance criteria 1–4 above.

---

### Requirement 2: Lazy-Fetch Previous Session Data

**User Story:** As a developer, I want previous-session grade data to be fetched on demand rather than at startup, so that the initial page-load time is not affected by historical data volume.

#### Acceptance Criteria

1. WHEN the user selects a Previous_Session in the Session_Selector for the first time, THE Data_Layer SHALL fetch grades and attendance records for that student and session from Supabase.
2. WHEN the same Previous_Session has already been fetched for the same student during the current browser session, THE Data_Layer SHALL read from the Previous_Session_Cache and SHALL NOT issue a second Supabase query.
3. WHILE a Lazy_Fetch is in progress, THE Report_Drawer SHALL display a loading indicator in place of the score table.
4. IF the Supabase query for a Previous_Session returns an error, THEN THE Report_Drawer SHALL display an inline error message and SHALL NOT remove the Session_Selector.
5. THE Data_Layer SHALL query only the `grades`, `terms`, and `attendance_weekly` tables scoped to the selected `session_id` when performing a Lazy_Fetch — it SHALL NOT re-fetch sessions, users, subjects, or classes.

---

### Requirement 3: Display Previous Session Scores — Terms 1 and 2

**User Story:** As any user who can view a student's report, I want to see the CA, Exam, Total, Grade, and Pass/Fail for each subject in Terms 1 and 2 of a previous session, so that I can review the student's historical academic performance.

#### Acceptance Criteria

1. WHEN a Previous_Session is selected and Term 1 or Term 2 is active, THE Report_Drawer SHALL render one Score_Row per subject that has at least one non-null grade value (CA or Exam) for the student in that term.
2. THE Score_Row SHALL display: subject name, subject type (Core or Elective), CA score out of 40, Exam score out of 60, Total score, Grade label, and Pass/Fail status.
3. WHEN a CA or Exam score is absent (null) for a subject in the selected term, THE Score_Row SHALL display "—" in that cell.
4. THE Report_Drawer SHALL compute the Pass/Fail status using the same `passMark()` threshold as the current session.
5. THE Report_Drawer SHALL display the scores as read-only — no edit controls SHALL be rendered.
6. WHEN a Previous_Session is selected, THE Report_Drawer SHALL display the session name and the selected term name in the eyebrow label above the student name.

---

### Requirement 4: Display Previous Session Scores — Term 3 with 3-Term Average

**User Story:** As any user who can view a student's report, I want to see the 3-term average alongside Term 3 scores for a previous session, so that I can assess the student's overall performance for that year.

#### Acceptance Criteria

1. WHEN a Previous_Session is selected and Term 3 is active, THE Report_Drawer SHALL render the same CA, Exam, T3 Total, T2 Total, T1 Total, T3_Average, Grade, and Pass/Fail columns as the current session Term 3 view.
2. THE Report_Drawer SHALL compute T3_Average per subject as `round((T3_total + T2_total + T1_total) / count_of_terms_with_data)` where `count_of_terms_with_data` counts only terms for which the subject has a non-null Total.
3. WHEN a subject has data in fewer than three terms of the previous session, THE Report_Drawer SHALL compute T3_Average using only the terms that have data and SHALL display a "—" for any missing term total.
4. THE Grade label and Pass/Fail status for Term 3 of a Previous_Session SHALL be based on T3_Average, not the T3 Total alone, matching the behaviour for the current session.

---

### Requirement 5: Term Selector Within a Previous Session

**User Story:** As any user reviewing a previous session, I want to switch between Term 1, Term 2, and Term 3 of that session, so that I can inspect each term independently.

#### Acceptance Criteria

1. WHEN a Previous_Session is selected, THE Report_Drawer SHALL display a term selector showing the terms defined in the `terms` table for that session.
2. WHEN the user changes the term selector while a Previous_Session is active, THE Report_Drawer SHALL re-render the score table for the newly selected term using already-fetched cached data — it SHALL NOT issue a new Supabase query.
3. THE term selector for a previous session SHALL default to Term 3 if Term 3 data exists for the student in that session; otherwise it SHALL default to the highest term number that has data.
4. WHEN the user switches back to the Current_Session in the Session_Selector, THE Report_Drawer SHALL restore the current session term selector to the term that was active before the session was changed.

---

### Requirement 6: Read-Only Gate for Consumer Roles in Previous Sessions

**User Story:** As a Student or Parent viewing a previous session's results, I want to see the scores without any published/locked gating, so that I can always access completed historical records.

#### Acceptance Criteria

1. WHEN a Consumer_Role user selects a Previous_Session, THE Report_Drawer SHALL display scores without applying the `Data.published(term)` lock check, because previous sessions are fully closed.
2. THE Report_Drawer SHALL NOT display the "results not released yet" locked state for any term of a Previous_Session.
3. WHEN a Consumer_Role user is viewing the Current_Session, THE Report_Drawer SHALL continue to apply the existing `Data.published(term)` lock check unchanged.

---

### Requirement 7: Student Results View — Session Selector

**User Story:** As a Student, I want to select a previous session on my Results page, so that I can review my academic history without going through the report drawer.

#### Acceptance Criteria

1. WHEN the Results_View is rendered for a Student role user, THE Results_View SHALL display the Session_Selector above the existing term selector.
2. WHEN the student selects a Previous_Session in the Results_View, THE Results_View SHALL fetch and display scores using the same Lazy_Fetch and Previous_Session_Cache behaviour defined in Requirement 2.
3. WHEN a Previous_Session is active in the Results_View, THE Results_View SHALL display scores in the same table format as the current session (CA, Exam, Total, Grade, Pass/Fail for T1/T2; extended columns for T3).
4. WHEN the student switches back to Current_Session in the Results_View, THE Results_View SHALL restore the current session term selector and score table without a page reload.
5. WHILE a Previous_Session is selected in the Results_View, THE Results_View SHALL display the session name in the meta line beneath the table.

---

### Requirement 8: Session Selector in Parent Portal

**User Story:** As a Parent, I want to see previous session results for each of my children, so that I can track their academic progress over multiple years.

#### Acceptance Criteria

1. WHEN a Parent role user opens the Report_Drawer for a child, THE Report_Drawer SHALL include the Session_Selector with the same rules as Requirement 1.
2. WHEN a Parent role user selects a Previous_Session for a child, THE Report_Drawer SHALL display scores using the same rules as Requirements 3, 4, and 6.
3. THE Report_Drawer SHALL NOT apply the `Data.published(term)` lock to any term of a Previous_Session regardless of the `published` flag stored for that term, because the session is closed.

---

### Requirement 9: Session Selector for Staff Roles

**User Story:** As an Admin, Class Teacher, Subject Teacher, or HOD, I want to open the report drawer for any student and view their previous session records, so that I can make informed decisions about that student's academic trajectory.

#### Acceptance Criteria

1. WHEN a Staff_Role user opens the Report_Drawer for any student, THE Report_Drawer SHALL include the Session_Selector with the same rules as Requirement 1.
2. WHEN a Staff_Role user selects a Previous_Session, THE Report_Drawer SHALL display scores without any published/locked gating for any term of that session.
3. THE Report_Drawer SHALL display the same read-only score table layout for Staff_Role users as for Consumer_Role users when viewing a Previous_Session.

---

### Requirement 10: Download Report for Previous Sessions

**User Story:** As any user who can view a student's report, I want to be able to download the scores for a previous session as an Excel file, so that I have a local copy of the historical record.

#### Acceptance Criteria

1. WHEN a Previous_Session is selected and scores are displayed, THE Report_Drawer SHALL enable the "Download report" button.
2. WHEN the user clicks "Download report" while a Previous_Session is active, THE Report_Drawer SHALL generate an Excel file containing the scores for all three terms of that session using the same `downloadXlsx` utility as the current session.
3. THE downloaded file name SHALL follow the pattern `report_{student_name}_session_{session_name}.xlsx`, replacing spaces in the session name with underscores.
4. THE Report_Drawer SHALL disable the "Download report" button WHILE a Lazy_Fetch is in progress for the selected session.

---

### Requirement 11: No Previous Session Data Pollution

**User Story:** As a developer, I want previous session data to be stored and accessed separately from the current session cache, so that current session reads are never affected by historical data.

#### Acceptance Criteria

1. THE Data_Layer SHALL store previous session grade data exclusively in the Previous_Session_Cache and SHALL NOT merge it into the main `_cache` object used by `Academic.*`, `Progression.*`, or any other current-session namespace.
2. THE Previous_Session_Cache SHALL be keyed by a composite key of `studentId` and `sessionId` so that fetching one student's history does not populate or invalidate another student's cache entry.
3. WHEN the user logs out, THE Previous_Session_Cache SHALL be cleared.
4. IF the Previous_Session_Cache grows beyond 50 student-session entries during a single browser session, THE Data_Layer SHALL evict the least-recently-used entry to prevent unbounded memory growth.
