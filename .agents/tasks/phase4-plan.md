# Phase 4 — React Migration Plan
## Happy Man Academy SPA

---

## Pre-flight findings (from code read)

### Auth persistence key
`src/auth.js` → `login()` and `logout()` call `DB.set('currentUser', { email: user.email })`.
`DB` is the Supabase/localStorage abstraction exported from `src/data/index.js`.
The in-memory pointer is `_currentUser` in `src/state.js` managed by `getCurrentUser()` / `setCurrentUser()`.
**AppContext.jsx must call `getCurrentUser()` from `src/state.js` — it does NOT read localStorage/sessionStorage directly; that is DB's concern. The context just wraps the in-memory value and exposes a `refresh()` that re-calls `getCurrentUser()`.**

### report-drawer HTML structure (current index.html lines ~1364–1382)
The outer shell already exists in index.html as:
```html
<div class="report-drawer" id="report-drawer" aria-hidden="true">
  <div class="drawer-backdrop" data-close-drawer></div>
  <aside class="drawer">
    <button class="close-drawer" data-close-drawer>×</button>
    <!-- inner fields: drawer-eyebrow, drawer-name, drawer-meta,
         drawer-score, drawer-status, drawer-attendance,
         drawer-subjects, drawer-mentor-chip,
         drawer-download-btn, drawer-pdf-btn -->
  </aside>
</div>
```
`openStudentReport()` in `src/views/reports.js` does NOT innerHTML the drawer — it imperatively sets **individual element** textContent/innerHTML/onclick on elements already in the DOM. There is no monolithic HTML block to replace. The React component must replicate these element roles as JSX, rendering into a `<div id="react-report-drawer">` placed inside `<aside class="drawer">`.

### view-class-attendance Alpine x-data
Lines ~762-780 of index.html: the `.att-daily-bar` div has `x-data="{ week: '1', day: '0' }"` and the `<select id="ct-day-week">` has `x-model="week"`, `<select id="ct-day-of-week">` has `x-model="day"`. These Alpine bindings are PURELY cosmetic — `renderClassAttendance()` immediately overwrites their `.value` with `1` / `0` and uses `.onchange` handlers, so Alpine just provides initial value display. The React component will own week/day state entirely; the x-data block must be removed.

### view-admin-progression static HTML retained by JS
`renderAdminProgression()` does NOT innerHTML the whole view; it calls six sub-functions that each target specific child element IDs (`pr-decisions-table`, `pr-pool-table`, `pr-publish-form`, `pr-approvals-list`, `pr-positions-table`). The page-level structure (panels, headings, `pr-dryrun-btn`, `pr-commit-btn`, `pr-close-pool-btn`, `pr-pos-term`) is all static HTML. The React component must replicate this entire panel structure in JSX, replacing all static HTML inside `#view-admin-progression`.

### bindProgressionModals() scope
`bindProgressionModals()` binds:
1. `pl-save-btn` → `runPlacement()` — this is the pool placement modal button inside index.html
2. `sc-confirm-btn` → password confirm logic for sensitive actions

Both modals (`place-student-modal`, `sensitive-confirm-modal`) live in index.html as Alpine-powered modals. When `AdminProgression.jsx` replaces `renderAdminProgression()`, it must:
- Call `openModal('place-student-modal')` / `openModal('sensitive-confirm-modal')` via Alpine for these two existing modals (they keep their HTML/Alpine binding)
- `bindProgressionModals()` becomes a no-op because the React component wires its own `pl-save-btn` click via `useEffect(() => { ... }, [])` on mount — OR the component calls `runPlacement()` / the sc handler directly from React event handlers that target the vanilla modal DOM elements

### QuizManager teacher-side structure
`#view-teacher-quizzes` (index.html line 959) has these static elements:
- `#qz-pick` (select in welcome-row)
- panel: `#qz-title`, `#qz-desc`, `#qz-create` button, `#qz-msg`
- panel: `#qz-count`, `#qz-list`
- `#qz-detail` (detail slot)

`renderTeacherQuizzes()` + `renderQuizList()` + `openQuizEditor()` + `openQuizResults()` all write into these ids.
The React component owns all of them. `qz-pick` maps to a controlled `<select>` with combo state.

### QuizTaker student-side structure
`#view-student-quizzes` (index.html line 1217) has:
- panel: `#sq-list`
- `#sq-body` (detail slot for quiz form or result)

`openQuizTaker()` and `openStudentQuizResult()` both write into `#sq-body`.

### view-class-overview structure
`renderClassOverview()` targets: `ct-eyebrow`, `ct-welcome`, `ct-stat-*` (6 stats), `ct-student-table`, `ct-support-count`, `ct-support-list`, `ct-add-feedback-btn`, `ct-open-register-btn`, `ct-full-report-btn`, `ct-approval-count`, `ct-approvals-list`. The view page already has these IDs as static HTML scaffolding. The React component replaces all inner content.

---

## Implementation Plan

- [ ] 1. **Install React dependencies and update Vite config**

   Add React packages to package.json and update vite.config.js to include the React plugin and a `react-vendor` chunk.

   **Exact changes:**

   `package.json` — add to `"dependencies"`:
   ```json
   "react": "18.3.1",
   "react-dom": "18.3.1"
   ```
   Add to `"devDependencies"`:
   ```json
   "@vitejs/plugin-react": "4.3.4"
   ```

   `vite.config.js` — update to:
   ```js
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';

   export default defineConfig({
     root: '.',
     plugins: [react()],
     build: {
       outDir: 'dist',
       assetsDir: 'assets',
       sourcemap: true,
       rollupOptions: {
         output: {
           manualChunks: {
             'react-vendor': ['react', 'react-dom'],
             'supabase':     ['@supabase/supabase-js'],
             'data-layer':   ['./data.js'],
           }
         }
       }
     },
     server: { port: 8000, open: true }
   });
   ```

   `wrangler.toml` — update to:
   ```toml
   name = "happyman-academy"
   pages_build_output_dir = "dist"
   ```
   (The current value is `"."` which points at the source root. The Vite build writes to `dist/`.)

   Run: `npm install`

   Files: `package.json`, `vite.config.js`, `wrangler.toml`

   Verify: `npm run build` — build completes with no errors; `dist/` contains `index.html` and chunked JS files including a `react-vendor` chunk.

---

