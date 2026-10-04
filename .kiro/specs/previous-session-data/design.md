# Technical Design — Previous Session Data

## Overview

This design adds a **previous-session academic history view** to the Happy Man Academy SPA. All roles that can open a student's report (Admin, Teacher, HOD, Student, Parent) gain a session selector that reveals read-only scores, attendance, and growth badges for any past closed session in which the student has grade data.

The feature is built in two layers:

1. **Data layer** — a `PrevSessionCache` module added to `src/data/index.js` that lazily fetches past session data from Supabase on demand and never touches the main `_cache`.
2. **UI layer** — a shared `<PreviousSessionPanel>` React component used by both the `StudentReportDrawer` (drawer, all roles) and a new `StudentResults` React component (migrates the vanilla `renderStudentResults` view).

---

## Architecture Diagram

```
openStudentReport(sid)          renderStudentResults() (migrated)
       │                                    │
       ▼                                    ▼
StudentReportDrawer.jsx          StudentResults.jsx (new)
       │                                    │
       └──────────┬─────────────────────────┘
                  ▼
         <SessionSelector>          ← lists current + past sessions with data
                  │
         ┌────────┴────────┐
         │ current session │   past session selected
         │  (existing)     │         │
         └─────────────────┘         ▼
                             <PreviousSessionPanel>
                                      │
                              PrevSessionCache.fetch(studentId, sessionId)
                                      │
                              Supabase: grades + terms + attendance_weekly
                                  scoped to session_id
```

---

## Component Tree

```
StudentReportDrawer.jsx
├── SessionSelector            (new shared component)
├── [current session content]  (existing, unchanged when current selected)
└── PreviousSessionPanel       (new, shown when past session selected)
    ├── SessionSummaryCards    (T1 avg%, T2 avg%, T3 avg% + session avg%)
    ├── TermTabs               (T1 | T2 | T3)
    ├── ScoreTable             (subject rows — adapts columns for T3)
    ├── AttendanceSummary      (per-term attendance %)
    └── GrowthSnapshot         (XP total, badges earned that session)

StudentResults.jsx  (new — migrates renderStudentResults)
├── SessionSelector
├── [current session content]  (existing table logic moved from student.js)
└── PreviousSessionPanel       (same shared component)
```

---

## New Files

| File | Purpose |
|------|---------|
| `src/data/prevSessionCache.js` | `PrevSessionCache` — lazy fetch + LRU cache |
| `src/react/components/SessionSelector.jsx` | Session `<select>` dropdown |
| `src/react/components/PreviousSessionPanel.jsx` | Full past-session view (scores + attendance + growth) |
| `src/react/components/StudentResults.jsx` | React migration of `renderStudentResults` |

---

## Data Layer — `src/data/prevSessionCache.js`

### What it fetches (per student × session)

```js
// Supabase queries (all scoped to session_id)
const { data: terms }   = await _sb.from('terms')
  .select('*').eq('session_id', sessionId);

const termIds = terms.map(t => t.id);

const { data: grades }  = await _sb.from('grades')
  .select('*').in('term_id', termIds).eq('student_id', studentId);

const { data: attendance } = await _sb.from('attendance_weekly')
  .select('*').in('term_id', termIds).eq('student_id', studentId);
```

`_sb` is the Supabase client. It is already on `window._sb` (exposed by `data.js`). Access it as `window._sb` from `prevSessionCache.js` to avoid importing the full data module.

### Cache structure

```js
// Map key: `${studentId}:${sessionId}`
// Value: { terms, gradesByTerm, attendanceByTerm, fetchedAt }
// Max 50 entries (LRU eviction)
```

### Public API

```js
// Returns { sessions: Session[] } — all closed sessions that have ≥1
// grade row for this student. Called once per drawer open.
export async function getSessionsWithData(studentId)

// Returns cached or freshly fetched { terms, gradesByTerm, attendanceByTerm }
// for one past session. Shows loading state while in flight.
export async function fetchPrevSession(studentId, sessionId)

// Called on logout — clears the entire cache.
export function clearPrevSessionCache()
```

### Session enumeration

```js
export async function getSessionsWithData(studentId) {
  // 1. Fetch all closed sessions
  const { data: sessions } = await _sb.from('sessions')
    .select('id, name, created_at')
    .eq('is_current', false).eq('is_closed', true)
    .order('created_at', { ascending: false });

  // 2. For each session, check if any grade row exists for this student
  //    (count query, not a full fetch)
  const withData = await Promise.all(sessions.map(async sess => {
    const termIds = await _termIdsForSession(sess.id);
    if (!termIds.length) return null;
    const { count } = await _sb.from('grades')
      .select('id', { count: 'exact', head: true })
      .in('term_id', termIds).eq('student_id', studentId);
    return count > 0 ? sess : null;
  }));

  return withData.filter(Boolean);
}
```

