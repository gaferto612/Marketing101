import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';

// Explicit allowlist: never deploy the repository root, server, credentials, or DB.
const output = new URL('../.pages-dist/', import.meta.url);
await mkdir(output, { recursive: true });
const allowed = new Set(['index.html', 'manual.html', 'user-manual.js', 'styles.css', 'app.js', 'pages-demo.js', 'planner-browser.js', 'marketing-tools.js', 'workspace-ui.js', 'editor-state.js', '.nojekyll']);
for (const file of ['launch-tools.js', 'launch-ui.js', 'project-client.js']) allowed.add(file);
for (const entry of await readdir(output, { withFileTypes: true })) {
  if (!allowed.has(entry.name) || !entry.isFile()) throw new Error(`Unexpected Pages output entry: ${entry.name}. Refusing to package it.`);
}
let html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="marketing101-mode" content="browser-demo">');
html = html.replace('href="/styles.css"', 'href="./styles.css"').replace('src="/app.js"', 'src="./app.js"').replaceAll('href="/"', 'href="./"');
await writeFile(new URL('index.html', output), html);
for (const file of ['launch-tools.js', 'launch-ui.js', 'project-client.js', 'manual.html', 'user-manual.js', 'styles.css', 'app.js', 'pages-demo.js', 'marketing-tools.js', 'workspace-ui.js', 'editor-state.js']) {
  await copyFile(new URL(`../public/${file}`, import.meta.url), new URL(file, output));
}
const planner = (await readFile(new URL('../src/planner.js', import.meta.url), 'utf8'))
  .replace("import { randomUUID } from 'node:crypto';", 'const randomUUID = () => globalThis.crypto.randomUUID();')
  .replace("'../public/marketing-tools.js'", "'./marketing-tools.js'")
  .replace("'../public/launch-tools.js'", "'./launch-tools.js'");
await writeFile(new URL('planner-browser.js', output), planner);
await writeFile(new URL('.nojekyll', output), '');
console.log('Pages browser demo built in .pages-dist (no server, credentials, or runtime data).');
