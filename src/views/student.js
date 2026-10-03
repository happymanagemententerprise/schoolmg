// ============================================================
//  Happy Man Academy — Student views
// ============================================================

import { Data, Academic, Progression, Growth, Timetable } from '../data/index.js';
import { getCurrentUser } from '../state.js';
import { _csState, set_csState } from '../state.js';
import {
  $, $q, $all, esc, toast, formatDate,
  gradeLabel, toneClass, subjectChip, statusClass, currentTerm, passMark
} from '../utils.js';
import { openModal, closeModal } from '../modals.js';
import { openStudentReport } from './reports.js';
import { timetableTable, renderParentGuardian, recordParentLoginIfNew, renderPassport, resultsLockedNote, termNameOf, renderStudentGrowth, dayChipsHTML, attendanceGridHTML, assignmentRowsHTML } from './shared.js';

// ── Student dashboard ─────────────────────────────────────────
export function renderStudentDashboard() {
  const currentUser = getCurrentUser();
  const sid     = currentUser.studentId;
  const s       = Data.student(sid);
  if (!s) { toast('This login is not linked to a student record.', 'error'); return; }
  const term    = currentTerm();
  const cl      = Data.cls(s.classId);
  const avg     = Academic.termAverage(sid, term);
  const att     = Academic.attendancePct(sid);
  const status  = Academic.promotionStatus(sid, term);
  const assigns = Data.assignments().filter(a => a.classId === s.classId);
  const mentor  = Data.mentor(s.mentorId);
  const check   = Academic.promotionCheck(sid, term);

  $('std-eyebrow').textContent      = `Student portal · ${s.admissionNo || ''}`;
  $('std-welcome').textContent      = `Welcome back, ${s.name.split(' ')[0]}.`;
  $('std-name').textContent         = s.name;
  $('std-class').textContent        = `${cl?.name || '—'} · ${Data.session().name}${cl?.stream ? ' · ' + cl.stream : ''}`;
  $('std-avatar').textContent       = s.initials;
  $('std-avatar').className         = `avatar ${toneClass(s.tone)}`;
  $('std-stat-avg').textContent     = avg + '%';
  $('std-stat-avg-note').textContent = `Grade ${gradeLabel(avg)} · ${[check.enPass, check.maPass, check.avgPass].filter(Boolean).length} of 3 met`;
  $('std-stat-att').textContent     = att;
  $('std-stat-assigns').textContent = assigns.length;
  const _allPub = [1, 2, 3].every(t => Data.published(t));
  $('std-stat-status').textContent  = _allPub ? status : '—';

  $('std-subject-results').innerHTML = Academic.termScores(sid, term).map(sc => {
    const pct = sc.score ?? 0, pass = pct >= passMark();
    return `<div>
      <span>${esc(sc.name)}</span>
      <b class="${pass ? '' : 'text-danger'}">${pct}%</b>
      <i><em style="width:${pct}%;background:${pass ? 'var(--green)' : 'var(--coral)'}"></em></i>
    </div>`;
  }).join('');

  const reqs = [
    { label: `At least ${passMark()}% in English`,     met: check.enPass, value: check.english + '%' },
    { label: `At least ${passMark()}% in Mathematics`, met: check.maPass, value: check.maths + '%' },
    { label: `Overall average at least ${passMark()}%`, met: check.avgPass, value: check.avg + '%' }
  ];
  const met      = reqs.filter(r => r.met).length;
  const promoted = check.pass;

  $('std-promo-title').textContent = promoted ? "You're on track" : 'Needs improvement';
  $('std-promo-badge').textContent = promoted ? '✓' : '!';
  $('std-promo-badge').className   = `check-badge ${promoted ? '' : 'warn-badge'}`;
  $('std-promo-circle').innerHTML  = `<strong>${met}/3</strong><span>requirements</span>`;
  if (_allPub) {
    $('std-promo-reqs').innerHTML = reqs.map(r => `
      <div>
        <span class="requirement-check ${r.met ? '' : 'req-fail'}">${r.met ? '✓' : '✗'}</span>
        <span>${r.label}</span><b>${r.value}</b>
      </div>`).join('');
  } else {
    $('std-promo-title').textContent = 'Pending';
    $('std-promo-badge').textContent = '…';
    $('std-promo-badge').className   = 'check-badge';
    $('std-promo-circle').innerHTML  = `<strong>—</strong><span>awaiting final term</span>`;
    $('std-promo-reqs').innerHTML    = '<div class="muted-cell" style="font-size:12px">Promotion status will be shown after all term results are published.</div>';
  }

  $('std-assignments-list').innerHTML = assigns.map(a => {
    const sub = Data.subject(a.subjectId);
    return `<div class="assignment-item">
      <span class="assignment-type chip-${sub?.color || 'blue'}">${esc(sub?.code || '?')}</span>
      <div><strong>${esc(a.title)}</strong><small>${esc(sub?.name || '')}</small></div>
      <time>${formatDate(a.due)}</time>
    </div>`;
  }).join('') || '<p class="muted-cell">No assignments.</p>';

  $('std-mentor-card').innerHTML = mentorCard(mentor);
  $('std-view-report-btn').onclick = () => openStudentReport(sid);
  $('std-download-btn').onclick    = () => toast('Report prepared. ✓');

  renderStudentSubjectsPanel();
  renderStudentGrowth();
}

