import fs from 'node:fs/promises';
import { FileBlob, PresentationFile } from 'file:///C:/Users/Happy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';

const finalPath = 'C:/Users/HAPPY/Documents/ChatGPT/School Management System/pitch-output/schooldb-pitch-slide.pptx';
const outputPath = 'C:/Users/HAPPY/Documents/ChatGPT/School Management System/pitch-build/final-slide.png';
const presentation = await PresentationFile.importPptx(await FileBlob.load(finalPath));
console.log(`slides=${presentation.slides.items.length}`);
console.log((await presentation.inspect({ kind: 'slide,textbox,notes', maxChars: 9000 })).ndjson);
const image = await presentation.export({ slide: presentation.slides.items[0], format: 'png', scale: 1 });
await fs.writeFile(outputPath, new Uint8Array(await image.arrayBuffer()));
