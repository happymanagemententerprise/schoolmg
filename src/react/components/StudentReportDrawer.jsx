// ============================================================
//  Happy Man Academy — StudentReportDrawer React component
// ============================================================
import { useEffect } from 'react';
import { Data, Academic } from '../../data/index.js';
import { getCurrentUser } from '../../state.js';
import {
  esc, toneClass, gradeLabel, statusClass,
  currentTerm, passMark, downloadXlsx, printReportPdf
} from '../../utils.js';
import { openDrawer } from '../../router.js';

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

  const handleDownload = () => {
    const rows = [
      ['Student', s.name], ['Class', cl?.name || ''], ['Term', term],
      ['Average', avg], ['Status', status], [],
      ['Subject', 'CA (40)', 'Exam (60)', 'Total', 'Grade']
    ];
    scores.forEach(sc => {
      rows.push([
        sc.name, sc.ca ?? '', sc.exam ?? '', sc.score ?? '',
        sc.score !== null ? gradeLabel(sc.score) : ''
      ]);
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
      <div className="drawer-actions">
        <button className="btn-primary" onClick={handleDownload}>Download report ↓</button>
        <button className="outline-button" onClick={printReportPdf}>Print / PDF ↗</button>
      </div>
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
