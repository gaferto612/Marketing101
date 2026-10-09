import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshWorkspace, validateWorkspace, generatePack, metrics, csv, calendarFile, normalizeBackup, qualityChecks } from '../public/marketing-tools.js';
import { validateBrand, validateCampaign, plan, parseRequest } from '../src/planner.js';

const product = { id: 'product-1', name: 'دورة مبيعات', description: 'دروس لتطوير محادثات البيع', audience: 'أصحاب المشاريع', facts: 'تتضمن تمارين عملية', offer: 'ثلاث جلسات', cta: 'تواصل معنا', website: '', color: '#235a43' };
const brand = { name: 'Test brand', business: 'Training', product: 'Course', audience: 'Owners', tone: 'Friendly', claims: 'Brand-only claim', website: '' };
test('free Arabic and English kits use supplied facts and produce six distinct formats without requiring links', () => {
  const ar = generatePack(product, { language: 'ar', goal: 'launch', tone: 'friendly' });
  const en = generatePack(product, { language: 'en', goal: 'awareness', tone: 'clear' });
  assert.equal(ar.length, 6); assert.equal(new Set(ar.map(d => d.format)).size, 6);
  assert.match(ar[0].content, /نقدّم لك/); assert.match(ar[0].content, /تمارين عملية/);
  assert.match(en[0].content, /Discover/); assert.doesNotMatch(ar[0].content, /https|100%|مضمون/);
  assert.notEqual(en[0].content, generatePack(product, { language: 'en', variant: 1 })[0].content);
  assert.equal(qualityChecks('Guaranteed 100% results').length, 1);
});
test('workspace validation rejects unsafe URLs, inconsistent counts, duplicate IDs and orphan drafts', () => {
  const w = freshWorkspace(); w.products.push(product);
  assert.equal(validateWorkspace(w).products[0].website, '');
  assert.throws(() => validateWorkspace({ ...w, products: [{ ...product, website: 'javascript:alert(1)' }] }), /HTTP/);
  assert.throws(() => validateWorkspace({ ...w, products: [product, product] }), /Duplicate/);
  assert.throws(() => validateWorkspace({ ...w, drafts: [{ id: 'draft-1', productId: 'missing', format: 'social', language: 'ar' }] }), /missing/);
  const report = { id: 'report-1', label: 'Real report', date: '2026-10-09', spend: 100, clicks: 20, impressions: 10, leads: null, sales: null, revenue: null };
  assert.throws(() => validateWorkspace({ ...w, results: [report] }), /Clicks/);
  assert.throws(() => validateWorkspace({ ...w, results: [{ ...report, clicks: 1, date: '2026-99-01' }] }), /valid result date/);
});
test('manual metrics do not turn missing data into zero or invent ratios', () => {
  const rows = [
    { spend: 100, clicks: 20, impressions: 1000, leads: 4, revenue: 300 },
    { spend: 1000, clicks: null, impressions: null, leads: null, revenue: null }
  ];
  const result = metrics(rows);
  assert.equal(result.spend, 1100); assert.equal(result.ctr, 2); assert.equal(result.cpl, 25); assert.equal(result.roas, 3);
  assert.equal(metrics([]).roas, null);
  assert.equal(metrics([{ spend: 0, revenue: 10, clicks: 0, impressions: 0, leads: 0 }]).cpl, null);
});
test('CSV export escapes quotes, newlines and spreadsheet formulas', () => {
  const result = csv([{ title: '=1+1', content: 'A "quote"\nnew line' }]);
  assert.match(result, /'=1\+1/); assert.match(result, /""quote""/); assert.ok(result.startsWith('\uFEFF'));
});
test('calendar export uses UTC, escapes text and folds Arabic without splitting characters', () => {
  const content = 'نص عربي طويل '.repeat(30);
  const output = calendarFile([{ id: 'c1', status: 'draft', created: Date.UTC(2026, 9, 9), data: { title: 'Course, offer; details', items: [{ id: 'i1', due: Date.UTC(2026, 9, 10, 12), channel: 'Social post', content }] } }]);
  assert.match(output, /DTSTART:20261010T120000Z/); assert.match(output, /Course\\, offer\\; details/);
  assert.ok(output.split('\r\n').every(line => new TextEncoder().encode(line).length <= 74));
  assert.doesNotMatch(output, /\uFFFD/); assert.equal((output.match(/BEGIN:VEVENT/g) || []).length, 1);
});
test('optional product link and selected product facts survive campaign snapshots and backup validation', () => {
  const b = validateBrand(brand);
  const data = validateCampaign(plan('Promote course', b, { product: product.name, audience: product.audience, budget: 0, days: 7, productFacts: product.facts, productWebsite: '' }));
  assert.match(data.items[0].content, /تمارين عملية/); assert.doesNotMatch(data.items[0].content, /Brand-only/);
  assert.equal(data.items[0].destination, ''); assert.equal(data.copyContext.claims, product.facts);
  const backup = normalizeBackup({ format: 'marketing101-backup', version: 1, brand: b, workspace: { ...freshWorkspace(), products: [product] }, campaigns: [{ id: 'c1', data }] }, validateBrand, validateCampaign);
  assert.equal(backup.workspace.products.length, 1); assert.equal(backup.campaigns.length, 1);
  assert.throws(() => normalizeBackup({ version: 99 }, validateBrand, validateCampaign), /Unsupported/);
  assert.throws(() => normalizeBackup({ format: 'marketing101-backup', version: 1, brand: b, campaigns: [{ id: 'invalid-id', data }] }, validateBrand, validateCampaign), /campaign ID/);
});
test('Arabic campaign requests understand Arabic digits and a two-week campaign without links', () => {
  const result = parseRequest('روّج لدورتي لمدة أسبوعين بميزانية ١٬٠٠٠ كرونة', validateBrand(brand));
  assert.equal(result.values.budget, 1000); assert.equal(result.values.days, 14); assert.deepEqual(result.missing, []);
  assert.equal(parseRequest('إعلان لمدة ٣ أسابيع بميزانية ٠ كرونة', validateBrand(brand)).values.days, 21);
  const data = plan('طلب عربي', validateBrand({ ...brand, language: 'ar' }), { product: 'دورة', audience: 'أصحاب المشاريع', budget: 0, days: 14 });
  assert.match(data.items[0].content, /تواصل معنا/); assert.doesNotMatch(data.items[0].content, /https/);
});
