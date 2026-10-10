import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const serverMode = process.env.TEST_SERVER === 'true';
const errors = []; page.on('pageerror', error => errors.push(error.message));
await mkdir('test-results', { recursive: true });
const nav = async name => {
  if (await page.getByLabel('Workspace navigation', { exact: true }).isVisible()) await page.getByLabel('Workspace navigation', { exact: true }).selectOption({ label: name });
  else await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true }).click();
};
const firstDraft = () => page.locator('[data-saved-content="d0"]');
async function request(path, method = 'GET', input) {
  return page.evaluate(async ({ path, method, input, serverMode }) => {
    if (!serverMode) return (await import('./pages-demo.js')).demoApi(path, method, input);
    const me = await (await fetch('/api/me')).json();
    const res = await fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrf }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error); return data;
  }, { path, method, input, serverMode });
}
try {
  await page.goto(process.env.TEST_ORIGIN || 'http://127.0.0.1:3102/Marketing101/');
  if (serverMode) {
    await page.getByRole('button', { name: 'New here? Create an account' }).click();
    await page.getByLabel('Email', { exact: true }).fill(`audit-${Date.now()}@example.com`);
    await page.getByLabel(/^Password/).fill('audit browser password');
    await page.getByRole('button', { name: 'Create account →' }).click();
  }
  await page.getByRole('heading', { name: 'Your marketing, in motion.' }).waitFor();
  await request('/brand', 'PUT', { name: 'Audit Brand', business: 'Training', product: 'Audit course', audience: 'Owners', tone: 'Clear', language: 'en', website: '', claims: '' });
  await request('/workspace', 'PUT', { version: 1, revision: 0,
    products: [{ id: 'p1', name: 'Audit course', description: 'Actual course description', audience: 'Small business owners', facts: 'Practice included', cta: 'Ask for details', website: '', color: '#235a43', problem: 'discovery questions', difference: 'Practical sessions', objections: 'course format' }],
    drafts: Array.from({ length: 24 }, (_, i) => ({ id: `d${i}`, productId: 'p1', title: `Approved draft ${i}`, content: `Original content ${i}`, format: i % 2 ? 'ad' : 'social', language: 'en', stage: 'draft', sourceRevision: 1, updated: Date.now() })),
    results: [{ id: 'r1', date: '2026-10-01', label: 'Measured report', campaignId: '', spend: 100, impressions: 1000, clicks: 20, leads: 4, sales: 1, revenue: 300 }, { id: 'r2', date: '2026-10-02', label: 'Incomplete report', campaignId: '', spend: 500, impressions: null, clicks: null, leads: null, sales: null, revenue: null }], briefs: [] });
  await page.getByRole('button', { name: 'Reload workspace' }).click(); await page.getByText('Workspace reloaded.', { exact: true }).waitFor();
  await nav('Content studio'); assert.equal(await page.locator('.saved-draft').count(), 20);
  await firstDraft().fill('Saved draft edit A');
  await page.getByRole('button', { name: 'Generate content kit', exact: true }).click();
  assert.equal(await firstDraft().inputValue(), 'Saved draft edit A');
  await page.getByLabel('Social post content', { exact: true }).fill('Generated kit edit A');
  await page.getByRole('button', { name: 'Save all drafts', exact: true }).click(); await page.getByText('Six content drafts saved.', { exact: true }).waitFor();
  assert.equal(await firstDraft().inputValue(), 'Saved draft edit A');
  await page.locator('.saved-draft').first().getByRole('button', { name: 'Save edits', exact: true }).click(); await page.getByText('Saved draft edits.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Generate content kit', exact: true }).click();
  await page.getByLabel('Social post content', { exact: true }).fill('Generated kit edit B');
  await firstDraft().fill('Saved draft edit B');
  await page.locator('.saved-draft').first().getByRole('button', { name: 'Save edits', exact: true }).click(); await page.getByText('Saved draft edits.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Social post content', { exact: true }).inputValue(), 'Generated kit edit B');
  await page.getByRole('button', { name: 'Save all drafts', exact: true }).click(); await page.getByText('Six content drafts saved.', { exact: true }).waitFor();
  await firstDraft().fill('Hidden draft edit');
  await page.getByLabel('Search saved content', { exact: true }).fill('Approved draft 23');
  await page.getByRole('button', { name: 'Filter drafts', exact: true }).click(); assert.equal(await page.locator('.saved-draft').count(), 1);
  await page.getByRole('button', { name: 'Save draft edits', exact: true }).click(); await page.getByText('Saved draft edits.', { exact: true }).waitFor();
  await page.getByLabel('Search saved content', { exact: true }).fill(''); await page.getByRole('button', { name: 'Filter drafts', exact: true }).click();
  assert.equal(await firstDraft().inputValue(), 'Hidden draft edit');
  await firstDraft().fill('Do not silently delete this');
  await page.locator('.saved-draft').first().getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByText('Save or discard unsaved edits before deleting a draft.', { exact: true }).waitFor();
  assert.equal(await firstDraft().inputValue(), 'Do not silently delete this');
  await page.getByRole('button', { name: 'Discard unsaved edits', exact: true }).click();
  await page.locator('.saved-draft').first().getByRole('button', { name: 'Mark ready', exact: true }).click();
  await page.locator('.saved-draft').first().getByText('ready', { exact: true }).waitFor();
  await nav('Products'); await page.locator('.product-card').first().getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Product description', { exact: true }).fill('Updated actual course description');
  await page.getByRole('button', { name: 'Save product', exact: true }).click(); await page.getByText('Product saved.', { exact: true }).waitFor();
  await nav('Content studio'); assert.equal(await page.locator('.saved-draft').first().locator('.pill').textContent(), 'draft');
  await page.locator('.saved-draft').first().getByText(/Product facts need review/).waitFor();
  await page.screenshot({ path: 'test-results/audited-content-studio.png', fullPage: true });
  await nav('Strategy'); await page.getByLabel('Planning target', { exact: true }).fill('12');
  await page.getByLabel('Plan duration (days)', { exact: true }).fill('7');
  await page.getByLabel('Testable hypothesis', { exact: true }).fill('Compare a question hook with an introduction and measure leads.');
  await page.getByRole('button', { name: 'Save strategy brief', exact: true }).click(); await page.getByText('Strategy brief saved.', { exact: true }).waitFor();
  await page.screenshot({ path: 'test-results/strategy-planner.png', fullPage: true });
  await page.getByRole('button', { name: 'Use brief in campaign', exact: true }).click();
  await page.getByRole('button', { name: 'Build my campaign' }).click(); await page.getByRole('heading', { name: 'The campaign brief' }).waitFor();
  await page.getByText(/Planning target: 12 Leads in 7 days/).waitFor();
  const campaigns = await request('/campaigns'); const w = await request('/workspace'); w.results[1].campaignId = campaigns[0].id; await request('/workspace', 'PUT', w);
  assert.equal(campaigns[0].data.goalPlan.target, 12);
  await page.getByRole('button', { name: 'Reload workspace' }).click(); await page.getByText('Workspace reloaded.', { exact: true }).waitFor();
  await nav('Results'); await page.getByLabel('Filter campaign', { exact: true }).selectOption(campaigns[0].id);
  await page.getByRole('button', { name: 'Filter reports', exact: true }).click();
  assert.equal(await page.locator('.report-row').count(), 1); assert.match(await page.locator('#metric-coverage').textContent(), /ROAS 0\/1/);
  await page.getByRole('heading', { name: 'Reported outcome vs planning target', exact: true }).waitFor();
  await page.getByLabel('Filter campaign', { exact: true }).selectOption('');
  await page.getByLabel('From date', { exact: true }).fill('2026-10-01'); await page.getByLabel('To date', { exact: true }).fill('2026-10-01');
  await page.getByRole('button', { name: 'Filter reports', exact: true }).click();
  assert.equal(await page.locator('.report-row').count(), 1); assert.match(await page.locator('.result-stats').textContent(), /3×/);
  await page.screenshot({ path: 'test-results/scoped-results.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.getByLabel('Workspace navigation', { exact: true }).isVisible());
  for (const name of ['Overview', 'Strategy', 'Content studio', 'Results', 'Backup & exports']) { await nav(name); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
  await nav('Strategy'); await page.screenshot({ path: 'test-results/mobile-strategy.png', fullPage: true });
  if (serverMode) { await page.getByRole('button', { name: 'Sign out ↗' }).click(); await page.getByRole('heading', { name: 'Welcome back.' }).waitFor(); assert.equal(await page.locator('#view').textContent(), ''); }
  else { page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Reset demo' }).click(); await page.getByText('Browser demo reset.', { exact: true }).waitFor(); }
  assert.deepEqual(errors, []);
  console.log(`Audit regression browser passed (${serverMode ? 'server' : 'Pages'}): mixed edits, hidden edits/filtering, deletion guard, source review invalidation, measurable strategy, scoped reporting, mobile navigation, and session cleanup.`);
} catch (error) {
  await page.screenshot({ path: 'test-results/audit-failure.png', fullPage: true });
  console.error('Headings:', await page.locator('h1,h2').allTextContents()); console.error('Errors:', errors); throw error;
} finally { await browser.close(); }
