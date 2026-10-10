import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createProjectApi } from '../public/project-client.js';
import { freshWorkspace, validateWorkspace, normalizeBackup, filterResults } from '../public/marketing-tools.js';
import { validateProject, validateLaunch, readiness, trackingUrl, launchPieces } from '../public/launch-tools.js';
import { validateBrand, validateCampaign } from '../src/planner.js';
import { createApp } from '../src/server.js';
import { openDatabase } from '../src/db.js';
import { once } from 'node:events';
execFileSync(process.execPath, ['tools/build-pages.mjs']);
const { createBrowserDemo } = await import('../.pages-dist/pages-demo.js');
const project = id => ({ ...validateProject({ id, name: `Project ${id}`, product: 'Booking', description: 'Manage appointments', audience: 'Clinics', language: 'ar', sector: 'health' }), workspace: freshWorkspace() });
const launch = validateLaunch({ id: 'launch1', name: 'City pilot', country: 'SY', cities: 'Damascus', timezone: 'Asia/Damascus', language: 'ar', audience: 'Clinics', problem: 'How to organize appointments?', offer: 'Manage appointments', evidence: 'Actual demo available', cta: 'Request details', responseUrl: 'https://example.com/join?existing=1', success: 'Completed enquiry from an eligible clinic', metric: 'leads', target: 5, days: 7, budget: 0 });
function setup() { const data = new Map(); const raw = createBrowserDemo({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }); const state = { projectId: '', registry: freshWorkspace() }; return { raw, state, api: createProjectApi(raw, state) }; }

test('project partitions preserve legacy data, separate assets/brand/campaigns and reject stale writes', async () => {
  const { raw, state, api } = setup();
  let root = await api('/registry'); root.products.push({ id: 'legacy-product', name: 'Legacy course', description: 'Existing user data', audience: 'Owners' }); root.projects.push(project('a'), project('b')); await api('/registry', 'PUT', root);
  state.projectId = 'a'; let workspace = await api('/workspace'); workspace.products.push({ id: 'product1', name: 'A course', description: 'A only', audience: 'Owners' });
  const old = structuredClone(workspace); workspace = await api('/workspace', 'PUT', workspace);
  await assert.rejects(api('/workspace', 'PUT', old), /changed/);
  assert.equal((await api('/brand')).name, 'Project a');
  const a = await api('/plan', 'POST', { message: 'Promote Booking for 7 days with 0 DKK', details: { launchSnapshot: launch } });
  assert.equal(a.campaign.data.projectId, 'a'); assert.equal(a.campaign.data.items.length, 3);
  assert.equal(a.campaign.status, 'draft'); assert.deepEqual(a.campaign.receipts, []);
  assert.deepEqual(a.campaign.data.suggestedChannels, ['Social post']);
  const again = await api('/plan', 'POST', { message: 'Promote Booking for 7 days with 0 DKK', details: { launchSnapshot: launch } });
  assert.equal(again.campaign.id, a.campaign.id);
  state.projectId = 'b'; assert.equal((await api('/workspace')).products.length, 0); assert.equal((await api('/campaigns')).length, 0);
  assert.equal((await api('/brand')).name, 'Project b');
  await assert.rejects(api(`/campaigns/${a.campaign.id}`), /another project/);
  const moved = structuredClone(a.campaign.data); moved.projectId = 'b';
  await assert.rejects(raw(`/campaigns/${a.campaign.id}`, 'PUT', { data: moved, revision: 1 }), /cannot be moved/);
  const backup = await api('/backup'); assert.equal(backup.workspace.projects.length, 2); assert.equal(backup.campaigns.length, 1);
  const crossed = structuredClone(backup); crossed.workspace.projects[1].workspace.launches.push({ ...launch, campaignId: a.campaign.id });
  assert.throws(() => normalizeBackup(crossed, validateBrand, validateCampaign), /across projects/);
  const orphan = structuredClone(backup); orphan.workspace.projects = []; assert.throws(() => normalizeBackup(orphan, validateBrand, validateCampaign), /missing project/);
  const restored = normalizeBackup(backup, validateBrand, validateCampaign); assert.equal(restored.workspace.projects[0].workspace.products.length, 1);
  state.projectId = ''; assert.equal((await api('/workspace')).products[0].id, 'legacy-product'); assert.equal((await api('/campaigns')).length, 0);
});