export function mentorCard(mentor) {
  if (!mentor) return '<p class="muted-cell">No mentor assigned yet.</p>';
  return `<div class="mentor-header">
      <div class="mentor-avatar avatar-${mentor.tone}">${mentor.initials}</div>
      <div class="mentor-info">
        <strong>${esc(mentor.name)}</strong>
        <span>${esc(mentor.subject || 'Mentor')} · ${esc(mentor.role)}${mentor.phone ? ' · ' + esc(mentor.phone) : ''}</span>
      </div>
    </div>
    <p class="mentor-bio mt8">${esc(mentor.bio || '')}</p>`;
}

// ── Student results ───────────────────────────────────────────
export function renderStudentResults() {
  const currentUser = getCurrentUser();
  const sid     = currentUser.studentId;
  if (!Data.student(sid)) { toast('This login is not linked to a student record.', 'error'); return; }
  const termSel = $('std-results-term');
  const cur = currentTerm();

  const visibleTerms = Data.session().terms
    .filter(t => t.term <= cur && Data.published(t.term));

  if (!visibleTerms.length) {
    termSel.innerHTML = '';
    $('std-results-table').innerHTML = `<tr><td colspan="7" class="muted-cell">${resultsLockedNote(cur)}</td></tr>`;
    $('std-results-meta').textContent = `${Data.session().name} · awaiting release`;
    return;
  }

  termSel.innerHTML = visibleTerms
    .map(t => `<option value="${t.term}" ${t.term === cur ? 'selected' : ''}>${esc(t.name)}</option>`)
    .join('');
  if (!Data.published(cur)) termSel.value = String(visibleTerms[visibleTerms.length - 1].term);

  function draw() {
    const term = +termSel.value;
    if (!Data.published(term)) {
      $('std-results-table').innerHTML = `<tr><td colspan="7" class="muted-cell">${resultsLockedNote(term)}</td></tr>`;
      $('std-results-meta').textContent = `${Data.session().name} · awaiting release`;
      return;
    }
    $('std-results-table').innerHTML = Academic.termScores(sid, term).map(sub => {
      const ca    = sub.ca ?? '—';
      const exam  = sub.exam ?? '—';
      const total = sub.score;
      const grade = total !== null ? gradeLabel(total) : '—';
      const pass  = total !== null && total >= passMark();
      return `<tr>
        <td><div class="student">${subjectChip(sub)}${esc(sub.name)}</div></td>
        <td class="muted-cell">${sub.type === 'core' ? 'Core' : 'Elective'}</td>
        <td>${ca}</td><td>${exam}</td>
        <td><strong>${total ?? '—'}</strong></td><td>${grade}</td>
        <td><span class="status ${total === null ? 'review' : pass ? 'promoted' : 'repeat'}">${total === null ? '—' : pass ? 'Pass' : 'Fail'}</span></td>
      </tr>`;
    }).join('');
    $('std-results-meta').textContent =
      `${Data.session().name} · ${Academic.termScores(sid, term).length} subjects · average ${Academic.termAverage(sid, term)}%`;
  }
  draw();
  termSel.onchange = draw;
}

