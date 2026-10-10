import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StudioEdits } from '../public/editor-state.js';
import { freshWorkspace, validateWorkspace, validateBrief, briefChecks, briefObjective, generatePack, filterDrafts, filterResults, metricsCoverage, metrics } from '../public/marketing-tools.js';
import { validateBrand, plan, validateCampaign } from '../src/planner.js';

const product = { id: 'p1', name: 'Course', description: 'Actual lessons', audience: 'Owners', facts: 'Includes practice', cta: 'Ask for details', problem: 'discovery conversations', difference: 'Live practice sessions', objections: 'session format', color: '#235a43', website: '' };

test('zero-budget planning stays organic through campaign validation', () => {
  const brand = validateBrand({ name: 'Example', business: 'Training', product: 'Course', audience: 'Owners', tone: 'Clear' });
  const campaign = plan('Promote Course for 7 days with 0 DKK', brand, { product: 'Course', audience: 'Owners', days: 7, budget: 0 });
  assert.deepEqual(campaign.suggestedChannels, ['Social post']);
  assert.ok(campaign.items.every(i => i.channel === 'Social post' && i.cost === 0));
  assert.deepEqual(validateCampaign(campaign).suggestedChannels, ['Social post']);
});

test('Arabic questions preserve meaning without nested question framing and ad headline repetition', () => {
  const kit = generatePack({ ...product, name: 'دورة البيع', audience: 'أصحاب المشاريع', problem: 'كيف أشرح قيمة خدمتي؟' }, { language: 'ar' });
  const social = kit.find(d => d.format === 'social').content;
  assert.match(social, /سؤال قد يهمك: كيف أشرح قيمة خدمتي؟/);
  assert.doesNotMatch(social, /هل تتساءل عن|؟؟|لـأصحاب/);
  const ad = kit.find(d => d.format === 'ad').content;
  assert.equal(ad.split('تعرّف على دورة البيع').length - 1, 1);
});
test('saving a kit and saving existing drafts preserve the other editor buffer', () => {
  const edits = new StudioEdits();
  edits.setKit(0, 'Edited kit', 'Original kit'); edits.setDraft('d1', 'Edited saved draft', 'Original draft');
  edits.clearKit(); assert.equal(edits.contentDraft('d1', 'Original draft'), 'Edited saved draft'); assert.ok(edits.dirty);
  edits.setKit(0, 'Another kit edit', 'Original kit');
  edits.reconcileDraftSave([{ id: 'd1', content: 'Original draft' }], [{ id: 'd1', content: 'Edited saved draft' }]);
  assert.equal(edits.drafts.size, 0); assert.equal(edits.contentKit(0, 'Original kit'), 'Another kit edit');
});
test('edits made while a save is pending survive acknowledgement, including reverting to the old text', () => {
  const edits = new StudioEdits(); edits.setDraft('d1', 'Latest typing', 'Original');
  edits.reconcileDraftSave([{ id: 'd1', content: 'Original' }], [{ id: 'd1', content: 'Submitted' }]);
  assert.equal(edits.contentDraft('d1', 'Submitted'), 'Latest typing');
  edits.clearDrafts();
  edits.reconcileDraftSave([{ id: 'd1', content: 'Original' }], [{ id: 'd1', content: 'Submitted' }]);
  assert.equal(edits.contentDraft('d1', 'Submitted'), 'Original');
  assert.ok(edits.reconcileKitSave([{ content: 'Submitted' }], [{ content: 'New typing' }]));
  assert.equal(edits.contentKit(0, 'Submitted'), 'New typing');
});
test('every objective produces three distinct options in all six formats without new claims', () => {
  for (const goal of ['awareness', 'launch', 'leads', 'offer']) for (const language of ['en', 'ar']) {
    const packs = [0, 1, 2].map(variant => generatePack(product, { goal, language, variant }));
    for (let i = 0; i < 6; i++) assert.equal(new Set(packs.map(p => p[i].content)).size, 3, `${goal}/${language}/${packs[0][i].format}`);
    assert.doesNotMatch(packs[0][0].content, /guaranteed|100%|limited time/i);
  }
});
test('legacy workspace migration preserves records and adds optional strategy metadata', () => {
  const legacy = { version: 1, revision: 5, products: [product], drafts: [], results: [] };
  const migrated = validateWorkspace(legacy);
  assert.equal(migrated.products.length, 1); assert.equal(migrated.revision, 5); assert.equal(migrated.products[0].revision, 1); assert.deepEqual(migrated.briefs, []);
});
test('strategy targets are validated and explicitly labeled as targets rather than predictions', () => {
  const brief = validateBrief({ id: 'b1', productId: 'p1', goal: 'leads', stage: 'consideration', metric: 'leads', target: 10, days: 14, budget: 0, hypothesis: 'Compare a question hook against an introduction.' });
  assert.match(briefObjective(brief), /target, not a forecast/);
  assert.equal(briefChecks(product, brief).filter(c => c.done).length, 6);
  const w = validateWorkspace({ ...freshWorkspace(), products: [product], briefs: [brief] }); assert.equal(w.briefs[0].target, 10);
  assert.throws(() => validateBrief({ ...brief, target: 2.5 }), /whole/);
  assert.throws(() => validateBrief({ ...brief, target: -1 }), /positive/);
  assert.throws(() => validateWorkspace({ ...w, briefs: [{ ...brief, productId: 'missing' }] }), /missing product/);
});
test('campaigns keep an independent, validated goal snapshot when a strategy brief changes', () => {
  const brief = validateBrief({ id: 'b1', productId: 'p1', goal: 'leads', stage: 'consideration', metric: 'leads', target: 12, days: 7, budget: 0, hypothesis: 'Compare two hooks.' });
  const brand = validateBrand({ name: 'Brand', business: 'Courses', product: 'Course', audience: 'Owners', tone: 'Clear', website: '' });
  const campaign = validateCampaign(plan('Promote course', brand, { product: 'Course', audience: 'Owners', budget: 0, days: 7, goalObjective: briefObjective(brief), goalPlan: brief }));
  brief.target = 50; assert.equal(campaign.goalPlan.target, 12); assert.match(campaign.objective, /12 Leads/);
  assert.throws(() => validateCampaign({ ...campaign, goalPlan: { ...brief, target: -1 } }), /positive/);
});
test('content filters preserve language/status distinctions and use source content for search', () => {
  const rows = [{ id: 'd1', title: 'Launch', content: 'محتوى عربي', format: 'social', stage: 'ready', language: 'ar' }, { id: 'd2', title: 'Offer', content: 'English copy', format: 'ad', stage: 'draft', language: 'en' }];
  assert.deepEqual(filterDrafts(rows, { query: 'عربي', stage: 'ready', language: 'ar' }).map(d => d.id), ['d1']);
  assert.equal(filterDrafts(rows, { format: 'email' }).length, 0);
});
test('report filtering scopes ratios to the chosen campaign/date and exposes missing paired data', () => {
  const rows = [{ date: '2026-10-01', campaignId: 'c1', spend: 100, leads: 4, revenue: 300, clicks: 20, impressions: 1000 }, { date: '2026-10-02', campaignId: 'c2', spend: 900, leads: 1, revenue: null, clicks: null, impressions: null }];
  const selected = filterResults(rows, { campaignId: 'c1', from: '2026-10-01', to: '2026-10-01' });
  assert.equal(metrics(selected).cpl, 25); assert.equal(metrics(selected).roas, 3);
  assert.deepEqual(metricsCoverage(rows), { total: 2, ctr: 1, cpl: 2, roas: 1 });
  assert.equal(metrics([{ spend: 100 }]).sales, null);
  assert.deepEqual(metricsCoverage([{ spend: 100 }]), { total: 1, ctr: 0, cpl: 0, roas: 0 });
  assert.throws(() => filterResults(rows, { from: '2026-10-03', to: '2026-10-01' }), /Start date/);
});