test('launch readiness is human confirmation and campaign pieces have distinct purposes and tracking', () => {
  assert.equal(readiness(launch).filter(c => c.done).length, 0);
  const ready = { ...launch, serviceReady: true, linkChecked: true, evidenceChecked: true, owner: 'Owner' };
  assert.ok(readiness(ready).every(c => c.done));
  const copy = launchPieces(project('a'), launch); assert.equal(new Set(copy).size, 3);
  assert.match(copy[0], /utm_content=problem/); assert.match(copy[1], /utm_content=evidence/); assert.match(copy[2], /utm_content=offer/);
  assert.throws(() => validateLaunch({ ...launch, timezone: 'Invalid/Zone' }), /timezone/);
  assert.throws(() => validateLaunch({ ...launch, target: 0 }), /target/);
  assert.equal(validateLaunch({ ...launch, budget: 10.25 }).budget, 10.25);
  assert.throws(() => validateLaunch({ ...launch, contentPieces: ['only one'] }), /three/);
  const custom = { ...launch, contentPieces: ['A', 'B', 'C'] }; assert.deepEqual(launchPieces(project('a'), custom), ['A', 'B', 'C']);
});

test('tracking preserves query/fragment, replaces UTM and rejects unsafe URLs; backup rejects cross-project links', async () => {
  const url = new URL(trackingUrl('https://example.com/?utm_source=old&keep=yes#join', { source: 'community', medium: 'organic', campaign: 'pilot', content: 'a' }));
  assert.equal(url.searchParams.get('keep'), 'yes'); assert.equal(url.hash, '#join'); assert.equal(url.searchParams.getAll('utm_source').length, 1);
  assert.throws(() => trackingUrl('javascript:alert(1)', { source: 'x', medium: 'y', campaign: 'z' }), /HTTP/);
  const root = freshWorkspace(); root.projects = [project('a')]; root.projects[0].workspace.launches = [launch];
  assert.equal(validateWorkspace(root).projects.length, 1);
  root.projects[0].workspace.followups = [{ id: 'f1', launchId: 'missing', alias: 'Case 1', stage: 'new' }];
  assert.throws(() => validateWorkspace(root), /missing launch/);
  assert.equal(filterResults([{ source: 'Community' }, { source: '' }], { source: ' community ' }).length, 1);
});

test('authenticated project launches work without a global brand and restore campaign links safely', async t => {
  const db = openDatabase(':memory:'); const origin = 'http://127.0.0.1:3101';
  const server = createApp({ db, origin }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() {
    let cookie = '', csrf = '';
    return async (path, method = 'GET', body) => {
      const response = await fetch(`${base}/api${path}`, { method, headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const result = await response.json(); if (result?.csrf) csrf = result.csrf;
      if (!response.ok) throw new Error(`${response.status}: ${result.error}`); return result;
    };
  }
  const raw = client(), other = client();
  await raw('/register', 'POST', { email: 'launch-a@example.com', password: 'long launch test password' });
  await other('/register', 'POST', { email: 'launch-b@example.com', password: 'long launch test password' });
  const state = { projectId: '', registry: freshWorkspace() }, api = createProjectApi(raw, state);
  const root = await api('/registry'); root.projects = [project('a'), project('b')]; await api('/registry', 'PUT', root); state.projectId = 'a';
  const input = { message: 'Promote Booking for 7 days with 0 DKK', details: { launchSnapshot: launch } };
  const created = (await api('/plan', 'POST', input)).campaign;
  assert.equal((await api('/plan', 'POST', input)).campaign.id, created.id);
  await assert.rejects(other('/plan', 'POST', { ...input, details: { ...input.details, projectId: 'a' } }), /404/);
  await assert.rejects(other(`/campaigns/${created.id}`), /404/);
  const moved = structuredClone(created.data); moved.projectId = 'b';
  await assert.rejects(raw(`/campaigns/${created.id}`, 'PUT', { data: moved, revision: created.revision }), /cannot be moved/);
  const regenerated = await api(`/campaigns/${created.id}/regenerate`, 'POST', { revision: created.revision, itemId: created.data.items[0].id }); assert.equal(regenerated.revision, 2);
  const workspace = await api('/workspace'); workspace.launches.push({ ...launch, campaignId: created.id });
  workspace.results.push({ id: 'r1', date: '2026-10-10', label: 'Manual observation', source: 'community', campaignId: created.id, leads: 1 });
  workspace.followups.push({ id: 'f1', launchId: launch.id, alias: 'Reference 1', stage: 'new' }); await api('/workspace', 'PUT', workspace);
  const backup = await api('/backup'); await api('/restore', 'POST', backup); assert.equal(state.projectId, '');
  state.projectId = 'a'; const restoredWorkspace = await api('/workspace'), restoredCampaigns = await api('/campaigns');
  assert.equal(restoredCampaigns.length, 1); assert.notEqual(restoredCampaigns[0].id, created.id);
  assert.equal(restoredWorkspace.launches[0].campaignId, restoredCampaigns[0].id); assert.equal(restoredWorkspace.results[0].campaignId, restoredCampaigns[0].id);
  assert.equal(restoredWorkspace.followups[0].launchId, launch.id); assert.equal(restoredCampaigns[0].status, 'draft');
  assert.equal((await raw('/policy')).enabled, false);
});
