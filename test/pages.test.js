import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
execFileSync(process.execPath, ['tools/build-pages.mjs']);
const { createBrowserDemo } = await import('../.pages-dist/pages-demo.js');
const { freshWorkspace } = await import('../public/marketing-tools.js');
function setup() {
  const values = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const api = createBrowserDemo(storage);
  return { api, storage };
}
const brand = { name: 'Demo brand', business: 'Courses', product: 'sales course', audience: 'business owners', tone: 'Friendly', website: 'https://example.com', claims: '' };
test('Pages artifact contains only public assets, relative paths and explicit browser mode', () => {
  assert.deepEqual(readdirSync('.pages-dist').sort(), ['.nojekyll', 'app.js', 'editor-state.js', 'index.html', 'marketing-tools.js', 'pages-demo.js', 'planner-browser.js', 'styles.css', 'workspace-ui.js']);
  const html = readFileSync('.pages-dist/index.html', 'utf8');
  assert.match(html, /content="browser-demo"/);
  assert.match(html, /src="\.\/app.js"/);
  assert.doesNotMatch(html, /(?:src|href)="\/(?:app.js|styles.css)"/);
  assert.doesNotMatch(readFileSync('.pages-dist/planner-browser.js', 'utf8'), /node:crypto/);
});
test('browser demo persists review/edit/approval and runs each simulated delivery once', async () => {
  const { api, storage } = setup();
  await api('/brand', 'PUT', brand);
  assert.deepEqual((await api('/plan', 'POST', { message: 'Promote my course' })).missing, ['budget', 'days']);
  const result = await api('/plan', 'POST', { message: 'Promote my course for one week with 100 DKK' });
  let c = result.campaign;
  c.data.items.forEach(i => i.due = Date.now() - 1000);
  c = await api(`/campaigns/${c.id}`, 'PUT', { data: c.data, revision: 1 });
  await api(`/campaigns/${c.id}/action`, 'POST', { action: 'submit', revision: 2 });
  assert.equal((await api(`/campaigns/${c.id}`)).receipts.length, 0);
  await assert.rejects(api(`/campaigns/${c.id}/action`, 'POST', { action: 'approve', revision: 1 }), /changed/);
  await api(`/campaigns/${c.id}/action`, 'POST', { action: 'approve', revision: 2 });
  const done = await createBrowserDemo(storage)(`/campaigns/${c.id}`);
  assert.equal(done.status, 'completed'); assert.equal(done.receipts.length, 3); assert.equal(done.spent, 10000);
  assert.equal((await api(`/campaigns/${c.id}`)).receipts.length, 3);
  const copy = await api(`/campaigns/${c.id}/duplicate`, 'POST', { revision: 2 });
  assert.equal(copy.status, 'draft'); assert.equal(copy.jobs.length, 0); assert.equal(copy.spent, 0); assert.equal(copy.approved_revision, null);
  assert.notEqual(copy.id, c.id);
  await api('/reset', 'POST', {}); assert.equal((await api('/campaigns')).length, 0); assert.equal(await api('/brand'), null);
});
test('browser demo automatic limits and pause/cancel stop simulation', async () => {
  const { api } = setup(); await api('/brand', 'PUT', brand);
  await api('/policy', 'PUT', { enabled: true, accounts: ['demo-workspace'], campaignTypes: ['product-promotion'], maxCampaign: 10000, maxDaily: 5000, adjustments: [] });
  let c = (await api('/plan', 'POST', { message: 'Promote my course for one week with 100 DKK' })).campaign;
  c.data.items.forEach(i => i.due = Date.now() - 1000);
  c = await api(`/campaigns/${c.id}`, 'PUT', { data: c.data, revision: 1 });
  await api(`/campaigns/${c.id}/action`, 'POST', { action: 'submit', revision: 2 });
  await api(`/campaigns/${c.id}/action`, 'POST', { action: 'pause', revision: 2 });
  assert.equal((await api(`/campaigns/${c.id}`)).receipts.length, 0);
  await api(`/campaigns/${c.id}/action`, 'POST', { action: 'resume', revision: 2 });
  c = await api(`/campaigns/${c.id}`); assert.equal(c.status, 'failed'); assert.equal(c.receipts.length, 1);
  assert.ok(c.spent <= 5000);
  await api(`/campaigns/${c.id}/action`, 'POST', { action: 'cancel', revision: 2 });
  assert.equal((await api(`/campaigns/${c.id}`)).receipts.length, 1);
});
test('workspace migration, revision conflicts, and backup restore cannot start approved jobs', async () => {
  const { api, storage } = setup();
  // Legacy Pages records did not have a workspace; migrate without deleting campaigns.
  storage.setItem('marketing101.pages.demo.v1', JSON.stringify({ version: 1, brand: null, campaigns: [], policy: { enabled: false, accounts: [], campaignTypes: [] } }));
  const initial = await api('/workspace'); assert.equal(initial.revision, 0);
  const workspace = { ...freshWorkspace(), products: [{ id: 'p1', name: 'Course', description: 'Facts', audience: 'Owners', website: '', color: '#235a43' }] };
  assert.equal((await api('/workspace', 'PUT', workspace)).revision, 1);
  await assert.rejects(api('/workspace', 'PUT', workspace), /changed/);
  await api('/brand', 'PUT', brand);
  const c = (await api('/plan', 'POST', { message: 'Promote my course for one week with 0 DKK' })).campaign;
  const backup = { format: 'marketing101-backup', version: 1, brand, workspace, campaigns: [{ id: c.id, data: c.data }] };
  await api('/restore', 'POST', backup);
  const restored = await api(`/campaigns/${c.id}`);
  assert.equal(restored.status, 'draft'); assert.equal(restored.jobs.length, 0); assert.equal(restored.receipts.length, 0);
  assert.equal((await api('/policy')).enabled, false);
  await assert.rejects(api('/workspace', 'PUT', { ...workspace, revision: 1 }), /changed/);
  await assert.rejects(api('/restore', 'POST', { ...backup, campaigns: [{ ...backup.campaigns[0], data: { bad: true } }] }), /items/);
  assert.equal((await api('/campaigns')).length, 1);
});
