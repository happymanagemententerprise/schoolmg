const students = [
  { name: 'Ama Osei', id: '1024', initials: 'AO', className: '7B', score: 78, attendance: '98%', status: 'Promoted', tone: 'blue', subjects: [['English', 82], ['Mathematics', 76], ['Science', 84], ['History', 71], ['French', 79], ['ICT', 76]] },
  { name: 'Kojo Mensah', id: '1088', initials: 'KM', className: '7B', score: 54, attendance: '91%', status: 'Review', tone: 'yellow', subjects: [['English', 53], ['Mathematics', 49], ['Science', 61], ['History', 58], ['French', 56], ['ICT', 57]] },
  { name: 'Esi Boateng', id: '1042', initials: 'EB', className: '8A', score: 86, attendance: '96%', status: 'Promoted', tone: 'green', subjects: [['English', 88], ['Mathematics', 83], ['Science', 91], ['History', 84], ['French', 86], ['ICT', 84]] },
  { name: 'Yaw Asante', id: '1116', initials: 'YA', className: '9C', score: 46, attendance: '87%', status: 'Repeat', tone: 'coral', subjects: [['English', 48], ['Mathematics', 44], ['Science', 50], ['History', 43], ['French', 47], ['ICT', 44]] }
];

const table = document.querySelector('#student-table');
const search = document.querySelector('#student-search');
const drawer = document.querySelector('#report-drawer');
const roleSelect = document.querySelector('#role-select');
const dashboardView = document.querySelector('#dashboard-view');
const studentView = document.querySelector('#student-view');
const learningView = document.querySelector('#learning-view');
const roleViews = {
  'Administrator': dashboardView,
  'Teacher · Class': document.querySelector('#class-teacher-view'),
  'Teacher · Subject': document.querySelector('#subject-teacher-view'),
  'Student': studentView,
  'Parent': document.querySelector('#parent-view')
};
const allViews = { ...roleViews, Learning: learningView };
const roleCopy = {
  'Administrator': ['Good morning, Amara.', 'Here is what is happening across Northstar Academy today.'],
  'Teacher · Class': ['Good morning, Mr. Owusu.', 'Your class overview, attendance and feedback are ready.'],
  'Teacher · Subject': ['Good morning, Ms. Addo.', 'Upload results and set assignment due dates for your subject.'],
  'Student': ['Good morning, Ama.', 'Your latest results, teacher-set assignments and attendance are here.'],
  'Parent': ['Good morning, Mrs. Osei.', 'Keep up with your children\'s progress across the school.']
};

function canPromote(student) {
  const corePass = student.subjects[0][1] > 50 && student.subjects[1][1] > 50;
  const otherPasses = student.subjects.slice(2).filter((subject) => subject[1] > 50).length >= 3;
  return corePass && otherPasses;
}

function statusClass(status) { return status.toLowerCase(); }

function renderTable(query = '') {
  const visible = students.filter((student) => student.name.toLowerCase().includes(query.toLowerCase()) || student.id.includes(query));
  table.innerHTML = visible.map((student) => `<tr><td><div class="student"><span class="student-avatar avatar-${student.tone}">${student.initials}</span>${student.name}</div></td><td>${student.className}</td><td><span class="score">${student.score}%</span></td><td class="muted-cell">${student.attendance}</td><td><span class="status ${statusClass(student.status)}">${student.status}</span></td><td><button class="row-menu" data-student="${student.id}" aria-label="View ${student.name} report">•••</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted-cell">No students match that search.</td></tr>';
  document.querySelectorAll('[data-student]').forEach((button) => button.addEventListener('click', () => openReport(button.dataset.student)));
}

function openReport(id) {
  const student = students.find((item) => item.id === id);
  if (!student) return;
  const promoted = canPromote(student);
  document.querySelector('#drawer-name').textContent = student.name;
  document.querySelector('#drawer-meta').textContent = `Class ${student.className} · Student ID ${student.id}`;
  document.querySelector('#drawer-score').textContent = `${student.score}%`;
  const status = document.querySelector('#drawer-status');
  status.textContent = promoted ? 'Promoted' : 'Repeat class';
  status.className = `promotion-badge ${promoted ? 'promoted' : 'repeat'}`;
  document.querySelector('#drawer-subjects').innerHTML = student.subjects.map(([name, score], index) => `<div class="subject-row"><div>${name}<small>${index < 2 ? 'Core subject' : 'Additional subject'}</small></div><b>${score}%</b></div>`).join('');
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
}

document.querySelectorAll('[data-close-drawer]').forEach((element) => element.addEventListener('click', () => { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }));
document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  document.querySelector('#page-title').textContent = button.dataset.page;
  Object.values(allViews).forEach((view) => { view.hidden = true; });
  allViews[button.dataset.page].hidden = false;
  document.querySelector('.sidebar').classList.remove('open');
}));
document.querySelectorAll('[data-page-link]').forEach((button) => button.addEventListener('click', () => document.querySelector(`[data-page="${button.dataset.pageLink}"]`).click()));
search.addEventListener('input', (event) => renderTable(event.target.value));
roleSelect.addEventListener('change', (event) => {
  Object.values(allViews).forEach((view) => { view.hidden = true; });
  roleViews[event.target.value].hidden = false;
  const [title, copy] = roleCopy[event.target.value];
  document.querySelector('#welcome-title').textContent = title;
  document.querySelector('#welcome-copy').textContent = copy;
  document.querySelector('#page-title').textContent = event.target.value === 'Administrator' ? 'Overview' : event.target.value.replace('Teacher · ', '');
});
document.querySelectorAll('[data-course-open]').forEach((button) => button.addEventListener('click', () => {
  document.querySelector('#page-title').textContent = button.dataset.courseOpen;
  document.querySelectorAll('.course-card').forEach((card) => card.classList.toggle('selected-course', card.dataset.course === button.dataset.courseOpen));
}));
document.querySelector('#term-select').addEventListener('change', (event) => { document.querySelector('#date-label').textContent = `${event.target.value === '3' ? 'Monday' : 'Monday'}, 17 September 2024 · Term ${event.target.value}`; });
document.querySelector('#view-school-report').addEventListener('click', () => openReport('1024'));
document.querySelector('#download-report').addEventListener('click', () => { document.querySelector('#download-report').textContent = 'Report prepared ✓'; });
document.querySelector('#student-report-button').addEventListener('click', () => openReport('1024'));
document.querySelector('#student-download').addEventListener('click', (event) => { event.currentTarget.innerHTML = 'Report prepared <span>✓</span>'; });
document.querySelector('#choose-spreadsheet').addEventListener('click', () => document.querySelector('#spreadsheet-input').click());
document.querySelector('#spreadsheet-input').addEventListener('change', (event) => { if (event.target.files.length) document.querySelector('#choose-spreadsheet').textContent = `${event.target.files[0].name} selected`; });
document.querySelector('#upload-spreadsheet').addEventListener('click', () => document.querySelector('#spreadsheet-input').click());
document.querySelector('.mobile-menu').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
renderTable();