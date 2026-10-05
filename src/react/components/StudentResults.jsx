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
import { resultsLockedNote } from '../../views/shared.js';

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
            const total = (r.test != null && r.exam != null) ? r.test + r.exam : null;
            return [String(r.subject_id), total];
          })
        );
        const t1ById = Object.fromEntries(
          t1Rows.map(r => {
            const total = (r.test != null && r.exam != null) ? r.test + r.exam : null;
            return [String(r.subject_id), total];
          })
        );

        const pm = passMark();

        const header = isTerm3
          ? ['Subject', 'Type', 'CA (40)', 'Exam (60)', 'T3 Total', 'T2 Total', 'T1 Total', '3-Term Avg', 'Grade', 'Status']
          : ['Subject', 'Type', 'CA (40)', 'Exam (60)', 'Total', 'Grade', 'Status'];

        const dataRows = rows.map(row => {
          const sub = subjects.find(s => String(s.id) === String(row.subject_id));
          const ca   = row.test  ?? null;
          const exam = row.exam  ?? null;
          const t3tot = (ca !== null && exam !== null) ? ca + exam : null;

          if (isTerm3) {
            const t2 = t2ById[String(row.subject_id)] ?? null;
            const t1 = t1ById[String(row.subject_id)] ?? null;
            const vals = [t3tot, t2, t1].filter(v => v !== null);
            const avg3 = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
            const pass = avg3 !== null && avg3 >= pm;
            return [
              sub?.name ?? '—',
              sub?.type === 'core' ? 'Core' : 'Elective',
              ca ?? '—', exam ?? '—',
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
              ca ?? '—', exam ?? '—',
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
  const visibleTerms = session.terms.filter(
    t => t.term <= currentTerm() && Data.published(t.term)
  );

  const scores   = Academic.termScores(sid, activeTerm);
  const isTerm3  = activeTerm === 3;

  const t2Scores = isTerm3 ? Academic.termScores(sid, 2) : [];
  const t1Scores = isTerm3 ? Academic.termScores(sid, 1) : [];
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

      {/* No published terms yet */}
      {visibleTerms.length === 0 ? (
        <div className="panel mt16">
          <table>
            <tbody>
              <tr>
                <td
                  dangerouslySetInnerHTML={{ __html: resultsLockedNote(currentTerm()) }}
                  colSpan={7}
                  className="muted-cell"
                />
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel mt16">
          {/* Meta + term selector row */}
          <p className="role-muted" style={{ marginBottom: '12px' }}>
            {session.name} &middot; {scores.length} subjects &middot; average{' '}
            {Academic.termAverage(sid, activeTerm)}%
          </p>

          <select
            className="select-inline"
            value={activeTerm}
            onChange={e => setActiveTerm(Number(e.target.value))}
            style={{ marginBottom: '12px' }}
          >
            {visibleTerms.map(t => (
              <option key={t.term} value={t.term}>{esc(t.name)}</option>
            ))}
          </select>

          <div className="table-wrap">
            <table>
              <thead>
                {isTerm3 ? (
                  <>
                    <tr>
                      <th rowSpan={2} style={{textAlign:'left'}}>Subject</th>
                      <th rowSpan={2}>Type</th>
                      <th colSpan={3}>Score breakdown</th>
                      <th rowSpan={2}>T2 Total</th>
                      <th rowSpan={2}>T1 Total</th>
                      <th rowSpan={2}>3-Term Avg</th>
                      <th rowSpan={2}>Grade</th>
                      <th rowSpan={2}>Status</th>
                    </tr>
                    <tr className="cr-sub-row">
                      <th>CA (40)</th><th>Exam (60)</th><th>T3 Total</th>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr>
                      <th rowSpan={2} style={{textAlign:'left'}}>Subject</th>
                      <th rowSpan={2}>Type</th>
                      <th colSpan={3}>Score breakdown</th>
                      <th rowSpan={2}>Grade</th>
                      <th rowSpan={2}>Status</th>
                    </tr>
                    <tr className="cr-sub-row">
                      <th>CA (40)</th><th>Exam (60)</th><th>Total</th>
                    </tr>
                  </>
                )}
              </thead>
              <tbody>
                {scores.length === 0 ? (
                  <tr>
                    <td
                      dangerouslySetInnerHTML={{ __html: resultsLockedNote(activeTerm) }}
                      colSpan={7}
                      className="muted-cell"
                    />
                  </tr>
                ) : isTerm3 ? (
                  scores.map((sub, idx) => {
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
