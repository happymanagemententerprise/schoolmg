import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Presentation, PresentationFile } from 'file:///C:/Users/Happy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';

const skillDir = 'C:/Users/Happy/.codex/plugins/cache/openai-primary-runtime/presentations/26.1011.11113/skills/presentations';
const workspaceDir = 'C:/Users/HAPPY/Documents/ChatGPT/School Management System';
const buildDir = path.join(workspaceDir, 'pitch-build');
const outputDir = path.join(workspaceDir, 'pitch-output');
const finalPath = path.join(outputDir, 'schooldb-pitch-deck-midnight.pptx');
const runtimePython = 'C:/Users/Happy/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
process.env.RUNTIME_NODE_MODULES = 'C:/Users/Happy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';

const C = { ink: '#F5F3EA', teal: '#F0B84B', muted: '#B6C2CE', paper: '#101D2D', line: '#34465A', white: '#EAF0F4' };
const FONT = { body: 'Aptos', title: 'Aptos Display' };
const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });

function addText(slide, name, text, box, style = {}) {
  const shape = slide.shapes.add({ geometry: 'textbox', name, position: box, fill: 'none', line: { style: 'solid', fill: 'none', width: 0 } });
  shape.text = text;
  shape.text.style = {
    typeface: style.typeface ?? FONT.body,
    fontSize: style.fontSize ?? 21,
    color: style.color ?? C.ink,
    bold: style.bold ?? false,
    alignment: style.alignment ?? 'left',
    verticalAlignment: style.verticalAlignment ?? 'top',
    wrap: 'square', autoFit: 'none', insets: 0,
  };
  return shape;
}

function addLine(slide, name, x, y, width, color = C.line, thickness = 1) {
  return slide.shapes.add({ geometry: 'line', name, position: { left: x, top: y, width, height: 0 }, fill: 'none', line: { style: 'solid', fill: color, width: thickness } });
}

function addHeader(slide, page, title, subtitle) {
  slide.background.fill = C.paper;
  slide.shapes.add({ geometry: 'ellipse', name: 'brand-dot', position: { left: 48, top: 45, width: 11, height: 11 }, fill: C.teal, line: { style: 'solid', fill: 'none', width: 0 } });
  addText(slide, 'brand', 'SCHOOLDB', { left: 76, top: 37, width: 145, height: 30 }, { fontSize: 15, bold: true, color: C.muted });
  addText(slide, 'category', 'SECONDARY SCHOOL MANAGEMENT', { left: 224, top: 37, width: 360, height: 30 }, { fontSize: 14, color: C.muted });
  addText(slide, 'page-number', String(page).padStart(2, '0'), { left: 1160, top: 36, width: 64, height: 28 }, { fontSize: 14, color: C.muted, alignment: 'right' });
  addText(slide, 'title', title, { left: 64, top: 92, width: 1040, height: 62 }, { typeface: FONT.title, fontSize: 42, bold: true, color: C.ink });
  if (subtitle) addText(slide, 'subtitle', subtitle, { left: 66, top: 158, width: 1050, height: 54 }, { fontSize: 22, color: C.muted });
  addLine(slide, 'footer-rule', 64, 666, 1152, C.line, 1);
  addText(slide, 'footer', 'SCHOOLDB  ·  NIGERIAN SECONDARY SCHOOLS', { left: 66, top: 675, width: 680, height: 20 }, { fontSize: 11, color: C.muted });
}

function addNotes(slide, extra = '') {
  slide.speakerNotes.text = `Source: user-provided Schooldb project analysis in this conversation. The attached sales-discovery deck is an unfilled template and contains no account-specific findings or quantified impact. ${extra}`.trim();
}