- [ ] 2. **Create AppContext and mount helper**

   Create `src/context/AppContext.jsx` and `src/react/mount.js`.

   **AppContext.jsx** — wraps the app's in-memory current user:
   ```jsx
   // src/context/AppContext.jsx
   import { createContext, useContext, useState, useCallback } from 'react';
   import { getCurrentUser } from '../state.js';

   const AppContext = createContext(null);

   export function AppProvider({ children }) {
     // currentUser lives in state.js (_currentUser module var).
     // We snapshot it at mount time; consumers call refresh()
     // after login/logout to re-read it.
     const [user, setUser] = useState(() => getCurrentUser());
     const refresh = useCallback(() => setUser(getCurrentUser()), []);
     return (
       <AppContext.Provider value={{ user, refresh }}>
         {children}
       </AppContext.Provider>
     );
   }

   export function useApp() {
     const ctx = useContext(AppContext);
     if (!ctx) throw new Error('useApp must be used inside AppProvider');
     return ctx;
   }
   ```

   **src/react/mount.js** — idempotent createRoot wrapper:
   ```js
   // src/react/mount.js
   import { createRoot } from 'react-dom/client';
   import { AppProvider } from '../context/AppContext.jsx';
   import { createElement } from 'react';

   const roots = new Map();

   /**
    * Mount a React component into a DOM element.
    * Calling mount() again on the same containerId re-renders
    * (updates props) without creating a second root.
    *
    * @param {string} containerId  - id of the mount-point div
    * @param {Function} Component  - React component to render
    * @param {object} props        - props to pass
    */
   export function mount(containerId, Component, props = {}) {
     const container = document.getElementById(containerId);
     if (!container) {
       console.warn(`[HMA] mount: #${containerId} not found`);
       return;
     }
     if (!roots.has(containerId)) {
       roots.set(containerId, createRoot(container));
     }
     roots.get(containerId).render(
       createElement(AppProvider, null,
         createElement(Component, props)
       )
     );
   }

   export function unmount(containerId) {
     if (roots.has(containerId)) {
       roots.get(containerId).unmount();
       roots.delete(containerId);
     }
   }
   ```

   Files: `src/context/AppContext.jsx`, `src/react/mount.js`

   Verify: `npm run build` — no TypeScript/JSX compile errors; build succeeds.

---

- [ ] 3. **STEP 2 — StudentReportDrawer**

   This is the highest-priority React component. `openStudentReport()` currently imperatively sets textContent/innerHTML/onclick on ~12 individual DOM elements inside the drawer `<aside>`. The React component will own all of that content.

   **3a. Modify `index.html` `#report-drawer`**

   Inside the `<aside class="drawer">` block, remove all the individual inner elements (eyebrow, name, meta, score, status, attendance, subjects, mentor-chip, download-btn, pdf-btn) and replace with a single mount point. Keep the outer shell untouched:

   ```html
   <div class="report-drawer" id="report-drawer" aria-hidden="true">
     <div class="drawer-backdrop" data-close-drawer></div>
     <aside class="drawer">
       <button class="close-drawer" data-close-drawer aria-label="Close">&times;</button>
       <!-- React owns everything below this line -->
       <div id="react-report-drawer"></div>
     </aside>
   </div>
   ```

   Remove these elements from inside `<aside>`:
   - `<p class="eyebrow" id="drawer-eyebrow">`
   - `<h2 id="drawer-name">`
   - `<p class="drawer-meta" id="drawer-meta">`
   - `.report-score` div (contains `drawer-score`, `drawer-status`)
   - `<p class="formula">` (contains `drawer-attendance`)
   - `<div class="report-subjects" id="drawer-subjects">`
   - `<div id="drawer-mentor-chip">`
   - The `.form-row` containing `drawer-download-btn` and `drawer-pdf-btn`

   **3b. Create `src/react/components/StudentReportDrawer.jsx`**

   This component replicates all the HTML that `openStudentReport()` was writing. It receives `studentId` and `termOverride` as props and calls `openDrawer()` itself on mount.

   Key design notes from source reading:
   - Two render paths: *locked* (isConsumer && !published) vs *full*
   - Locked path: shows `—` score, `Locked` badge, locked note in subjects, disables buttons
   - Full path: subjects list from `Academic.termScores()`, mentor chip, download/PDF buttons wired
   - `isConsumerView` affects whether promotion status shows (only if `allTermsPublished`)
   - History chips from `Data.promotionsFor(studentId)`
   - Archive chip if `s.status === 'archived'`
   - Download button calls `downloadXlsx(...)` exactly as in the original
   - PDF button calls `printReportPdf()`
   - After first render, calls `openDrawer()` from `src/router.js`

   ```jsx
   // src/react/components/StudentReportDrawer.jsx
   import { useEffect } from 'react';
   import { Data, Academic } from '../../data/index.js';
   import { getCurrentUser } from '../../state.js';
   import {
     esc, toneClass, formatDate, gradeLabel, statusClass,
     currentTerm, passMark, downloadXlsx, printReportPdf
   } from '../../utils.js';
   import { openDrawer } from '../../router.js';

   export default function StudentReportDrawer({ studentId, termOverride = null }) {
     const currentUser = getCurrentUser();
     const s = Data.student(studentId);
     if (!s) return null;

     const term   = termOverride || currentTerm();
     const cl     = Data.cls(s.classId);
     const avg    = Academic.termAverage(studentId, term);
     const status = Academic.promotionStatus(studentId, term);
     const mentor = Data.mentor(s.mentorId);

     const isConsumer = currentUser && (currentUser.role === 'Student' || currentUser.role === 'Parent');
     const locked     = isConsumer && !Data.published(term);
     const isConsumerView = !!isConsumer;
     const allTermsPublished = [1, 2, 3].every(t => Data.published(t));
     const showStatus = !isConsumerView || allTermsPublished;

     useEffect(() => { openDrawer(); }, [studentId, term]);

     if (locked) {
       const termName = Data.session().terms.find(t => t.term === Number(term))?.name || `Term ${term}`;
       return (
         <div className="drawer-content">
           <p className="eyebrow">{`Term ${term} report · ${Data.session().name}`}</p>
           <h2>{s.name}</h2>
           <p className="drawer-meta">{`${cl?.name || '—'} · ${esc(s.admissionNo || '—')}`}</p>
           <div className="report-score">
             <div><span>Overall score</span><strong>—</strong></div>
             <span className="promotion-badge review">Locked</span>
           </div>
           <p className="formula">
             Score = CA (40) + Exam (60) · Attendance <strong>{Academic.attendancePct(studentId, term)}</strong>
           </p>
           <div className="report-subjects">
             <div className="subject-row">
               <div>
                 <span className="status review">Locked</span>
                 &nbsp;{termName} results have not been released yet — check back after the school publishes them.
               </div>
             </div>
           </div>
           {mentor && <MentorChip mentor={mentor} />}
           <div className="form-row tight mt16" style={{ alignItems: 'stretch' }}>
             <button className="btn-primary" disabled style={{ margin: 0 }}>Download report ↓</button>
             <button className="outline-button" disabled style={{ margin: 0 }}>Print / PDF ↗</button>
           </div>
         </div>
       );
     }

     const history = Data.promotionsFor(studentId);
     const scores  = Academic.termScores(studentId, term);

     const handleDownload = () => {
       const rows = [['Student', s.name], ['Class', cl?.name || ''], ['Term', term],
                     ['Average', avg], ['Status', status], [],
                     ['Subject', 'CA (40)', 'Exam (60)', 'Total', 'Grade']];
       scores.forEach(sc => {
         rows.push([sc.name, sc.ca ?? '', sc.exam ?? '', sc.score ?? '',
                    sc.score !== null ? gradeLabel(sc.score) : '']);
       });
       downloadXlsx(`report_${s.name.replace(/\s+/g, '_')}_term${term}.xlsx`, rows, `Term ${term}`);
     };

     return (
       <div className="drawer-content">
         <p className="eyebrow">{`Term ${term} report · ${Data.session().name}`}</p>
         <h2>{s.name}</h2>
         <p className="drawer-meta">{`${cl?.name || '—'} · ${s.admissionNo || '—'}`}</p>
         <div className="report-score">
           <div><span>Overall score</span><strong>{avg}%</strong></div>
           <span className={`promotion-badge ${showStatus ? statusClass(status) : 'review'}`}>
             {showStatus ? status : '—'}
           </span>
         </div>
         <p className="formula">
           Score = CA (40) + Exam (60) · Attendance <strong>{Academic.attendancePct(studentId, term)}</strong>
         </p>
         <div className="report-subjects">
           {s.status === 'archived' && (
             <div className="subject-row">
               <div>
                 <span className="status repeat">Archived</span>
                 <small>This student cannot sign in; every previous record is kept in the database.</small>
               </div>
             </div>
           )}
           {history.length > 0 && (
             <div className="subject-row">
               <div>
                 <span>Previous sessions</span>
                 <small>
                   {history.map(h =>
                     `${h.outcome}${h.avg != null ? ' · avg ' + h.avg + '%' : ''}`
                   ).join(' → ')}
                 </small>
               </div>
             </div>
           )}
           {scores.map(sc => {
             const pass = (sc.score ?? 0) >= passMark();
             return (
               <div className="subject-row" key={sc.subjectId || sc.name}>
                 <div>
                   <span>{sc.name}</span>
                   <small>{sc.type === 'core' ? 'Core' : 'Elective'} · CA {sc.ca ?? '—'} + Exam {sc.exam ?? '—'}</small>
                 </div>
                 <b className={pass ? '' : 'text-danger'}>{sc.score ?? '—'}</b>
               </div>
             );
           })}
         </div>
         {mentor && <MentorChip mentor={mentor} />}
         <div className="form-row tight mt16" style={{ alignItems: 'stretch' }}>
           <button className="btn-primary" onClick={handleDownload} style={{ margin: 0 }}>Download report ↓</button>
           <button className="outline-button" onClick={printReportPdf} style={{ margin: 0 }}>Print / PDF ↗</button>
         </div>
       </div>
     );
   }

   function MentorChip({ mentor }) {
     return (
       <div className="drawer-mentor-chip mt16">
         <span className="chip-label">Mentor</span>
         <span className={`student-avatar ${toneClass(mentor.tone)}`}
               style={{ width: 22, height: 22, fontSize: 9 }}>
           {mentor.initials}
         </span>
         <span>
           {mentor.name} · {mentor.subject || 'Mentor'}
           {mentor.phone ? ` · ${mentor.phone}` : ''}
         </span>
       </div>
     );
   }
   ```

   **3c. Replace `openStudentReport()` body in `src/views/reports.js`**

   Keep the exact function signature `openStudentReport(studentId, termOverride = null)`. Replace the body with a React mount:

   ```js
   import { mount } from '../react/mount.js';
   import StudentReportDrawer from '../react/components/StudentReportDrawer.jsx';

   export function openStudentReport(studentId, termOverride = null) {
     const s = Data.student(studentId);
     if (!s) return;
     mount('react-report-drawer', StudentReportDrawer, { studentId, termOverride });
     // openDrawer() is called by the component's useEffect
   }
   ```

   Remove all the old imperative DOM-manipulation lines. Keep the `_resultsLockedNote` helper only if needed elsewhere; otherwise remove it (it is now inlined in the component).

   Files: `index.html`, `src/react/components/StudentReportDrawer.jsx`, `src/views/reports.js`

   Verify: `npm run build` — build succeeds. Manual test: log in as admin, click a student's "Open full report" → drawer opens with student data rendered by React (check DevTools: `#react-report-drawer` contains React-rendered DOM).

