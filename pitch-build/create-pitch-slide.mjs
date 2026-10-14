import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Presentation, PresentationFile } from 'file:///C:/Users/Happy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';

const skillDir = 'C:/Users/Happy/.codex/plugins/cache/openai-primary-runtime/presentations/26.1011.11113/skills/presentations';
const workspaceDir = 'C:/Users/HAPPY/Documents/ChatGPT/School Management System';
const buildDir = path.join(workspaceDir, 'pitch-build');
const outputDir = path.join(workspaceDir, 'pitch-output');
const finalPath = path.join(outputDir, 'schooldb-pitch-slide.pptx');
const runtimePython = 'C:/Users/Happy/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
process.env.RUNTIME_NODE_MODULES = 'C:/Users/Happy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const colors = { ink: '#122027', teal: '#287C88', muted: '#5B6B72', paper: '#EEF5F7', line: '#BCD5DA' };

await fs.mkdir(buildDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const slide = presentation.slides.add();
slide.background.fill = colors.paper;

function textBox(name, text, position, style = {}) {
  const shape = slide.shapes.add({
    geometry: 'textbox',
    name,
    position,
    fill: 'none',
    line: { style: 'solid', fill: 'none', width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    typeface: style.typeface ?? 'Aptos',
    fontSize: style.fontSize ?? 20,
    color: style.color ?? colors.ink,
    bold: style.bold ?? false,
    alignment: style.alignment ?? 'left',
    verticalAlignment: style.verticalAlignment ?? 'top',
    wrap: 'square',
    autoFit: 'none',
    insets: 0,
  };
  return shape;
}

// Header and direct value proposition
slide.shapes.add({
  geometry: 'ellipse', name: 'schooldb-mark',
  position: { left: 49, top: 45, width: 11, height: 11 },
  fill: colors.teal, line: { style: 'solid', fill: 'none', width: 0 },
});
textBox('brand', 'SCHOOLDB', { left: 77, top: 37, width: 145, height: 30 }, {
  fontSize: 15, bold: true, color: colors.muted,
});
textBox('category', 'SECONDARY SCHOOL MANAGEMENT', { left: 224, top: 37, width: 360, height: 30 }, {
  fontSize: 14, color: colors.muted,
});
textBox('title', 'One connected system\nfor the school year', { left: 64, top: 104, width: 880, height: 126 }, {
  typeface: 'Aptos Display', fontSize: 50, bold: true, color: colors.ink,
});
textBox('value-proposition', 'Schooldb brings academic records, classroom learning and family access into one workflow for Nigerian secondary schools.', { left: 66, top: 237, width: 815, height: 74 }, {
  fontSize: 24, color: colors.muted,
});
textBox('school-calendar-context', 'BUILT AROUND\nNIGERIA’S 3-TERM YEAR', { left: 960, top: 254, width: 254, height: 62 }, {
  fontSize: 16, bold: true, color: colors.teal,
});

// Editable four-stage school-year workflow
slide.shapes.add({
  geometry: 'line', name: 'academic-workflow-line',
  position: { left: 82, top: 392, width: 881, height: 0 },
  fill: 'none', line: { style: 'solid', fill: colors.line, width: 2 },
});
const steps = [
  { x: 74, title: 'Record', body: 'Daily attendance\nCA and exam grades' },
  { x: 368, title: 'Teach', body: 'Assignments, lessons,\nquizzes and discussions' },
  { x: 662, title: 'Review', body: 'Term reports, analytics\nand teacher remarks' },
  { x: 956, title: 'Progress', body: 'Promotion decisions\nand family visibility' },
];
for (const [index, step] of steps.entries()) {
  slide.shapes.add({
    geometry: 'ellipse', name: `workflow-step-${index + 1}`,
    position: { left: step.x, top: 383, width: 18, height: 18 },
    fill: colors.teal, line: { style: 'solid', fill: colors.paper, width: 3 },
  });
  const left = step.x;
  textBox(`step-${index + 1}-number`, `0${index + 1}`, { left, top: 351, width: 60, height: 24 }, {
    fontSize: 15, bold: true, color: colors.teal,
  });
  textBox(`step-${index + 1}-title`, step.title, { left, top: 426, width: 250, height: 36 }, {
    typeface: 'Aptos Display', fontSize: 26, bold: true, color: colors.ink,
  });
  textBox(`step-${index + 1}-body`, step.body, { left, top: 469, width: 250, height: 78 }, {
    fontSize: 21, color: colors.muted,
  });
}

slide.shapes.add({
  geometry: 'line', name: 'footer-rule',
  position: { left: 64, top: 621, width: 1152, height: 0 },
  fill: 'none', line: { style: 'solid', fill: colors.line, width: 1 },
});
textBox('audiences', 'One shared school record for administrators, teachers, students and parents.', { left: 66, top: 641, width: 1050, height: 34 }, {
  fontSize: 18, color: colors.muted,
});
slide.speakerNotes.text = 'Source: the user-provided Schooldb project analysis in this conversation. The attached sales-discovery deck is an unfilled template with no account-specific findings or quantified impact. This slide therefore makes no savings, growth, or performance claims.';

for (const [index, currentSlide] of presentation.slides.items.entries()) {
  const preview = await presentation.export({ slide: currentSlide, format: 'png', scale: 1 });
  await fs.writeFile(path.join(buildDir, `schooldb-slide-${index + 1}.png`), new Uint8Array(await preview.arrayBuffer()));
}
const draftPath = path.join(buildDir, 'schooldb-pitch-slide-draft.pptx');
await (await PresentationFile.exportPptx(presentation)).save(draftPath);

const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir, 'container_tools/artifact_tool_utils.mjs')).href);
const stagingDir = path.join(buildDir, '.codex-finalizer');
await fs.mkdir(stagingDir, { recursive: true });
const candidatePath = path.join(stagingDir, 'candidate.pptx');
await fs.copyFile(draftPath, candidatePath);
const result = await finalizePresentation({
  explicitTotalSlideCount: 1,
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
  receiptPath: path.join(stagingDir, 'schooldb-pitch-slide.validation.json'),
});
console.log(JSON.stringify(result));
console.log(`FINAL_PPTX=${finalPath}`);