// ── Subject registration panel ────────────────────────────────
export function renderStudentSubjectsPanel() {
  const currentUser = getCurrentUser();
  const sid = currentUser.studentId;
  const st  = Data.student(sid);
  const note = $('std-subjects-note');
  const grid = $('std-subjects-list');
  const btn  = $('std-subjects-btn');
  if (!st || !note || !grid || !btn) return;

  const year = Progression.yearOf(sid);
  const sel  = Progression.selectionFor(sid);
  const eff  = Progression.effectiveSubjects(sid);
  const cl   = Data.cls(st.classId);

  const topics = Progression.topicsFor(st.classId).slice(0, 5);
  const topicBlock = topics.length
    ? `<div class="mt16"><p class="role-muted" style="margin:0 0 6px"><strong>What's been covered</strong> · latest weekly topics in your class</p>` +
      topics.map(t => `<div class="topic-row">
        <span class="subject-chip chip-${Data.subject(t.subjectId)?.color || 'blue'}">W${t.week}</span>
        <div><strong>${esc(t.topic)}</strong><small>${esc(Data.subject(t.subjectId)?.name || '')}</small></div>
      </div>`).join('') + '</div>'
    : '';

  if (!Progression.canChoose(year)) {
    note.textContent = 'Subject registration for this year is set by the school — your subjects appear on your report automatically.';
    btn.hidden = true;
    grid.innerHTML = topicBlock || '<p class="muted-cell">Junior secondary classes take the common subject list.</p>';
    return;
  }

  if (sel && sel.status === 'pending') {
    note.textContent = 'Your change request has been sent to your class teacher for review.';
    btn.hidden = true;
    grid.innerHTML =
      `<div class="subject-results"><div><span>Requested subjects</span><b class="status review">Pending review</b></div>` +
      sel.subjectIds.map(id => `<div><span>${esc(Data.subject(id)?.name || id)}</span><b class="muted-cell">${esc(Data.subject(id)?.type === 'core' ? 'Core' : 'Elective')}</b></div>`).join('') +
      `</div>` + topicBlock;
    return;
  }

  if (eff && eff.length) {
    note.textContent = year >= 11
      ? 'Your subjects for this term. You can request a change at any time — your class teacher will review it.'
      : 'Your subjects for this term.';
    btn.hidden = false;
    btn.textContent = year >= 11 ? 'Request change' : 'Change subjects';
    grid.innerHTML =
      `<div class="subject-results">` +
      eff.map(id => `<div><span>${esc(Data.subject(id)?.name || id)}</span><b>${esc(Data.subject(id)?.type === 'core' ? 'Core' : 'Elective')}</b></div>`).join('') +
      `</div>` + topicBlock;
    btn.onclick = openChooseSubjectsModal;
    return;
  }

  note.textContent = `Pick your subjects for this ${Data.session().name} — you can adjust them later.`;
  btn.hidden = false;
  btn.textContent = 'Choose subjects';
  grid.innerHTML = `<p class="muted-cell">No subjects chosen yet.</p>` + topicBlock;
  btn.onclick = openChooseSubjectsModal;
}