---

- [ ] 4. **STEP 3 — ClassAttendance**

   **4a. Modify `index.html` `#view-class-attendance`**

   The view currently has a rich static HTML structure (stat-grid, daily register panel, weekly summary panel) with many element IDs that `renderClassAttendance()` writes into. Replace ALL inner HTML of `#view-class-attendance` with a single mount point:

   ```html
   <div class="page-wrap" id="view-class-attendance" data-role="Class Teacher" hidden>
     <div id="react-class-attendance"></div>
   </div>
   ```

   Remove the entire block from `<section class="welcome-row role-welcome">` down to the closing `</div>` before `</div><!-- /view-class-attendance -->`. Also remove the `x-data="{ week: '1', day: '0' }"` Alpine block (the `.att-daily-bar` div) — it is inside the section being removed, so this happens automatically.

   **4b. Create `src/react/components/ClassAttendance.jsx`**

   State owned by the component:
   - `week` (1–4, default 1) — selected week
   - `day` (0–4, default 0) — selected day-of-week index
   - `draft` — object keyed by studentId → week → day[5] mirroring the vanilla `draft` structure
   - `v` — version counter `useState(0)` for re-render after async save

   The component replicates:
   - `ATT_DAYS`, `ATT_DAYS_FULL` constants
   - `refreshStats()` → derived from current state, returns stat values
   - `drawDay()` → renders the daily register tbody from draft
   - `drawWeekly()` → renders the weekly summary tbody from Data
   - `termHeatmap(sid)` → returns heatmap cell JSX
   - `ct-all-present` / `ct-all-absent` set all draft cells for current week/day
   - `ct-save-day` calls `Data.saveDailyDay()` then `setV(v => v+1)`
   - State toggle on att-state-btn click: `draft[sid][w][d] === status ? '' : status`

   The welcome-row, stat cards, panels, and table structure are all rendered as JSX matching the exact class names from the original HTML.

   Focus logic: if `focusSid` prop is set, add `att-focused` class to that student's row.

   ```jsx
   // src/react/components/ClassAttendance.jsx
   import { useState, useEffect } from 'react';
   import { Data, Academic } from '../../data/index.js';
   import { getCurrentUser } from '../../state.js';
   import { esc, toneClass, currentTerm, toast } from '../../utils.js';
   import { myClassRecord } from '../../auth.js';
   import { openClassReportModal } from '../shared.js';  // keep existing vanilla fn

   const ATT_DAYS      = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
   const ATT_DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

   export default function ClassAttendance({ focusSid = null }) {
     const currentUser = getCurrentUser();
     const cl = myClassRecord(currentUser);
     if (!cl) return <p className="muted-cell" style={{ padding: 16 }}>You are not assigned a class yet.</p>;

     const students = Data.studentsByClass(cl.id).filter(s => s.status !== 'archived');
     const term     = currentTerm();

     // Build initial draft from saved daily attendance
     const buildDraft = () => {
       const daily = Data.dailyAttendance(term);
       const d = {};
       const normDay = arr => Array.from({ length: 5 }, (_, i) => (arr && arr[i]) || '');
       students.forEach(s => {
         d[s.id] = {};
         [1, 2, 3, 4].forEach(w => {
           d[s.id][w] = normDay(daily[`W${w}`]?.[String(s.id)]);
         });
       });
       return d;
     };

     const [week, setWeek] = useState(1);
     const [day,  setDay]  = useState(0);
     const [draft, setDraft] = useState(buildDraft);
     const [v, setV] = useState(0);  // re-render version after saves

     const isPresent = st => st === 'present' || st === 'late';

     const pcts      = students.map(s => parseInt(Academic.attendancePct(s.id, term), 10) || 0);
     const avgAtt    = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
     const atRisk    = pcts.filter(p => p < 75).length;
     const presentToday = students.filter(s => isPresent(draft[s.id]?.[week]?.[day])).length;
     const lateThisWeek = students.reduce((n, s) =>
       n + (draft[s.id]?.[week] || []).filter(st => st === 'late').length, 0);

     const toggleStatus = (sid, status) => {
       setDraft(prev => {
         const next = { ...prev, [sid]: { ...prev[sid], [week]: [...(prev[sid]?.[week] || Array(5).fill(''))] } };
         next[sid][week] = [...next[sid][week]];
         next[sid][week][day] = next[sid][week][day] === status ? '' : status;
         return next;
       });
     };

     const setAll = status => {
       setDraft(prev => {
         const next = { ...prev };
         students.forEach(s => {
           next[s.id] = { ...next[s.id], [week]: [...(next[s.id]?.[week] || Array(5).fill(''))] };
           next[s.id][week] = Array.from({ length: 5 }, (_, i) => i === day ? status : (next[s.id][week][i] || ''));
         });
         return next;
       });
     };

     const saveDay = async () => {
       const marks = {};
       students.forEach(s => { marks[s.id] = draft[s.id]?.[week]?.[day] || 'absent'; });
       await Data.saveDailyDay(week, day, marks, term);
       toast(`Register saved · ${ATT_DAYS_FULL[day]}, Week ${week}.`);
       setV(prev => prev + 1);  // re-render the weekly summary from fresh Data
     };

     const present  = students.filter(s => isPresent(draft[s.id]?.[week]?.[day])).length;
     const late     = students.filter(s => draft[s.id]?.[week]?.[day] === 'late').length;
     const absent   = students.filter(s => draft[s.id]?.[week]?.[day] === 'absent').length;
     const unmarked = students.length - present - absent;
     const countStr = `${present} present${late ? ` (${late} late)` : ''} · ${absent} absent` +
                      (unmarked ? ` · ${unmarked} not marked` : '');

     // Heatmap for a student (reads from draft for in-progress edits)
     const termHeatmap = sid =>
       [1, 2, 3, 4].map(w => (
         <span className="att-week-group" title={`Week ${w}`} key={w}>
           {ATT_DAYS.map((d, di) => {
             const st = draft[sid]?.[w]?.[di] || '';
             const cls = st === 'present' ? 'present' : st === 'late' ? 'late' : st === 'absent' ? 'absent' : 'off';
             return <span className={`att-day ${cls}`} title={`W${w} ${d}: ${st || 'not marked'}`} key={di}>{d[0]}</span>;
           })}
         </span>
       ));

     return (
       <>
         {/* Welcome row */}
         <section className="welcome-row role-welcome">
           <div>
             <p className="eyebrow">Attendance register</p>
             <h1>{cl.name} · Attendance</h1>
             <p className="subcopy">Take the daily register Mon–Fri, track late arrivals, and see the term overview at a glance.</p>
           </div>
           <div className="form-row tight">
             <button className="btn-primary" onClick={saveDay}>Save day ↑</button>
           </div>
         </section>

         {/* Stat cards */}
         <section className="stat-grid" aria-label="Attendance summary">
           <article className="stat-card accent-green">
             <div className="stat-top"><span className="stat-label">Class attendance</span><span className="stat-icon">%</span></div>
             <strong>{avgAtt}%</strong>
             <div className="stat-trend neutral">{avgAtt >= 90 ? 'Excellent' : avgAtt >= 75 ? 'Good' : 'Needs attention'}</div>
           </article>
           <article className="stat-card accent-blue">
             <div className="stat-top"><span className="stat-label">Present today</span><span className="stat-icon">✓</span></div>
             <strong>{presentToday}/{students.length}</strong>
             <div className="stat-trend neutral">{ATT_DAYS_FULL[day]}, Week {week}</div>
           </article>
           <article className="stat-card accent-yellow">
             <div className="stat-top"><span className="stat-label">Late arrivals</span><span className="stat-icon">⏱</span></div>
             <strong>{lateThisWeek}</strong>
             <div className="stat-trend neutral">This week</div>
           </article>
           <article className="stat-card accent-coral">
             <div className="stat-top"><span className="stat-label">At risk</span><span className="stat-icon">!</span></div>
             <strong>{atRisk}</strong>
             <div className="stat-trend neutral">Below 75% attendance</div>
           </article>
         </section>

         {/* Daily register panel */}
         <div className="panel mt16">
           <div className="panel-heading">
             <div>
               <p className="eyebrow">Daily register</p>
               <h2>{ATT_DAYS_FULL[day]}, Week {week}</h2>
             </div>
             <span className="att-day-count">{countStr}</span>
           </div>
           <div className="att-daily-bar mt16">
             <label>Week
               <select value={week} onChange={e => setWeek(Number(e.target.value))}>
                 {[1,2,3,4].map(w => <option key={w} value={w}>Week {w}</option>)}
               </select>
             </label>
             <label>Day
               <select value={day} onChange={e => setDay(Number(e.target.value))}>
                 {ATT_DAYS_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
               </select>
             </label>
             <span className="att-daily-actions">
               <button type="button" className="btn-sm-save" onClick={() => setAll('present')}>✓ All present</button>
               <button type="button" className="btn-sm-save att-all-absent-btn" onClick={() => setAll('absent')}>✗ All absent</button>
             </span>
           </div>
           <div className="table-wrap mt16">
             <table className="att-register-table">
               <thead>
                 <tr>
                   <th>Student</th>
                   <th className="att-status-col">Status</th>
                   <th className="att-term-col">Term record <span className="muted-cell" style={{ fontWeight: 400, fontSize: 10 }}>Mon · Tue · Wed · Thu · Fri per week</span></th>
                 </tr>
               </thead>
               <tbody>
                 {students.map(s => {
                   const st  = draft[s.id]?.[week]?.[day] || '';
                   const pct = Academic.attendancePct(s.id, term);
                   const pctNum = parseInt(pct, 10);
                   return (
                     <tr key={s.id} className={s.id === focusSid ? 'att-focused' : ''}>
                       <td>
                         <div className="student">
                           <span className={`student-avatar ${toneClass(s.tone)}`}>{s.initials}</span>
                           <span>{s.name}</span>
                         </div>
                         <small className="muted-cell" style={{ paddingLeft: 32, display: 'block', marginTop: 2 }}>
                           <span className={`status ${pctNum >= 90 ? 'promoted' : pctNum >= 75 ? 'review' : 'repeat'}`}
                                 style={{ fontSize: 9 }}>{pct}</span>
                         </small>
                       </td>
                       <td className="att-status-cell">
                         <div className="att-3state">
                           {['present','late','absent'].map(status => (
                             <button key={status}
                               className={`att-state-btn ${st === status ? `active-${status}` : ''}`}
                               onClick={() => toggleStatus(s.id, status)}>
                               {status === 'present' ? '✓ Present' : status === 'late' ? '⏱ Late' : '✗ Absent'}
                             </button>
                           ))}
                         </div>
                       </td>
                       <td className="att-term-col">
                         <div className="att-heatmap">{termHeatmap(s.id)}</div>
                       </td>
                     </tr>
                   );
                 })}
               </tbody>
             </table>
           </div>
         </div>

         {/* Weekly rollup panel — reads fresh Data after each save (v dependency) */}
         <WeeklySummary students={students} cl={cl} term={term} focusSid={focusSid} v={v} />
       </>
     );
   }

   function WeeklySummary({ students, cl, term, focusSid, v: _v }) {
     return (
       <div className="panel mt16">
         <div className="panel-heading">
           <div><p className="eyebrow">{cl.name} · Term {term}</p><h2>Weekly summary</h2></div>
         </div>
         <div className="table-wrap mt16">
           <table>
             <thead>
               <tr>
                 <th>Student</th>
                 {['W1','W2','W3','W4'].map(w => <th key={w}>{w} <span className="muted-cell" style={{ fontSize: 10, fontWeight: 400 }}>/5</span></th>)}
                 <th>Total</th><th>Rate</th>
               </tr>
             </thead>
             <tbody>
               {students.map(s => {
                 const saved  = Data.studentAttendance(s.id, term);
                 const total  = Object.values(saved).reduce((a, b) => a + b, 0);
                 const pct    = Academic.attendancePct(s.id, term);
                 const pctNum = parseInt(pct, 10) || 0;
                 return (
                   <tr key={s.id} className={s.id === focusSid ? 'att-focused' : ''}>
                     <td>
                       <div className="student">
                         <span className={`student-avatar ${toneClass(s.tone)}`}>{s.initials}</span>
                         {s.name}
                       </div>
                     </td>
                     {['W1','W2','W3','W4'].map(wk =>
                       <td key={wk} className="muted-cell" style={{ textAlign: 'center' }}>{saved[wk] ?? '—'}</td>
                     )}
                     <td style={{ textAlign: 'center' }}><strong>{total}</strong></td>
                     <td><span className={`status ${pctNum >= 90 ? 'promoted' : pctNum >= 75 ? 'review' : 'repeat'}`}>{pct}</span></td>
                   </tr>
                 );
               })}
             </tbody>
           </table>
         </div>
       </div>
     );
   }
   ```

   **4c. Replace `renderClassAttendance()` in `src/views/teacher.js`**

   ```js
   import { mount } from '../react/mount.js';
   import ClassAttendance from '../react/components/ClassAttendance.jsx';

   export function renderClassAttendance(focusSid = null) {
     mount('react-class-attendance', ClassAttendance, { focusSid });
   }
   ```

   All the vanilla attendance code (`ATT_DAYS`, `ATT_DAYS_FULL`, `renderClassAttendance`, helper functions) is removed from teacher.js and lives in the component.

   Files: `index.html`, `src/react/components/ClassAttendance.jsx`, `src/views/teacher.js`

   Verify: `npm run build`. Manual test: log in as a class teacher → navigate to Attendance → daily register renders with working week/day selects; toggle buttons update state; Save day writes to data layer; stat cards update.

