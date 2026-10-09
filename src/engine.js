import { randomUUID } from 'node:crypto';
import { event, transaction } from './db.js';
import { DemoIntegration } from './integrations.js';
import { InputError, money, validateCampaign } from './planner.js';

export const defaultPolicy = () => ({ enabled: false, accounts: [], campaignTypes: [], maxCampaign: 0, maxDaily: 0, adjustments: [] });
export function policyFor(db, user) {
  const row = db.prepare('SELECT data FROM policies WHERE user_id=?').get(user);
  return row ? JSON.parse(row.data) : defaultPolicy();
}
export function validatePolicy(input) {
  if (typeof input.enabled !== 'boolean') throw new InputError('Automatic mode must be enabled explicitly.');
  const accounts = Array.isArray(input.accounts) ? [...new Set(input.accounts)] : [];
  const campaignTypes = Array.isArray(input.campaignTypes) ? [...new Set(input.campaignTypes)] : [];
  const adjustments = Array.isArray(input.adjustments) ? [...new Set(input.adjustments)] : [];
  if (accounts.some(a => a !== 'demo-workspace') || campaignTypes.some(t => t !== 'product-promotion')) throw new InputError('Only the Demo workspace and product promotions are available.');
  if (adjustments.length) throw new InputError('This release supports no automatic content or budget adjustments.');
  const maxCampaign = money(Number(input.maxCampaign) / 100, 'Campaign limit');
  const maxDaily = money(Number(input.maxDaily) / 100, 'Daily limit');
  if (input.enabled && (!accounts.length || !campaignTypes.length)) throw new InputError('Choose allowed accounts and campaign types.');
  return { enabled: input.enabled, accounts, campaignTypes, maxCampaign, maxDaily, adjustments };
}
export function automaticAllowed(data, policy) {
  return policy.enabled && data.budget <= policy.maxCampaign
    && policy.campaignTypes.includes(data.campaignType)
    && data.items.every(item => policy.accounts.includes(item.account));
}
export function campaignFor(db, user, id) {
  const row = db.prepare('SELECT * FROM campaigns WHERE id=? AND user_id=?').get(id, user);
  if (!row) throw new InputError('Campaign not found.', 404);
  return { ...row, data: JSON.parse(row.data) };
}
export function createCampaign(db, user, input, now = Date.now()) {
  const data = validateCampaign(input), id = randomUUID();
  transaction(db, () => {
    db.prepare('INSERT INTO campaigns(id,user_id,data,created) VALUES(?,?,?,?)').run(id, user, JSON.stringify(data), now);
    event(db, id, 'Draft created with demo template content. No publication or spending.', now);
  });
  return campaignFor(db, user, id);
}
export function saveCampaign(db, user, id, input, revision) {
  return transaction(db, () => {
    const row = campaignFor(db, user, id);
    if (row.revision !== revision) throw new InputError('This campaign changed. Refresh before saving.', 409);
    if (!['draft', 'awaiting approval'].includes(row.status)) throw new InputError('Only unapproved campaigns can be edited.', 409);
    const data = validateCampaign(input);
    db.prepare("UPDATE campaigns SET data=?,revision=revision+1,status='draft',approved_revision=NULL,approval_kind=NULL,cap=NULL WHERE id=?")
      .run(JSON.stringify(data), id);
    event(db, id, 'Content updated. Previous review invalidated.');
    return campaignFor(db, user, id);
  });
}
function schedule(db, row, kind, now) {
  const data = validateCampaign(row.data);
  db.prepare("UPDATE campaigns SET status='scheduled',approved_revision=revision,approval_kind=?,cap=? WHERE id=?")
    .run(kind, data.budget, row.id);
  for (const item of data.items) db.prepare('INSERT INTO jobs(id,campaign_id,item_id,due) VALUES(?,?,?,?)')
    .run(randomUUID(), row.id, item.id, item.due);
  event(db, row.id, kind === 'automatic' ? 'Approved under your automatic-mode policy and scheduled.' : 'Exact campaign revision approved and scheduled.', now);
}
export function transition(db, user, id, action, revision, now = Date.now()) {
  return transaction(db, () => {
    const row = campaignFor(db, user, id);
    if (row.revision !== revision) throw new InputError('Campaign changed. Refresh and review the latest version.', 409);
    if (action === 'submit' && row.status === 'draft') {
      if (automaticAllowed(row.data, policyFor(db, user))) schedule(db, row, 'automatic', now);
      else {
        db.prepare("UPDATE campaigns SET status='awaiting approval' WHERE id=?").run(id);
        event(db, id, 'Ready for review. Nothing will run until approved.', now);
      }
    } else if (action === 'approve' && row.status === 'awaiting approval') schedule(db, row, 'manual', now);
    else if (action === 'pause' && ['scheduled', 'running'].includes(row.status)) {
      db.prepare("UPDATE campaigns SET status='paused' WHERE id=?").run(id);
      event(db, id, 'Paused. Pending jobs will not execute.', now);
    } else if (action === 'resume' && row.status === 'paused') {
      db.prepare("UPDATE campaigns SET status='scheduled' WHERE id=?").run(id);
      event(db, id, 'Resumed with the previously approved revision.', now);
    } else if (action === 'cancel' && !['completed', 'cancelled'].includes(row.status)) {
      db.prepare("UPDATE campaigns SET status='cancelled' WHERE id=?").run(id);
      db.prepare("UPDATE jobs SET state='cancelled' WHERE campaign_id=? AND state!='done'").run(id);
      event(db, id, 'Cancelled. Completed demo receipts remain in history.', now);
    } else if (action === 'retry' && row.status === 'failed') {
      db.prepare("UPDATE jobs SET state='pending',attempts=0,error=NULL,due=? WHERE campaign_id=? AND state='failed'").run(now, id);
      db.prepare("UPDATE campaigns SET status='scheduled' WHERE id=?").run(id);
      event(db, id, 'Failed jobs queued again; successful deliveries will not be repeated.', now);
    } else throw new InputError(`Cannot ${action} a campaign with status ${row.status}.`, 409);
    return campaignFor(db, user, id);
  });
}
export function runDue(db, { now = Date.now(), integration = new DemoIntegration(db) } = {}) {
  const jobs = db.prepare(`SELECT j.id FROM jobs j JOIN campaigns c ON c.id=j.campaign_id
    WHERE j.state='pending' AND j.due<=? AND c.status IN ('scheduled','running')
    ORDER BY j.due LIMIT 100`).all(now);
  for (const job of jobs) transaction(db, () => {
    // Re-read under an immediate write lock: multiple workers cannot publish twice.
    const current = db.prepare(`SELECT j.*,c.user_id,c.status,c.data,c.revision,c.approved_revision,
      c.cap,c.spent,c.approval_kind FROM jobs j JOIN campaigns c ON c.id=j.campaign_id WHERE j.id=?`).get(job.id);
    if (!current || current.state !== 'pending' || current.due > now || !['scheduled', 'running'].includes(current.status)) return;
    const data = JSON.parse(current.data);
    const item = data.items.find(i => i.id === current.item_id);
    let failure;
    if (!item || current.revision !== current.approved_revision || current.cap === null) failure = 'Approval is missing or outdated.';
    else if (!Number.isSafeInteger(item.cost) || item.cost < 0 || current.spent + item.cost > current.cap) failure = 'Campaign spending limit would be exceeded.';
    if (!failure && current.approval_kind === 'automatic') {
      const policy = policyFor(db, current.user_id);
      const day = Math.floor(now / 86400000) * 86400000;
      const daily = db.prepare(`SELECT COALESCE(SUM(d.cost),0) AS total FROM deliveries d
        JOIN campaigns c ON c.id=d.campaign_id WHERE c.user_id=? AND d.created>=? AND d.created<?`)
        .get(current.user_id, day, day + 86400000).total;
      if (!automaticAllowed(data, policy)) failure = 'Automatic permission was revoked or the campaign exceeds the current policy.';
      else if (daily + item.cost > policy.maxDaily) failure = 'Automatic daily spending limit would be exceeded (UTC day).';
    }
    if (failure) {
      db.prepare("UPDATE jobs SET state='failed',error=? WHERE id=?").run(failure, job.id);
      db.prepare("UPDATE campaigns SET status='failed' WHERE id=?").run(current.campaign_id);
      event(db, current.campaign_id, failure, now);
      return;
    }
    const key = `${current.campaign_id}:${current.item_id}`;
    if (current.status !== 'running') {
      db.prepare("UPDATE campaigns SET status='running' WHERE id=?").run(current.campaign_id);
      event(db, current.campaign_id, 'Demo execution started.', now);
    }
    // Isolate adapter writes; failed attempts cannot leave partial receipts behind.
    db.exec('SAVEPOINT delivery');
    try {
      const previous = db.prepare('SELECT key FROM deliveries WHERE key=?').get(key);
      integration.publish({ key, campaignId: current.campaign_id, item, now });
      if (!db.prepare('SELECT key FROM deliveries WHERE key=?').get(key)) throw new Error('Integration did not persist a receipt.');
      if (!previous) db.prepare('UPDATE campaigns SET spent=spent+? WHERE id=?').run(item.cost, current.campaign_id);
      db.prepare("UPDATE jobs SET state='done',error=NULL WHERE id=?").run(job.id);
      event(db, current.campaign_id, `${item.channel} delivered to Demo workspace. Simulated allocation: ${(item.cost / 100).toFixed(2)} DKK.`, now);
      db.exec('RELEASE delivery');
    } catch {
      db.exec('ROLLBACK TO delivery');
      db.exec('RELEASE delivery');
      const attempts = current.attempts + 1;
      const failed = attempts >= 3;
      db.prepare('UPDATE jobs SET attempts=?,state=?,error=?,due=? WHERE id=?')
        .run(attempts, failed ? 'failed' : 'pending', 'Demo integration failed. Retry available.', now + 1000 * 2 ** attempts, job.id);
      if (failed) db.prepare("UPDATE campaigns SET status='failed' WHERE id=?").run(current.campaign_id);
      event(db, current.campaign_id, failed ? 'Delivery failed after three attempts. Inspect and retry.' : `Delivery attempt ${attempts} failed; automatic retry scheduled.`, now);
      return;
    }
    const remaining = db.prepare("SELECT count(*) AS n FROM jobs WHERE campaign_id=? AND state!='done'").get(current.campaign_id).n;
    if (!remaining) {
      db.prepare("UPDATE campaigns SET status='completed' WHERE id=?").run(current.campaign_id);
      event(db, current.campaign_id, 'Campaign completed in demo mode. Reach, clicks, and conversions are unavailable.', now);
    }
  });
  return jobs.length;
}
