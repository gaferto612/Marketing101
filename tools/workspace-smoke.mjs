import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3102/Marketing101/';
const serverMode = process.env.TEST_SERVER === 'true';
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const nav = async name => {
  if (await page.getByLabel('Workspace navigation', { exact: true }).isVisible()) await page.getByLabel('Workspace navigation', { exact: true }).selectOption({ label: name });
  else await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true }).click();
};
const fits = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow');
await mkdir('test-results', { recursive: true });
async function download(button, name) {
  const pending = page.waitForEvent('download'); await button.click(); const file = await pending;
  const path = `test-results/${name}`; await file.saveAs(path); return path;
}
try {
  await page.goto(origin);
  if (serverMode) {
    await page.getByRole('button', { name: 'New here? Create an account' }).click();
    await page.getByLabel('Email', { exact: true }).fill(`workspace-${Date.now()}@example.com`);
    await page.getByLabel(/^Password/).fill('workspace smoke password');
    await page.getByRole('button', { name: 'Create account →', exact: true }).click();
  }
  await page.getByRole('heading', { name: 'Your marketing, in motion.' }).waitFor();
  await nav('Brand profile');
  await page.getByLabel('Business name', { exact: true }).fill('ورشة التسويق');
  await page.getByLabel('Main product or offer', { exact: true }).fill('دورة مبيعات');
  await page.getByLabel('Business details', { exact: true }).fill('تدريب عملي لأصحاب المشاريع');
  await page.getByLabel('Default audience', { exact: true }).fill('أصحاب المشاريع الصغيرة');
  await page.getByLabel('Brand tone', { exact: true }).fill('واضح وودّي');
  await page.getByLabel('Default campaign language', { exact: true }).selectOption('ar');
  await page.getByLabel('One claim per line', { exact: true }).fill('Brand-only claim, not for this product');
  // Leave the optional product link empty throughout this journey.
  await page.getByRole('button', { name: 'Save brand profile →' }).click();
  await page.getByRole('heading', { name: 'What are we promoting?' }).waitFor();
  await nav('Products');
  await page.getByLabel('Product name', { exact: true }).fill('دورة محادثات البيع');
  await page.getByLabel('Audience', { exact: true }).fill('أصحاب المشاريع');
  await page.getByLabel('Product description', { exact: true }).fill('تدريب على فهم احتياجات العميل');
  await page.getByLabel('Offer details', { exact: true }).fill('ثلاث جلسات تدريبية');
  await page.getByLabel('Approved product facts', { exact: true }).fill('تتضمن تمارين عملية');
  await page.getByLabel('Call to action', { exact: true }).fill('تواصل معنا للتفاصيل');
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  await page.getByText('Product saved.', { exact: true }).waitFor();
  assert.equal(await page.locator('.product-card').count(), 1);
  await page.locator('.product-card').getByRole('button', { name: 'Create content' }).click();
  await page.getByRole('button', { name: 'Generate content kit', exact: true }).click();
  assert.equal(await page.locator('.kit-grid textarea').count(), 6);
  const social = await page.getByLabel('Social post content', { exact: true }).inputValue();
  assert.match(social, /تتضمن تمارين عملية/); assert.doesNotMatch(social, /Brand-only/);
  const modified = social + '\n<script>window.workspaceXss=true</script>';
  await page.getByLabel('Social post content', { exact: true }).fill(modified);
  await page.getByRole('button', { name: 'Save all drafts', exact: true }).click();
  await page.getByText('Six content drafts saved.', { exact: true }).waitFor();
  assert.equal(await page.locator('.saved-draft').count(), 6);
  assert.equal(await page.evaluate(() => window.workspaceXss), undefined);
  await page.screenshot({ path: 'test-results/content-studio.png', fullPage: true });
  await page.locator('.saved-draft').first().getByRole('button', { name: 'Mark ready' }).click();
  await page.locator('.saved-draft').first().getByText('ready', { exact: true }).waitFor();
  const csvPath = await download(page.getByRole('button', { name: 'Export CSV', exact: true }), 'content-export.csv');
  assert.match(await readFile(csvPath, 'utf8'), /تتضمن تمارين عملية/);
  await page.locator('.saved-draft').first().getByRole('button', { name: 'Use in campaign' }).click();
  await page.getByRole('button', { name: 'Build my campaign' }).click();
  await page.getByRole('heading', { name: 'The campaign brief' }).waitFor();
  assert.equal(await page.getByLabel('Exact content', { exact: true }).first().inputValue(), modified);
  assert.doesNotMatch(await page.getByLabel('Exact content', { exact: true }).nth(1).inputValue(), /Brand-only/);
  await page.getByRole('button', { name: 'Schedule all pieces now for a quick demo ↗', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByText('Changes saved. Review the latest campaign.').waitFor();
  await page.getByRole('button', { name: 'Review campaign →' }).click();
  await page.getByLabel('I reviewed every content piece, link, date, and allocation.', { exact: true }).check();
  await page.getByRole('button', { name: 'Approve & schedule →' }).click();
  await page.getByText('completed', { exact: true }).waitFor({ timeout: 15000 });
  assert.equal(await page.locator('.receipt').count(), 3);
  const campaignCsv = await download(page.getByRole('button', { name: 'Export campaign CSV', exact: true }), 'campaign-export.csv');
  assert.match(await readFile(campaignCsv, 'utf8'), /تتضمن تمارين عملية/);
  await page.getByRole('button', { name: 'Duplicate as draft', exact: true }).click();
  await page.getByText('Duplicated as a draft. Review dates and content before approving.').waitFor();
  assert.equal(await page.locator('.receipt').count(), 0);
  assert.ok(await page.getByRole('button', { name: 'Review campaign →', exact: true }).isVisible());
  await nav('Ad designer');
  for (const [size, width, height] of [['square', 1080, 1080], ['story', 1080, 1920], ['landscape', 1200, 628]]) {
    await page.getByLabel('Canvas size', { exact: true }).selectOption(size);
    const path = await download(page.getByRole('button', { name: 'Download PNG', exact: true }), `ad-${size}.png`);
    const png = await readFile(path);
    assert.equal(png.readUInt32BE(16), width); assert.equal(png.readUInt32BE(20), height);
    await fits();
  }
  await page.screenshot({ path: 'test-results/ad-designer.png', fullPage: true });
  await nav('Calendar');
  const icsPath = await download(page.getByRole('button', { name: 'Export calendar', exact: true }), 'calendar.ics');
  assert.equal(((await readFile(icsPath, 'utf8')).match(/BEGIN:VEVENT/g) || []).length, 6);
  await nav('Results');
  await page.getByLabel('Report name', { exact: true }).fill('Manual test report');
  for (const [name, value] of [['Actual spend (DKK)', 100], ['Impressions', 1000], ['Clicks', 20], ['Leads', 4], ['Sales', 2], ['Revenue (DKK)', 300]]) await page.getByLabel(name, { exact: true }).fill(String(value));
  await page.getByRole('button', { name: 'Save result report', exact: true }).click();
  await page.getByText('Actual result report saved.', { exact: true }).waitFor();
  assert.match(await page.locator('.result-stats').textContent(), /2%/);
  assert.match(await page.locator('.result-stats').textContent(), /3×/);
  await page.screenshot({ path: 'test-results/manual-results.png', fullPage: true });
  await nav('Backup & exports');
  const backupPath = await download(page.getByRole('button', { name: 'Download backup JSON', exact: true }), 'workspace-backup.json');
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  assert.equal(backup.workspace.products.length, 1); assert.equal(backup.workspace.drafts.length, 6); assert.equal(backup.workspace.results.length, 1);
  assert.equal(backup.campaigns.length, 2);
  await page.getByLabel('Backup file', { exact: true }).setInputFiles(backupPath);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Validate & restore backup' }).click();
  await page.getByText('Backup restored. All campaign plans are unapproved drafts.').waitFor();
  await nav('Overview'); assert.equal(await page.locator('.campaign-row').count(), 2);
  assert.deepEqual(await page.locator('.campaign-row .pill').allTextContents(), ['draft', 'draft']);
  await page.reload(); await page.getByRole('heading', { name: 'Your marketing, in motion.' }).waitFor();
  await nav('Products'); assert.equal(await page.locator('.product-card').count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['Products', 'Content studio', 'Ad designer', 'Calendar', 'Results', 'Backup & exports']) { await nav(name); await fits(); }
  await page.screenshot({ path: 'test-results/mobile-backup.png', fullPage: true });
  await nav('Automation'); assert.ok(!(await page.getByLabel('Enable automatic mode for matching campaigns', { exact: true }).isChecked()));
  if (!serverMode) { page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Reset demo' }).click(); await page.getByText('Browser demo reset.', { exact: true }).waitFor(); }
  else { await page.getByRole('button', { name: 'Sign out ↗' }).click(); await page.getByRole('heading', { name: 'Welcome back.' }).waitFor(); }
  assert.deepEqual(errors, []);
  console.log(`Free workspace browser test passed (${serverMode ? 'authenticated server' : 'Pages'}): product facts, Arabic kit, draft editing/readiness, campaign reuse, PNGs, CSV, calendar, actual metrics, backup/restore, persistence, mobile layouts, and script escaping.`);
} catch (error) {
  await page.screenshot({ path: 'test-results/workspace-failure.png', fullPage: true });
  console.error('Headings:', await page.locator('h1,h2').allTextContents());
  console.error('Browser errors:', errors); throw error;
} finally { await browser.close(); }