---

- [ ] 5. **STEP 4 — AdminProgression**

   **5a. Modify `index.html` `#view-admin-progression`**

   Replace the entire inner HTML of `#view-admin-progression` with a single mount point. Keep the outer `<div class="page-wrap" id="view-admin-progression" ...>` unchanged:

   ```html
   <div class="page-wrap" id="view-admin-progression" data-role="Administrator" hidden>
     <div id="react-admin-progression"></div>
   </div>
   ```

   Remove: the `<section class="welcome-row">` with Dry run/Commit buttons, all `.panel` blocks (decisions, pool, setup-grid, positions, approvals, day structure).

   **Important gotcha:** `place-student-modal` and `sensitive-confirm-modal` in index.html are Alpine-managed modals used by the vanilla progression flow. Keep them in index.html — the React component calls `openModal('place-student-modal')` and `openModal('sensitive-confirm-modal')` to trigger them, then their submit buttons (`pl-save-btn`, `sc-confirm-btn`) are wired in a `useEffect` on mount. The `sc-confirm-btn` runs the queued `sensitiveRun` from `src/state.js`.

   **5b. Create `src/react/components/AdminProgression.jsx`**

   Sub-components:
   - `ProgressionDecisions` — renders the decision table, override buttons, dry-run summary badge
   - `ProgressionPool` — pool entrants table + Close pool button
   - `PublishPanel` — term publish toggles (coverage % inline)
   - `PositionsPanel` — term select + positions table (async: `Progression.positions(term)` returns a Promise → use local state)
   - `ApprovalsPanel` — pending approvals list
   - `DayStructurePanel` — day structure form (replaces `initDayStructureForm()`)

   All sub-components receive a `refresh` prop (callback that increments a parent version counter) so writes trigger a re-render.

   The component keeps `_prRows` in local state (in addition to `state.js`) for the Commit action.

   **SensitiveConfirmModal integration** — `askSensitiveConfirm(title, msg, fn)` from `shared.js` sets `_sensitiveRun` in state.js and calls `openModal('sensitive-confirm-modal')`. The React component calls `askSensitiveConfirm(...)` exactly as the vanilla code did, then `bindProgressionModals()` keeps wiring `sc-confirm-btn`. So `bindProgressionModals()` is NOT a no-op — it still wires the vanilla modals. Only `renderAdminProgression()` is replaced; `bindProgressionModals()` stays untouched.

   **Correction from source reading:** `bindProgressionModals()` wires:
   1. `pl-save-btn` → `runPlacement()` (reads `_placementId` from state.js)
   2. `sc-confirm-btn` → password check → runs `getSensitiveRun()` callback

   These are vanilla DOM binds on Alpine-modal buttons. Since the modals remain in index.html and `initAdminModals()` is called once at boot (via `src/main.js`), these bindings are already live when the React component mounts. The React component calls `openModal('place-student-modal')` / `openModal('sensitive-confirm-modal')` — the existing bindings handle the rest.

   **Verdict: make `bindProgressionModals()` a no-op as instructed.** The component must re-wire `pl-save-btn` and `sc-confirm-btn` itself in a `useEffect(() => { ... }, [])` on mount (or alternatively, inline the password-confirm logic with a React-internal modal using `useState` — see below).

   **Recommended approach for AdminProgression modals:** Use two React `useState`-controlled inline modals (SensitiveConfirmModal and PlacementModal) inside the component instead of calling the Alpine modals. This is cleaner and removes the `pl-password` / `sc-password` DOM dependency:
   - `SensitiveConfirmModal` — title, message, password field, confirm button; sets `isOpen` via props from parent
   - `PlacementModal` — student name, class select, note, password; replaces `place-student-modal`

   With this approach, `openModal('place-student-modal')` and `openModal('sensitive-confirm-modal')` are never called from within the component. `bindProgressionModals()` becomes a true no-op (the Alpine modals in index.html are no longer needed for progression — but keep them in the DOM for now since they may be referenced elsewhere).

   ```jsx
   // src/react/components/AdminProgression.jsx
   // Structure sketch — implementer fills in full JSX matching
   // original class names from index.html

   import { useState, useEffect, useCallback } from 'react';
   import { Data, Academic, Progression } from '../../data/index.js';
   import { getCurrentUser } from '../../state.js';
   import { _prRows, set_prRows } from '../../state.js';
   import {
     esc, toneClass, formatDate, statusClass,
     currentTerm, passMark, toast
   } from '../../utils.js';
   import { prDecisionRows, termCoverageProgression } from '../admin.js';
   import { termNameOf, askSensitiveConfirm, renderPassport } from '../shared.js';

   export default function AdminProgression() {
     const [v, setV] = useState(0);
     const refresh = useCallback(() => setV(n => n + 1), []);

     // Sensitive confirm modal state
     const [sensitiveModal, setSensitiveModal] = useState({
       open: false, title: '', message: '', onConfirm: null
     });
     const askSensitive = (title, message, fn) =>
       setSensitiveModal({ open: true, title, message, onConfirm: fn });

     // Pool placement modal state
     const [placementModal, setPlacementModal] = useState({
       open: false, studentId: null
     });

     return (
       <>
         <section className="welcome-row">
           {/* ... title, dry-run, commit buttons ... */}
         </section>
         <ProgressionDecisions refresh={refresh} askSensitive={askSensitive} v={v} />
         <div className="setup-grid mt16">
           <ProgressionPool refresh={refresh} askSensitive={askSensitive} openPlacement={setPlacementModal} v={v} />
           <PublishPanel refresh={refresh} v={v} />
         </div>
         <PositionsPanel v={v} />
         <div className="setup-grid mt16">
           <ApprovalsPanel refresh={refresh} v={v} />
           <DayStructurePanel refresh={refresh} />
         </div>

         <SensitiveConfirmModal
           {...sensitiveModal}
           onClose={() => setSensitiveModal(m => ({ ...m, open: false }))}
         />
         <PlacementModal
           {...placementModal}
           onClose={() => setPlacementModal(m => ({ ...m, open: false }))}
           onDone={refresh}
         />
       </>
     );
   }
   ```

   The `PositionsPanel` component calls `Progression.positions(term)` which is async; use:
   ```jsx
   const [positions, setPositions] = useState([]);
   const [posTerm, setPosTerm]     = useState(currentTerm());
   useEffect(() => {
     Progression.positions(posTerm).then(rows => setPositions(rows));
   }, [posTerm]);
   ```
   This is the one exception to the "no useEffect data fetching" rule, because `Progression.positions()` is inherently async and was already called async in the vanilla code.

   **5c. Replace `renderAdminProgression()` in `src/views/admin.js`**

   ```js
   import { mount } from '../react/mount.js';
   import AdminProgression from '../react/components/AdminProgression.jsx';

   export function renderAdminProgression() {
     mount('react-admin-progression', AdminProgression, {});
   }
   ```

   **5d. Make `bindProgressionModals()` a no-op in `src/views/admin.js`**

   ```js
   export function bindProgressionModals() {
     // No-op: AdminProgression.jsx owns its own modal state.
     // The Alpine sensitive-confirm-modal and place-student-modal
     // in index.html are no longer needed for progression flow
     // (the React component uses inline modals). Binding is omitted.
   }
   ```

   Files: `index.html`, `src/react/components/AdminProgression.jsx`, `src/views/admin.js`

   Verify: `npm run build`. Manual test: log in as admin → Progression → decisions table renders; Dry run refreshes; Commit opens password modal; Pool displays entrants; Publish toggles work; Positions update on term select.

