import fs from 'node:fs/promises';
import { FileBlob, PresentationFile } from 'file:///C:/Users/Happy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';

const sourcePath = 'C:/Users/Happy/.codex/attachments/5ca18977-cf49-47db-a7bd-026e31fa35cc/sales-discovery.pptx';
const outputDir = 'C:/Users/HAPPY/Documents/ChatGPT/School Management System/.codex/pitch-build/source-preview';
await fs.mkdir(outputDir, { recursive: true });
const presentation = await PresentationFile.importPptx(await FileBlob.load(sourcePath));
console.log(`slides=${presentation.slides.items.length}`);
const inspect = await presentation.inspect({ kind: 'slide,textbox,shape,image,table,chart,notes', maxChars: 30000 });
console.log(inspect.ndjson);
for (const [index, slide] of presentation.slides.items.entries()) {
  const png = await presentation.export({ slide, format: 'png', scale: 1 });
  await fs.writeFile(`${outputDir}/slide-${index + 1}.png`, new Uint8Array(await png.arrayBuffer()));
}