// 1 — Core pitch and the school-year workflow
{
  const slide = deck.slides.add();
  slide.background.fill = C.paper;
  slide.shapes.add({ geometry: 'ellipse', name: 'brand-dot', position: { left: 49, top: 45, width: 11, height: 11 }, fill: C.teal, line: { style: 'solid', fill: 'none', width: 0 } });
  addText(slide, 'brand', 'SCHOOLDB', { left: 77, top: 37, width: 145, height: 30 }, { fontSize: 15, bold: true, color: C.muted });
  addText(slide, 'category', 'SECONDARY SCHOOL MANAGEMENT', { left: 224, top: 37, width: 360, height: 30 }, { fontSize: 14, color: C.muted });
  addText(slide, 'title', 'One connected system\nfor the school year', { left: 64, top: 104, width: 880, height: 126 }, { typeface: FONT.title, fontSize: 50, bold: true, color: C.ink });
  addText(slide, 'value-proposition', 'Schooldb brings academic records, classroom learning and family access into one workflow for Nigerian secondary schools.', { left: 66, top: 237, width: 815, height: 74 }, { fontSize: 24, color: C.muted });
  addText(slide, 'school-calendar-context', 'BUILT AROUND\nNIGERIA’S 3-TERM YEAR', { left: 960, top: 254, width: 254, height: 62 }, { fontSize: 16, bold: true, color: C.teal });
  addLine(slide, 'academic-workflow-line', 82, 392, 892, C.line, 2);
  const steps = [
    { x: 74, title: 'Record', body: 'Daily attendance\nCA and exam grades' },
    { x: 368, title: 'Teach', body: 'Assignments, lessons,\nquizzes and discussions' },
    { x: 662, title: 'Review', body: 'Term reports, analytics\nand teacher remarks' },
    { x: 956, title: 'Progress', body: 'Promotion decisions\nand family visibility' },
  ];
  for (const [i, step] of steps.entries()) {
    slide.shapes.add({ geometry: 'ellipse', name: `workflow-step-${i + 1}`, position: { left: step.x, top: 383, width: 18, height: 18 }, fill: C.teal, line: { style: 'solid', fill: C.paper, width: 3 } });
    addText(slide, `step-${i + 1}-number`, `0${i + 1}`, { left: step.x, top: 351, width: 60, height: 24 }, { fontSize: 15, bold: true, color: C.teal });
    addText(slide, `step-${i + 1}-title`, step.title, { left: step.x, top: 426, width: 250, height: 36 }, { typeface: FONT.title, fontSize: 26, bold: true });
    addText(slide, `step-${i + 1}-body`, step.body, { left: step.x, top: 469, width: 250, height: 78 }, { fontSize: 21, color: C.muted });
  }
  addLine(slide, 'audience-rule', 64, 621, 1152, C.line, 1);
  addText(slide, 'audiences', 'One shared school record for administrators, teachers, students and parents.', { left: 66, top: 641, width: 1050, height: 34 }, { fontSize: 18, color: C.muted });
  addNotes(slide, 'No outcome or savings metrics were supplied, so the slide makes no quantified impact claims.');
}

// 2 — Distinct views for the four supported roles
{
  const slide = deck.slides.add();
  addHeader(slide, 2, 'Each role sees the work they own', 'One student record supports school administration, classroom work and family visibility.');
  const rows = [
    ['ADMINISTRATOR', 'Set sessions and terms; manage users, classes, subjects and teacher assignments; review school reports, analytics and timetables.'],
    ['CLASS TEACHER', 'Take attendance for the assigned class, view its roster and timetable, and add end-of-term class remarks.'],
    ['SUBJECT TEACHER', 'Upload CA and exam scores for assigned subject–class pairs; manage assignments, lessons, quizzes and discussions.'],
    ['STUDENT + PARENT', 'Students see their own reports, attendance and learning. Parents see those records for linked children.'],
  ];
  rows.forEach(([label, body], i) => {
    const top = 244 + i * 96;
    addText(slide, `role-${i + 1}`, label, { left: 76, top, width: 255, height: 34 }, { fontSize: 16, bold: true, color: C.teal });
    addText(slide, `role-description-${i + 1}`, body, { left: 360, top: top - 3, width: 840, height: 68 }, { fontSize: 21, color: C.ink });
    if (i < rows.length - 1) addLine(slide, `role-rule-${i + 1}`, 76, top + 74, 1124, C.line, 1);
  });
  addNotes(slide, 'Role descriptions summarize the existing admin, teacher, student and parent capabilities. The project has no HOD role.');
}

