// ============================================================
//  Happy Man Academy — StudentReportDrawer React component
// ============================================================
import { useState, useEffect } from 'react';
import { Data, Academic } from '../../data/index.js';
import { getCurrentUser } from '../../state.js';
import {
  esc, toneClass, gradeLabel, statusClass,
  currentTerm, passMark, downloadXlsx, downloadXlsxMulti, printReportPdf
} from '../../utils.js';
import { openDrawer } from '../../router.js';
import SessionSelector from './SessionSelector.jsx';
import PreviousSessionPanel from './PreviousSessionPanel.jsx';

export default function StudentReportDrawer({ studentId, term: termProp = null }) {
  const currentUser = getCurrentUser();
  const s = Data.student(studentId);
  if (!s) return null;

  const term   = termProp || currentTerm();
  const cl     = Data.cls(s.classId);
  const avg    = Academic.termAverage(studentId, term);
  const status = Academic.promotionStatus(studentId, term);
  const mentor = Data.mentor(s.mentorId);

  const isConsumer    = currentUser && (currentUser.role === 'Student' || currentUser.role === 'Parent');
  const locked        = isConsumer && !Data.published(term);
  const isConsumerView = !!isConsumer;
  const allTermsPublished = [1, 2, 3].every(t => Data.published(t));
  const showStatus    = !isConsumerView || allTermsPublished;

  // Session selector state — null means "show current session"
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedSessionName, setSelectedSessionName] = useState(null);

  // Reset to current session whenever the displayed student changes
  useEffect(() => {
    setSelectedSessionId(null);
    setSelectedSessionName(null);
  }, [studentId]);

  // Open the drawer after mount / re-render
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div className="drawer-actions">
          <button className="btn-primary" disabled>Download report ↓</button>
          <button className="outline-button" disabled>Print / PDF ↗</button>
        </div>
      </div>
    );
  }

  const history = Data.promotionsFor(studentId);
  const scores  = Academic.termScores(studentId, term);
  const isTerm3 = term === 3;

  // For term 3: pull prior term totals per subject
  const t2Scores = isTerm3 ? Academic.termScores(studentId, 2) : [];
  const t1Scores = isTerm3 ? Academic.termScores(studentId, 1) : [];
  const t2ById   = Object.fromEntries(t2Scores.map(s => [s.subjectId, s.score]));
  const t1ById   = Object.fromEntries(t1Scores.map(s => [s.subjectId, s.score]));

  const handleDownload = () => {
    const headers = isTerm3
      ? ['Subject', 'CA (40)', 'Exam (60)', 'T3 Total', 'T2 Total', 'T1 Total', '3-Term Avg', 'Grade']
      : ['Subject', 'CA (40)', 'Exam (60)', 'Total', 'Grade'];
    const rows = [
      ['Student', s.name], ['Class', cl?.name || ''], ['Term', term],
      ['Average', avg], ['Status', status], [],
      headers
    ];
    scores.forEach(sc => {
      if (isTerm3) {
        const t2 = t2ById[sc.subjectId] ?? null;
        const t1 = t1ById[sc.subjectId] ?? null;
        const vals = [sc.score, t2, t1].filter(v => v !== null);
        const avg3 = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
        rows.push([sc.name, sc.ca ?? '', sc.exam ?? '', sc.score ?? '', t2 ?? '', t1 ?? '', avg3 ?? '', avg3 !== null ? gradeLabel(avg3) : '']);
      } else {
        rows.push([sc.name, sc.ca ?? '', sc.exam ?? '', sc.score ?? '', sc.score !== null ? gradeLabel(sc.score) : '']);
      }
    });
    downloadXlsx(`report_${s.name.replace(/\s+/g, '_')}_term${term}.xlsx`, rows, `Term ${term}`);
  };

  // Build a 3-sheet xlsx for a previous session
  const handlePrevDownload = (prevData) => {
    const allSubjects = Data.subjects();
    const sheets = [1, 2, 3].map(termNum => {
      const isT3 = termNum === 3;
      const headers = isT3
        ? ['Subject', 'CA (40)', 'Exam (60)', 'T3 Total', 'T2 Total', 'T1 Total', '3-Term Avg', 'Grade']
        : ['Subject', 'CA (40)', 'Exam (60)', 'Total', 'Grade'];
      const gradeRows = prevData.gradesByTerm[termNum] || [];

      // For T3: build lookups for T2/T1 totals
      const t2Map = {};
      const t1Map = {};
      if (isT3) {
        (prevData.gradesByTerm[2] || []).forEach(r => {
          const ca = r.test ?? null;
          const ex = r.exam ?? null;
          if (ca !== null && ex !== null) t2Map[String(r.subject_id)] = ca + ex;
        });
        (prevData.gradesByTerm[1] || []).forEach(r => {
          const ca = r.test ?? null;
          const ex = r.exam ?? null;
          if (ca !== null && ex !== null) t1Map[String(r.subject_id)] = ca + ex;
        });
      }

      const dataRows = gradeRows.map(r => {
        const sub  = allSubjects.find(x => String(x.id) === String(r.subject_id));
        const ca   = r.test  ?? null;
        const exam = r.exam  ?? null;
        const total = (ca !== null && exam !== null) ? ca + exam : null;
        if (isT3) {
          const t2 = t2Map[String(r.subject_id)] ?? null;
          const t1 = t1Map[String(r.subject_id)] ?? null;
          const vals = [total, t2, t1].filter(v => v !== null);
          const avg3 = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
          return [sub?.name ?? '—', ca ?? '', exam ?? '', total ?? '', t2 ?? '', t1 ?? '', avg3 ?? '', avg3 !== null ? gradeLabel(avg3) : ''];
        }
        return [sub?.name ?? '—', ca ?? '', exam ?? '', total ?? '', total !== null ? gradeLabel(total) : ''];
      });

      return {
        name: `Term ${termNum}`,
        rows: [['Student', s.name], ['Session', selectedSessionName || ''], [], headers, ...dataRows]
      };
    });

    downloadXlsxMulti(
      `report_${s.name.replace(/\s+/g, '_')}_session_${(selectedSessionName || '').replace(/\s+/g, '_')}.xlsx`,
      sheets
    );
  };

  return (
    <div className="drawer-content">
      <SessionSelector
        studentId={studentId}
        currentSessionName={Data.session().name}
        selectedSessionId={selectedSessionId}
        onSelect={(id, name) => {
          setSelectedSessionId(id);
          setSelectedSessionName(name);
        }}
      />
      {selectedSessionId !== null ? (
        <PreviousSessionPanel
          studentId={studentId}
          sessionId={selectedSessionId}
          sessionName={selectedSessionName}
          onDownload={handlePrevDownload}
        />
      ) : (
        <>
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
            <div className="table-wrap mt8">
              <table className="cr-report-table">
                <thead>
                  <tr>
                    <th rowSpan={2} style={{textAlign:'left'}}>Subject</th>
                    <th colSpan={3}>Score breakdown</th>
                    {isTerm3 && <><th rowSpan={2}>T2</th><th rowSpan={2}>T1</th><th rowSpan={2}>3-Avg</th></>}
                    <th rowSpan={2}>Grade</th>
                  </tr>
                  <tr className="cr-sub-row">
                    <th>CA</th><th>Exam</th><th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map(sc => {
                    if (isTerm3) {
                      const t2   = t2ById[sc.subjectId] ?? null;
                      const t1   = t1ById[sc.subjectId] ?? null;
                      const vals = [sc.score, t2, t1].filter(v => v !== null);
                      const avg3 = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
                      const pass = avg3 !== null && avg3 >= passMark();
                      return (
                        <tr key={sc.subjectId || sc.name}>
                          <td>{sc.name}<br/><small className="muted-cell">{sc.type === 'core' ? 'Core' : 'Elective'}</small></td>
                          <td className="cr-split">{sc.ca ?? '—'}</td>
                          <td className="cr-split">{sc.exam ?? '—'}</td>
                          <td className="cr-split"><b className={pass ? '' : 'text-danger'}>{sc.score ?? '—'}</b></td>
                          <td className="cr-split muted-cell">{t2 ?? '—'}</td>
                          <td className="cr-split muted-cell">{t1 ?? '—'}</td>
                          <td className="cr-split"><b>{avg3 ?? '—'}</b></td>
                          <td><small>{avg3 !== null ? gradeLabel(avg3) : '—'}</small></td>
                        </tr>
                      );
                    }
                    // Term 1 & 2
                    const pass = (sc.score ?? 0) >= passMark();
                    return (
                      <tr key={sc.subjectId || sc.name}>
                        <td>{sc.name}<br/><small className="muted-cell">{sc.type === 'core' ? 'Core' : 'Elective'}</small></td>
                        <td className="cr-split">{sc.ca ?? '—'}</td>
                        <td className="cr-split">{sc.exam ?? '—'}</td>
                        <td className="cr-split"><b className={pass ? '' : 'text-danger'}>{sc.score ?? '—'}</b></td>
                        <td><small>{sc.score !== null ? gradeLabel(sc.score) : '—'}</small></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {mentor && <MentorChip mentor={mentor} />}
          <div className="drawer-actions">
            <button className="btn-primary" onClick={handleDownload}>Download report ↓</button>
            <button className="outline-button" onClick={printReportPdf}>Print / PDF ↗</button>
          </div>
        </>
      )}
    </div>
  );
}

function MentorChip({ mentor }) {
  return (
    <div className="drawer-mentor-chip mt16">
      <span className="chip-label">Mentor</span>
      <span className={`student-avatar xs-avatar ${toneClass(mentor.tone)}`}>
        {mentor.initials}
      </span>
      <span>
        {mentor.name} · {mentor.subject || 'Mentor'}
        {mentor.phone ? ` · ${mentor.phone}` : ''}
      </span>
    </div>
  );
}
