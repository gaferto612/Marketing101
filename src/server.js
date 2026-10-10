import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { openDatabase, transaction, event } from './db.js';
import { InputError, validateBrand, parseRequest, plan, variation, text } from './planner.js';
import { campaignFor, createCampaign, saveCampaign, transition, policyFor, validatePolicy } from './engine.js';
import { freshWorkspace, validateWorkspace, normalizeBackup } from '../public/marketing-tools.js';
import { validateCampaign } from './planner.js';

const derive = promisify(scrypt);
const hash = token => createHash('sha256').update(token).digest('hex');
async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  const result = await derive(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `${salt}:${result.toString('hex')}`;
}
async function passwordMatches(password, saved) {
  const modern = saved.startsWith('v2:');
  const [salt, hex] = (modern ? saved.slice(3) : saved).split(':');
  const check = (await passwordHash(modern ? password : password.trim(), salt)).split(':')[1];
  return timingSafeEqual(Buffer.from(hex, 'hex'), Buffer.from(check, 'hex'));
}

export function createApp({ db = openDatabase(), origin = process.env.APP_ORIGIN || 'http://127.0.0.1:3101', secure = process.env.COOKIE_SECURE === 'true', registrationCode = process.env.REGISTRATION_CODE || '' } = {}) {
  const attempts = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
    db.prepare('DELETE FROM sessions WHERE expires<?').run(now);
  }, 60000).unref();
  function rateLimit(req) {
    const key = req.socket.remoteAddress;
    const now = Date.now();
    const entry = attempts.get(key);
    const current = entry && entry.until > now ? entry : { count: 0, until: now + 600000 };
    current.count++;
    attempts.set(key, current);
    if (current.count > 25) throw new InputError('Too many account attempts. Try again in ten minutes.', 429);
  }
  function session(req) {
    const token = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('m101='))?.slice(5);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
    return db.prepare(`SELECT s.*,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE token=? AND expires>?`)
      .get(hash(token), Date.now());
  }
  function cookie(token, seconds = 604800) {
    return `m101=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
  }
  function signIn(user, res) {
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(24).toString('hex');
    db.prepare('INSERT INTO sessions(token,user_id,expires,csrf) VALUES(?,?,?,?)')
      .run(hash(token), user.id, Date.now() + 7 * 86400000, csrf);
    res.setHeader('Set-Cookie', cookie(token));
    return { email: user.email, csrf };
  }
  async function body(req, limit = 128000) {
    let size = 0, chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw new InputError('Request is too large.', 413);
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
    catch { throw new InputError('Invalid JSON.'); }
  }
  function details(user, id) {
    const campaign = campaignFor(db, user, id);
    return {
      ...campaign,
      events: db.prepare('SELECT at,message FROM events WHERE campaign_id=? ORDER BY id DESC').all(id),
      jobs: db.prepare('SELECT item_id,due,state,attempts,error FROM jobs WHERE campaign_id=?').all(id),
      receipts: db.prepare('SELECT receipt FROM deliveries WHERE campaign_id=? ORDER BY created').all(id).map(r => JSON.parse(r.receipt)),
      metrics: { mode: 'demo', reach: null, clicks: null, conversions: null }
    };
  }
  const staticFiles = { '/': ['index.html', 'text/html'], '/manual.html': ['manual.html', 'text/html'], '/user-manual.js': ['user-manual.js', 'text/javascript'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/marketing-tools.js': ['marketing-tools.js', 'text/javascript'], '/workspace-ui.js': ['workspace-ui.js', 'text/javascript'], '/editor-state.js': ['editor-state.js', 'text/javascript'] };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Cache-Control', 'no-store');
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const reply = (data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };
    try {
      const pathname = new URL(req.url, origin).pathname;
      if (req.method === 'GET' && staticFiles[pathname]) {
        const [file, type] = staticFiles[pathname];
        const data = await readFile(new URL(`../public/${file}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(data); return;
      }
      if (pathname === '/health' && req.method === 'GET') return reply({ status: 'ok', mode: 'demo' });
      if (!pathname.startsWith('/api/')) throw new InputError('Not found.', 404);
      if (req.method !== 'GET' && req.headers.origin !== origin) throw new InputError('Request origin is not allowed.', 403);
      if (['/api/register', '/api/login'].includes(pathname) && req.method === 'POST') {
        rateLimit(req);
        const input = await body(req);
        const email = text(input.email, 'Email', 254).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('Enter a valid email address.');
        const password = input.password;
        if (typeof password !== 'string' || password.length < 12 || password.length > 256 || !password.trim()) throw new InputError('Use a password of 12–256 characters.');
        if (pathname === '/api/register') {
          if (registrationCode && input.code !== registrationCode) throw new InputError('An invitation code is required.', 403);
          const id = randomUUID(), saved = `v2:${await passwordHash(password)}`;
          try { db.prepare('INSERT INTO users(id,email,password) VALUES(?,?,?)').run(id, email, saved); }
          catch { throw new InputError('Unable to register this email. Try signing in.', 409); }
          return reply(signIn({ id, email }, res), 201);
        }
        const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
        // Always perform scrypt, including unknown users.
        const valid = await passwordMatches(password, user?.password || '00000000000000000000000000000000:' + '0'.repeat(128));
        if (!user || !valid) throw new InputError('Incorrect email or password.', 401);
        return reply(signIn(user, res));
      }
      const auth = session(req);
      if (!auth) throw new InputError('Sign in to continue.', 401);
      if (req.method !== 'GET' && req.headers['x-csrf-token'] !== auth.csrf) throw new InputError('Session verification failed. Refresh and try again.', 403);
      const user = auth.user_id;
      if (['/api/restore', '/api/validate-backup'].includes(pathname) && req.method === 'POST') {
        const input = await body(req, 3100000);
        let backup;
        try { backup = normalizeBackup(input, validateBrand, validateCampaign); } catch (error) { throw new InputError(error.message); }
        if (pathname === '/api/validate-backup') return reply({ products: backup.workspace.products.length, drafts: backup.workspace.drafts.length, campaigns: backup.campaigns.length, reports: backup.workspace.results.length });
        transaction(db, () => {
          // Replace only this authenticated user's records; imports get fresh global IDs.
          for (const table of ['deliveries', 'events', 'jobs']) db.prepare(`DELETE FROM ${table} WHERE campaign_id IN (SELECT id FROM campaigns WHERE user_id=?)`).run(user);
          db.prepare('DELETE FROM campaigns WHERE user_id=?').run(user);
          db.prepare('DELETE FROM brands WHERE user_id=?').run(user);
          if (backup.brand) db.prepare('INSERT INTO brands(user_id,data) VALUES(?,?)').run(user, JSON.stringify(backup.brand));
          const mapping = new Map();
          for (const c of backup.campaigns) {
            const newId = randomUUID(); mapping.set(c.id, newId);
            db.prepare('INSERT INTO campaigns(id,user_id,data,created) VALUES(?,?,?,?)').run(newId, user, JSON.stringify(c.data), Date.now());
            event(db, newId, 'Restored as an unapproved draft. No jobs or receipts imported.');
          }
          for (const r of backup.workspace.results) r.campaignId = mapping.get(r.campaignId) || '';
          const previousWorkspace = db.prepare('SELECT data FROM workspaces WHERE user_id=?').get(user);
          backup.workspace.revision = (previousWorkspace ? JSON.parse(previousWorkspace.data).revision : 0) + 1;
          db.prepare('INSERT INTO workspaces(user_id,data) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data').run(user, JSON.stringify(backup.workspace));
          db.prepare('DELETE FROM policies WHERE user_id=?').run(user);
        });
        return reply({ ok: true, campaigns: backup.campaigns.length });
      }
      if (pathname === '/api/workspace') {
        if (req.method === 'GET') {
          const row = db.prepare('SELECT data FROM workspaces WHERE user_id=?').get(user);
          return reply(row ? validateWorkspace(JSON.parse(row.data)) : freshWorkspace());
        }
        if (req.method === 'PUT') {
          const input = await body(req, 2100000);
          const row = db.prepare('SELECT data FROM workspaces WHERE user_id=?').get(user);
          const previous = row ? JSON.parse(row.data) : freshWorkspace();
          if (input.revision !== previous.revision) throw new InputError('Workspace changed in another tab. Refresh before saving.', 409);
          let workspace;
          try { workspace = validateWorkspace(input); } catch (error) { throw new InputError(error.message); }
          workspace.revision = previous.revision + 1;
          db.prepare('INSERT INTO workspaces(user_id,data) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data').run(user, JSON.stringify(workspace));
          return reply(workspace);
        }
      }
      if (pathname === '/api/me' && req.method === 'GET') return reply({ email: auth.email, csrf: auth.csrf });
      if (pathname === '/api/logout' && req.method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE token=?').run(auth.token);
        res.setHeader('Set-Cookie', cookie('', 0)); return reply({ ok: true });
      }
      if (pathname === '/api/brand') {
        if (req.method === 'GET') {
          const row = db.prepare('SELECT data FROM brands WHERE user_id=?').get(user);
          return reply(row ? JSON.parse(row.data) : null);
        }
        if (req.method === 'PUT') {
          const brand = validateBrand(await body(req));
          db.prepare('INSERT INTO brands(user_id,data) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data').run(user, JSON.stringify(brand));
          return reply(brand);
        }
      }
      if (pathname === '/api/policy') {
        if (req.method === 'GET') return reply(policyFor(db, user));
        if (req.method === 'PUT') {
          const policy = validatePolicy(await body(req));
          db.prepare('INSERT INTO policies(user_id,data) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data').run(user, JSON.stringify(policy));
          return reply(policy);
        }
      }
      if (pathname === '/api/campaigns' && req.method === 'GET') {
        return reply(db.prepare('SELECT * FROM campaigns WHERE user_id=? ORDER BY created DESC').all(user).map(r => ({ ...r, data: JSON.parse(r.data) })));
      }
      if (pathname === '/api/plan' && req.method === 'POST') {
        const row = db.prepare('SELECT data FROM brands WHERE user_id=?').get(user);
        if (!row) throw new InputError('Save your brand profile first.');
        const input = await body(req), brand = JSON.parse(row.data);
        const parsed = parseRequest(input.message, brand, input.details || {});
        if (parsed.missing.length) return reply(parsed);
        const campaign = createCampaign(db, user, plan(input.message, brand, parsed.values));
        return reply({ missing: [], campaign: details(user, campaign.id) }, 201);
      }
      const match = pathname.match(/^\/api\/campaigns\/([a-f0-9-]+)(?:\/(action|regenerate|duplicate))?$/);
      if (match) {
        const [, id, operation] = match;
        if (!operation && req.method === 'GET') return reply(details(user, id));
        const input = await body(req);
        if (operation === 'duplicate' && req.method === 'POST') {
          const original = campaignFor(db, user, id);
          if (input.revision !== original.revision) throw new InputError('Campaign changed. Refresh before duplicating.', 409);
          const copy = structuredClone(original.data); copy.title = `${copy.title.slice(0, 230)} (copy)`;
          const created = createCampaign(db, user, copy);
          return reply(details(user, created.id), 201);
        }
        if (!operation && req.method === 'PUT') {
          saveCampaign(db, user, id, input.data, input.revision); return reply(details(user, id));
        }
        if (operation === 'action' && req.method === 'POST') {
          transition(db, user, id, input.action, input.revision); return reply(details(user, id));
        }
        if (operation === 'regenerate' && req.method === 'POST') {
          const campaign = campaignFor(db, user, id);
          const row = db.prepare('SELECT data FROM brands WHERE user_id=?').get(user);
          const item = campaign.data.items.find(i => i.id === input.itemId);
          if (!item || !row) throw new InputError('Content or brand not found.', 404);
          item.variant++;
          item.content = variation(campaign.data.copyContext || JSON.parse(row.data), campaign.data.product, campaign.data.audience, item.variant);
          saveCampaign(db, user, id, campaign.data, input.revision); return reply(details(user, id));
        }
      }
      throw new InputError('Not found.', 404);
    } catch (error) {
      if (!(error instanceof InputError)) console.error('Request failed:', error.message);
      if (!res.headersSent) reply({ error: error instanceof InputError ? error.message : 'An internal error occurred. Please try again.' }, error.status || 500);
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on('close', () => clearInterval(cleanup));
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3101;
  const origin = process.env.APP_ORIGIN || `http://127.0.0.1:${port}`;
  if (process.env.NODE_ENV === 'production' && (!origin.startsWith('https://') || process.env.COOKIE_SECURE !== 'true' || !process.env.REGISTRATION_CODE)) {
    throw new Error('Production requires HTTPS APP_ORIGIN, COOKIE_SECURE=true and REGISTRATION_CODE.');
  }
  const server = createApp({ origin });
  const worker = fork(fileURLToPath(new URL('./worker.js', import.meta.url)));
  worker.on('exit', (code, signal) => {
    if (!stopping) { console.error(`Background worker stopped (${code ?? signal}); shutting down to prevent silent scheduling failure.`); server.close(() => process.exit(1)); }
  });
  let stopping = false;
  server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Marketing101 ready at ${origin} (demo only)`));
  function stop() { stopping = true; worker.kill(); server.close(() => process.exit(0)); }
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
