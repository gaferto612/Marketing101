import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
execFileSync(process.execPath, ['tools/build-pages.mjs']);
const { createBrowserDemo } = await import('../.pages-dist/pages-demo.js');
function setup() {
  const values = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const api = createBrowserDemo(storage);
  return { api, storage };
}
const brand = { name: 'Demo brand', business: 'Courses', product: 'sales course', audience: 'business owners', tone: 'Friendly', website: 'https://example.com', claims: '' };
test('Pages artifact contains only public assets, relative paths and explicit browser mode', () => {
  assert.deepEqual(readdirSync('.pages-dist').sort(), ['.nojekyll', 'app.js', 'index.html', 'pages-demo.js', 'planner-browser.js', 'styles.css']);
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
