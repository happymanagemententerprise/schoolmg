// ============================================================
//  Happy Man Academy — SessionSelector React component
//
//  Shows either a plain eyebrow label (no past sessions with data)
//  or a <select> dropdown listing the current session + all past
//  sessions that have grade data for the given student.
// ============================================================
import { useState, useEffect } from 'react';
import { getSessionsWithData } from '../../data/prevSessionCache.js';

export default function SessionSelector({
  studentId,
  currentSessionName,
  selectedSessionId,
  onSelect,
}) {
  const [pastSessions, setPastSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getSessionsWithData(studentId)
      .then(sessions => {
        setPastSessions(sessions);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [studentId]);

  if (loading) return null;

  if (!loading && pastSessions.length === 0) {
    return <p className="eyebrow session-eyebrow">{currentSessionName}</p>;
  }

  return (
    <select
      className="select-inline session-select"
      value={selectedSessionId ?? 'current'}
      onChange={e => {
        const v = e.target.value;
        if (v === 'current') {
          onSelect(null, currentSessionName);
        } else {
          const s = pastSessions.find(x => String(x.id) === v);
          onSelect(v, s?.name ?? v);
        }
      }}
    >
      <option value="current">{currentSessionName} (Current)</option>
      {pastSessions.map(s => (
        <option key={s.id} value={String(s.id)}>{s.name}</option>
      ))}
    </select>
  );
}