// 3 — How attendance, assessments and reports relate
{
  const slide = deck.slides.add();
  addHeader(slide, 3, 'Term records connect daily work to reports', 'Attendance and subject scores stay organized by student, class, subject and term.');
  const cols = [
    { x: 76, n: '01', title: 'Attendance', body: 'Class teachers record daily attendance for their own class, by date.' },
    { x: 466, n: '02', title: 'Assessment', body: 'Each subject grade combines continuous assessment and an exam, up to 100 points.' },
    { x: 856, n: '03', title: 'Reporting', body: 'Term reports bring subject marks and teacher remarks together for review.' },
  ];
  cols.forEach((col, i) => {
    addText(slide, `term-step-no-${i}`, col.n, { left: col.x, top: 278, width: 70, height: 34 }, { fontSize: 17, bold: true, color: C.teal });
    addText(slide, `term-step-title-${i}`, col.title, { left: col.x, top: 328, width: 330, height: 42 }, { typeface: FONT.title, fontSize: 29, bold: true });
    addText(slide, `term-step-body-${i}`, col.body, { left: col.x, top: 385, width: 318, height: 116 }, { fontSize: 22, color: C.muted });
  });
  addLine(slide, 'score-rule', 76, 536, 1124, C.line, 1);
  addText(slide, 'score-definition', 'CA (max 40)  +  Exam (max 60)  =  Term score (max 100)', { left: 76, top: 562, width: 1040, height: 42 }, { typeface: FONT.title, fontSize: 26, bold: true, color: C.ink });
  addNotes(slide, 'The 40-point continuous assessment and 60-point exam maxima come from the supplied project analysis.');
}

// 4 — Transparent year-end promotion rule
{
  const slide = deck.slides.add();
  addHeader(slide, 4, 'Promotion follows a defined academic rule', 'The third-term report uses subject averages across the three-term session.');
  const requirements = [
    ['MATHEMATICS', 'Session average ≥ 50%'],
    ['ENGLISH', 'Session average ≥ 50%'],
    ['OVERALL AVERAGE', 'At least 50% across all subjects'],
  ];
  requirements.forEach(([label, detail], i) => {
    const top = 274 + i * 104;
    addText(slide, `promotion-label-${i}`, label, { left: 84, top, width: 330, height: 34 }, { fontSize: 16, bold: true, color: C.teal });
    addText(slide, `promotion-detail-${i}`, detail, { left: 455, top: top - 4, width: 650, height: 45 }, { typeface: FONT.title, fontSize: 28, bold: true, color: C.ink });
    if (i < 2) addLine(slide, `promotion-rule-${i}`, 84, top + 63, 1050, C.line, 1);
  });
  addText(slide, 'promotion-outcome', 'Promoted when all three thresholds are met\nOtherwise → verdict includes the reason', { left: 84, top: 589, width: 1000, height: 58 }, { fontSize: 20, color: C.muted });
  addNotes(slide, 'Corrected promotion rule per the user: Mathematics session average must be at least 50%, English session average must be at least 50%, and the overall average across all subjects must be at least 50%.');
}

