import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3102/Marketing101/';
const errors = []; page.on('pageerror', error => errors.push(error.message));
const nav = async name => { if (await page.getByLabel('Workspace navigation', { exact: true }).isVisible()) await page.getByLabel('Workspace navigation', { exact: true }).selectOption({ label: name }); else await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true }).click(); };
const fill = (name, value) => page.getByLabel(name, { exact: true }).fill(value);
await mkdir('test-results', { recursive: true });
try {
  await page.goto(origin);
  if (process.env.TEST_SERVER === 'true') {
    await page.getByRole('button', { name: 'New here? Create an account' }).click();
    await fill('Email', `launch-${Date.now()}@example.com`); await page.getByLabel(/^Password/).fill('launch walkthrough password');
    await page.getByRole('button', { name: 'Create account →', exact: true }).click();
  }
  await nav('المشاريع / Projects');
  async function addProject(name) {
    await fill('اسم المشروع', name); await fill('الخدمة أو العرض الرئيسي', 'إدارة المواعيد'); await fill('وصف المشروع', 'سيناريو افتراضي لاختبار إطلاق خدمة تنظيم مواعيد العيادات');
    await fill('الجمهور الافتراضي', 'العيادات'); await fill('حقائق معتمدة للمشروع', 'عرض تجريبي لطريقة تنظيم المواعيد');
    await fill('رابط المشروع العام', 'https://example.com/join'); await page.getByRole('button', { name: 'حفظ المشروع', exact: true }).click();
    await page.getByText('Project saved.', { exact: true }).waitFor();
  }
  await addProject('مشروع طبي افتراضي'); await addProject('مشروع دورة افتراضي');
  await page.locator('.project-card').filter({ hasText: 'مشروع طبي افتراضي' }).getByRole('button', { name: 'فتح المشروع', exact: true }).click();
  await page.getByRole('heading', { name: 'أطلق مشروعك خطوة بخطوة', exact: true }).waitFor();
  await fill('المدن أو مناطق توفر الخدمة', 'دمشق — تجربة افتراضية'); await fill('سؤال أو مشكلة الجمهور', 'كيف ننظم المواعيد؟');
  await page.getByRole('button', { name: 'التالي', exact: true }).click();
  await fill('خطوة التواصل أو التسجيل', 'اطلب تفاصيل التجربة'); await fill('متى نعتبر النتيجة نجاحاً؟', 'استفسار من عيادة عن تجربة الخدمة');
  assert.equal(await page.getByLabel('ميزانية الخطة (DKK)', { exact: true }).getAttribute('step'), '0.01');
  await page.getByRole('button', { name: 'التالي', exact: true }).click();
  await fill('المسؤول عن متابعة الاستفسارات', 'مسؤول التجربة');
  await page.getByLabel('الخدمة متاحة فعلياً لهذا الجمهور والمنطقة', { exact: true }).check();
  await page.getByLabel('فتحت رابط الاستجابة واختبرت التسجيل أو التواصل', { exact: true }).check();
  await page.getByLabel('راجعت الحقائق ودليل الثقة وأوافق على استخدامهما', { exact: true }).check();
  await page.getByRole('button', { name: 'التالي', exact: true }).click();
  await fill('محتوى الإطلاق 1', (await page.getByLabel('محتوى الإطلاق 1', { exact: true }).inputValue()) + '\nنص معدل قبل الحفظ');
  await page.screenshot({ path: 'test-results/launch-review.png', fullPage: true });
  await page.getByRole('button', { name: 'حفظ وإنشاء مسودة الحملة', exact: true }).click();
  await page.getByRole('heading', { name: 'The campaign brief', exact: true }).waitFor();
  assert.match(await page.getByLabel('Exact content', { exact: true }).first().inputValue(), /نص معدل قبل الحفظ/);
  assert.match(await page.getByLabel('Exact content', { exact: true }).nth(1).inputValue(), /utm_content=evidence/);
  assert.equal(await page.locator('.receipt').count(), 0);
  await page.getByRole('button', { name: 'Schedule all pieces now for a quick demo ↗', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await page.getByText('Changes saved. Review the latest campaign.').waitFor();
  await page.getByRole('button', { name: 'Review campaign →' }).click();
  await page.getByLabel('I reviewed every content piece, link, date, and allocation.', { exact: true }).check();
  await page.getByRole('button', { name: 'Approve & schedule →' }).click(); await page.getByText('completed', { exact: true }).waitFor({ timeout: 20000 });
  assert.equal(await page.locator('.receipt').count(), 3);
  await nav('المتابعة / Follow-up'); await fill('مرجع الاستفسار أو اسم مستعار', 'عيادة تجريبية 1'); await fill('مصدر الاستفسار', 'community');
  await page.getByRole('button', { name: 'حفظ المتابعة', exact: true }).click(); await page.getByText('Follow-up saved.', { exact: true }).waitFor();
  assert.match(await page.getByLabel('رد مقترح', { exact: true }).inputValue(), /اطلب تفاصيل التجربة/);
  await nav('مصادر النتائج / Tracking'); await fill('اسم الحملة (utm_campaign)', 'city-pilot');
  await page.getByRole('button', { name: 'إنشاء رابط موسوم', exact: true }).click(); assert.match(await page.getByLabel('الرابط الناتج', { exact: true }).inputValue(), /utm_campaign=city-pilot/);
  await nav('Results'); await fill('Report name', 'اختبار يدوي افتراضي'); await fill('Result source', 'community'); await fill('Success definition', 'استفسار عيادة مؤهلة');
  await page.getByRole('button', { name: 'Save result report', exact: true }).click(); await page.getByText('Actual result report saved.', { exact: true }).waitFor();
  assert.match(await page.locator('.report-row').first().innerText(), /community/);
  await nav('Backup & exports'); const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download backup JSON', exact: true }).click(); const file = await download; await file.saveAs('test-results/launch-backup.json');
  const backup = JSON.parse(await readFile('test-results/launch-backup.json', 'utf8'));
  assert.equal(backup.workspace.projects.length, 2); assert.equal(backup.campaigns.length, 1); assert.equal(backup.workspace.projects[0].workspace.followups.length, 1);
  await nav('المشاريع / Projects'); await page.locator('.project-card').filter({ hasText: 'مشروع دورة افتراضي' }).getByRole('button', { name: 'فتح المشروع', exact: true }).click();
  await nav('Overview'); assert.equal(await page.locator('.campaign-row').count(), 0);
  await nav('Results'); assert.equal(await page.locator('.report-row').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['المشاريع / Projects', 'أطلق مشروعك / Launch', 'المتابعة / Follow-up', 'مصادر النتائج / Tracking']) { await nav(name); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} fits mobile`); }
  await page.screenshot({ path: 'test-results/launch-mobile.png', fullPage: true });
  await page.reload(); await page.getByRole('heading', { name: 'Your marketing, in motion.', exact: true }).waitFor(); await nav('المشاريع / Projects'); assert.equal(await page.locator('.project-card').count(), 2);
  assert.deepEqual(errors, []);
  console.log('Launch journey passed: two isolated projects, four-step Arabic wizard, edited three-purpose content, exact approval, three simulated receipts, follow-up, UTM, sourced report, full backup, persistence and mobile navigation.');
} catch (error) { await page.screenshot({ path: 'test-results/launch-failure.png', fullPage: true }); console.error('Browser errors:', errors); throw error; }
finally { await browser.close(); }