---

## `SessionSelector.jsx`

```jsx
// Props: { studentId, currentSessionName, onSelect, selectedSessionId }
// selectedSessionId === null means "current session"

export default function SessionSelector({ studentId, currentSessionName, onSelect, selectedSessionId }) {
  const [pastSessions, setPastSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSessionsWithData(studentId).then(sessions => {
      setPastSessions(sessions);
      setLoading(false);
    });
  }, [studentId]);

  // Don't render a dropdown if no past sessions have data
  if (!loading && pastSessions.length === 0) {
    return <p className="eyebrow">{currentSessionName}</p>;
  }

  return (
    <select
      className="select-inline"
      value={selectedSessionId ?? 'current'}
      onChange={e => onSelect(e.target.value === 'current' ? null : e.target.value)}
    >
      <option value="current">{currentSessionName} (Current)</option>
      {pastSessions.map(s => (
        <option key={s.id} value={String(s.id)}>{s.name}</option>
      ))}
    </select>
  );
}
```

---

## `PreviousSessionPanel.jsx`

### Props
```js
{
  studentId: string,
  sessionId: string,       // the selected past session's DB id
  sessionName: string,     // e.g. "2025 / 2026"
  subjects: Subject[],     // from Data.subjects() — current cache (subjects don't change)
}
```

### State
```js
const [data,    setData]    = useState(null);    // fetched session data
const [loading, setLoading] = useState(true);
const [error,   setError]   = useState(null);
const [term,    setTerm]    = useState(null);    // selected term number (1|2|3)
```

### Fetch on mount / sessionId change
```js
useEffect(() => {
  setLoading(true); setError(null);
  fetchPrevSession(studentId, sessionId)
    .then(d => {
      setData(d);
      // default to highest term with data
      const terms = d.terms.map(t => t.term).filter(t => hasData(d, t));
      setTerm(Math.max(...terms));
      setLoading(false);
    })
    .catch(e => { setError(e.message); setLoading(false); });
}, [studentId, sessionId]);
```

### Score computation (pure, no Supabase)
```js
// From fetched gradesByTerm[termNum] → array of { subjectId, ca, exam, score }
function scoresForTerm(data, termNum, subjects) {
  const rows = data.gradesByTerm[termNum] || [];
  return subjects
    .filter(sub => rows.some(r => String(r.subject_id) === String(sub.id)))
    .map(sub => {
      const r = rows.find(r => String(r.subject_id) === String(sub.id)) || {};
      const ca   = r.test  ?? null;
      const exam = r.exam  ?? null;
      const score = ca !== null && exam !== null ? ca + exam : null;
      return { ...sub, ca, exam, score };
    });
}
```

### SessionSummaryCards — T1/T2/T3 + session avg
```jsx
function SessionSummaryCards({ data, subjects }) {
  const avgs = [1, 2, 3].map(t => {
    const scores = scoresForTerm(data, t, subjects).map(s => s.score).filter(v => v !== null);
    return scores.length ? Math.round(scores.reduce((a,b) => a+b,0) / scores.length) : null;
  });
  const sessionAvg = avgs.filter(Boolean).length
    ? Math.round(avgs.filter(Boolean).reduce((a,b)=>a+b,0) / avgs.filter(Boolean).length)
    : null;
  return (
    <div className="stat-row">
      {[1,2,3].map((t,i) => (
        <div key={t} className="stat-card">
          <small>Term {t}</small>
          <strong>{avgs[i] !== null ? avgs[i]+'%' : '—'}</strong>
        </div>
      ))}
      <div className="stat-card">
        <small>Session Avg</small>
        <strong>{sessionAvg !== null ? sessionAvg+'%' : '—'}</strong>
      </div>
    </div>
  );
}
```

### ScoreTable — adapts for T3
Same CA/Exam/Total/Grade columns for T1 and T2. T3 adds T2 Total, T1 Total, 3-Term Avg columns — identical to the current session T3 logic already in `StudentReportDrawer`.

