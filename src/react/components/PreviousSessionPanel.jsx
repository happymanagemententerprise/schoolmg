// ============================================================
//  Happy Man Academy — PreviousSessionPanel React component
//
//  Displays grade, attendance, and growth data for a past
//  session.  All sub-components are defined in this file and
//  are not exported.
// ============================================================
import { useState, useEffect } from 'react';
import { fetchPrevSession } from '../../data/prevSessionCache.js';
import { Data } from '../../data/index.js';
import { gradeLabel, passMark } from '../../utils.js';

// ── Main component ───────────────────────────────────────────

export default function PreviousSessionPanel({
  studentId,
  sessionId,
  sessionName,
  onDownload,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTerm, setActiveTerm] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchPrevSession(studentId, sessionId)
      .then(d => {
        setData(d);
        const term = [3, 2, 1].find(t => (d.gradesByTerm[t]?.length ?? 0) > 0) ?? null;
        setActiveTerm(term);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, [studentId, sessionId]);

  if (loading) {
    return <div className="prev-session-loading">Loading session data…</div>;
  }

  if (error) {
    return <div className="prev-session-error">Could not load data: {error}</div>;
  }

  const subjects = Data.subjects();

  return (
    <div className="prev-session-panel">
      <SessionSummaryCards data={data} subjects={subjects} />
      <TermTabs data={data} activeTerm={activeTerm} setActiveTerm={setActiveTerm} />
      {activeTerm !== null && (
        <ScoreTable data={data} activeTerm={activeTerm} subjects={subjects} />
      )}
      <AttendanceSummary data={data} />
      <GrowthSnapshot studentId={studentId} sessionId={sessionId} data={data} />
      {onDownload && (
        <div className="drawer-actions">
          <button className="btn-primary" onClick={() => onDownload(data)}>
            Download previous session report ↓
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-component: SessionSummaryCards ───────────────────────

function SessionSummaryCards({ data, subjects: _subjects }) {
  // Compute per-term average from gradesByTerm
  const termAvgs = [1, 2, 3].map(t => {
    const rows = data.gradesByTerm[t] || [];
    const valids = rows.filter(r => r.test != null && r.exam != null);
    if (valids.length === 0) return null;
    const sum = valids.reduce((acc, r) => acc + (r.test + r.exam), 0);
    return Math.round(sum / valids.length);
  });

  const nonNullAvgs = termAvgs.filter(a => a !== null);
  const sessionAvg = nonNullAvgs.length
    ? Math.round(nonNullAvgs.reduce((a, b) => a + b, 0) / nonNullAvgs.length)
    : null;

  return (
    <div className="session-summary-row">
      {[1, 2, 3].map((t, i) => (
        <div className="stat-card" key={t}>
          <div className="stat-top">
            <span className="stat-label">Term {t} avg</span>
          </div>
          <strong>{termAvgs[i] !== null ? termAvgs[i] + '%' : '—'}</strong>
        </div>
      ))}
      <div className="stat-card">
        <div className="stat-top">
          <span className="stat-label">Session avg</span>
        </div>
        <strong>{sessionAvg !== null ? sessionAvg + '%' : '—'}</strong>
      </div>
    </div>
  );
}

// ── Sub-component: TermTabs ───────────────────────────────────

function TermTabs({ data, activeTerm, setActiveTerm }) {
  const available = [1, 2, 3].filter(t => (data.gradesByTerm[t]?.length ?? 0) > 0);

  if (available.length === 0) return null;

  return (
    <div className="term-tabs">
      {available.map(t => (
        <button
          key={t}
          className={'tab-btn' + (activeTerm === t ? ' active' : '')}
          onClick={() => setActiveTerm(t)}
        >
          Term {t}
        </button>
      ))}
    </div>
  );
}

// ── Sub-component: ScoreTable ─────────────────────────────────

function scoresForTerm(data, termNum, subjects) {
  const rows = data.gradesByTerm[termNum] || [];
  return rows.map(row => {
    const sub = subjects.find(s => String(s.id) === String(row.subject_id)) || null;
    const ca   = row.test  ?? null;
    const exam = row.exam  ?? null;
    const total = (ca !== null && exam !== null) ? ca + exam : null;
    return { sub, ca, exam, total };
  });
}

function ScoreTable({ data, activeTerm, subjects }) {
  const isTerm3 = activeTerm === 3;

  const t3Scores = isTerm3 ? scoresForTerm(data, 3, subjects) : [];
  const t2BySubjectId = isTerm3
    ? Object.fromEntries(
        scoresForTerm(data, 2, subjects).map(r => [
          String(r.sub?.id ?? ''),
          r.total
        ])
      )
    : {};
  const t1BySubjectId = isTerm3
    ? Object.fromEntries(
        scoresForTerm(data, 1, subjects).map(r => [
          String(r.sub?.id ?? ''),
          r.total
        ])
      )
    : {};

  const activeScores = scoresForTerm(data, activeTerm, subjects);
  const pm = passMark();

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Subject</th>
            <th>Type</th>
            <th>CA (40)</th>
            <th>Exam (60)</th>
            {isTerm3 ? (
              <>
                <th>T3 Total</th>
                <th>T2 Total</th>
                <th>T1 Total</th>
                <th>3-Term Avg</th>
              </>
            ) : (
              <th>Total</th>
            )}
            <th>Grade</th>
            <th>Pass/Fail</th>
          </tr>
        </thead>
        <tbody>
          {activeScores.map((row, idx) => {
            if (isTerm3) {
              const subId = String(row.sub?.id ?? idx);
              const t2 = t2BySubjectId[subId] ?? null;
              const t1 = t1BySubjectId[subId] ?? null;
              const vals = [row.total, t2, t1].filter(v => v !== null);
              const avg3 = vals.length
                ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
                : null;
              const pass = avg3 !== null && avg3 >= pm;
              return (
                <tr key={idx}>
                  <td>{row.sub?.name ?? '—'}</td>
                  <td>{row.sub?.type === 'core' ? 'Core' : 'Elective'}</td>
                  <td>{row.ca ?? '—'}</td>
                  <td>{row.exam ?? '—'}</td>
                  <td>{row.total ?? '—'}</td>
                  <td>{t2 ?? '—'}</td>
                  <td>{t1 ?? '—'}</td>
                  <td>{avg3 ?? '—'}</td>
                  <td>{avg3 !== null ? gradeLabel(avg3) : '—'}</td>
                  <td className={pass ? '' : 'text-danger'}>
                    {avg3 !== null ? (pass ? 'Pass' : 'Fail') : '—'}
                  </td>
                </tr>
              );
            }

            // Term 1 & 2
            const pass = row.total !== null && row.total >= pm;
            return (
              <tr key={idx}>
                <td>{row.sub?.name ?? '—'}</td>
                <td>{row.sub?.type === 'core' ? 'Core' : 'Elective'}</td>
                <td>{row.ca ?? '—'}</td>
                <td>{row.exam ?? '—'}</td>
                <td>{row.total ?? '—'}</td>
                <td>{row.total !== null ? gradeLabel(row.total) : '—'}</td>
                <td className={pass ? '' : 'text-danger'}>
                  {row.total !== null ? (pass ? 'Pass' : 'Fail') : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Sub-component: AttendanceSummary ─────────────────────────

function AttendanceSummary({ data }) {
  return (
    <div className="panel mt16">
      <p className="eyebrow">Attendance</p>
      <div className="stat-row">
        {[1, 2, 3].map(t => {
          const weekMap = data.attendanceByTerm[t] || {};
          const weeks = Object.keys(weekMap).length;
          const totalDays = Object.values(weekMap).reduce((a, b) => a + (b || 0), 0);
          const possible = weeks * 5;
          const pct = possible > 0 ? Math.round((totalDays / possible) * 100) : null;
          return (
            <div className="stat-card" key={t}>
              <div className="stat-top">
                <span className="stat-label">Term {t}</span>
              </div>
              <strong>{pct !== null ? pct + '%' : '—'}</strong>
              <div className="stat-trend neutral">
                {possible > 0 ? `${totalDays} / ${possible} days` : 'No data'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sub-component: GrowthSnapshot ────────────────────────────

function GrowthSnapshot({ studentId, sessionId }) {
  const artifacts = (Data.artifacts() || []).filter(
    a =>
      String(a.studentId) === String(studentId) &&
      String(a.sessionId ?? a.session_id ?? '') === String(sessionId) &&
      a.status === 'verified'
  );

  const commendations = (Data.commendations() || []).filter(
    c =>
      String(c.studentId) === String(studentId) &&
      String(c.sessionId ?? c.session_id ?? '') === String(sessionId)
  );

  const promotionHistory = Data.promotionsFor(studentId);
  const promotion = promotionHistory.find(
    p => String(p.sessionId) === String(sessionId)
  ) || null;

  const hasData = artifacts.length > 0 || commendations.length > 0 || promotion !== null;

  if (!hasData) {
    return (
      <div className="growth-snapshot">
        <p className="muted-cell">No growth data recorded for this session.</p>
      </div>
    );
  }

  return (
    <div className="growth-snapshot">
      <p className="eyebrow">Growth &amp; Achievement</p>
      {artifacts.length > 0 && (
        <span className="growth-badge-chip">
          🏅 {artifacts.length} verified portfolio {artifacts.length === 1 ? 'artifact' : 'artifacts'}
        </span>
      )}
      {commendations.length > 0 && (
        <span className="growth-badge-chip">
          ⭐ {commendations.length} {commendations.length === 1 ? 'commendation' : 'commendations'}
        </span>
      )}
      {promotion && (
        <span className="growth-badge-chip">
          📋 {promotion.outcome}
          {promotion.avg != null ? ` · avg ${promotion.avg}%` : ''}
        </span>
      )}
    </div>
  );
}