export function openChooseSubjectsModal() {
  const currentUser = getCurrentUser();
  const sid = currentUser.studentId;
  const st  = Data.student(sid);
  const cl  = st ? Data.cls(st.classId) : null;
  if (!st || !cl) return;
  const year   = Progression.yearOf(sid);
  const subs   = Academic.classSubjects(cl.id);
  const counts = Progression.selectionCounts() || { minTotal: 8, general: 1, stream: 5 };
  const sel    = Progression.selectionFor(sid);
  const cur    = (sel && sel.status !== 'pending') ? (sel.subjectIds || []) : [];
  set_csState({ sid, year, previous: cur });

  $('cs-eyebrow').textContent =
    `${st.name.split(' ')[0]}, choose from the subjects offered in the ${cl.stream ? cl.stream : cl.level} track. ` +
    `You need at least ${counts.minTotal} subjects (${counts.general} general + ${counts.stream} stream/electives).`;
  $('cs-rules').innerHTML = `<p class="role-muted" style="margin:0">Core subjects stay, this choice decides your remaining subjects. ` +
    (year >= 11 ? 'Changes above this are reviewed by your class teacher before they take effect.' : 'Your choice is effective immediately.') + '</p>';
  $('cs-list').innerHTML = subs.map(sub => {
    const locked = sub.type === 'core' || sub.group === 'General' || (cl.stream && sub.group === cl.stream);
    return `<label class="dept-check">
      <input type="checkbox" value="${sub.id}" ${cur.includes(String(sub.id)) ? 'checked' : ''}>
      <span>${subjectChip(sub)}${esc(sub.name)}</span>
      <small class="muted-cell" style="margin-left:auto">${locked ? (sub.type === 'core' ? 'core' : sub.group) : 'elective'}</small>
    </label>`;
  }).join('');
  $('cs-feedback').hidden = true;
  $('cs-save-btn').onclick = saveChooseSubjects;
  openModal('choose-subjects-modal');
}

export async function saveChooseSubjects() {
  const currentUser = getCurrentUser();
  const checked = [...$all('#cs-list input:checked')].map(i => i.value);
  const counts  = Progression.selectionCounts() || { minTotal: 8 };
  const fb      = $('cs-feedback');
  const fail = msg => { fb.hidden = false; fb.textContent = msg; fb.className = 'form-feedback mt8 text-danger'; };
  if (!checked.length)  { fail('Select at least one subject.'); return; }
  if (checked.length < counts.minTotal) { fail(`Pick at least ${counts.minTotal} subjects (${checked.length} chosen so far).`); return; }
  if (!_csState) return;

  if (_csState.year >= 11) {
    await Progression.chooseSubjects(_csState.sid, checked, { status: 'pending', userId: currentUser.id });
    await Progression.requestApproval({
      actionType: 'subject_change',
      entityType: 'subject_selection',
      entityId: _csState.sid,
      payload: { subjectIds: checked.map(String), previous: (_csState.previous || []).map(String) },
      summary: `${Data.student(_csState.sid)?.name.trim().split(' ').slice(0, 2).join(' ') || 'Student'} requested a subject change (${checked.length} subjects).`
    }, currentUser.id);
    closeModal('choose-subjects-modal');
    toast('Change request sent to your class teacher. ✓');
  } else {
    await Progression.chooseSubjects(_csState.sid, checked, { status: 'effective', userId: currentUser.id });
    closeModal('choose-subjects-modal');
    toast('Your subjects are saved. ✓');
  }
  set_csState(null);
  renderStudentSubjectsPanel();
}

