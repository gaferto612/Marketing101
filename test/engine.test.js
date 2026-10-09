import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { openDatabase } from '../src/db.js';
import { createCampaign, saveCampaign, transition, campaignFor, runDue, validatePolicy } from '../src/engine.js';
import { plan, parseRequest, validateBrand } from '../src/planner.js';
import { DemoIntegration } from '../src/integrations.js';

const brand = validateBrand({ name: 'Course Co', business: 'Sales courses', product: 'sales course', audience: 'business owners', tone: 'Friendly', website: 'https://example.com/course', claims: '' });
const now = 1800000000000;
function setup(t, path = ':memory:') {
  const db = openDatabase(path);
  db.prepare('INSERT INTO users(id,email,password) VALUES(?,?,?)').run('owner', 'owner@example.com', 'unused');
  db.prepare('INSERT INTO users(id,email,password) VALUES(?,?,?)').run('other', 'other@example.com', 'unused');
  t.after(() => db.close());
  const data = plan('Promote my sales course for two weeks with 1,000 DKK.', brand, { product: 'sales course', audience: 'business owners', budget: 1000, days: 14 }, now - 2000000000);
  const c = createCampaign(db, 'owner', data, now);
  return { db, c };
}
function approve(db, c) {
  transition(db, 'owner', c.id, 'submit', c.revision, now);
  return transition(db, 'owner', c.id, 'approve', c.revision, now);
}
test('natural-language example extracts product, audience, duration and Danish budget', () => {
  const result = parseRequest('Promote my sales course to Danish small-business owners for two weeks, with a total budget of 1,000 DKK.', brand);
  assert.deepEqual(result.missing, []);
  assert.equal(result.values.budget, 1000);
  assert.equal(result.values.days, 14);
  assert.equal(result.values.audience, 'Danish small-business owners');
  assert.equal(result.values.product, 'sales course');
  assert.equal(parseRequest('Promote my course', brand).missing.length, 2);
  assert.equal(parseRequest('Promote my course with 0 DKK for one week', brand).values.budget, 0);
  assert.equal(parseRequest('Promote my course with 1.000 DKK for 7 days', brand).values.budget, 1000);
});
test('unapproved drafts and review campaigns never execute', t => {
  const { db, c } = setup(t);
  runDue(db, { now });
  assert.equal(db.prepare('SELECT count(*) n FROM deliveries').get().n, 0);
  transition(db, 'owner', c.id, 'submit', c.revision, now);
  runDue(db, { now });
  assert.equal(db.prepare('SELECT count(*) n FROM jobs').get().n, 0);
  assert.throws(() => transition(db, 'other', c.id, 'approve', c.revision), /not found/);
});
test('edits invalidate review and stale approval revisions are rejected', t => {
  const { db, c } = setup(t);
  transition(db, 'owner', c.id, 'submit', 1, now);
  const edited = structuredClone(c.data); edited.items[0].content = 'New exact content';
  const saved = saveCampaign(db, 'owner', c.id, edited, 1);
  assert.equal(saved.status, 'draft'); assert.equal(saved.revision, 2);
  assert.equal(saved.approved_revision, null);
  assert.throws(() => transition(db, 'owner', c.id, 'approve', 1), /changed/);
  transition(db, 'owner', c.id, 'submit', 2, now);
  transition(db, 'owner', c.id, 'approve', 2, now);
  assert.throws(() => saveCampaign(db, 'owner', c.id, edited, 2), /unapproved/);
});
test('approved campaign completes once, with exact content and no invented metrics', t => {
  const { db, c } = setup(t); approve(db, c);
  runDue(db, { now }); runDue(db, { now });
  const row = campaignFor(db, 'owner', c.id);
  assert.equal(row.status, 'completed'); assert.equal(row.spent, 100000);
  const receipts = db.prepare('SELECT receipt FROM deliveries').all().map(r => JSON.parse(r.receipt));
  assert.equal(receipts.length, 3);
  assert.equal(receipts[0].content, c.data.items[0].content);
  assert.equal(receipts[0].metrics, null);
});
test('pause, resume, and cancel control queued jobs', t => {
  const { db, c } = setup(t); approve(db, c);
  transition(db, 'owner', c.id, 'pause', 1, now);
  runDue(db, { now }); assert.equal(db.prepare('SELECT count(*) n FROM deliveries').get().n, 0);
  transition(db, 'owner', c.id, 'resume', 1, now);
  transition(db, 'owner', c.id, 'cancel', 1, now);
  runDue(db, { now }); assert.equal(db.prepare('SELECT count(*) n FROM deliveries').get().n, 0);
  assert.equal(campaignFor(db, 'owner', c.id).status, 'cancelled');
  assert.throws(() => transition(db, 'owner', c.id, 'resume', 1), /Cannot/);
});
test('allocation validation and execution both enforce budget caps', t => {
  const { db, c } = setup(t);
  const invalid = structuredClone(c.data); invalid.items[0].cost = 100001;
  assert.throws(() => saveCampaign(db, 'owner', c.id, invalid, 1), /exceed/);
  approve(db, c);
  db.prepare('UPDATE campaigns SET cap=1 WHERE id=?').run(c.id);
  runDue(db, { now });
  assert.equal(campaignFor(db, 'owner', c.id).status, 'failed');
  assert.equal(db.prepare('SELECT count(*) n FROM deliveries').get().n, 0);
});
test('automatic mode defaults off, only matches explicit policy, and enforces daily totals', t => {
  const { db, c } = setup(t);
  const policy = validatePolicy({ enabled: true, accounts: ['demo-workspace'], campaignTypes: ['product-promotion'], maxCampaign: 100000, maxDaily: 50000, adjustments: [] });
  db.prepare('INSERT INTO policies(user_id,data) VALUES(?,?)').run('owner', JSON.stringify(policy));
  const scheduled = transition(db, 'owner', c.id, 'submit', 1, now);
  assert.equal(scheduled.approval_kind, 'automatic');
  runDue(db, { now });
  assert.equal(db.prepare('SELECT count(*) n FROM deliveries').get().n, 1);
  assert.equal(campaignFor(db, 'owner', c.id).status, 'failed');
  assert.ok(campaignFor(db, 'owner', c.id).spent <= 50000);
  assert.throws(() => validatePolicy({ ...policy, adjustments: ['increase-budget'] }), /no automatic/);
});
test('revoking automatic permission prevents previously scheduled execution', t => {
  const { db, c } = setup(t);
  const policy = { enabled: true, accounts: ['demo-workspace'], campaignTypes: ['product-promotion'], maxCampaign: 100000, maxDaily: 100000, adjustments: [] };
  db.prepare('INSERT INTO policies(user_id,data) VALUES(?,?)').run('owner', JSON.stringify(policy));
  transition(db, 'owner', c.id, 'submit', 1, now);
  db.prepare('UPDATE policies SET data=? WHERE user_id=?').run(JSON.stringify({ ...policy, enabled: false }), 'owner');
  runDue(db, { now }); assert.equal(db.prepare('SELECT count(*) n FROM deliveries').get().n, 0);
  assert.equal(campaignFor(db, 'owner', c.id).status, 'failed');
});
test('partial adapter failures roll back receipts and retries do not duplicate', t => {
  const { db, c } = setup(t); approve(db, c);
  const demo = new DemoIntegration(db);
  const faulty = { publish(args) { demo.publish(args); throw new Error('Simulated outage after receipt write'); } };
  runDue(db, { now, integration: faulty });
  assert.equal(db.prepare('SELECT count(*) n FROM deliveries').get().n, 0);
  runDue(db, { now: now + 10000, integration: faulty });
  runDue(db, { now: now + 30000, integration: faulty });
  assert.equal(campaignFor(db, 'owner', c.id).status, 'failed');
  transition(db, 'owner', c.id, 'retry', 1, now + 40000);
  runDue(db, { now: now + 40000 }); runDue(db, { now: now + 60000 });
  assert.equal(db.prepare('SELECT count(*) n FROM deliveries').get().n, 3);
  assert.equal(campaignFor(db, 'owner', c.id).spent, 100000);
});
test('two independent worker processes execute persisted jobs without duplicates', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'marketing101-test-'));
  const path = join(directory, 'database.db');
  const { db, c } = setup(t, path); approve(db, c);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const moduleUrl = new URL('../src/worker.js', import.meta.url);
  const code = `import {openDatabase} from ${JSON.stringify(new URL('../src/db.js', moduleUrl).href)}; import {runDue} from ${JSON.stringify(new URL('../src/engine.js', moduleUrl).href)}; const db=openDatabase(process.argv[1]); runDue(db,{now:${now}}); db.close();`;
  const exec = promisify(execFile);
  await Promise.all([exec(process.execPath, ['--input-type=module', '-e', code, path]), exec(process.execPath, ['--input-type=module', '-e', code, path])]);
  assert.equal(db.prepare('SELECT count(*) n FROM deliveries').get().n, 3);
  assert.equal(campaignFor(db, 'owner', c.id).spent, 100000);
  const reopened = openDatabase(path);
  assert.equal(campaignFor(reopened, 'owner', c.id).status, 'completed'); reopened.close();
});