// 5 — Lightweight LMS and parent-facing continuity
{
  const slide = deck.slides.add();
  addHeader(slide, 5, 'Learning tools sit alongside school records', 'Classroom activity remains connected to the same roles, subjects and student context.');
  const entries = [
    ['ASSIGNMENTS', 'Subject teachers create assignments and due dates; students and linked parents can review them.'],
    ['LESSONS + QUIZZES', 'Teachers publish learning material and quizzes; quiz attempts are scored on the server.'],
    ['DISCUSSIONS', 'Students can participate in subject discussions alongside lessons and assessments.'],
    ['TIMETABLES', 'Teachers, students and parents can check schedules for the relevant class or linked child.'],
  ];
  entries.forEach(([label, body], i) => {
    const top = 246 + i * 88;
    addText(slide, `learning-label-${i}`, label, { left: 76, top, width: 280, height: 30 }, { fontSize: 16, bold: true, color: C.teal });
    addText(slide, `learning-body-${i}`, body, { left: 360, top: top - 4, width: 838, height: 62 }, { fontSize: 21, color: C.ink });
    if (i < entries.length - 1) addLine(slide, `learning-rule-${i}`, 76, top + 63, 1124, C.line, 1);
  });
  addNotes(slide, 'Parent visibility is limited to children linked through the parent–student relationship.');
}

// 6 — A practical suggested next step
{
  const slide = deck.slides.add();
  addHeader(slide, 6, 'Start with the school’s own rules', 'Suggested pilot: walk one class through a complete term workflow before expanding.');
  const phases = [
    ['SET UP', 'Confirm session, term dates, classes, subjects and grading rules.'],
    ['CONNECT', 'Check student records, teacher assignments and parent–student links.'],
    ['RUN', 'Use attendance, grade entry, assignments and learning tools with the pilot class.'],
    ['REVIEW', 'Check report cards and year-end promotion outcomes against school policy.'],
  ];
  phases.forEach(([label, body], i) => {
    const top = 244 + i * 88;
    addText(slide, `pilot-phase-${i}`, `0${i + 1}  ${label}`, { left: 78, top, width: 280, height: 30 }, { fontSize: 16, bold: true, color: C.teal });
    addText(slide, `pilot-description-${i}`, body, { left: 368, top: top - 4, width: 825, height: 60 }, { fontSize: 21, color: C.ink });
    if (i < phases.length - 1) addLine(slide, `pilot-rule-${i}`, 78, top + 62, 1114, C.line, 1);
  });
  addNotes(slide, 'This slide proposes an initial rollout sequence; pilot length, class selection and success measures should be agreed with the school.');
}

await fs.mkdir(buildDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });
for (const [i, slide] of deck.slides.items.entries()) {
  const png = await deck.export({ slide, format: 'png', scale: 1 });
  await fs.writeFile(path.join(buildDir, `schooldb-deck-slide-${i + 1}.png`), new Uint8Array(await png.arrayBuffer()));
}
const montage = await deck.export({ format: 'png', montage: true });
await fs.writeFile(path.join(buildDir, 'schooldb-deck-montage.png'), new Uint8Array(await montage.arrayBuffer()));
const draftPath = path.join(buildDir, 'schooldb-pitch-deck-draft.pptx');
await (await PresentationFile.exportPptx(deck)).save(draftPath);

const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir, 'container_tools/artifact_tool_utils.mjs')).href);
const stagingDir = path.join(buildDir, '.codex-finalizer-midnight-deck');
await fs.mkdir(stagingDir, { recursive: true });
const candidatePath = path.join(stagingDir, 'candidate.pptx');
await fs.copyFile(draftPath, candidatePath);
const result = await finalizePresentation({
  explicitTotalSlideCount: 6,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable: runtimePython,
  integrityValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-heading-fit'],
  fontPolicy: {
    basis: 'reference',
    families: ['Aptos Display', 'Aptos'],
    referencePath: 'C:/Users/Happy/.codex/attachments/5ca18977-cf49-47db-a7bd-026e31fa35cc/sales-discovery.pptx',
    referenceSha256: 'fecbff22bbebfeffdd9798e85a6e98b7b6826dfea717ac2d7f1a8e1198bd185f',
  },
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, 'schooldb-pitch-deck.validation.json'),
});
console.log(JSON.stringify(result));
console.log(`FINAL_PPTX=${finalPath}`);