// ── Student pathway ───────────────────────────────────────────
export function renderStudentPathway() {
  const currentUser = getCurrentUser();
  const s = Data.student(currentUser.studentId);
  const box = $('stu-path-body');
  if (!$('stu-path-body')) return;
  if (!s) {
    box.innerHTML = '<div class="panel"><p class="muted-cell">This login is not linked to a student record.</p></div>';
    return;
  }
  const cl   = Data.cls(s.classId);
  const year = cl?.year ?? null;
  if ($('stu-path-heading')) $('stu-path-heading').textContent = cl ? `Choose my path — ${esc(cl.name)}` : 'Choose my path';
  const eligible = !!(cl && (cl.selectionMode === 'pool' || Progression.isCheckpoint(year)));

  if (!cl) {
    box.innerHTML = '<div class="panel"><p class="muted-cell">No class record yet.</p></div>';
    return;
  }

  if (cl.stream) {
    box.innerHTML = `<div class="panel">
      <div class="panel-heading"><div><p class="eyebrow">Path decided</p><h2>${esc(cl.name)}</h2></div>
        <span class="status promoted">Placed</span></div>
      <p class="role-muted">Your path is set for this session — you are on the <strong>${esc(cl.stream)}</strong> stream.</p>
    </div>`;
    return;
  }

  if (!eligible) {
    box.innerHTML = `<div class="panel">
      <p class="role-muted">At your year the school sets your class for you — the choice opens at the Grade 9 checkpoint and for students in a placement pool.</p>
      <p class="muted-cell">Current class: ${esc(cl.name)}.</p>
    </div>`;
    return;
  }

  const targetYear = cl.year === 10 ? 10 : cl.year + 1;
  const options = (Data.classes() || []).filter(c => c.year == targetYear && c.level === 'SS' && ['Science', 'Commercial', 'Arts'].includes(c.stream));
  const hints = {
    Science:    'Mathematics, Physics, Chemistry, Biology',
    Commercial: 'Accounting, Business Studies, Commerce, Economics',
    Arts:       'Literature, Fine & Applied Arts, Music, Theatre'
  };
  const req  = Progression.pathRequest(s.id);
  const chosen = req?.stream || '';

  const statusHTML = req ? `<div class="path-status ${req.status}">
      ${req.status === 'approved'
        ? `<strong>Your path is decided.</strong> The school placed you on the ${esc(req.stream || '—')} stream.`
        : `<strong>Preference recorded: ${esc(req.stream || '—')}.</strong> The school will confirm it — you can change it any time before they decide.`}
      ${req.note ? `<div class="muted-cell mt8">Your note to the school: ${esc(req.note)}</div>` : ''}
    </div>` : '';

  box.innerHTML = `<div class="panel">
    <div class="panel-heading"><div>
      <p class="eyebrow">Grade ${targetYear} · SSS</p>
      <h2>Pick the stream that fits you</h2>
    </div></div>
    <p class="role-muted">For ${esc(cl.name)} the school decides your final path with your results and your wishes in mind. Pick the stream you want — the administration will confirm it.</p>
    ${statusHTML}
    <div class="path-options mt16">
      ${options.length ? options.map(o => `
        <label class="path-card" data-stream="${o.stream}"
               :class="{ selected: chosen === '${o.stream}' }"
               @click="chosen = '${o.stream}'">
          <input type="radio" name="stu-path" value="${o.stream}" :checked="chosen === '${o.stream}'">
          <strong>${esc(o.name)}</strong>
          <span class="muted-cell">${esc(hints[o.stream] || '')}</span>
        </label>`).join('')
        : '<p class="muted-cell">The stream classes for Grade ' + targetYear + ' have not been set up yet.</p>'}
    </div>
    <div class="form-group mt16"><label for="stu-path-note">Anything you want the school to know <small class="muted-cell" style="font-weight:400">(optional)</small></label>
      <textarea id="stu-path-note" rows="3" maxlength="500" placeholder="e.g. I enjoy sciences and would like to study medicine…">${esc((req && req.note) || '')}</textarea></div>
    <button class="btn-primary" id="stu-path-save" style="width:auto;margin:0">Save my choice</button>
    <div id="stu-path-msg" class="form-feedback mt8" hidden></div>
  </div>`;

  // Initialise Alpine directives on the newly injected HTML
  if (window.Alpine) {
    Alpine.initTree(box);
    const alpineData = Alpine.$data(box);
    if (alpineData) alpineData.chosen = chosen;
  }

  $('stu-path-save').onclick = async () => {
    const msg = $('stu-path-msg');
    const alpineData = window.Alpine ? Alpine.$data(box) : null;
    const picked = alpineData?.chosen || $q('input[name="stu-path"]:checked')?.value;
    if (!picked) { _message(msg, 'Choose a path first.', 'error'); return; }
    await Progression.requestPathway(s.id, picked, $('stu-path-note').value.trim(), currentUser.id);
    _message(msg, 'Your choice is saved — the school will confirm it.', 'success');
    renderStudentPathway();
  };
}