### AttendanceSummary
```jsx
function AttendanceSummary({ data }) {
  return (
    <div className="panel mt16">
      <p className="panel-label">Attendance</p>
      <div className="stat-row">
        {[1,2,3].map(t => {
          const weeks = data.attendanceByTerm[t] || {};
          const days  = Object.values(weeks).map(Number);
          const pct   = days.length
            ? Math.round(days.reduce((a,b)=>a+b,0) / (days.length * 5) * 100) : null;
          return (
            <div key={t} className="stat-card">
              <small>Term {t}</small>
              <strong>{pct !== null ? pct+'%' : '—'}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### GrowthSnapshot — badges + XP for that session
Growth data (artifacts, commendations) is already in the current cache and is cross-session — `Growth.badges(sid)` and `Growth.studentXp(sid)` work off all-time records. For a past session snapshot, show:
- Verified artifacts submitted during that session (filter `artifact.sessionId === sessionId`)
- Commendations earned during that session (filter by `commendation.createdAt` within the session's term dates)
- The promotion outcome for that session from `Data.promotionsFor(sid)` filtered by session

```jsx
function GrowthSnapshot({ studentId, sessionId, sessionTermDates }) {
  const { Growth, Data } = window; // already on window from data.js
  const arts = (Data.artifacts() || [])
    .filter(a => String(a.studentId) === String(studentId)
               && String(a.sessionId) === String(sessionId)
               && a.status === 'verified');
  const comms = (Data.commendations() || [])
    .filter(c => String(c.studentId) === String(studentId)
              && isWithinSession(c.createdAt, sessionTermDates));
  const promotion = (Data.promotionsFor(studentId) || [])
    .find(p => String(p.sessionId) === String(sessionId));
  // ... render badges, artifact count, promotion outcome
}
```

---

## `StudentResults.jsx` — migrating `renderStudentResults`

Replaces the vanilla JS `renderStudentResults()` function. Mount point in `index.html`: `<div id="react-student-results">`.

```jsx
export default function StudentResults() {
  const currentUser = getCurrentUser();
  const sid = currentUser?.studentId;
  const [selectedSessionId, setSelectedSessionId] = useState(null); // null = current
  const { term, setTerm, ... } = useCurrentSessionResults(sid);     // extracted from existing logic

  if (selectedSessionId) {
    return (
      <>
        <SessionSelector studentId={sid} ... onSelect={setSelectedSessionId} />
        <PreviousSessionPanel studentId={sid} sessionId={selectedSessionId} ... />
      </>
    );
  }

  // Current session — existing table logic moved here from student.js
  return (
    <>
      <SessionSelector studentId={sid} ... onSelect={setSelectedSessionId} />
      <CurrentSessionResults sid={sid} />
    </>
  );
}
```

`renderStudentResults` in `student.js` becomes a one-liner React mount, same pattern as `renderClassAttendance`.

---

## Changes to `StudentReportDrawer.jsx`

Add `selectedSessionId` state. When non-null, render `<PreviousSessionPanel>` instead of the current score rows:

```jsx
const [selectedSessionId, setSelectedSessionId] = useState(null);

// In JSX, above the eyebrow:
<SessionSelector
  studentId={studentId}
  currentSessionName={Data.session().name}
  onSelect={setSelectedSessionId}
  selectedSessionId={selectedSessionId}
/>

{selectedSessionId ? (
  <PreviousSessionPanel
    studentId={studentId}
    sessionId={selectedSessionId}
    sessionName={...}
    subjects={Data.subjects()}
  />
) : (
  /* existing current-session content unchanged */
)}
```

---

## `src/auth.js` — logout hook

```js
// In logout(), after clearing currentUser:
import { clearPrevSessionCache } from './data/prevSessionCache.js';
clearPrevSessionCache();
```

---

## `index.html` changes

```html
<!-- Replace #view-student-results inner HTML -->
<div class="page-wrap" id="view-student-results" data-role="Student" hidden>
  <div id="react-student-results"></div>
</div>
```

Remove static `<thead>` and `<tbody id="std-results-table">` — React owns this view now.

---

## `src/router.js` / `src/views/student.js`

```js
// student.js
import { mount } from '../react/mount.js';
import StudentResults from '../react/components/StudentResults.jsx';
export function renderStudentResults() {
  mount(document.getElementById('react-student-results'), StudentResults);
}
```

Remove the dynamic `draw()` / `termSel.onchange` logic from `student.js` — it moves into `StudentResults.jsx`.

---

## Supabase RLS note

`grades`, `terms`, `attendance_weekly`, and `sessions` all have `anon_all` policies, so the lazy queries will succeed under the current open-policy setup. When RLS is tightened (the roadmap security phase), the past-session queries will need the same per-role policies applied to current-session queries.

---

## CSS additions needed

| Class | Rule |
|-------|------|
| `.session-selector-wrap` | `margin-bottom: 12px` wrapper above the eyebrow |
| `.prev-session-label` | `font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .5px` |
| `.session-summary-row` | flex row of 4 stat cards, gap 8px |
| `.term-tabs` | horizontal pill tabs for T1/T2/T3, same style as existing `.tab-btn` |

---

## Implementation order

1. `src/data/prevSessionCache.js` — data layer (no UI dependencies)
2. `SessionSelector.jsx` — thin component, no data except `getSessionsWithData`
3. `PreviousSessionPanel.jsx` — full panel (depends on 1 + 2)
4. Wire `SessionSelector` + `PreviousSessionPanel` into `StudentReportDrawer.jsx`
5. `StudentResults.jsx` + migrate `renderStudentResults` + update `index.html`
6. CSS additions
7. Wire `clearPrevSessionCache` into logout
