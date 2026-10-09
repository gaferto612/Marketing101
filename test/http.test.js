import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/server.js';
import { runDue } from '../src/engine.js';

test('authenticated HTTP journey, access controls, CSRF and exact approval', async t => {
  const db = openDatabase(':memory:');
  const origin = 'http://127.0.0.1:3101';
  const server = createApp({ db, origin });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() {
    let cookie = '', csrf = '';
    return async (path, method = 'GET', body, overrides = {}) => {
      const response = await fetch(`${base}${path}`, { method,
        headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json', ...overrides },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const data = await response.json(); if (data?.csrf) csrf = data.csrf;
      return { status: response.status, data, headers: response.headers };
    };
  }
  const a = client(), b = client();
  assert.equal((await a('/api/campaigns')).status, 401);
  assert.equal((await a('/api/register', 'POST', { email: 'a@example.com', password: 'correct long password' })).status, 201);
  assert.equal((await b('/api/register', 'POST', { email: 'b@example.com', password: 'another long password' })).status, 201);
  const brand = { name: 'Test Brand', product: 'sales course', business: 'Sales courses', audience: 'business owners', tone: 'Clear', website: 'https://example.com', claims: '' };
  assert.equal((await a('/api/brand', 'PUT', brand, { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await a('/api/brand', 'PUT', brand, { 'X-CSRF-Token': 'invalid' })).status, 403);
  assert.equal((await a('/api/brand', 'PUT', brand)).status, 200);
  assert.equal((await b('/api/brand')).data, null);
  const missing = await a('/api/plan', 'POST', { message: 'Promote my course' });
  assert.deepEqual(missing.data.missing, ['budget', 'days']);
  const result = await a('/api/plan', 'POST', { message: 'Promote my sales course to Danish business owners for two weeks with 1,000 DKK' });
  assert.equal(result.status, 201);
  const c = result.data.campaign;
  assert.equal((await b(`/api/campaigns/${c.id}`)).status, 404);
  assert.equal((await b(`/api/campaigns/${c.id}/action`, 'POST', { action: 'submit', revision: 1 })).status, 404);
  assert.equal((await a(`/api/campaigns/${c.id}/action`, 'POST', { action: 'approve', revision: 1 })).status, 409);
  const edited = structuredClone(c.data); edited.items[0].content = '<script>alert(1)</script> factual draft';
  edited.items.forEach(item => item.due = Date.now() - 1000);
  const save = await a(`/api/campaigns/${c.id}`, 'PUT', { data: edited, revision: 1 });
  assert.equal(save.status, 200);
  assert.equal((await a(`/api/campaigns/${c.id}/action`, 'POST', { action: 'submit', revision: 2 })).data.status, 'awaiting approval');
  assert.equal((await a(`/api/campaigns/${c.id}/action`, 'POST', { action: 'approve', revision: 1 })).status, 409);
  assert.equal((await a(`/api/campaigns/${c.id}/action`, 'POST', { action: 'approve', revision: 2 })).data.status, 'scheduled');
  runDue(db); runDue(db);
  const done = await a(`/api/campaigns/${c.id}`);
  assert.equal(done.data.status, 'completed'); assert.equal(done.data.receipts.length, 3);
  assert.equal(done.data.receipts[0].content, edited.items[0].content);
  assert.equal(done.data.metrics.clicks, null);
  assert.ok(done.data.events.some(e => e.message.includes('completed')));
  assert.match(done.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal((await a('/api/logout', 'POST', {})).status, 200);
  assert.equal((await a('/api/me')).status, 401);
  assert.equal((await a('/api/login', 'POST', { email: 'a@example.com', password: 'incorrect long password' })).status, 401);
  assert.equal((await a('/api/login', 'POST', { email: 'a@example.com', password: 'correct long password' })).status, 200);
});