// ── Student lessons ───────────────────────────────────────────
export function renderStudentLessons() {
  const currentUser = getCurrentUser();
  const s = Data.student(currentUser.studentId);
  const list = $('stu-less-list');
  if (!s || !list) return;
  const lessons = Data.lessonsFor(s.classId) || [];
  list.innerHTML = lessons.length
    ? `<div class="table-wrap"><table><thead><tr><th>Subject</th><th>Title</th><th class="muted-cell">Teacher</th><th class="muted-cell">Posted</th><th></th></tr></thead>` +
      `<tbody>${lessons.map(l => `
        <tr>
          <td>${esc(Data.subject(l.subjectId)?.name || '—')}</td>
          <td>${esc(l.title)}</td>
          <td class="muted-cell">${esc(Data.user(l.teacherId)?.name || '—')}</td>
          <td class="muted-cell">${formatDate(l.createdAt)}</td>
          <td><button class="text-button" data-stu-read="${l.id}">Read</button></td>
        </tr>`).join('')}</tbody></table></div>`
    : '<p class="muted-cell">No lessons have been published for your class yet.</p>';

  $all('[data-stu-read]').forEach(b => b.onclick = () => {
    const lesson = (Data.lmsLessons() || []).find(x => String(x.id) === String(b.dataset.stuRead));
    const box = $('stu-less-detail'); if (!lesson || !box) return;
    box.innerHTML = `<div class="panel">
      <div class="panel-heading"><div>
        <p class="eyebrow">${esc(Data.subject(lesson.subjectId)?.name || '')} · ${esc(Data.user(lesson.teacherId)?.name || '')} · ${formatDate(lesson.createdAt)}</p>
        <h2>${esc(lesson.title)}</h2>
      </div></div>
      <div class="ls-body">${esc(lesson.content)}</div>
    </div>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

// ── Student quizzes (React) ───────────────────────────────────
export function renderStudentQuizzes() {
  import('../react/mount.js').then(({ mount }) => {
    import('../react/components/QuizTaker.jsx').then(({ default: QuizTaker }) => {
      mount('react-student-quizzes', QuizTaker, {});
    });
  });
}

// openQuizTaker and openStudentQuizResult are now internal to QuizTaker.jsx.
// These stubs ensure no runtime error if called elsewhere.
function _legacyRenderStudentQuizzes() {
  const currentUser = getCurrentUser();
  const s = Data.student(currentUser.studentId);
  const list = $('sq-list');
  if (!s || !list) return;
  const quizzes = (Data.quizzesFor(s.classId) || []).filter(q => q.isPublished);
  list.innerHTML = quizzes.length
    ? `<div class="table-wrap"><table><thead><tr><th>Subject</th><th>Title</th><th class="muted-cell">Qns</th><th>Your score</th><th></th></tr></thead>` +
      `<tbody>${quizzes.map(q => {
        const attempt = Data.attemptFor(q.id, s.id);
        return `<tr>
          <td>${esc(Data.subject(q.subjectId)?.name || '—')}</td>
          <td>${esc(q.title)}${q.description ? `<div class="muted-cell" style="font-size:10px;margin-top:2px">${esc(q.description)}</div>` : ''}</td>
          <td class="muted-cell">${Data.questionsForQuiz(q.id).length}</td>
          <td>${attempt ? `<span class="status promoted">${attempt.score} / ${attempt.total}</span>` : '<span class="muted-cell">Not attempted</span>'}</td>
          <td>${attempt
            ? `<button class="text-button" data-sq-result="${q.id}">View result</button>`
            : `<button class="btn-primary small" data-sq-take="${q.id}">Take quiz</button>`}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`
    : '<p class="muted-cell">No quizzes are available for your class right now.</p>';

  $all('[data-sq-take]').forEach(b => b.onclick = () => openQuizTaker(b.dataset.sqTake));
  $all('[data-sq-result]').forEach(b => b.onclick = () => openStudentQuizResult(b.dataset.sqResult));
}

export function openQuizTaker(quizId) {
  const currentUser = getCurrentUser();
  const box = $('sq-body'); if (!box) return;
  const quiz = (Data.lmsQuizzes() || []).find(x => String(x.id) === String(quizId)); if (!quiz) return;
  const questions = Data.questionsForQuiz(quizId);
  box.innerHTML = `<div class="panel">
    <div class="panel-heading"><div>
      <p class="eyebrow">${esc(Data.subject(quiz.subjectId)?.name || '')} · ${esc(Data.classNameOf(quiz.classId))}</p>
      <h2>${esc(quiz.title)}</h2>
    </div></div>
    ${quiz.description ? `<p class="role-muted">${esc(quiz.description)}</p>` : ''}
    <form id="quiz-form" class="mt8">
      ${questions.map((qq, i) => `
        <fieldset class="quiz-fieldset">
          <legend>Question ${i + 1}${qq.points > 1 ? ` · ${qq.points} pts` : ''}</legend>
          <p class="quiz-question-text">${esc(qq.questionText)}</p>
          ${qq.questionType === 'tf'
            ? `<div class="form-row tight">
                <label class="dept-check"><input type="radio" name="q${qq.id}" value="True" required> True</label>
                <label class="dept-check"><input type="radio" name="q${qq.id}" value="False" required> False</label>
              </div>`
            : [['A', qq.options?.A], ['B', qq.options?.B], ['C', qq.options?.C], ['D', qq.options?.D]]
                .filter(([, v]) => v != null && v !== '')
                .map(([label, v]) => `<label class="dept-check"><input type="radio" name="q${qq.id}" value="${esc(v)}" required> <strong>${label}.</strong> ${esc(v)}</label>`).join('')}
        </fieldset>`).join('')}
      <button class="btn-primary mt16" type="submit" style="width:auto">Submit quiz</button>
      <div id="quiz-msg" class="form-feedback mt8" hidden></div>
    </form>
  </div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  $('quiz-form').onsubmit = async e => {
    e.preventDefault();
    const msg = $('quiz-msg');
    const answers = {};
    questions.forEach(qq => {
      const picked = $q(`input[name="q${qq.id}"]:checked`);
      if (picked) answers[qq.id] = picked.value;
    });
    const result = await Data.submitQuizAttempt(quiz.id, currentUser.studentId, answers);
    if (!result) { _message(msg, 'This quiz has no questions yet.', 'error'); return; }
    _message(msg, `You scored ${result.score} / ${result.total} — well done.`, 'success');
    openStudentQuizResult(quiz.id);
  };
}

export function openStudentQuizResult(quizId) {
  const currentUser = getCurrentUser();
  const box = $('sq-body'); if (!box) return;
  const quiz    = (Data.lmsQuizzes() || []).find(x => String(x.id) === String(quizId));
  const attempt = Data.attemptFor(quizId, currentUser.studentId);
  if (!attempt) { box.innerHTML = '<div class="panel"><p class="muted-cell">No attempt recorded.</p></div>'; return; }
  const detail = (Data.questionsForQuiz(quizId) || []).map(qq => {
    const got   = String(attempt.answers?.[qq.id] ?? '').trim();
    const right = got.toLowerCase() === String(qq.correctAnswer).toLowerCase();
    return `<tr>
      <td>${esc(qq.questionText)}</td>
      <td class="muted-cell">${esc(got) || '—'}</td>
      <td class="muted-cell">${esc(qq.correctAnswer)}</td>
      <td><span class="status ${right ? 'promoted' : 'repeat'}">${right ? 'Correct' : 'Incorrect'}</span></td>
    </tr>`;
  }).join('');
  box.innerHTML = `<div class="panel">
    <div class="panel-heading"><div>
      <p class="eyebrow">${quiz ? esc(quiz.title) : ''}</p>
      <h2>Your result</h2>
    </div><span class="check-badge">${attempt.score} / ${attempt.total}</span></div>
    <div class="table-wrap mt16"><table><thead><tr><th>Question</th><th>Your answer</th><th>Correct</th><th></th></tr></thead>
      <tbody>${detail || '<tr><td colspan="4" class="muted-cell">No questions saved for this quiz.</td></tr>'}</tbody></table></div>
  </div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Student discussions ───────────────────────────────────────
export function renderStudentDiscussions() {
  const currentUser = getCurrentUser();
  const s = Data.student(currentUser.studentId);
  const list = $('sd-list');
  if (!s || !list) return;
  const discussions = Data.discussionsFor(s.classId) || [];
  list.innerHTML = discussions.length
    ? `<div class="table-wrap"><table><thead><tr><th>Subject</th><th>Topic</th><th class="muted-cell">Teacher</th><th class="muted-cell">Replies</th><th></th></tr></thead>` +
      `<tbody>${discussions.map(d => `
        <tr>
          <td>${esc(Data.subject(d.subjectId)?.name || '—')}</td>
          <td>${esc(d.title)}</td>
          <td class="muted-cell">${esc(Data.user(d.teacherId)?.name || '—')}</td>
          <td class="muted-cell">${Data.postsFor(d.id).length}</td>
          <td><button class="text-button" data-sd-open="${d.id}">Open</button></td>
        </tr>`).join('')}</tbody></table></div>`
    : '<p class="muted-cell">No discussions are open for your class yet.</p>';
  $all('[data-sd-open]').forEach(b => {
    b.onclick = () => {
      import('./teacher.js').then(({ renderThread }) => renderThread(b.dataset.sdOpen, 'sd-thread'));
    };
  });
}

// ── Student attendance ────────────────────────────────────────
export function renderStudentAttendance() {
  const currentUser = getCurrentUser();
  const s = Data.student(currentUser.studentId);
  const sel = $('stu-att-term');
  if (!s || !sel) return;
  sel.innerHTML = Data.session().terms.map(t =>
    `<option value="${t.term}" ${t.term === currentTerm() ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  const draw = () => {
    $('stu-att-meta').textContent = `${s.name} · ${esc(Data.cls(s.classId)?.name || '')} · ${termNameOf(+sel.value)}`;
    $('stu-att-grid').innerHTML   = attendanceGridHTML(s.id, +sel.value);
  };
  draw();
  sel.onchange = draw;
}

export function renderStudentAssignments() {
  const currentUser = getCurrentUser();
  const s = Data.student(currentUser.studentId);
  const meta = $('stu-assign-meta');
  const list = $('stu-assign-list');
  if (!s || !meta || !list) return;
  meta.textContent = `${s.name.split(' ')[0]}, here are the assignments set for ${esc(Data.cls(s.classId)?.name || 'your class')}.`;
  list.innerHTML = assignmentRowsHTML(s.classId);
}

export function renderStudentTimetable() {
  const currentUser = getCurrentUser();
  const s = Data.student(currentUser.studentId);
  const meta = $('stu-tt-meta');
  if (!s || !meta) return;
  meta.textContent = `${s.name} · ${esc(Data.cls(s.classId)?.name || '')}`;
  _renderTimetableFor(s.classId, 'stu-tt-grid');
}

function _renderTimetableFor(classId, containerId) {
  const box = $(containerId); if (!box) return;
  const all     = Timetable.generateAll();
  const schedule = all.schedules.find(x => String(x.classId) === String(classId));
  if (!schedule) {
    box.innerHTML = `<div class="panel"><p class="muted-cell">No weekly timetable generated for ${esc(Data.classNameOf(classId))} yet.</p></div>`;
    return;
  }
  box.innerHTML = `<div class="panel">
    <div class="panel-heading"><div>
      <p class="eyebrow">Term ${currentTerm()} · ${esc(Data.session().name)}</p>
      <h2>${esc(schedule.name)} · Weekly schedule</h2>
    </div><span class="read-only-badge">View only</span></div>
    ${timetableTable(schedule)}
  </div>`;
}

// ── Internal helpers ──────────────────────────────────────────
function _message(el, text, kind) {
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  el.className = kind === 'error' ? 'form-feedback mt8 text-danger' : 'form-feedback mt8 success';
}
