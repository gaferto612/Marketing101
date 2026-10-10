import { InputError, parseRequest, plan, validateBrand, validateCampaign, money, variation } from './planner-browser.js';
import { freshWorkspace, validateWorkspace, normalizeBackup } from './marketing-tools.js';

const key = 'marketing101.pages.demo.v1';
const defaults = () => ({ version: 1, brand: null,
  policy: { enabled: false, accounts: [], campaignTypes: [], maxCampaign: 0, maxDaily: 0, adjustments: [] }, campaigns: [], workspace: freshWorkspace() });
const clone = value => structuredClone(value);
const allowed = (c, p) => p.enabled && c.data.budget <= p.maxCampaign
  && p.campaignTypes.includes(c.data.campaignType) && c.data.items.every(i => p.accounts.includes(i.account));
const log = (c, message, at) => c.events.unshift({ at, message });

// This models the workflow only. Client-side data/rules are NOT a security boundary.
// The Node/SQLite app remains the authenticated server implementation.
export function createBrowserDemo(storage, clock = Date.now) {
  function load() {
    try {
      const raw = storage.getItem(key);
      if (!raw) return defaults();
      const data = JSON.parse(raw);
      if (data.version !== 1 || !Array.isArray(data.campaigns)) throw new Error();
      data.workspace ||= freshWorkspace();
      return data;
    } catch { throw new Error('Saved demo data could not be read. Use Reset demo or allow browser storage.'); }
  }
  function save(data) {
    try { storage.setItem(key, JSON.stringify(data)); }
    catch { throw new Error('Demo changes could not be saved. Browser storage is full or blocked.'); }
  }
  function tick(store, now) {
    for (const c of store.campaigns) {
      if (!['scheduled', 'running'].includes(c.status)) continue;
      for (const job of c.jobs) {
        if (job.state !== 'pending' || job.due > now) continue;
        const item = c.data.items.find(i => i.id === job.item_id);
        const day = Math.floor(now / 86400000) * 86400000;
        const daily = store.campaigns.flatMap(c => c.receipts).filter(r => r.publishedAt >= day && r.publishedAt < day + 86400000).reduce((n, r) => n + r.simulatedCost, 0);
        let error;
        if (c.approved_revision !== c.revision) error = 'Approval is missing or outdated.';
        else if (c.spent + item.cost > c.cap) error = 'Simulated campaign budget would be exceeded.';
        else if (c.approval_kind === 'automatic' && !allowed(c, store.policy)) error = 'Automatic permission was revoked or exceeded.';
        else if (c.approval_kind === 'automatic' && daily + item.cost > store.policy.maxDaily) error = 'Automatic daily simulated limit would be exceeded (UTC day).';
        if (error) { c.status = 'failed'; job.state = 'failed'; job.error = error; log(c, error, now); break; }
        c.status = 'running';
        const receiptId = `browser-demo-${c.id}:${item.id}`;
        if (!c.receipts.some(r => r.id === receiptId)) {
          c.receipts.push({ id: receiptId, mode: 'demo', destination: item.account, content: item.content,
            link: item.destination, simulatedCost: item.cost, publishedAt: now, metrics: null });
          c.spent += item.cost;
          log(c, `${item.channel} simulated in this browser. Allocation: ${(item.cost / 100).toFixed(2)} DKK.`, now);
        }
        job.state = 'done'; job.error = null;
      }
      if (c.jobs.length && c.jobs.every(j => j.state === 'done') && c.status !== 'completed') {
        c.status = 'completed'; log(c, 'Browser demo completed. No real posts or charges. Performance metrics unavailable.', now);
      }
    }
  }
  function schedule(c, kind, now) {
    validateCampaign(c.data);
    c.status = 'scheduled'; c.approval_kind = kind; c.approved_revision = c.revision; c.cap = c.data.budget;
    c.jobs = c.data.items.map(i => ({ item_id: i.id, due: i.due, state: 'pending', attempts: 0, error: null }));
    log(c, `${kind === 'automatic' ? 'Automatic policy' : 'Manual review'} approved revision ${c.revision}. Browser simulation scheduled.`, now);
  }
  return async function request(path, method = 'GET', input = {}) {
    if (path === '/reset' && method === 'POST') { storage.removeItem(key); return { ok: true }; }
    const store = load(), now = clock();
    if (method === 'GET') tick(store, now);
    let result;
    if (path === '/me') result = { email: 'Local browser demo · no account', csrf: 'browser-demo' };
    else if (path === '/workspace' && method === 'GET') { store.workspace = validateWorkspace(store.workspace); result = store.workspace; }
    else if (path === '/workspace' && method === 'PUT') {
      if (input.revision !== store.workspace.revision) throw new InputError('Workspace changed in another tab. Refresh before saving.', 409);
      result = validateWorkspace(input); result.revision = store.workspace.revision + 1; store.workspace = result;
    }
    else if (['/restore', '/validate-backup'].includes(path) && method === 'POST') {
      const backup = normalizeBackup(input, validateBrand, validateCampaign);
      if (path === '/validate-backup') return { products: backup.workspace.products.length, drafts: backup.workspace.drafts.length, campaigns: backup.campaigns.length, reports: backup.workspace.results.length };
      const oldRevisions = new Map(store.campaigns.map(c => [c.id, c.revision]));
      const workspaceRevision = store.workspace.revision + 1;
      store.brand = backup.brand; store.workspace = backup.workspace; store.workspace.revision = workspaceRevision;
      store.policy = defaults().policy;
      store.campaigns = backup.campaigns.map(c => ({ ...c, status: 'draft', revision: (oldRevisions.get(c.id) || 0) + 1, approved_revision: null,
        approval_kind: null, cap: null, spent: 0, created: now, jobs: [], receipts: [],
        events: [{ at: now, message: 'Restored from backup as an unapproved draft. Automatic mode disabled.' }],
        metrics: { mode: 'demo', reach: null, clicks: null, conversions: null } }));
      result = { ok: true, campaigns: store.campaigns.length };
    }
    else if (path === '/brand' && method === 'GET') result = store.brand;
    else if (path === '/brand' && method === 'PUT') result = store.brand = validateBrand(input);
    else if (path === '/policy' && method === 'GET') result = store.policy;
    else if (path === '/policy' && method === 'PUT') {
      const accounts = Array.isArray(input.accounts) ? input.accounts : [];
      const types = Array.isArray(input.campaignTypes) ? input.campaignTypes : [];
      if (typeof input.enabled !== 'boolean' || accounts.some(a => a !== 'demo-workspace') || types.some(t => t !== 'product-promotion') || input.adjustments?.length) throw new InputError('Invalid browser demo policy.');
      if (input.enabled && (!accounts.length || !types.length)) throw new InputError('Choose allowed accounts and campaign types.');
      result = store.policy = { enabled: input.enabled, accounts, campaignTypes: types,
        maxCampaign: money(Number(input.maxCampaign) / 100), maxDaily: money(Number(input.maxDaily) / 100), adjustments: [] };
    } else if (path === '/campaigns' && method === 'GET') result = store.campaigns;
    else if (path === '/plan' && method === 'POST') {
      if (!store.brand) throw new InputError('Save your brand profile first.');
      const parsed = parseRequest(input.message, store.brand, input.details || {});
      if (parsed.missing.length) result = parsed;
      else {
        const c = { id: crypto.randomUUID(), status: 'draft', revision: 1, approved_revision: null,
          approval_kind: null, cap: null, spent: 0, created: now,
          data: validateCampaign(plan(input.message, store.brand, parsed.values, now)),
          jobs: [], receipts: [], events: [], metrics: { mode: 'demo', reach: null, clicks: null, conversions: null } };
        log(c, 'Draft created in browser demo. No server or real publishing.', now);
        store.campaigns.unshift(c); result = { missing: [], campaign: c };
      }
    } else {
      const match = path.match(/^\/campaigns\/([a-f0-9-]+)(?:\/(action|regenerate|duplicate))?$/);
      const c = match && store.campaigns.find(c => c.id === match[1]);
      if (!c) throw new InputError('Campaign not found.', 404);
      const operation = match[2];
      if (!operation && method === 'GET') result = c;
      else {
        if (input.revision !== c.revision) throw new InputError('Campaign changed. Refresh before continuing.', 409);
        if (operation === 'duplicate' && method === 'POST') {
          const copy = { ...clone(c), id: crypto.randomUUID(), status: 'draft', revision: 1,
            approved_revision: null, approval_kind: null, cap: null, spent: 0, created: now, jobs: [], receipts: [], events: [] };
          copy.data.title = `${copy.data.title.slice(0, 230)} (copy)`;
          copy.data = validateCampaign(copy.data);
          log(copy, 'Duplicated as an unapproved draft. Check dates before scheduling.', now);
          store.campaigns.unshift(copy); save(store); return clone(copy);
        } else if ((!operation && method === 'PUT') || (operation === 'regenerate' && method === 'POST')) {
          if (!['draft', 'awaiting approval'].includes(c.status)) throw new InputError('Only unapproved campaigns can be edited.', 409);
          if (operation === 'regenerate') {
            const item = c.data.items.find(i => i.id === input.itemId);
            if (!item) throw new InputError('Content not found.');
            item.variant++; item.content = variation(c.data.copyContext || store.brand, c.data.product, c.data.audience, item.variant);
          } else c.data = validateCampaign(input.data);
          c.revision++; c.status = 'draft'; c.approved_revision = null; c.cap = null; c.approval_kind = null;
          log(c, 'Saved changes. Previous review invalidated.', now);
        } else if (operation === 'action' && method === 'POST') {
          const action = input.action;
          if (action === 'submit' && c.status === 'draft') {
            if (allowed(c, store.policy)) schedule(c, 'automatic', now);
            else { c.status = 'awaiting approval'; log(c, 'Ready for review; no simulation will run until approved.', now); }
          } else if (action === 'approve' && c.status === 'awaiting approval') schedule(c, 'manual', now);
          else if (action === 'pause' && ['scheduled', 'running'].includes(c.status)) { c.status = 'paused'; log(c, 'Browser simulation paused.', now); }
          else if (action === 'resume' && c.status === 'paused') { c.status = 'scheduled'; log(c, 'Browser simulation resumed.', now); }
          else if (action === 'cancel' && !['completed', 'cancelled'].includes(c.status)) { c.status = 'cancelled'; c.jobs.filter(j => j.state !== 'done').forEach(j => j.state = 'cancelled'); log(c, 'Cancelled. Existing demo receipts retained.', now); }
          else if (action === 'retry' && c.status === 'failed') { c.status = 'scheduled'; c.jobs.filter(j => j.state === 'failed').forEach(j => { j.state = 'pending'; j.error = null; j.due = now; }); log(c, 'Failed simulation queued again.', now); }
          else throw new InputError(`Cannot ${action} a ${c.status} campaign.`, 409);
        } else throw new InputError('Unsupported browser demo action.');
        result = c;
      }
    }
    save(store); return clone(result);
  };
}

export async function demoApi(path, method, input) {
  const run = () => createBrowserDemo(window.localStorage)(path, method, input);
  // Serialize read/modify/write between tabs on the same origin when supported.
  return navigator.locks ? navigator.locks.request(key, run) : run();
}