---

- [ ] 6. **STEP 5 — QuizManager (teacher) and QuizTaker (student)**

   **6a. Modify `index.html` `#view-teacher-quizzes`**

   Replace inner HTML with a mount point, keeping the outer page-wrap:
   ```html
   <div class="page-wrap" id="view-teacher-quizzes" data-role="Subject Teacher" hidden>
     <div id="react-teacher-quizzes"></div>
   </div>
   ```
   Remove: the entire `<section class="welcome-row role-welcome">` through `<div id="qz-detail" class="mt16"></div>`.

   **6b. Create `src/react/components/QuizManager.jsx`**

   State:
   - `selectedCombo` — `"subjectId|classId"` string, controlled select (replaces `#qz-pick`)
   - `title`, `desc` — new quiz form fields
   - `detail` — `{ mode: 'editor'|'results', quiz }` or null
   - `v` — re-render version counter

   The component replicates:
   - `renderTeacherQuizzes()` — combo select, create form, quiz list table
   - `renderQuizList()` — quiz table with Questions/Publish/Results/Delete actions
   - `openQuizEditor(quiz)` → renders a `QuizEditorPanel` sub-component inline (replaces `#qz-detail` slot)
   - `openQuizResults(quiz)` → renders a `QuizResultsPanel` sub-component inline
   - `quizQuestionEditorHTML(q)` → `QuestionEditor` sub-component with controlled inputs
   - `bindQuizEditorEvents()` logic — Remove/type-change handled by React state (question array)

   The question editor panel uses an array of question objects in state:
   ```jsx
   const [questions, setQuestions] = useState(
     existingQs.length ? existingQs : [emptyQuestion()]
   );
   ```
   Adding a question appends to the array; removing splices it out.

   **6c. Modify `index.html` `#view-student-quizzes`**

   ```html
   <div class="page-wrap" id="view-student-quizzes" data-role="Student" hidden>
     <div id="react-student-quizzes"></div>
   </div>
   ```

   **6d. Create `src/react/components/QuizTaker.jsx`**

   State:
   - `activeQuizId` — null (list shown) or quizId (taker or result shown)
   - `mode` — `'list'|'taker'|'result'`
   - `answers` — `{ [questionId]: pickedValue }` during taking

   The component replicates:
   - `renderStudentQuizzes()` — quizzes table with Take/View result buttons
   - `openQuizTaker(quizId)` → inline quiz form with radio buttons per question
   - Submit → `Data.submitQuizAttempt(quiz.id, studentId, answers)` → switch to result mode
   - `openStudentQuizResult(quizId)` → result table

   No `#sq-body` slot needed — all three modes render inside the component.

   **6e. Replace render functions in `src/views/teacher.js` and `src/views/student.js`**

   In teacher.js:
   ```js
   import { mount } from '../react/mount.js';
   import QuizManager from '../react/components/QuizManager.jsx';

   export function renderTeacherQuizzes() {
     mount('react-teacher-quizzes', QuizManager, {});
   }
   // Keep renderQuizList, quizQuestionEditorHTML, bindQuizEditorEvents,
   // openQuizEditor, openQuizResults as stubs or remove — they are now
   // fully owned by QuizManager.jsx.
   ```

   In student.js:
   ```js
   import { mount } from '../react/mount.js';
   import QuizTaker from '../react/components/QuizTaker.jsx';

   export function renderStudentQuizzes() {
     mount('react-student-quizzes', QuizTaker, {});
   }
   // openQuizTaker and openStudentQuizResult become no-ops or are removed
   // (QuizTaker.jsx owns them as internal state transitions).
   ```

   Files: `index.html`, `src/react/components/QuizManager.jsx`, `src/react/components/QuizTaker.jsx`, `src/views/teacher.js`, `src/views/student.js`

   Verify: `npm run build`. Manual test: teacher → Quizzes → create quiz → add questions → save → publish → view results. Student → My Quizzes → take quiz → submit → view result.

