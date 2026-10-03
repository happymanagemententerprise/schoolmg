// ============================================================
//  Happy Man Academy — AdminProgression React component
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { Data, Academic, Progression } from '../../data/index.js';
import { getCurrentUser } from '../../state.js';
import { _prRows, set_prRows } from '../../state.js';
import {
  esc, toneClass, formatDate, statusClass,
  currentTerm, passMark, toast
} from '../../utils.js';
import { prDecisionRows, termCoverageProgression } from '../../views/admin.js';
import { termNameOf, renderPassport } from '../../views/shared.js';

// ── AdminProgression (root) ───────────────────────────────────
export default function AdminProgression() {
  const [v, setV]     = useState(0);
  const refresh       = useCallback(() => setV(n => n + 1), []);
  const currentUser   = getCurrentUser();

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

  // Dry-run / commit
  const handleDryRun = () => {
    // Re-render re-reads prDecisionRows
    setV(n => n + 1);
    toast('Preview refreshed — nothing written.');
  };

  const handleCommit = () => {
    const rows = prDecisionRows();
    set_prRows(rows);
    const gate = Data.promotionsGate();
    if (!gate.open) { toast(gate.reason, 'error'); return; }
    const counts = {};
    rows.forEach(r => { counts[r.decision.outcome] = (counts[r.decision.outcome] || 0) + 1; });
    askSensitive(
      'Commit promotion decisions',
      `${rows.length} active student(s). ${counts.promoted || 0} promoted to the next class, ` +
      `${counts.pooled || 0} moved into the Grade 10 Pool, ${counts.graduated || 0} graduate, ` +
      `${counts.repeat || 0} repeat. Class assignments and promotion records are updated now — this is the end-of-session action.`,
      async () => {
        const poolId = Progression.poolClass()?.id || null;
        for (const r of rows) {
          const d = r.decision, ch = d.check || {};
          await Progression.snapshotPromotions([{
            studentId: r.id, fromClassId: r.classId,
            toClassId: d.outcome === 'pooled' ? poolId : d.outcome === 'promoted' ? Progression.classAfter(r.classId) : null,
            outcome: d.outcome,
            avg: ch.avg ?? null, en: ch.english ?? null, ma: ch.maths ?? null
          }]);
          if (d.outcome === 'pooled' && poolId) {
            await Progression.assignClass(r.id, poolId, { reason: 'pool_placement', note: 'End-of-session promotion', userId: currentUser.id });
          } else if (d.outcome === 'promoted') {
            const next = Progression.classAfter(r.classId);
            if (next) await Progression.assignClass(r.id, next, { reason: 'promotion', note: 'Met the promotion rule', userId: currentUser.id });
          }
        }
        refresh();
        toast('Promotion decisions committed.');
      }
    );
  };

  const gate = Data.promotionsGate();

  return (
    <>
      <section className="welcome-row">
        <div>
          <p className="eyebrow">End-of-session academic flow</p>
          <h1>Progression &amp; Placement</h1>
          <p className="subcopy">Decisions are previewed first, then committed. Pool placement, results publication, positions, approvals, and the school day.</p>
        </div>
        <button className="btn-primary" onClick={handleDryRun}>Dry run</button>
        <button className="btn-primary" onClick={handleCommit} disabled={!gate.open}>Commit decisions</button>
      </section>

      <ProgressionDecisions refresh={refresh} askSensitive={askSensitive} v={v} />

      <div className="setup-grid mt16">
        <ProgressionPool
          refresh={refresh}
          askSensitive={askSensitive}
          openPlacement={sid => setPlacementModal({ open: true, studentId: sid })}
          v={v}
        />
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

// ── ProgressionDecisions ──────────────────────────────────────
function ProgressionDecisions({ refresh, askSensitive, v: _v }) {
  const gate = Data.promotionsGate();

  if (!gate.open) {
    return (
      <div className="panel mt16">
        <div className="panel-heading">
          <div><p className="eyebrow">Decision preview</p><h2>End-of-session promotion</h2></div>
          <span className="read-only-badge">—</span>
        </div>
        <p className="role-muted">
          {termNameOf(gate.term)} results have to be published before any student is marked promoted. Publish them above to close the session and unlock the decisions.
        </p>
        <div className="table-wrap mt16">
          <table>
            <thead>
              <tr><th>Student</th><th>Class</th><th>EN</th><th>MA</th><th>Avg</th><th>Decision</th><th>Next class</th><th></th></tr>
            </thead>
            <tbody>
              <tr><td colSpan={8} className="muted-cell">Nothing to evaluate until final term is published.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const rows = prDecisionRows();
  set_prRows(rows);
  const counts = {};
  rows.forEach(r => { counts[r.decision.outcome] = (counts[r.decision.outcome] || 0) + 1; });
  const summaryBadge = rows.length
    ? `${rows.length} students · ${counts.promoted || 0} promote · ${counts.pooled || 0} to pool · ${counts.graduated || 0} graduate · ${counts.repeat || 0} repeat`
    : 'No active students';
  const note = rows.length
    ? 'Preview only. Commit writes the promotion records and moves pooled students into the Grade 10 Pool.'
    : 'Nothing to evaluate yet — add students and enter scores first.';

  return (
    <div className="panel mt16">
      <div className="panel-heading">
        <div><p className="eyebrow">Decision preview</p><h2>End-of-session promotion</h2></div>
        <span className="read-only-badge">{summaryBadge}</span>
      </div>
      <p className="role-muted">{note}</p>
      <div className="table-wrap mt16">
        <table>
          <thead>
            <tr><th>Student</th><th>Class</th><th>EN</th><th>MA</th><th>Avg</th><th>Decision</th><th>Next class</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const d  = r.decision, ch = d.check || {};
              const override = Progression.overrideOf(r.id);
              const chip = d.outcome === 'promoted'  ? <span className="status promoted">Promote</span>
                         : d.outcome === 'pooled'    ? <span className="status review">Pool</span>
                         : d.outcome === 'graduated' ? <span className="status promoted">Graduate</span>
                         :                             <span className="status repeat">Repeat</span>;
              const hint = d.outcome === 'repeat' && d.reason === 'no_marks'
                ? <small className="muted-cell"> no marks</small> : null;
              const overrideTag = override
                ? <small className="muted-cell">admin → {override.decision}</small>
                : null;
              return (
                <tr key={r.id}>
                  <td><strong>{r.name}</strong></td>
                  <td>{r.className}</td>
                  <td>{ch.english ?? '—'}</td>
                  <td>{ch.maths ?? '—'}</td>
                  <td>{ch.avg ?? '—'}</td>
                  <td>{chip}{hint}{overrideTag}</td>
                  <td>{r.next}</td>
                  <td className="role-row-actions">
                    {override ? (
                      <button
                        className="btn-sm-outline"
                        title="Revert to the rule"
                        onClick={() => {
                          askSensitive(
                            'Revert to the automatic rule?',
                            `${r.name}'s manual decision will be removed and the ${passMark()}-mark rule will apply again for this session.`,
                            async () => {
                              await Progression.clearOverride(r.id);
                              refresh();
                              toast('Override removed.');
                            }
                          );
                        }}
                      >↩ Clear</button>
                    ) : (
                      <button
                        className="btn-sm-save"
                        title="Manually promote a student below the line"
                        disabled={!(d.outcome === 'repeat' || d.outcome === 'promoted')}
                        onClick={() => {
                          askSensitive(
                            'Manually promote this student?',
                            `${r.name} fell below the 50-mark line, but as Administrator you can still promote them. The manual decision overrides the automatic rule for this session. Confirm with your password.`,
                            async () => {
                              const currentUser = getCurrentUser();
                              await Progression.setOverride(r.id, 'promoted', 'Manual promotion by admin', currentUser.id);
                              refresh();
                              toast('Manual decision recorded — the override wins for this session.');
                            }
                          );
                        }}
                      >Manual</button>
                    )}
                    <button
                      className="btn-sm-outline"
                      title="Print the Student Achievement Passport"
                      onClick={() => renderPassport(r.id)}
                    >Passport</button>
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

// ── ProgressionPool ───────────────────────────────────────────
function ProgressionPool({ refresh, askSensitive, openPlacement, v: _v }) {
  const currentUser = getCurrentUser();
  const entrants    = Progression.poolEntrants();
  const poolClass   = Progression.poolClass();
  const allClasses  = Data.classes();

  const handleClosePool = () => {
    const n = entrants.length;
    if (!n) return;
    askSensitive(
      'Close the Grade 10 Pool',
      `${n} unplaced entrant(s) will be marked inactive in the roll. This cannot be undone.`,
      async () => {
        const count = await Progression.closePool(currentUser.id);
        refresh();
        toast(count ? `${count} unplaced entrant(s) marked inactive.` : 'Nothing to close.');
      }
    );
  };

  const handleDecision = async (studentId, chosenStream) => {
    // Find target class: SS year 10, matching stream, not a pool class
    const target = allClasses.find(c =>
      c.level === 'SS' &&
      c.year  === 10 &&
      c.stream === chosenStream &&
      c.selectionMode !== 'pool'
    );
    if (!target) {
      toast(`No class configured for ${chosenStream} stream.`, 'error');
      return;
    }
    const ok = await Progression.assignClass(studentId, target.id, {
      reason: 'stream_placement',
      note: `Placed into ${chosenStream} stream`,
      userId: currentUser.id
    });
    if (!ok) {
      toast(`Could not place student — they may already be in ${target.name}, or a connection error occurred.`, 'error');
      return;
    }
    refresh();
    const s = Data.student(studentId);
    toast(`${s?.name || 'Student'} placed in ${target.name}.`);
  };

  return (
    <article className="panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Grade 9 checkpoint</p><h2>Grade 10 Pool</h2></div>
        <button className="outline-button" disabled={!entrants.length} onClick={handleClosePool}>
          Close pool
        </button>
      </div>
      <p className="role-muted">
        Grade 9 exits to the pool unconditionally at the end of Term 2. Unplaced entrants stay here until streamed; closing the pool marks any that remain as inactive.
      </p>
      <div className="table-wrap mt16">
        <table>
          <thead>
            <tr><th>Name</th><th>Path (student pick)</th><th>Decision</th></tr>
          </thead>
          <tbody>
            {entrants.length ? entrants.map(s => {
              const pr = Progression.pathRequest(s.id);
              const chosenStream = pr?.stream || null;
              const allStreams   = ['Science', 'Arts', 'Commercial'];
              const pathBadge   = chosenStream
                ? <span className={`status ${chosenStream === 'Science' ? 'promoted' : chosenStream === 'Arts' ? 'review' : 'repeat'}`}>{chosenStream}</span>
                : <span className="muted-cell">—</span>;

              let decisionButtons;
              if (chosenStream) {
                decisionButtons = (
                  <>
                    <button className="btn-sm-save" onClick={() => handleDecision(s.id, chosenStream)}>Approve</button>
                    {allStreams.filter(st => st !== chosenStream).map(st => (
                      <button key={st} className="btn-sm-outline" onClick={() => handleDecision(s.id, st)}>{st}</button>
                    ))}
                  </>
                );
              } else {
                decisionButtons = (
                  <>
                    {allStreams.map(st => (
                      <button key={st} className="btn-sm-outline" onClick={() => handleDecision(s.id, st)}>{st}</button>
                    ))}
                  </>
                );
              }

              return (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    <small style={{ display: 'block', color: 'var(--muted)' }}>{Data.cls(s.classId)?.name || '—'}</small>
                  </td>
                  <td>{pathBadge}</td>
                  <td className="role-row-actions">{decisionButtons}</td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={3} className="muted-cell">
                  {poolClass ? 'No entrants in the pool right now.' : 'No pool class configured yet (set one class to selection mode "pool").'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

// ── PublishPanel ──────────────────────────────────────────────
function PublishPanel({ refresh, v: _v }) {
  const currentUser = getCurrentUser();
  const terms = Data.session().terms;

  const handlePublish = async (term, on) => {
    await Progression.setTermPublished(term, on, currentUser.id);
    refresh();
    toast(on ? `Term ${term} results published.` : `Term ${term} results taken offline.`);
  };

  return (
    <article className="panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Results access</p><h2>Publish</h2></div>
      </div>
      <p className="role-muted">
        A term cannot be published while any class still has an unentered score cell. Coverage is live below.
      </p>
      <div className="setup-form">
        {terms.map(t => {
          const pct   = termCoverageProgression(t.term);
          const isPub = Data.published(t.term);
          const state = isPub ? 'Published' : pct >= 100 ? 'Ready to publish' : `Waiting on ${Math.min(100, 100 - pct)}% of classes`;
          return (
            <div className="form-group" key={t.term}>
              <label>{t.name}</label>
              <div className="toggle-row">
                <span className={isPub ? 'open-label' : 'closed-label'}>{state}</span>
                <button
                  className="btn-primary"
                  disabled={!isPub && pct < 100}
                  onClick={() => handlePublish(t.term, !isPub)}
                >
                  {isPub ? 'Unpublish' : 'Publish'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

// ── PositionsPanel ────────────────────────────────────────────
function PositionsPanel({ v: _v }) {
  const [posTerm, setPosTerm] = useState(() => currentTerm());
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    Progression.positions(posTerm).then(rows => setPositions(rows));
  }, [posTerm, _v]);

  const sorted = [...positions].sort((a, b) =>
    (a.yearPosition - b.yearPosition) || (a.classPosition - b.classPosition));

  return (
    <div className="panel mt16">
      <div className="panel-heading">
        <div><p className="eyebrow">Rankings</p><h2>Positions</h2></div>
        <select
          className="select-inline"
          aria-label="Positions term"
          value={posTerm}
          onChange={e => setPosTerm(Number(e.target.value))}
        >
          <option value={1}>Term 1</option>
          <option value={2}>Term 2</option>
          <option value={3}>Term 3</option>
        </select>
      </div>
      <div className="table-wrap mt16">
        <table>
          <thead>
            <tr><th>#</th><th>Student</th><th>Class</th><th>Class pos.</th><th>Year pos.</th><th>Term avg</th><th>Session avg</th></tr>
          </thead>
          <tbody>
            {sorted.length ? sorted.map((r, i) => {
              const s  = Data.student(r.studentId);
              const cl = Data.cls(r.classId);
              return (
                <tr key={r.studentId}>
                  <td>{i + 1}</td>
                  <td><strong>{s?.name || '—'}</strong></td>
                  <td>{cl?.name || '—'}</td>
                  <td>{r.classPosition}</td>
                  <td>{r.yearPosition}</td>
                  <td>{r.termAvg ?? '—'}</td>
                  <td>{r.sessionAvg ?? '—'}</td>
                </tr>
              );
            }) : (
              <tr><td colSpan={7} className="muted-cell">No positions yet for this term.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ApprovalsPanel ────────────────────────────────────────────
function ApprovalsPanel({ refresh, v: _v }) {
  const currentUser = getCurrentUser();
  const rows = Progression.approvalsFor ? Progression.approvalsFor() : [];

  const handleApprove = async (a) => {
    await Progression.decideApproval(a.id, true, currentUser.id);
    refresh();
    toast('Request approved.');
  };

  const handleReject = async (a) => {
    await Progression.decideApproval(a.id, false, currentUser.id);
    refresh();
    toast('Request rejected.');
  };

  return (
    <article className="panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Principal review</p><h2>Approvals</h2></div>
      </div>
      {rows.length ? rows.map(a => {
        const who    = a.requestedBy ? Data.user(a.requestedBy) : null;
        const action = String(a.actionType || 'approve').replace(/_/g, ' ');
        return (
          <div className="event-mini-row" key={a.id}>
            <span className="event-dot event-academic"></span>
            <div>
              <strong>{a.note || action}</strong>
              <small>
                {action} · {a.entityType || ''}{who ? ' · requested by ' + who.name : ''} · {formatDate(a.at)}
              </small>
            </div>
            <span className="role-row-actions">
              <button className="outline-button" onClick={() => handleApprove(a)}>Approve</button>
              <button className="outline-button" onClick={() => handleReject(a)}>Reject</button>
            </span>
          </div>
        );
      }) : (
        <p className="muted-cell">Nothing awaiting your decision.</p>
      )}
    </article>
  );
}

// ── DayStructurePanel ─────────────────────────────────────────
function DayStructurePanel({ refresh }) {
  const [periods,     setPeriods]     = useState(() => Data.ttSettings()?.periods || 6);
  const [start,       setStart]       = useState(() => Data.ttSettings()?.start || '08:00');
  const [minutes,     setMinutes]     = useState(() => Data.ttSettings()?.periodMinutes || Data.ttSettings()?.minutes || 40);
  const [resetBreaks, setResetBreaks] = useState(false);
  const [breaks,      setBreaks]      = useState(() => {
    const s = Data.ttSettings();
    return s?.breaks || [];
  });
  const [feedback, setFeedback] = useState('');

  const handleSave = async () => {
    const currentUser = getCurrentUser();
    if (!periods || periods < 4 || periods > 9) {
      setFeedback('Periods per day must be between 4 and 9.'); return;
    }
    if (!minutes || minutes < 20 || minutes > 90) {
      setFeedback('Period length must be between 20 and 90 minutes.'); return;
    }
    // Use lazy import to avoid circular issues
    const { Timetable } = await import('../../data/index.js');
    const finalBreaks = resetBreaks ? Timetable.DAY_DEFAULTS?.breaks || [] : breaks;
    await Data.saveTimetableSettings({ periods, start: start || '08:00', minutes, breaks: finalBreaks }, currentUser.id);
    setFeedback('');
    toast('Day structure saved. Regenerate the timetable on the Timetable page.');
    refresh();
  };

  return (
    <article className="panel">
      <div className="panel-heading">
        <div><p className="eyebrow">School day</p><h2>Day structure</h2></div>
      </div>
      <p className="role-muted">Changing the day structure invalidates the saved timetable — regenerate it afterwards.</p>
      <div className="setup-form">
        <div className="form-group mt16">
          <label htmlFor="dstr-periods-r">Periods per day</label>
          <input id="dstr-periods-r" type="number" min="4" max="9" value={periods} onChange={e => setPeriods(Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label htmlFor="dstr-start-r">First bell</label>
          <input id="dstr-start-r" type="text" placeholder="08:00" value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="dstr-minutes-r">Period length (min)</label>
          <input id="dstr-minutes-r" type="number" min="20" max="90" value={minutes} onChange={e => setMinutes(Number(e.target.value))} />
        </div>
        <label className="dept-check mt8">
          <input type="checkbox" checked={resetBreaks} onChange={e => setResetBreaks(e.target.checked)} />
          <span>Restore default breaks (after 3rd period 20 min, after 7th 45 min)</span>
        </label>
        <button className="btn-primary mt16" onClick={handleSave}>Save day structure</button>
        {feedback && <div className="form-feedback mt8 text-danger">{feedback}</div>}
      </div>
    </article>
  );
}

// ── SensitiveConfirmModal ─────────────────────────────────────
function SensitiveConfirmModal({ open, title, message, onConfirm, onClose }) {
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');

  if (!open) return null;

  const handleConfirm = async () => {
    const currentUser = getCurrentUser();
    if (!Data.passwordMatches(currentUser, password)) {
      setError('That password is not right for this account.');
      return;
    }
    setError('');
    setPassword('');
    onClose();
    if (typeof onConfirm === 'function') await onConfirm();
  };

  const handleClose = () => {
    setPassword('');
    setError('');
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="close-modal" onClick={handleClose}>&times;</button>
        </div>
        <div className="modal-body">
          <p className="role-muted">{message}</p>
          <div className="form-group mt16">
            <label htmlFor="sc-password-r">Your password</label>
            <input
              id="sc-password-r"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }}
              autoComplete="current-password"
            />
          </div>
          {error && <p className="form-feedback mt8 text-danger">{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="outline-button" onClick={handleClose}>Cancel</button>
          <button className="btn-primary" onClick={handleConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ── PlacementModal ────────────────────────────────────────────
function PlacementModal({ open, studentId, onClose, onDone }) {
  const [classId,  setClassId]  = useState('');
  const [note,     setNote]     = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');

  if (!open || !studentId) return null;

  const s       = Data.student(studentId);
  const cl      = s ? Data.cls(s.classId) : null;
  let targets   = Data.classes().filter(c => c.level === 'SS' && c.year === 10 && c.stream && c.selectionMode !== 'pool');
  if (!targets.length) targets = Data.classes().filter(c => c.level === 'SS' && c.stream && c.selectionMode !== 'pool');

  const handlePlace = async () => {
    const currentUser = getCurrentUser();
    if (!Data.passwordMatches(currentUser, password)) {
      setError('That password is not right for this account.');
      return;
    }
    if (!classId) { setError('Choose a target class first.'); return; }
    setError('');
    onClose();
    await Progression.assignClass(s.id, classId, { reason: 'pool_placement', note: note.trim(), userId: currentUser.id });
    toast('Student placed in their track class.');
    setPassword(''); setNote(''); setClassId('');
    onDone();
  };

  const handleClose = () => {
    setPassword(''); setNote(''); setClassId(''); setError('');
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>Place student</h3>
          <button className="close-modal" onClick={handleClose}>&times;</button>
        </div>
        <div className="modal-body">
          <p className="eyebrow">Picks the senior subject list of the chosen track.</p>
          <p><strong>{s?.name}</strong> · {cl?.name || 'Grade 10 Pool'}</p>
          <div className="form-group mt8">
            <label>Target class</label>
            <select value={classId} onChange={e => setClassId(e.target.value)}>
              <option value="">— Choose track class —</option>
              {targets.map(c => (
                <option key={c.id} value={c.id}>{c.name} · {c.stream}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Note (optional)</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="pl-password-r">Your password</label>
            <input
              id="pl-password-r"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="form-feedback mt8 text-danger">{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="outline-button" onClick={handleClose}>Cancel</button>
          <button className="btn-primary" onClick={handlePlace}>Place student</button>
        </div>
      </div>
    </div>
  );
}
