import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('..', import.meta.url));

function child(databasePath: string, source: string): any {
  const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
    cwd: project,
    // These tests are about the SQLite file itself, so never inherit a Postgres URL.
    env: { ...process.env, DATABASE_PATH: databasePath, DATABASE_URL: '' },
    encoding: 'utf8',
  });
  return output.trim() ? JSON.parse(output.trim()) : null;
}

function createV2Database(path: string): void {
  const d = new DatabaseSync(path);
  d.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  d.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX sessions_user_idx ON sessions(user_id);
    CREATE TABLE library (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title_id TEXT NOT NULL, title_json TEXT NOT NULL, status TEXT NOT NULL, rating INTEGER, updated_at TEXT NOT NULL, PRIMARY KEY(user_id, title_id));
    CREATE TABLE reviews (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title_id TEXT NOT NULL, title_name TEXT NOT NULL, body TEXT NOT NULL, rating INTEGER, spoiler INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id, title_id));
    CREATE INDEX reviews_created_idx ON reviews(created_at DESC);
    CREATE TABLE forecasts (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title_id TEXT NOT NULL, choice TEXT NOT NULL, confidence INTEGER NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, title_json TEXT, PRIMARY KEY(user_id,title_id));
    CREATE TABLE forecast_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title_id TEXT NOT NULL, choice TEXT NOT NULL, confidence INTEGER NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL, first_submission INTEGER NOT NULL DEFAULT 0, release_date TEXT);
    CREATE INDEX forecast_events_title_idx ON forecast_events(title_id, created_at);
    CREATE TABLE api_cache (cache_key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL);
    PRAGMA user_version = 2;
  `);
  const stamp = new Date().toISOString();
  d.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('legacy-user', 'Legacy', 'legacy@example.test', 'legacy-hash', stamp);
  d.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('legacy-session', 'legacy-user', new Date(Date.now() + 86400000).toISOString(), stamp);
  d.prepare('INSERT INTO library VALUES(?,?,?,?,?,?)').run('legacy-user', 'movie-1', '{"id":"movie-1"}', 'watchlist', null, stamp);
  d.prepare('INSERT INTO library VALUES(?,?,?,?,?,?)').run('legacy-user', 'movie-2', '{"id":"movie-2","title":"Seen Before"}', 'watched', 4, '2024-05-06T10:00:00.000Z');
  d.prepare('INSERT INTO reviews VALUES(?,?,?,?,?,?,?,?,?)').run('legacy-review', 'legacy-user', 'movie-1', 'Legacy Film', 'kept', null, 0, 'first-impression', stamp);
  d.prepare('INSERT INTO forecasts VALUES(?,?,?,?,?,?,?,?)').run('legacy-user', 'movie-1', 'hit', 70, 'kept', stamp, stamp, '{"id":"movie-1"}');
  d.prepare('INSERT INTO forecast_events VALUES(?,?,?,?,?,?,?,?,?)').run('legacy-event', 'legacy-user', 'movie-1', 'hit', 70, 'kept', stamp, 1, '2099-01-01');
  d.prepare('INSERT INTO api_cache VALUES(?,?,?)').run('legacy-cache', '{"kept":true}', Date.now() + 86400000);
  d.close();
}

test('v2 database migrates transactionally to the current version without losing records', () => {
  const folder = mkdtempSync(join(tmpdir(), 'cinepulse-migration-'));
  const path = join(folder, 'legacy.db');
  createV2Database(path);
  try {
    const result = child(path, `
      const { sqliteRaw, CURRENT_SCHEMA_VERSION } = await import('./lib/db.ts');
      const d = sqliteRaw();
      const version = d.prepare('PRAGMA user_version').get().user_version;
      const counts = Object.fromEntries(['users','sessions','library','reviews','forecasts','forecast_events','api_cache'].map((table) => [table, d.prepare('SELECT COUNT(*) AS count FROM ' + table).get().count]));
      const indexes = d.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name IN ('sessions_expiry_idx','library_user_updated_idx','api_cache_expiry_idx') ORDER BY name").all().map((row) => row.name);
      const diary = d.prepare("SELECT title_id, watched_on, rating, rewatch FROM diary_entries WHERE user_id='legacy-user'").all();
      console.log(JSON.stringify({ version, current: CURRENT_SCHEMA_VERSION, counts, indexes, diary, releaseDate: d.prepare('SELECT release_date FROM forecast_events WHERE id=?').get('legacy-event').release_date }));
    `);
    assert.equal(Number(result.version), Number(result.current));
    assert.ok(Number(result.current) >= 14);
    for (const table of ['users', 'sessions', 'reviews', 'forecasts', 'forecast_events', 'api_cache']) assert.equal(Number(result.counts[table]), 1, table);
    assert.equal(Number(result.counts.library), 2);
    // v16: only the watched title becomes a diary entry, dated by when it was saved.
    assert.deepEqual(result.diary.map((r: any) => ({ ...r })), [{ title_id: 'movie-2', watched_on: '2024-05-06', rating: 4, rewatch: 0 }]);
    assert.deepEqual(result.indexes, ['api_cache_expiry_idx', 'library_user_updated_idx', 'sessions_expiry_idx']);
    assert.equal(result.releaseDate, '2099-01-01');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('a newer schema version is refused before application tables are changed', () => {
  const folder = mkdtempSync(join(tmpdir(), 'cinepulse-newer-schema-'));
  const path = join(folder, 'future.db');
  const d = new DatabaseSync(path);
  d.exec('PRAGMA user_version = 999');
  d.close();
  try {
    const result = child(path, `
      const { sqliteRaw } = await import('./lib/db.ts');
      try { sqliteRaw(); console.log(JSON.stringify({ ok: true })); }
      catch (error) { console.log(JSON.stringify({ ok: false, message: error.message })); }
    `);
    assert.equal(result.ok, false);
    assert.match(result.message, /Unsupported database schema version 999/);
    const check = new DatabaseSync(path);
    const table = check.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='users'").get() as { count: number };
    assert.equal(table.count, 0);
    check.close();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('backup of the complete database directory restores data independently', () => {
  const folder = mkdtempSync(join(tmpdir(), 'cinepulse-backup-'));
  const original = join(folder, 'original');
  const restored = join(folder, 'restored');
  const sourcePath = join(original, 'cinepulse.db');
  const restorePath = join(restored, 'cinepulse.db');
  const source = `
    const { db, closeDb } = await import('./lib/db.ts');
    await db().run('INSERT INTO users(id,name,email,password_hash,created_at) VALUES(?,?,?,?,?)', 'backup-user','Backup','backup@example.test','hash',new Date().toISOString());
    await closeDb();
  `;
  try {
    child(sourcePath, source);
    // Copy the whole directory, including any SQLite WAL/SHM sidecars.
    cpSync(original, restored, { recursive: true });
    const result = child(restorePath, `
      const { db } = await import('./lib/db.ts');
      const row = await db().get('SELECT name,email FROM users WHERE id=?', 'backup-user');
      console.log(JSON.stringify({ ...row }));
    `);
    assert.deepEqual(result, { name: 'Backup', email: 'backup@example.test' });
    assert.equal(existsSync(restorePath), true);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('maintenance removes expired records in bounded batches and keeps cache bounded', () => {
  const folder = mkdtempSync(join(tmpdir(), 'cinepulse-maintenance-'));
  const path = join(folder, 'maintenance.db');
  try {
    const result = child(path, `
      const { db, runMaintenance } = await import('./lib/db.ts');
      const d = db();
      const stamp = new Date().toISOString();
      await d.run('INSERT INTO users(id,name,email,password_hash,created_at) VALUES(?,?,?,?,?)', 'maintenance-user','Maintenance','maintenance@example.test','hash',stamp);
      for (let i = 0; i < 120; i++) await d.run('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)', 'expired-' + i, 'maintenance-user', '2000-01-01T00:00:00.000Z', stamp);
      for (let i = 0; i < 120; i++) await d.run('INSERT INTO api_cache(cache_key,value,expires_at) VALUES(?,?,?)', 'expired-' + i, '{}', 0);
      await runMaintenance();
      console.log(JSON.stringify({ sessions: (await d.get('SELECT COUNT(*) AS count FROM sessions')).count, cache: (await d.get('SELECT COUNT(*) AS count FROM api_cache')).count }));
    `);
    assert.equal(Number(result.sessions), 20);
    assert.equal(Number(result.cache), 20);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
