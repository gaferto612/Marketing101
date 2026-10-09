import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function openDatabase(path = process.env.DATABASE_PATH || './data/marketing101.db') {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      expires INTEGER NOT NULL, csrf TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS brands (
      user_id TEXT PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS policies (
      user_id TEXT PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'draft', data TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1, approved_revision INTEGER,
      approval_kind TEXT, cap INTEGER, spent INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      item_id TEXT NOT NULL, due INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0, error TEXT,
      UNIQUE(campaign_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS jobs_due ON jobs(state,due);
    CREATE TABLE IF NOT EXISTS deliveries (
      key TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      item_id TEXT NOT NULL, cost INTEGER NOT NULL, receipt TEXT NOT NULL,
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      at INTEGER NOT NULL, message TEXT NOT NULL
    );
  `);
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function event(db, id, message, at = Date.now()) {
  db.prepare('INSERT INTO events(campaign_id,at,message) VALUES(?,?,?)').run(id, at, message);
}
