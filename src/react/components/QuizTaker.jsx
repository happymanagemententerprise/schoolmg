// ============================================================
//  Happy Man Academy — QuizTaker React component (student)
// ============================================================
import { useState } from 'react';
import { Data } from '../../data/index.js';
import { getCurrentUser } from '../../state.js';
import { esc, toast } from '../../utils.js';

export default function QuizTaker() {
  const currentUser = getCurrentUser();
  const s = Data.student(currentUser?.studentId);

  const [mode,    setMode]    = useState('list');  // 'list' | 'taker' | 'result'
  const [quizId,  setQuizId]  = useState(null);
  const [answers, setAnswers] = useState({});
  const [v,       setV]       = useState(0);

  if (!s) {
    return (
      <div className="panel mt16">
        <p className="muted-cell">Student record not found. Please contact your administrator.</p>
      </div>
    );
  }

  const quizzes = (Data.quizzesFor(s.classId) || []).filter(q => q.isPublished);

  const openTaker = (id) => {
    setQuizId(id);
    setAnswers({});
    setMode('taker');
  };

  const openResult = (id) => {
    setQuizId(id);
    setMode('result');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const quiz      = (Data.lmsQuizzes() || []).find(x => String(x.id) === String(quizId));
    const questions = Data.questionsForQuiz(quizId);
    const result    = await Data.submitQuizAttempt(quiz.id, s.id, answers);
    if (!result) { toast('This quiz has no questions yet.', 'error'); return; }
    toast(`You scored ${result.score} / ${result.total} — well done.`);
    setV(n => n + 1);
    openResult(quizId);
  };

  // ── List view ──────────────────────────────────────────────
  if (mode === 'list') {
    return (
      <>
        <section className="welcome-row">
          <div>
            <p className="eyebrow">Learning</p>
            <h1>My quizzes</h1>
            <p className="subcopy">Quizzes published for your class — each attempt is one shot, so check your answers before submitting.</p>
          </div>
        </section>
        <div className="panel mt16">
          <div className="panel-heading">
            <div><p className="eyebrow">Available</p><h2>Quizzes</h2></div>
          </div>
          <div className="mt8">
            {quizzes.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Subject</th><th>Title</th>
                      <th className="muted-cell">Qns</th>
                      <th>Your score</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {quizzes.map(q => {
                      const attempt = Data.attemptFor(q.id, s.id);
                      return (
                        <tr key={q.id}>
                          <td>{Data.subject(q.subjectId)?.name || '—'}</td>
                          <td>
                            {q.title}
                            {q.description && (
                              <div className="muted-cell quiz-item-desc">{q.description}</div>
                            )}
                          </td>
                          <td className="muted-cell">{Data.questionsForQuiz(q.id).length}</td>
                          <td>
                            {attempt
                              ? <span className="status promoted">{attempt.score} / {attempt.total}</span>
                              : <span className="muted-cell">Not attempted</span>}
                          </td>
                          <td>
                            {attempt
                              ? <button className="text-button" onClick={() => openResult(q.id)}>View result</button>
                              : <button className="btn-primary small" onClick={() => openTaker(q.id)}>Take quiz</button>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted-cell">No quizzes are available for your class right now.</p>
            )}
          </div>
        </div>
      </>
    );
  }

  const quiz      = (Data.lmsQuizzes() || []).find(x => String(x.id) === String(quizId));
  const questions = quiz ? Data.questionsForQuiz(quizId) : [];

  // ── Taker view ─────────────────────────────────────────────
  if (mode === 'taker') {
    return (
      <>
        <section className="welcome-row">
          <div>
            <p className="eyebrow">Learning</p>
            <h1>My quizzes</h1>
          </div>
          <button className="outline-button" onClick={() => setMode('list')}>← Back to list</button>
        </section>
        <div className="mt16">
          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{Data.subject(quiz?.subjectId)?.name || ''} · {Data.classNameOf ? Data.classNameOf(quiz?.classId) : Data.cls(quiz?.classId)?.name || ''}</p>
                <h2>{quiz?.title}</h2>
              </div>
            </div>
            {quiz?.description && <p className="role-muted">{quiz.description}</p>}
            <form onSubmit={handleSubmit} className="mt8">
              {questions.map((qq, i) => (
                <fieldset className="quiz-fieldset" key={qq.id}>
                  <legend>
                    Question {i + 1}{qq.points > 1 ? ` · ${qq.points} pts` : ''}
                  </legend>
                  <p className="quiz-question-text">{qq.questionText}</p>
                  {qq.questionType === 'tf' ? (
                    <div className="form-row tight">
                      {['True', 'False'].map(val => (
                        <label className="dept-check" key={val}>
                          <input
                            type="radio"
                            name={`q${qq.id}`}
                            value={val}
                            required
                            checked={answers[qq.id] === val}
                            onChange={() => setAnswers(prev => ({ ...prev, [qq.id]: val }))}
                          />
                          {val}
                        </label>
                      ))}
                    </div>
                  ) : (
                    [['A', qq.options?.A], ['B', qq.options?.B], ['C', qq.options?.C], ['D', qq.options?.D]]
                      .filter(([, v]) => v != null && v !== '')
                      .map(([label, val]) => (
                        <label className="dept-check" key={label}>
                          <input
                            type="radio"
                            name={`q${qq.id}`}
                            value={val}
                            required
                            checked={answers[qq.id] === val}
                            onChange={() => setAnswers(prev => ({ ...prev, [qq.id]: val }))}
                          />
                          <strong>{label}.</strong> {val}
                        </label>
                      ))
                  )}
                </fieldset>
              ))}
              <button className="btn-primary mt16 quiz-action-btn" type="submit">
                Submit quiz
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  // ── Result view ─────────────────────────────────────────────
  const attempt = quiz ? Data.attemptFor(quizId, s.id) : null;
  if (!attempt) {
    return (
      <>
        <section className="welcome-row">
          <div><p className="eyebrow">Learning</p><h1>My quizzes</h1></div>
          <button className="outline-button" onClick={() => setMode('list')}>← Back to list</button>
        </section>
        <div className="panel mt16"><p className="muted-cell">No attempt recorded.</p></div>
      </>
    );
  }

  return (
    <>
      <section className="welcome-row">
        <div><p className="eyebrow">Learning</p><h1>My quizzes</h1></div>
        <button className="outline-button" onClick={() => setMode('list')}>← Back to list</button>
      </section>
      <div className="mt16">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{quiz?.title || ''}</p>
              <h2>Your result</h2>
            </div>
            <span className="check-badge">{attempt.score} / {attempt.total}</span>
          </div>
          <div className="table-wrap mt16">
            <table>
              <thead>
                <tr><th>Question</th><th>Your answer</th><th>Correct</th><th></th></tr>
              </thead>
              <tbody>
                {questions.length ? questions.map(qq => {
                  const got   = String(attempt.answers?.[qq.id] ?? '').trim();
                  const right = got.toLowerCase() === String(qq.correctAnswer).toLowerCase();
                  return (
                    <tr key={qq.id}>
                      <td>{qq.questionText}</td>
                      <td className="muted-cell">{got || '—'}</td>
                      <td className="muted-cell">{qq.correctAnswer}</td>
                      <td>
                        <span className={`status ${right ? 'promoted' : 'repeat'}`}>
                          {right ? 'Correct' : 'Incorrect'}
                        </span>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={4} className="muted-cell">No questions saved for this quiz.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
