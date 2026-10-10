import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, cpSync, mkdirSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sections, reviewedOn } from '../public/user-manual.js';

test('guide review matches current app and covers every workflow without promising live delivery', () => {
  execFileSync(process.execPath, ['tools/check-manual.mjs']);
  assert.match(reviewedOn, /^\d{4}-\d{2}-\d{2}$/);
  const expected = ['projects', 'launch', 'followup', 'tracking', 'start', 'modes', 'brand', 'products', 'strategy', 'studio', 'composer', 'approval', 'states', 'automation', 'creative', 'results', 'backup', 'help'];
  assert.deepEqual(sections.map(s => s.id), expected);
  for (const section of sections) assert.ok(section.title && section.text && section.steps.length);
  assert.match(sections.find(s => s.id === 'modes').text, /لا نشر حقيقي/);
  for (const workflow of ['ci', 'pages']) assert.match(readFileSync(`.github/workflows/${workflow}.yml`, 'utf8'), /npm run manual:check/);
  assert.match(readFileSync('public/index.html', 'utf8'), /data-view="manual"/);
});

test('unreviewed feature changes block the manual check', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'marketing101-manual-'));
  try {
    for (const dir of ['public', 'src']) cpSync(dir, join(fixture, dir), { recursive: true });
    mkdirSync(join(fixture, 'tools')); mkdirSync(join(fixture, 'docs'));
    for (const file of ['package.json', 'tools/check-manual.mjs', 'docs/user-manual-review.json']) cpSync(file, join(fixture, file));
    appendFileSync(join(fixture, 'public/app.js'), '\n// Simulated new feature\n');
    assert.throws(() => execFileSync(process.execPath, ['tools/check-manual.mjs'], { cwd: fixture, stdio: 'pipe' }), error => /User manual review required for: public\/app.js/.test(String(error.stderr)));
  } finally {
    const target = resolve(fixture);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('marketing101-manual-')) throw new Error('Unexpected test cleanup target');
    rmSync(target, { recursive: true, force: true });
  }
});
