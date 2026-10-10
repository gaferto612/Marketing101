import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
// Cover user-visible behavior and the manual itself, including newly added modules.
const files = ['package.json'];
for (const dir of ['public', 'src']) {
  for (const entry of await readdir(new URL(`${dir}/`, root), { withFileTypes: true }))
    if (entry.isFile() && /\.(js|html|css)$/.test(entry.name)) files.push(`${dir}/${entry.name}`);
}
files.sort();
const hashes = {};
for (const file of files) hashes[file] = createHash('sha256').update((await readFile(new URL(file, root), 'utf8')).replaceAll('\r\n', '\n')).digest('hex');
const manifest = new URL('docs/user-manual-review.json', root);
if (process.argv.includes('--reviewed')) {
  await writeFile(manifest, JSON.stringify({ reviewed: hashes }, null, 2) + '\n');
  console.log('Recorded manual review. Commit the manual and review manifest together.');
} else {
  let previous;
  try { previous = JSON.parse(await readFile(manifest, 'utf8')).reviewed; } catch { throw new Error('Missing manual review manifest. Review the guide, then run npm run manual:reviewed.'); }
  const changed = [...new Set([...Object.keys(previous), ...files])].filter(f => previous[f] !== hashes[f]);
  if (changed.length) throw new Error(`User manual review required for: ${changed.join(', ')}. Update the relevant guide sections and reviewedOn, then run npm run manual:reviewed. For changes that do not affect instructions, record why in the PR. This check detects changes; it does not write or verify instructional accuracy.`);
  console.log('User manual review matches current application files.');
}
