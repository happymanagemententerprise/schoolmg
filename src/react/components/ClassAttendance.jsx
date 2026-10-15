// ============================================================
//  Happy Man Academy — ClassAttendance React component
// ============================================================
import { useState } from 'react';
import { Data, Academic } from '../../data/index.js';
import { getCurrentUser } from '../../state.js';
import { toneClass, currentTerm, toast } from '../../utils.js';
import { myClassRecord } from '../../auth.js';

const ATT_DAYS      = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const ATT_DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TERM_WEEKS = 16;

export default function ClassAttendance({ focusSid = null }) {
  const currentUser = getCurrentUser();
  const cl = myClassRecord(currentUser);
  if (!cl) {
    return <p className="muted-cell p16">You are not assigned a class yet.</p>;
  }

  const students = Data.studentsByClass(cl.id).filter(s => s.status !== 'archived');
  const term     = currentTerm();
  const schoolDates = Data.attendanceDates(term);
  const today = Data.todayDate();
  const todaySlot = schoolDates.indexOf(today);

  // Build initial draft from saved daily attendance
  const buildDraft = () => {
    const daily = Data.dailyAttendance(term);
    const d = {};
    const normDay = arr => Array.from({ length: 5 }, (_, i) => {
      const status = (arr && arr[i]) || '';
      return status === 'unmarked' ? '' : status;
    });
    students.forEach(s => {
      d[s.id] = {};
      Array.from({ length: TERM_WEEKS }, (_, i) => i + 1).forEach(w => {
        d[s.id][w] = normDay(daily[`W${w}`]?.[String(s.id)]);
      });
    });
    return d;
  };

  const [selectedDate, setSelectedDate] = useState(todaySlot >= 0 ? today : (schoolDates[0] || ''));
  const [draft, setDraft] = useState(buildDraft);
  const [v,     setV]     = useState(0); // re-render version after saves
  const dateSlot = schoolDates.indexOf(selectedDate);
  const week = dateSlot >= 0 ? Math.floor(dateSlot / 5) + 1 : 1;
  const day = dateSlot >= 0 ? dateSlot % 5 : 0;
  const canEditSelectedDate = dateSlot >= 0 && selectedDate === today && dateSlot === todaySlot;

  const isPresent = st => st === 'present' || st === 'late';

  const pcts      = students.map(s => parseInt(Academic.attendancePct(s.id, term), 10) || 0);
  const avgAtt    = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
  const atRisk    = pcts.filter(p => p < 75).length;
  const presentToday = students.filter(s => isPresent(draft[s.id]?.[week]?.[day])).length;
  const lateThisWeek = students.reduce((n, s) =>
    n + ((draft[s.id]?.[week] || []).filter(st => st === 'late').length), 0);

  const toggleStatus = (sid, status) => {
    if (!canEditSelectedDate) return;
    setDraft(prev => {
      const prevWeek = prev[sid]?.[week] || Array(5).fill('');
      const newWeek  = [...prevWeek];
      newWeek[day]   = newWeek[day] === status ? '' : status;
      return { ...prev, [sid]: { ...prev[sid], [week]: newWeek } };
    });
  };

  const setAll = status => {
    if (!canEditSelectedDate) return;
    setDraft(prev => {
      const next = { ...prev };
      students.forEach(s => {
        const prevWeek = next[s.id]?.[week] || Array(5).fill('');
        const newWeek  = [...prevWeek];
        newWeek[day]   = status;
        next[s.id] = { ...next[s.id], [week]: newWeek };
      });
      return next;
    });
  };

  const saveDay = async () => {
    if (!canEditSelectedDate) {
      toast('Attendance can only be edited for today’s school date.', 'error');
      return;
    }
    const marks = {};
    students.forEach(s => { marks[s.id] = draft[s.id]?.[week]?.[day] || ''; });
    const saved = await Data.saveDailyDay(week, day, marks, term, selectedDate);
    if (!saved) { toast('Register not saved. Check the term calendar and try again.', 'error'); return; }
    toast(`Register saved · ${selectedDate} · Week ${week}.`);
    setV(prev => prev + 1);
  };

  const present  = students.filter(s => isPresent(draft[s.id]?.[week]?.[day])).length;
  const late     = students.filter(s => draft[s.id]?.[week]?.[day] === 'late').length;
  const absent   = students.filter(s => draft[s.id]?.[week]?.[day] === 'absent').length;
  const unmarked = students.length - present - absent;
  const countStr = `${present} present${late ? ` (${late} late)` : ''} · ${absent} absent` +
                   (unmarked ? ` · ${unmarked} not marked` : '');

  // Heatmap for a student
  const termHeatmap = sid =>
    Array.from({ length: TERM_WEEKS }, (_, i) => i + 1).map(w => (
      <span className="att-week-group" title={`Week ${w}`} key={w}>
        {ATT_DAYS.map((d, di) => {
          const st  = draft[sid]?.[w]?.[di] || '';
          const cls = st === 'present' ? 'present' : st === 'late' ? 'late' : st === 'absent' ? 'absent' : 'off';
          return (
            <span
              className={`att-day ${cls}`}
              title={`W${w} ${d}: ${st || 'not marked'}`}
              key={di}
            >
              {d[0]}
            </span>
          );
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
          <button className="btn-primary" disabled={!canEditSelectedDate} onClick={saveDay}>Save day ↑</button>
        </div>
      </section>

      {/* Stat cards */}
      <section className="stat-grid" aria-label="Attendance summary">
        <article className="stat-card accent-green">
          <div className="stat-top">
            <span className="stat-label">Class attendance</span>
            <span className="stat-icon">%</span>
          </div>
          <strong>{avgAtt}%</strong>
          <div className="stat-trend neutral">
            {avgAtt >= 90 ? 'Excellent' : avgAtt >= 75 ? 'Good' : 'Needs attention'}
          </div>
        </article>
        <article className="stat-card accent-blue">
          <div className="stat-top">
            <span className="stat-label">Present today</span>
            <span className="stat-icon">✓</span>
          </div>
          <strong>{presentToday}/{students.length}</strong>
          <div className="stat-trend neutral">{ATT_DAYS_FULL[day]}, Week {week}</div>
        </article>
        <article className="stat-card accent-yellow">
          <div className="stat-top">
            <span className="stat-label">Late arrivals</span>
            <span className="stat-icon">⏱</span>
          </div>
          <strong>{lateThisWeek}</strong>
          <div className="stat-trend neutral">This week</div>
        </article>
        <article className="stat-card accent-coral">
          <div className="stat-top">
            <span className="stat-label">At risk</span>
            <span className="stat-icon">!</span>
          </div>
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
          <label>
            School date
            <input type="date" value={selectedDate} min={schoolDates[0] || undefined}
              max={schoolDates[schoolDates.length - 1] || undefined}
              onChange={e => setSelectedDate(e.target.value)} />
          </label>
          <span className="muted-cell">{dateSlot >= 0 ? `Week ${week} · ${ATT_DAYS_FULL[day]}` : 'Choose a date inside the 16-week term'}</span>
          <span className="att-daily-actions">
            <button type="button" className="btn-sm-save" disabled={!canEditSelectedDate} onClick={() => setAll('present')}>✓ All present</button>
            <button type="button" className="btn-sm-save att-all-absent-btn" disabled={!canEditSelectedDate} onClick={() => setAll('absent')}>✗ All absent</button>
          </span>
        </div>
        <div className="table-wrap mt16">
          <table className="att-register-table">
            <thead>
              <tr>
                <th>Student</th>
                <th className="att-status-col">Status</th>
                <th className="att-term-col">
                  Term record{' '}
                  <span className="muted-cell att-term-col-note">
                    Mon · Tue · Wed · Thu · Fri per week
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => {
                const st     = draft[s.id]?.[week]?.[day] || '';
                const pct    = Academic.attendancePct(s.id, term);
                const pctNum = parseInt(pct, 10);
                return (
                  <tr key={s.id} className={String(s.id) === String(focusSid) ? 'att-focused' : ''}>
                    <td>
                      <div className="student">
                        <span className={`student-avatar ${toneClass(s.tone)}`}>{s.initials}</span>
                        <span>{s.name}</span>
                      </div>
                      <small className="muted-cell att-student-att">
                        <span
                          className={`status att-student-att-badge ${pctNum >= 90 ? 'promoted' : pctNum >= 75 ? 'review' : 'repeat'}`}
                        >
                          {pct}
                        </span>
                      </small>
                    </td>
                    <td className="att-status-cell">
                      <div className="att-3state">
                        {['present', 'late', 'absent'].map(status => (
                          <button
                            key={status}
                            type="button"
                            className={`att-state-btn ${st === status ? `active-${status}` : ''}`}
                            disabled={!canEditSelectedDate}
                            onClick={() => toggleStatus(s.id, status)}
                          >
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

      {/* Weekly rollup — re-reads Data after each save via v prop */}
      <WeeklySummary students={students} cl={cl} term={term} focusSid={focusSid} v={v} />

      {/* Monthly rollup — the term's weeks grouped into month blocks */}
      <MonthlySummary students={students} cl={cl} term={term} focusSid={focusSid} v={v} />
    </>
  );
}

function WeeklySummary({ students, cl, term, focusSid, v: _v }) {
  return (
    <div className="panel mt16">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{cl.name} · Term {term}</p>
          <h2>Weekly summary</h2>
        </div>
      </div>
      <div className="table-wrap mt16">
        <table>
          <thead>
            <tr>
              <th>Student</th>
          {Array.from({ length: TERM_WEEKS }, (_, i) => `W${i + 1}`).map(w => (
                <th key={w}>
                  {w}{' '}
                  <span className="muted-cell att-term-col-note">/5</span>
                </th>
              ))}
              <th>Total</th>
              <th>Rate</th>
            </tr>
          </thead>
          <tbody>
            {students.map(s => {
              const saved  = Data.studentAttendance(s.id, term);
              const total  = Object.values(saved).reduce((a, b) => a + b, 0);
              const pct    = Academic.attendancePct(s.id, term);
              const pctNum = parseInt(pct, 10) || 0;
              return (
                <tr key={s.id} className={String(s.id) === String(focusSid) ? 'att-focused' : ''}>
                  <td>
                    <div className="student">
                      <span className={`student-avatar ${toneClass(s.tone)}`}>{s.initials}</span>
                      {s.name}
                    </div>
                  </td>
                  {Array.from({ length: TERM_WEEKS }, (_, i) => `W${i + 1}`).map(wk => (
                    <td key={wk} className="muted-cell att-weekly-td">
                      {saved[wk] ?? '—'}
                    </td>
                  ))}
                  <td className="att-weekly-td"><strong>{total}</strong></td>
                  <td>
                    <span className={`status ${pctNum >= 90 ? 'promoted' : pctNum >= 75 ? 'review' : 'repeat'}`}>
                      {pct}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MonthlySummary({ students, cl, term, focusSid, v: _v }) {
  const months = students.map(s => Academic.monthlyAttendance(s.id, term));
  const blockCount = months.reduce((max, m) => Math.max(max, m.length), 0);
  if (!blockCount) return null;
  const labels = (months.find(m => m.length === blockCount) || []).map(b => b.label);

  return (
    <div className="panel mt16">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{cl.name} · Term {term}</p>
          <h2>Monthly summary</h2>
        </div>
        <span className="muted-cell">Term weeks grouped into month blocks</span>
      </div>
      <div className="table-wrap mt16">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              {labels.map((l, i) => (
                <th key={i}>
                  {l} <span className="muted-cell att-term-col-note">%</span>
                </th>
              ))}
              <th>Term</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, si) => {
              const pct    = Academic.attendancePct(s.id, term);
              const pctNum = parseInt(pct, 10) || 0;
              return (
                <tr key={s.id} className={String(s.id) === String(focusSid) ? 'att-focused' : ''}>
                  <td>
                    <div className="student">
                      <span className={`student-avatar ${toneClass(s.tone)}`}>{s.initials}</span>
                      {s.name}
                    </div>
                  </td>
                  {labels.map((_, i) => {
                    const b = months[si][i];
                    if (!b) return <td key={i} className="muted-cell att-weekly-td">—</td>;
                    const rc = b.pct >= 90 ? 'promoted' : b.pct >= 75 ? 'review' : 'repeat';
                    return (
                      <td key={i} className="att-weekly-td">
                        <span className={`status ${rc}`}>{b.pct}%</span>
                      </td>
                    );
                  })}
                  <td><strong>{pctNum}%</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
