// ============================================================
//  Happy Man Academy — StudentResults React component
//
//  Replaces the vanilla renderStudentResults() function.
//  Shows current-session results with a term selector, or a
//  PreviousSessionPanel when a past session is chosen via
//  SessionSelector.
// ============================================================
import { useState, useEffect } from 'react';
import { Data, Academic } from '../../data/index.js';
import { getCurrentUser } from '../../state.js';
import {
  gradeLabel, passMark, currentTerm,
  subjectChip, esc, downloadXlsxMulti,
} from '../../utils.js';
import SessionSelector from './SessionSelector.jsx';
import PreviousSessionPanel from './PreviousSessionPanel.jsx';
import { termNameOf } from '../../views/shared.js';

// ── Main component ───────────────────────────────────────────

export default function StudentResults() {
  const currentUser = getCurrentUser();
  const sid = currentUser?.studentId;

  const [selectedSessionId,   setSelectedSessionId]   = useState(null);
  const [selectedSessionName, setSelectedSessionName] = useState(null);
  const [activeTerm, setActiveTerm] = useState(currentTerm());

  const session = Data.session();

  if (!sid || !Data.student(sid)) {
    return <p className="muted-cell">This login is not linked to a student record.</p>;
  }

  // ── handlePrevDownload ───────────────────────────────────
  function handlePrevDownload(fetchedData) {
    const s = Data.student(sid);
    const filename = `report_${(s?.name || '').replace(/\s+/g, '_')}_session_${(selectedSessionName || '').replace(/\s+/g, '_')}.xlsx`;

    const sheets = [1, 2, 3]
      .filter(t => (fetchedData.gradesByTerm[t]?.length ?? 0) > 0)
      .map(t => {
        const isTerm3 = t === 3;
        const rows = fetchedData.gradesByTerm[t] || [];
        const subjects = Data.subjects();

        const t2Rows = isTerm3 ? (fetchedData.gradesByTerm[2] || []) : [];
        const t1Rows = isTerm3 ? (fetchedData.gradesByTerm[1] || []) : [];
        const t2ById = Object.fromEntries(
          t2Rows.map(r => {
            const total = (r.test != null && r.exam != null) ? (r.midterm == null ? r.test : r.midterm + r.test) + r.exam : null;
            return [String(r.subject_id), total];
          })
        );
        const t1ById = Object.fromEntries(
          t1Rows.map(r => {
            const total = (r.test != null && r.exam != null) ? (r.midterm == null ? r.test : r.midterm + r.test) + r.exam : null;
            return [String(r.subject_id), total];
          })
        );

        const pm = passMark();

        const header = isTerm3
          ? ['Subject', 'Type', 'Mid-term (20)', 'Second-half CA (20)', 'Exam (60)', 'T3 Total', 'T2 Total', 'T1 Total', '3-Term Avg', 'Grade', 'Status']
          : ['Subject', 'Type', 'Mid-term (20)', 'Second-half CA (20)', 'Exam (60)', 'Total', 'Grade', 'Status'];

        const dataRows = rows.map(row => {
          const sub = subjects.find(s => String(s.id) === String(row.subject_id));
          const midterm = row.midterm ?? null;
          const ca   = row.test  ?? null;
          const exam = row.exam  ?? null;
          const t3tot = (ca !== null && exam !== null) ? (midterm == null ? ca : midterm + ca) + exam : null;

          if (isTerm3) {
            const t2 = t2ById[String(row.subject_id)] ?? null;
            const t1 = t1ById[String(row.subject_id)] ?? null;
            const vals = [t3tot, t2, t1].filter(v => v !== null);
            const avg3 = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
            const pass = avg3 !== null && avg3 >= pm;
            return [
              sub?.name ?? '—',
              sub?.type === 'core' ? 'Core' : 'Elective',
              midterm ?? '—', ca ?? '—', exam ?? '—',
              t3tot ?? '—', t2 ?? '—', t1 ?? '—', avg3 ?? '—',
              avg3 !== null ? gradeLabel(avg3) : '—',
              avg3 !== null ? (pass ? 'Pass' : 'Fail') : '—',
            ];
          } else {
            const total = t3tot;
            const pass  = total !== null && total >= pm;
            return [
              sub?.name ?? '—',
              sub?.type === 'core' ? 'Core' : 'Elective',
              midterm ?? '—', ca ?? '—', exam ?? '—',
              total ?? '—',
              total !== null ? gradeLabel(total) : '—',
              total !== null ? (pass ? 'Pass' : 'Fail') : '—',
            ];
          }
        });

        return { name: `Term ${t}`, rows: [header, ...dataRows] };
      });

    downloadXlsxMulti(filename, sheets);
  }

  // ── Past session branch ──────────────────────────────────
  if (selectedSessionId !== null) {
    return (
      <>
        <SessionSelector
          studentId={sid}
          currentSessionName={session.name}
          selectedSessionId={selectedSessionId}
          onSelect={(id, name) => {
            setSelectedSessionId(id);
            setSelectedSessionName(name);
          }}
        />
        <PreviousSessionPanel
          studentId={sid}
          sessionId={selectedSessionId}
          sessionName={selectedSessionName}
          onDownload={handlePrevDownload}
        />
      </>
    );
  }

  // ── Current session branch ───────────────────────────────
  const visibleTerms = session.terms.filter(t => {
    if (t.term > currentTerm()) return false;
    if (Data.published(t.term)) return true;
    return Academic.termScores(sid, t.term).some(score => score.midterm !== null);
  });
  const displayTerm = visibleTerms.some(t => t.term === activeTerm)
    ? activeTerm
    : (visibleTerms[visibleTerms.length - 1]?.term ?? currentTerm());
  const isPublished = Data.published(displayTerm);
  const scores   = Academic.termScores(sid, displayTerm);
  const isTerm3  = displayTerm === 3;

  const t2Scores = isTerm3 && isPublished ? Academic.termScores(sid, 2) : [];
  const t1Scores = isTerm3 && isPublished ? Academic.termScores(sid, 1) : [];
  const t2ById   = Object.fromEntries(t2Scores.map(s => [s.subjectId, s.score]));
  const t1ById   = Object.fromEntries(t1Scores.map(s => [s.subjectId, s.score]));

  const pm = passMark();

  return (
    <>
      {/* Session selector always first */}
      <SessionSelector
        studentId={sid}
        currentSessionName={session.name}
        selectedSessionId={selectedSessionId}
        onSelect={(id, name) => {
          setSelectedSessionId(id);
          setSelectedSessionName(name);
        }}
      />

      {/* Nothing has been released yet */}
      {visibleTerms.length === 0 ? (
        <div className="results-locked-notice mt16" role="status">
          <span className="status review">Locked</span>
          <p>No results have been released for {termNameOf(currentTerm())} yet. Check back when the school publishes mid-term marks or term results.</p>
        </div>
      ) : !isPublished ? (
        <div className="panel mt16 student-results-panel">
          <div className="results-panel-heading">
            <div><h2>{session.terms.find(t => t.term === displayTerm)?.name || 'Term'} · mid-term results</h2>
              <p className="role-muted">Your school has released mid-term marks. Second-half CA, exam scores, totals, and grades stay hidden until the full term results are published.</p>
            </div>
            <select className="select-inline" value={displayTerm} aria-label="Results term" onChange={e => setActiveTerm(Number(e.target.value))}>
              {visibleTerms.map(t => <option key={t.term} value={t.term}>{esc(t.name)}</option>)}
            </select>
          </div>
          <div className="table-wrap mt16"><table className="student-results-table">
            <thead><tr><th>Subject</th><th>Type</th><th>Mid-term / 20</th><th>Release</th></tr></thead>
            <tbody>{scores.filter(sub => sub.midterm !== null).map(sub => (
              <tr key={sub.subjectId}>
                <td><div className="student"><span dangerouslySetInnerHTML={{ __html: subjectChip(sub) }} />{esc(sub.name)}</div></td>
                <td className="muted-cell">{sub.type === 'core' ? 'Core' : 'Elective'}</td>
                <td><strong>{sub.midterm}</strong></td>
                <td><span className="status promoted">Released</span></td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      ) : (
        <div className="panel mt16 student-results-panel">
          {/* Meta + term selector row */}
          <div className="results-panel-heading">
            <div><p className="role-muted" style={{ marginBottom: '4px' }}>{session.name} &middot; {scores.filter(score => score.score !== null).length} subjects scored</p>
              <p className="role-muted">Published term results · average {Academic.termAverage(sid, displayTerm)}%</p>
            </div>
            <select className="select-inline" value={displayTerm} aria-label="Results term" onChange={e => setActiveTerm(Number(e.target.value))}>
              {visibleTerms.map(t => <option key={t.term} value={t.term}>{esc(t.name)}</option>)}
            </select>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                {isTerm3 ? (
                  <>
                    <tr>
                      <th rowSpan={2} style={{textAlign:'left'}}>Subject</th>
                      <th rowSpan={2}>Type</th>
                      <th colSpan={4}>Score breakdown</th>
                      <th rowSpan={2}>T2 Total</th>
                      <th rowSpan={2}>T1 Total</th>
                      <th rowSpan={2}>3-Term Avg</th>
                      <th rowSpan={2}>Grade</th>
                      <th rowSpan={2}>Status</th>
                    </tr>
                    <tr className="cr-sub-row">
                      <th>Mid-term</th><th>Second-half CA</th><th>Exam</th><th>T3 Total</th>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr>
                      <th rowSpan={2} style={{textAlign:'left'}}>Subject</th>
                      <th rowSpan={2}>Type</th>
                      <th colSpan={4}>Score breakdown</th>
                      <th rowSpan={2}>Grade</th>
                      <th rowSpan={2}>Status</th>
                    </tr>
                    <tr className="cr-sub-row">
                      <th>Mid-term</th><th>Second-half CA</th><th>Exam</th><th>Total</th>
                    </tr>
                  </>
                )}
              </thead>
              <tbody>
                {scores.length === 0 ? (
                  <tr>
                    <td
                      dangerouslySetInnerHTML={{ __html: 'No subject marks were recorded for this published term.' }}
                      colSpan={isTerm3 ? 11 : 8}
                      className="muted-cell"
                    />
                  </tr>
                ) : isTerm3 ? (
                  scores.map((sub, idx) => {
                    const midterm = sub.midterm ?? '—';
                    const ca    = sub.ca   ?? '—';
                    const exam  = sub.exam ?? '—';
                    const total = sub.score;
                    const t2    = t2ById[sub.subjectId] ?? null;
                    const t1    = t1ById[sub.subjectId] ?? null;
                    const vals  = [total, t2, t1].filter(v => v !== null);
                    const avg3  = vals.length
                      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
                      : null;
                    const grade = avg3 !== null ? gradeLabel(avg3) : '—';
                    const pass  = avg3 !== null && avg3 >= pm;
                    return (
                      <tr key={sub.subjectId ?? idx}>
                        <td>
                          <div className="student">
                            <span
                              dangerouslySetInnerHTML={{ __html: subjectChip(sub) }}
                            />
                            {esc(sub.name)}
                          </div>
                        </td>
                        <td className="muted-cell">
                          {sub.type === 'core' ? 'Core' : 'Elective'}
                        </td>
                        <td>{midterm}</td>
                        <td>{ca}</td>
                        <td>{exam}</td>
                        <td><strong>{total ?? '—'}</strong></td>
                        <td className="muted-cell">{t2 ?? '—'}</td>
                        <td className="muted-cell">{t1 ?? '—'}</td>
                        <td><strong>{avg3 ?? '—'}</strong></td>
                        <td>{grade}</td>
                        <td>
                          <span
                            className={`status ${avg3 === null ? 'review' : pass ? 'promoted' : 'repeat'}`}
                          >
                            {avg3 === null ? '—' : pass ? 'Pass' : 'Fail'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  scores.map((sub, idx) => {
                    const midterm = sub.midterm ?? '—';
                    const ca    = sub.ca   ?? '—';
                    const exam  = sub.exam ?? '—';
                    const total = sub.score;
                    const grade = total !== null ? gradeLabel(total) : '—';
                    const pass  = total !== null && total >= pm;
                    return (
                      <tr key={sub.subjectId ?? idx}>
                        <td>
                          <div className="student">
                            <span
                              dangerouslySetInnerHTML={{ __html: subjectChip(sub) }}
                            />
                            {esc(sub.name)}
                          </div>
                        </td>
                        <td className="muted-cell">
                          {sub.type === 'core' ? 'Core' : 'Elective'}
                        </td>
                        <td>{midterm}</td>
                        <td>{ca}</td>
                        <td>{exam}</td>
                        <td><strong>{total ?? '—'}</strong></td>
                        <td>{grade}</td>
                        <td>
                          <span
                            className={`status ${total === null ? 'review' : pass ? 'promoted' : 'repeat'}`}
                          >
                            {total === null ? '—' : pass ? 'Pass' : 'Fail'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