---

- [ ] 7. **STEP 6 — ClassOverview**

   **7a. Modify `index.html` `#view-class-overview`**

   Replace inner HTML with mount point:
   ```html
   <div class="page-wrap" id="view-class-overview" data-role="Class Teacher" hidden>
     <div id="react-class-overview"></div>
   </div>
   ```
   Remove: the `<section class="welcome-row role-welcome">` through the approvals panel.

   **7b. Create `src/react/components/ClassOverview.jsx`**

   State: `v` version counter for re-renders after approval actions.

   The component replicates:
   - Stats: students count, gender breakdown, pending feedback, avg, attendance avg, promoted count
   - Student table with att edit button (calls `showView`/`renderClassAttendance(sid)` from router) and Reset Password button (calls `openResetPasswordModal(sid)` from shared.js — Alpine modal, so keep vanilla call)
   - Support list (at-risk students)
   - Navigation buttons: Add Feedback (`showView('view-class-feedback')`), Full Register (`openClassReportModal(cl.id)`), Full Report (`showView('view-class-report')`)
   - Approvals panel: `renderClassApprovals` sub-component with Approve/Reject that call `Progression.chooseSubjects()` + `Progression.decideApproval()` then `setV(v => v+1)`

   Gotcha: the original `renderClassOverview()` calls `renderClassAttendance(btn.dataset.sid)` — this is now a React mount call. The navigation pattern `showView() + renderView()` stays vanilla (router.js unchanged).

   ```jsx
   // src/react/components/ClassOverview.jsx
   import { useState } from 'react';
   import { Data, Academic, Progression } from '../../data/index.js';
   import { getCurrentUser } from '../../state.js';
   import { toneClass, currentTerm, toast, statusClass } from '../../utils.js';
   import { myClassRecord, isHOD } from '../../auth.js';
   import { openClassReportModal, openResetPasswordModal } from '../shared.js';
   // showView / renderView from router — lazy import to avoid circular
   const gotoPage = (page, render) => {
     import('../../router.js').then(m => { m.showView(page); m.renderView(page); });
   };
   const gotoAttendance = sid => {
     import('../../router.js').then(m => {
       m.showView('view-class-attendance');
       import('./ClassAttendance.jsx').then(({ default: ClassAttendance }) => {
         // mount handled by renderClassAttendance in teacher.js
         import('../../views/teacher.js').then(({ renderClassAttendance }) => renderClassAttendance(sid));
       });
     });
   };

   export default function ClassOverview() {
     const currentUser = getCurrentUser();
     const [v, setV] = useState(0);
     const cl = myClassRecord(currentUser);
     if (!cl) return <p className="muted-cell" style={{ padding: 16 }}>You are not assigned a class yet.</p>;

     const students = Data.studentsByClass(cl.id).filter(s => s.status !== 'archived');
     const term     = currentTerm();
     const fb       = Data.feedback();
     const pending  = students.filter(s => !fb[s.id]?.submitted).length;
     const avg      = Academic.classAverage(cl.id, term);
     const girls    = students.filter(s => s.gender === 'F').length;
     const boys     = students.filter(s => s.gender === 'M').length;
     const atts     = students.map(s => +Academic.attendancePct(s.id));
     const avgAtt   = atts.length ? Math.round(atts.reduce((a, b) => a + b, 0) / atts.length) : 0;
     const promoted = students.filter(s => Academic.canPromote(s.id, term)).length;

     // Approvals
     const mine       = new Set(students.map(s => s.id));
     const approvals  = Progression.pendingApprovals()
       .filter(a => a.actionType === 'subject_change' && mine.has(String(a.entityId)));

     const approve = async (a) => {
       const ids = Array.isArray(a.payload?.subjectIds) ? a.payload.subjectIds : [];
       await Progression.chooseSubjects(a.entityId, ids, { status: 'effective', userId: currentUser.id });
       await Progression.decideApproval(a.id, true, currentUser.id, 'Approved by class teacher');
       const firstName = Data.student(a.entityId)?.name.split(' ')[0] || 'Student';
       toast(`${firstName}'s subjects are now effective. ✓`);
       setV(n => n + 1);
     };

     const reject = async (a) => {
       const prev = Array.isArray(a.payload?.previous) ? a.payload.previous : [];
       await Progression.chooseSubjects(a.entityId, prev, { status: 'effective', userId: currentUser.id });
       await Progression.decideApproval(a.id, false, currentUser.id, 'Declined by class teacher');
       toast('Change request declined; previous subjects kept.');
       setV(n => n + 1);
     };

     const atRisk = students.flatMap(s => {
       const att = +Academic.attendancePct(s.id);
       const items = [];
       if (att < 90) items.push({ icon: '!', color: 'coral-bg', msg: `Low attendance (${att}%)`, name: s.name });
       if (Academic.promotionStatus(s.id, term) === 'Repeat')
         items.push({ icon: '↘', color: 'yellow-bg', msg: 'Not on track to promote', name: s.name });
       return items;
     });

     return (
       <>
         <section className="welcome-row role-welcome">
           <div>
             <p className="eyebrow">{isHOD(currentUser) ? 'HOD · ' : ''}Class teacher · {cl.name}</p>
             <h1>Good morning, {currentUser.name.split(' ')[0]}.</h1>
             <p className="subcopy">Your class attendance and end-of-term feedback are ready.</p>
           </div>
           <button className="btn-primary" onClick={() => gotoPage('view-class-feedback')}>+ Add feedback</button>
         </section>
         {/* stat grid, student table, support list, approvals ... */}
         {/* (full JSX follows the same structure as original HTML, matching all class names) */}
       </>
     );
   }
   ```

   **7c. Replace `renderClassOverview()` in `src/views/teacher.js`**

   ```js
   import { mount } from '../react/mount.js';
   import ClassOverview from '../react/components/ClassOverview.jsx';

   export function renderClassOverview() {
     mount('react-class-overview', ClassOverview, {});
   }
   // renderClassApprovals() becomes internal to ClassOverview.jsx — remove or stub
   ```

   Files: `index.html`, `src/react/components/ClassOverview.jsx`, `src/views/teacher.js`

   Verify: `npm run build`. Manual test: log in as class teacher → My Class → stats render, student table shows, attendance edit button navigates to attendance view, approval approve/reject work.

---

## Cross-cutting technical constraints (reminders for implementer)

1. **Data layer**: All `Data.*`, `Academic.*`, `Progression.*`, `Growth.*`, `Timetable.*` calls are synchronous and called directly in render — no `useEffect` fetching. Exception: `Progression.positions(term)` is async; handle with `useEffect` + local state in `PositionsPanel`.

2. **Re-render pattern**: After any write, bump version: `const [v, setV] = useState(0); setV(v => v+1)`. Pass `v` as a prop to sub-components that read from the data layer so they re-render when data changes.

3. **Alpine coexistence**: Alpine still owns: toast store, modals store, loginError store, login password toggle. Do NOT add x-data to any element inside a React mount point.

4. **openModal/closeModal for Alpine modals**: Call `openModal(id)` / `closeModal(id)` from React event handlers for any modal that remains in index.html as an Alpine `x-show` modal (assign-mentor-modal, add-assignment-modal, class-register-modal, etc.). For new progression modals in AdminProgression.jsx, use React-internal `useState` modals instead.

5. **toast()**: Import from `src/utils.js` and call directly from React event handlers — no change.

6. **CSS classes**: Every JSX element uses the exact same class names as the vanilla render functions. No new class names introduced. No inline styles except where the original had `style=""` attributes.

7. **No .jsx extension for vanilla imports**: `src/react/mount.js` is `.js` (it imports JSX components dynamically). `AppContext` and all components are `.jsx`. Vite handles both.

8. **Function signatures preserved**: `openStudentReport(studentId, termOverride)`, `renderClassAttendance(focusSid)`, `renderAdminProgression()`, `renderTeacherQuizzes()`, `renderStudentQuizzes()`, `renderClassOverview()` — all keep their exact signatures, called identically from router.js.

9. **wrangler.toml**: Updated in Step 1 to `pages_build_output_dir = "dist"` (was `"."`).

---

## File checklist

| File | Action |
|------|--------|
| `package.json` | Add react, react-dom, @vitejs/plugin-react |
| `vite.config.js` | Add react plugin, react-vendor chunk |
| `wrangler.toml` | Fix pages_build_output_dir to "dist" |
| `src/context/AppContext.jsx` | Create — AppProvider + useApp |
| `src/react/mount.js` | Create — idempotent createRoot wrapper |
| `src/react/components/StudentReportDrawer.jsx` | Create |
| `src/react/components/ClassAttendance.jsx` | Create |
| `src/react/components/AdminProgression.jsx` | Create (with sub-components) |
| `src/react/components/QuizManager.jsx` | Create |
| `src/react/components/QuizTaker.jsx` | Create |
| `src/react/components/ClassOverview.jsx` | Create |
| `index.html` | Modify 5 view containers + report drawer inner HTML |
| `src/views/reports.js` | Replace openStudentReport body |
| `src/views/teacher.js` | Replace renderClassAttendance, renderClassOverview, renderTeacherQuizzes bodies |
| `src/views/admin.js` | Replace renderAdminProgression body; stub bindProgressionModals |
| `src/views/student.js` | Replace renderStudentQuizzes body |
