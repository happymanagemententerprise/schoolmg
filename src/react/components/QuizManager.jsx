// ============================================================
//  Happy Man Academy — QuizManager React component (teacher)
// ============================================================
import { useState } from 'react';
import { Data } from '../../data/index.js';
import { getCurrentUser } from '../../state.js';
import { esc, toneClass, formatDate, toast } from '../../utils.js';

// ── Helpers ───────────────────────────────────────────────────
function comboOptions(combos) {
  if (!combos.length) return [{ value: '', label: 'No subject / class allocated' }];
  return combos.map(co => ({
    value: `${co.subject.id}|${co.class.id}`,
    label: `${co.subject.name} · ${co.class.name}`
  }));
}

function emptyQuestion() {
  return { questionText: '', questionType: 'mc', points: 1, options: { A: '', B: '', C: '', D: '' }, correctAnswer: '' };
}

// ── QuizManager (root) ────────────────────────────────────────
export default function QuizManager() {
  const currentUser = getCurrentUser();

  // All combos for this teacher
  const allocs = (Data.teacherSubjects() || []).filter(ts => String(ts.teacherId) === String(currentUser?.id));
  const combos = allocs
    .map(ts => ({ subject: Data.subject(ts.subjectId), class: Data.cls(ts.classId) }))
    .filter(c => c.subject && c.class);

  const options    = comboOptions(combos);
  const [combo, setCombo] = useState(() => options[0]?.value || '');
  const [title, setTitle] = useState('');
  const [desc,  setDesc]  = useState('');
  const [msg,   setMsg]   = useState(null);   // { text, kind }
  const [v,     setV]     = useState(0);
  const [detail, setDetail] = useState(null); // { mode: 'editor'|'results', quiz }

  const [subjectId, classId] = combo ? combo.split('|') : ['', ''];

  const mine = (Data.lmsQuizzes() || []).filter(q => q.teacherId === currentUser?.id);

  const handleCreate = async () => {
    if (!title.trim()) { setMsg({ text: 'A title is required.', kind: 'error' }); return; }
    if (!subjectId || !classId) { setMsg({ text: 'Pick the subject and class first.', kind: 'error' }); return; }
    await Data.createQuiz({ subjectId, classId, title: title.trim(), description: desc.trim() }, currentUser.id);
    setTitle(''); setDesc('');
    setMsg({ text: 'Quiz created. Add questions below.', kind: 'success' });
    setV(n => n + 1);
  };

  const handleTogglePublish = async (quiz) => {
    await Data.setQuizPublished(quiz.id, !quiz.isPublished);
    setV(n => n + 1);
    if (detail?.quiz?.id === quiz.id) setDetail(d => ({ ...d, quiz: { ...d.quiz, isPublished: !quiz.isPublished } }));
  };

  const handleDelete = async (quiz) => {
    await Data.deleteQuiz(quiz.id, currentUser.id);
    toast('Quiz deleted.');
    if (detail?.quiz?.id === quiz.id) setDetail(null);
    setV(n => n + 1);
  };

  return (
    <>
      {/* Welcome row */}
      <section className="welcome-row role-welcome">
        <div>
          <p className="eyebrow">Learning management</p>
          <h1>Quizzes</h1>
          <p className="subcopy">Create quick quizzes and see how each class performs.</p>
        </div>
        <div className="form-row tight">
          <select
            className="select-inline"
            aria-label="Subject and class"
            value={combo}
            onChange={e => setCombo(e.target.value)}
          >
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </section>

      {/* New quiz panel */}
      <section className="panel mt16">
        <div className="panel-heading">
          <div><p className="eyebrow">New quiz</p><h2>Start a quiz</h2></div>
        </div>
        <div className="form-row tight">
          <div className="form-group">
            <label htmlFor="qz-title-r">Title</label>
            <input id="qz-title-r" type="text" placeholder="e.g. Parts of speech" maxLength={200}
              value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="qz-desc-r">Description <small className="muted-cell" style={{ fontWeight: 400 }}>(optional)</small></label>
            <input id="qz-desc-r" type="text" placeholder="e.g. Quick check on nouns and verbs"
              value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
        </div>
        <button className="btn-primary" style={{ width: 'auto', margin: 0 }} onClick={handleCreate}>
          Create quiz &nbsp;+ Add questions
        </button>
        {msg && (
          <div className={`form-feedback mt8${msg.kind === 'error' ? ' text-danger' : ' success'}`}>
            {msg.text}
          </div>
        )}
      </section>

      {/* Quiz list */}
      <div className="panel mt16">
        <div className="panel-heading">
          <div><p className="eyebrow">Your quizzes</p><h2>All quizzes</h2></div>
          <span className="count-badge">{mine.length}</span>
        </div>
        <div className="mt8">
          {mine.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Subject</th><th>Class</th><th>Title</th>
                    <th className="muted-cell">Qns</th>
                    <th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map(q => (
                    <tr key={q.id}>
                      <td>{Data.subject(q.subjectId)?.name || '—'}</td>
                      <td>{Data.classNameOf ? Data.classNameOf(q.classId) : Data.cls(q.classId)?.name || '—'}</td>
                      <td>
                        {q.title}
                        {q.description && (
                          <div className="muted-cell" style={{ fontSize: 10, marginTop: 2 }}>{q.description}</div>
                        )}
                      </td>
                      <td className="muted-cell">{Data.questionsForQuiz(q.id).length}</td>
                      <td>
                        <span className={`status ${q.isPublished ? 'promoted' : 'review'}`}>
                          {q.isPublished ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button className="text-button" onClick={() => setDetail({ mode: 'editor', quiz: q })}>
                            Questions
                          </button>
                          <button className="text-button" onClick={() => handleTogglePublish(q)}>
                            {q.isPublished ? 'Unpublish' : 'Publish'}
                          </button>
                          <button className="text-button" onClick={() => setDetail({ mode: 'results', quiz: q })}>
                            Results
                          </button>
                          <button className="text-button" onClick={() => handleDelete(q)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted-cell">No quizzes yet — create one above.</p>
          )}
        </div>
      </div>

      {/* Detail slot */}
      {detail && (
        <div className="mt16">
          {detail.mode === 'editor' ? (
            <QuizEditorPanel
              quiz={detail.quiz}
              onDone={updatedQuiz => {
                setV(n => n + 1);
                if (updatedQuiz) setDetail(d => ({ ...d, quiz: updatedQuiz }));
              }}
            />
          ) : (
            <QuizResultsPanel quiz={detail.quiz} />
          )}
        </div>
      )}
    </>
  );
}

// ── QuizEditorPanel ───────────────────────────────────────────
function QuizEditorPanel({ quiz, onDone }) {
  const existing = Data.questionsForQuiz(quiz.id);
  const [questions, setQuestions] = useState(
    existing.length ? existing.map(q => ({
      questionText:  q.questionText  || '',
      questionType:  q.questionType === 'tf' ? 'tf' : 'mc',
      points:        Number(q.points) || 1,
      options: {
        A: q.options?.A || '',
        B: q.options?.B || '',
        C: q.options?.C || '',
        D: q.options?.D || ''
      },
      correctAnswer: q.correctAnswer || ''
    })) : [emptyQuestion()]
  );
  const [msg, setMsg] = useState(null);

  const updateQ = (i, field, value) => {
    setQuestions(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'questionType') {
        // Reset options for T/F
        if (value === 'tf') {
          next[i].options = { A: 'True', B: 'False', C: '', D: '' };
        } else {
          next[i].options = { A: '', B: '', C: '', D: '' };
        }
      }
      return next;
    });
  };

  const updateOpt = (i, opt, val) => {
    setQuestions(prev => {
      const next = [...prev];
      next[i] = { ...next[i], options: { ...next[i].options, [opt]: val } };
      return next;
    });
  };

  const removeQ = i => setQuestions(prev => prev.filter((_, idx) => idx !== i));
  const addQ    = () => setQuestions(prev => [...prev, emptyQuestion()]);

  const handleSave = async () => {
    const valid = questions.filter(q => q.questionText.trim());
    if (!valid.length) { setMsg({ text: 'Add at least one question with text.', kind: 'error' }); return; }
    await Data.saveQuizQuestions(quiz.id, valid);
    setMsg({ text: 'Questions saved.', kind: 'success' });
    onDone(quiz);
  };

  const clsName = Data.classNameOf ? Data.classNameOf(quiz.classId) : Data.cls(quiz.classId)?.name || '—';

  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{Data.subject(quiz.subjectId)?.name || ''} · {clsName}</p>
          <h2>Questions — {quiz.title}</h2>
        </div>
        <span className="read-only-badge">{existing.length} saved</span>
      </div>
      <div className="mt8">
        {questions.map((q, i) => (
          <QuestionEditor
            key={i}
            q={q}
            onUpdate={(field, val) => updateQ(i, field, val)}
            onUpdateOpt={(opt, val) => updateOpt(i, opt, val)}
            onRemove={() => removeQ(i)}
          />
        ))}
      </div>
      <div className="form-row tight mt16">
        <button className="outline-button" style={{ width: 'auto', margin: 0 }} onClick={addQ}>
          + Add another question
        </button>
        <button className="btn-primary" style={{ width: 'auto', margin: 0 }} onClick={handleSave}>
          Save questions
        </button>
      </div>
      {msg && (
        <div className={`form-feedback mt8${msg.kind === 'error' ? ' text-danger' : ' success'}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

// ── QuestionEditor ────────────────────────────────────────────
function QuestionEditor({ q, onUpdate, onUpdateOpt, onRemove }) {
  const isTF = q.questionType === 'tf';
  return (
    <div className="quiz-question">
      <div className="form-row tight">
        <div className="form-group" style={{ flex: 2 }}>
          <label>Question</label>
          <input className="q-text" value={q.questionText} onChange={e => onUpdate('questionText', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Type</label>
          <select className="q-type" value={q.questionType} onChange={e => onUpdate('questionType', e.target.value)}>
            <option value="mc">Multiple choice</option>
            <option value="tf">True / False</option>
          </select>
        </div>
        <div className="form-group">
          <label>Points</label>
          <input className="q-points" type="number" min="1" value={q.points} onChange={e => onUpdate('points', Number(e.target.value))} />
        </div>
        <div className="form-group">
          <button className="text-button" style={{ marginTop: 22 }} onClick={onRemove}>Remove</button>
        </div>
      </div>
      <div className="form-row tight">
        {['A', 'B', 'C', 'D'].map(opt => (
          <div className="form-group" key={opt}>
            <label>{opt}</label>
            <input
              className="q-opt"
              data-opt={opt}
              value={isTF ? (opt === 'A' ? 'True' : opt === 'B' ? 'False' : '') : (q.options[opt] || '')}
              disabled={isTF && (opt === 'A' || opt === 'B')}
              onChange={e => onUpdateOpt(opt, e.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="form-group">
        <label>Correct answer</label>
        <input
          className="q-correct"
          value={q.correctAnswer}
          placeholder="e.g. B  —  or  True / False"
          style={{ maxWidth: 300 }}
          onChange={e => onUpdate('correctAnswer', e.target.value)}
        />
      </div>
    </div>
  );
}

// ── QuizResultsPanel ──────────────────────────────────────────
function QuizResultsPanel({ quiz }) {
  const students = (Data.studentsByClass(quiz.classId) || []).filter(s => s.status === 'active');
  const clsName  = Data.classNameOf ? Data.classNameOf(quiz.classId) : Data.cls(quiz.classId)?.name || '—';
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{Data.subject(quiz.subjectId)?.name || ''} · {clsName}</p>
          <h2>Results — {quiz.title}</h2>
        </div>
      </div>
      <div className="table-wrap mt16">
        <table>
          <thead>
            <tr><th>Student</th><th>Admission No.</th><th>Score</th><th>Submitted</th></tr>
          </thead>
          <tbody>
            {students.length ? students.map(s => {
              const attempt = Data.attemptFor(quiz.id, s.id);
              return (
                <tr key={s.id}>
                  <td>
                    <div className="student">
                      <span className={`student-avatar ${toneClass(s.tone)}`}>{s.initials}</span>
                      {s.name}
                    </div>
                  </td>
                  <td className="muted-cell">{s.admissionNo || s.id}</td>
                  <td>{attempt
                    ? <strong>{attempt.score} / {attempt.total}</strong>
                    : <span className="muted-cell">Not attempted</span>
                  }</td>
                  <td className="muted-cell">{attempt?.submittedAt ? formatDate(attempt.submittedAt) : '—'}</td>
                </tr>
              );
            }) : (
              <tr><td colSpan={4} className="muted-cell">No active students in this class.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
