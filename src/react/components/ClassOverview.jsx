// ============================================================
//  Happy Man Academy — ClassOverview React component
// ============================================================
import { useState } from 'react';
import { Data, Academic, Progression } from '../../data/index.js';
import { getCurrentUser } from '../../state.js';
import { toneClass, currentTerm, toast, statusClass } from '../../utils.js';
import { myClassRecord, isHOD } from '../../auth.js';

// Lazy imports to avoid circular deps with router.js
const gotoView = (page) => {
  import('../../router.js').then(m => { m.showView(page); m.renderView(page); });
};

const gotoAttendanceFocused = (sid) => {
  import('../../router.js').then(m => {
    m.showView('view-class-attendance');
    import('../../views/teacher.js').then(({ renderClassAttendance }) => {
      renderClassAttendance(sid);
    });
  });
};

export default function ClassOverview() {
  const currentUser = getCurrentUser();
  const [v, setV]   = useState(0);
  const cl = myClassRecord(currentUser);
  if (!cl) {
    return <p className="muted-cell" style={{ padding: 16 }}>You are not assigned a class yet.</p>;
  }

  const students = Data.studentsByClass(cl.id).filter(s => s.status !== 'archived');
  const term     = currentTerm();
  const fb       = Data.feedback();
  const pending  = students.filter(s => !fb[s.id]?.submitted).length;
  const avg      = Academic.classAverage(cl.id, term);
  const girls    = students.filter(s => s.gender === 'F').length;
  const boys     = students.filter(s => s.gender === 'M').length;
  const atts     = students.map(s => +Academic.attendancePct(s.id));
  const avgAtt   = atts.length ? Math.round(atts.reduce((a, b) => a + b, 0) / atts.length) : 0;
  const promoted = students.filter(s => Academic.canPromote ? Academic.canPromote(s.id, term) : false).length;

  // Approvals
  const mine      = new Set(students.map(s => String(s.id)));
  const approvals = (Progression.pendingApprovals ? Progression.pendingApprovals() : [])
    .filter(a => a.actionType === 'subject_change' && mine.has(String(a.entityId)));

  const handleApprove = async (a) => {
    const ids = Array.isArray(a.payload?.subjectIds) ? a.payload.subjectIds : [];
    await Progression.chooseSubjects(a.entityId, ids, { status: 'effective', userId: currentUser.id });
    await Progression.decideApproval(a.id, true, currentUser.id, 'Approved by class teacher');
    const firstName = Data.student(a.entityId)?.name.split(' ')[0] || 'Student';
    toast(`${firstName}'s subjects are now effective. ✓`);
    setV(n => n + 1);
  };

  const handleReject = async (a) => {
    const prev = Array.isArray(a.payload?.previous) ? a.payload.previous : [];
    await Progression.chooseSubjects(a.entityId, prev, { status: 'effective', userId: currentUser.id });
    await Progression.decideApproval(a.id, false, currentUser.id, 'Declined by class teacher');
    toast('Change request declined; previous subjects kept.');
    setV(n => n + 1);
  };

  const handleResetPassword = async (sid) => {
    import('../../views/shared.js').then(({ openResetPasswordModal }) => {
      openResetPasswordModal(sid);
    });
  };

  const atRisk = students.flatMap(s => {
    const att   = +Academic.attendancePct(s.id);
    const items = [];
    if (att < 90) items.push({ icon: '!', color: 'coral-bg', msg: `Low attendance (${att}%)`, name: s.name });
    if (Academic.promotionStatus(s.id, term) === 'Repeat') {
      items.push({ icon: '↘', color: 'yellow-bg', msg: 'Not on track to promote', name: s.name });
    }
    return items;
  });

  return (
    <>
      {/* Welcome row */}
      <section className="welcome-row role-welcome">
        <div>
          <p className="eyebrow">{isHOD(currentUser) ? 'HOD · ' : ''}Class teacher · {cl.name}</p>
          <h1>Good morning, {currentUser.name.split(' ')[0]}.</h1>
          <p className="subcopy">Your class attendance and end-of-term feedback are ready.</p>
        </div>
        <button className="btn-primary" onClick={() => gotoView('view-class-feedback')}>
          + Add feedback
        </button>
      </section>

      {/* Stat grid */}
      <section className="stat-grid">
        <article className="student-stat coral-stat">
          <span>Class students</span>
          <strong>{students.length}</strong>
          <small>{girls} girls · {boys} boys</small>
        </article>
        <article className="student-stat green-stat">
          <span>Class attendance</span>
          <strong>{avgAtt}%</strong>
          <small>This term</small>
        </article>
        <article className="student-stat blue-stat">
          <span>Class average</span>
          <strong>{avg}%</strong>
          <small>This term</small>
        </article>
        <article className="student-stat yellow-stat">
          <span>On track to promote</span>
          <strong>{promoted}/{students.length}</strong>
          <small>{pending} pending feedback</small>
        </article>
      </section>

      {/* Main content */}
      <section className="role-grid">
        {/* Student table */}
        <article className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Term close-out</p><h2>Attendance &amp; feedback</h2></div>
            <div className="form-row tight">
              <button className="text-button" onClick={() => gotoView('view-class-report')}>Class report ↗</button>
              <button className="text-button" onClick={() => {
                import('../../views/shared.js').then(({ openClassReportModal }) => {
                  openClassReportModal(cl.id);
                });
              }}>Full register ↗</button>
            </div>
          </div>
          <div className="role-table mt16">
            <div className="role-table-head">
              <span>Student</span><span>Attendance</span><span>Feedback</span><span></span>
            </div>
            {students.map(s => {
              const att  = Academic.attendancePct(s.id);
              const done = fb[s.id]?.submitted;
              return (
                <div className="role-table-row" key={s.id}>
                  <span className="student">
                    <span className={`student-avatar ${toneClass(s.tone)}`}>{s.initials}</span>
                    {s.name}
                  </span>
                  <strong>{att}</strong>
                  <span className={`status ${done ? 'promoted' : 'review'}`}>
                    {done ? 'Done' : 'Pending'}
                  </span>
                  <span className="role-row-actions">
                    <button
                      className="row-menu ct-att-btn"
                      title="Edit attendance"
                      onClick={() => gotoAttendanceFocused(s.id)}
                    >✎</button>
                    <button
                      className="btn-sm-save"
                      title="Reset password"
                      onClick={() => handleResetPassword(s.id)}
                    >Reset</button>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="role-muted">
            Tip: the <strong>&#9998;</strong> at the end of a student's row jumps to that student's attendance for the term.
          </p>
        </article>

        {/* Support / at-risk */}
        <article className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Class health</p><h2>Needs support</h2></div>
            <span className="check-badge">{atRisk.length}</span>
          </div>
          <p className="role-muted">Students who need a note or follow-up before reports close.</p>
          <div>
            {atRisk.length ? atRisk.map((item, i) => (
              <div className="support-item" key={i}>
                <span className={`support-icon ${item.color}`}>{item.icon}</span>
                <div><strong>{item.msg}</strong><small>{item.name}</small></div>
                <span>↗</span>
              </div>
            )) : (
              <p className="muted-cell">Every student is on track.</p>
            )}
          </div>
          <button
            className="outline-button mt16"
            onClick={() => gotoView('view-class-attendance')}
          >
            Open attendance register ↗
          </button>
        </article>
      </section>

      {/* Approvals */}
      <div className="panel mt16">
        <div className="panel-heading">
          <div><p className="eyebrow">Subject registration</p><h2>Change requests</h2></div>
          <span className="check-badge">{approvals.length}</span>
        </div>
        <p className="role-muted">
          Year 11 &amp; 12 students who asked to change their subjects. Approving the request makes the new subject list effective.
        </p>
        <div className="mt16">
          {approvals.length ? approvals.map(a => {
            const st   = Data.student(a.entityId);
            const ids  = Array.isArray(a.payload?.subjectIds) ? a.payload.subjectIds : [];
            const names = ids.length
              ? ids.map(id => Data.subject(String(id))?.name || id).join(', ')
              : (a.payload?.summary || 'Requested a change');
            return (
              <div className="approval-row" key={a.id}>
                <span className="student">
                  <span className={`student-avatar ${st ? toneClass(st.tone) : 'blue'}`}>
                    {st ? st.initials : '?'}
                  </span>
                </span>
                <div style={{ flex: 1 }}>
                  <strong className="twelve">{st?.name || 'Student ' + a.entityId}</strong>
                  <span className="approval-sub">{names}</span>
                </div>
                <span className="status review">Pending</span>
                <span className="approval-actions">
                  <button className="btn-sm-save" onClick={() => handleApprove(a)}>Approve</button>
                  <button className="btn-sm-outline" onClick={() => handleReject(a)}>Reject</button>
                </span>
              </div>
            );
          }) : (
            <p className="muted-cell">No pending subject change requests for your class.</p>
          )}
        </div>
      </div>
    </>
  );
}
