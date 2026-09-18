import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

let database: DatabaseSync | undefined;

/** The schema version understood by this application. */
export const CURRENT_SCHEMA_VERSION = 5;
const MAINTENANCE_BATCH_SIZE = 100;
const CACHE_LIMIT = 500;

function schemaVersion(d: DatabaseSync): number {
  const row = d.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
  return Number(row?.user_version ?? 0);
}

function createV1Schema(d: DatabaseSync): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS library (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title_id TEXT NOT NULL, title_json TEXT NOT NULL, status TEXT NOT NULL,
      rating INTEGER, updated_at TEXT NOT NULL, PRIMARY KEY(user_id, title_id)
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title_id TEXT NOT NULL, title_name TEXT NOT NULL, body TEXT NOT NULL,
      rating INTEGER, spoiler INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(user_id, title_id)
    );
    CREATE INDEX IF NOT EXISTS reviews_created_idx ON reviews(created_at DESC);
    CREATE TABLE IF NOT EXISTS forecasts (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title_id TEXT NOT NULL, choice TEXT NOT NULL, confidence INTEGER NOT NULL,
      reason TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, title_id)
    );
    CREATE TABLE IF NOT EXISTS forecast_events (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title_id TEXT NOT NULL, choice TEXT NOT NULL, confidence INTEGER NOT NULL,
      reason TEXT NOT NULL, created_at TEXT NOT NULL, first_submission INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS forecast_events_title_idx ON forecast_events(title_id, created_at);
    CREATE TABLE IF NOT EXISTS api_cache (
      cache_key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS email_verifications (
      email TEXT PRIMARY KEY COLLATE NOCASE,
      code_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
}

function hasColumn(d: DatabaseSync, table: string, column: string): boolean {
  const columns = d.prepare(`PRAGMA table_info(${table})`).all() as { name?: string }[];
  return columns.some((item) => item.name === column);
}

/** Apply one-way, additive migrations. The caller owns the transaction. */
function migrate(d: DatabaseSync): void {
  const existing = schemaVersion(d);
  if (existing > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported database schema version ${existing}; this application supports up to ${CURRENT_SCHEMA_VERSION}`);
  }

  d.exec('BEGIN IMMEDIATE');
  try {
    let version = existing;
    if (version < 1) {
      createV1Schema(d);
      d.exec('PRAGMA user_version = 1');
      version = 1;
    }
    if (version < 2) {
      // v2 preserves catalog snapshots at the time a forecast/library item was
      // saved. Existing rows receive NULL and remain valid legacy records.
      if (!hasColumn(d, 'forecast_events', 'release_date')) {
        d.exec('ALTER TABLE forecast_events ADD COLUMN release_date TEXT');
      }
      if (!hasColumn(d, 'forecasts', 'title_json')) {
        d.exec('ALTER TABLE forecasts ADD COLUMN title_json TEXT');
      }
      d.exec('PRAGMA user_version = 2');
      version = 2;
    }
    if (version < 3) {
      // v3 adds only bounded-maintenance indexes. No existing rows or IDs are
      // rewritten, and the statements are safe to repeat on interrupted v2
      // installations.
      d.exec(`
        CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
        CREATE INDEX IF NOT EXISTS library_user_updated_idx ON library(user_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS api_cache_expiry_idx ON api_cache(expires_at);
      `);
      d.exec('PRAGMA user_version = 3');
      version = 3;
    }
    if (version < 4) {
      // v4 adds a prediction_cache table for storing AI model outputs.
      // TTL-based; cleaned on each maintenance pass.
      d.exec(`
        CREATE TABLE IF NOT EXISTS prediction_cache (
          title_id TEXT PRIMARY KEY,
          model_version TEXT NOT NULL,
          result_json TEXT NOT NULL,
          computed_at TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS prediction_cache_expiry_idx ON prediction_cache(expires_at);
      `);
      d.exec('PRAGMA user_version = 4');
      version = 4;
    }
    if (version < 5) {
      // v5 adds the Public Profiles & Social Layer
      if (!hasColumn(d, 'users', 'username')) {
        d.exec('ALTER TABLE users ADD COLUMN username TEXT COLLATE NOCASE');
      }
      if (!hasColumn(d, 'users', 'display_name')) {
        d.exec('ALTER TABLE users ADD COLUMN display_name TEXT');
      }
      if (!hasColumn(d, 'users', 'bio')) {
        d.exec('ALTER TABLE users ADD COLUMN bio TEXT');
      }
      if (!hasColumn(d, 'users', 'avatar_url')) {
        d.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT');
      }
      if (!hasColumn(d, 'users', 'profile_visibility')) {
        d.exec("ALTER TABLE users ADD COLUMN profile_visibility TEXT DEFAULT 'public'");
      }
      if (!hasColumn(d, 'users', 'is_verified')) {
        d.exec('ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT 0');
      }
      if (!hasColumn(d, 'users', 'favorite_title_ids')) {
        d.exec("ALTER TABLE users ADD COLUMN favorite_title_ids TEXT DEFAULT '[]'");
      }

      // Backfill existing users with unique usernames
      const existingUsers = d.prepare('SELECT id, name, email, username FROM users').all() as any[];
      const takenUsernames = new Set<string>();
      for (const u of existingUsers) {
        if (!u.username) {
          let base = (u.name ? u.name.toLowerCase().replace(/[^a-z0-9_]/g, '') : '') || (u.email ? u.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '') : 'cinephile');
          if (base.length < 3) base = 'user_' + base;
          let candidate = base;
          let counter = 1;
          while (takenUsernames.has(candidate)) {
            candidate = `${base}${counter++}`;
          }
          takenUsernames.add(candidate);
          d.prepare('UPDATE users SET username = ?, display_name = COALESCE(display_name, ?) WHERE id = ?').run(candidate, u.name || candidate, u.id);
        } else {
          takenUsernames.add(u.username.toLowerCase());
        }
      }

      d.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users(username COLLATE NOCASE);

        CREATE TABLE IF NOT EXISTS follows (
          follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'accepted',
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          PRIMARY KEY (follower_id, followee_id),
          CHECK (follower_id != followee_id)
        );
        CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id, status);
        CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id, status);

        CREATE TABLE IF NOT EXISTS privacy_settings (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          watchlist_visibility TEXT DEFAULT 'public',
          diary_visibility TEXT DEFAULT 'public',
          ratings_visibility TEXT DEFAULT 'public',
          reviews_visibility TEXT DEFAULT 'public',
          predictions_visibility TEXT DEFAULT 'public',
          activity_visibility TEXT DEFAULT 'followers_only',
          show_in_search BOOLEAN DEFAULT 1,
          allow_activity_from TEXT DEFAULT 'everyone'
        );

        CREATE TABLE IF NOT EXISTS activity_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          metadata TEXT,
          visibility TEXT NOT NULL DEFAULT 'public',
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        );
        CREATE INDEX IF NOT EXISTS idx_activity_user_time ON activity_events(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_events(created_at DESC);

        CREATE TABLE IF NOT EXISTS likes (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          PRIMARY KEY (user_id, target_type, target_id)
        );
        CREATE INDEX IF NOT EXISTS idx_likes_target ON likes(target_type, target_id);

        CREATE TABLE IF NOT EXISTS comments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          deleted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id, created_at ASC);

        CREATE TABLE IF NOT EXISTS blocks (
          blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          PRIMARY KEY (blocker_id, blocked_id),
          CHECK (blocker_id != blocked_id)
        );
        CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON blocks(blocker_id);
        CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);

        CREATE TABLE IF NOT EXISTS user_lists (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          is_ranked BOOLEAN DEFAULT 0,
          visibility TEXT DEFAULT 'public',
          items_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        );
        CREATE INDEX IF NOT EXISTS idx_user_lists_user ON user_lists(user_id);

        CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          target_type TEXT,
          target_id TEXT,
          read_at TEXT,
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at);

        INSERT OR IGNORE INTO privacy_settings (user_id) SELECT id FROM users;
      `);

      d.exec('PRAGMA user_version = 5');
      version = 5;
    }
    d.exec(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        email TEXT PRIMARY KEY COLLATE NOCASE,
        code_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);
    d.exec('COMMIT');
  } catch (error) {
    try { d.exec('ROLLBACK'); } catch { /* preserve the migration error */ }
    throw error;
  }
}

/**
 * Delete only a bounded batch of expired operational records. This is a
 * maintenance path, not a promise that a very large old database is cleaned
 * in one request.
 */
function maintainDatabase(d: DatabaseSync): void {
  const timestamp = now();
  d.prepare(`
    DELETE FROM sessions
    WHERE rowid IN (
      SELECT rowid FROM sessions WHERE expires_at <= ? LIMIT ${MAINTENANCE_BATCH_SIZE}
    )
  `).run(timestamp);
  d.prepare(`
    DELETE FROM api_cache
    WHERE rowid IN (
      SELECT rowid FROM api_cache WHERE expires_at <= ? LIMIT ${MAINTENANCE_BATCH_SIZE}
    )
  `).run(Date.now());
  // Keep the cache bounded even if callers continuously add long-lived keys.
  d.prepare(`
    DELETE FROM api_cache
    WHERE rowid IN (
      SELECT rowid FROM api_cache
      WHERE rowid NOT IN (SELECT rowid FROM api_cache ORDER BY expires_at DESC LIMIT ${CACHE_LIMIT})
      LIMIT ${MAINTENANCE_BATCH_SIZE}
    )
  `).run();
  // Evict expired prediction cache entries.
  try {
    d.prepare(`
      DELETE FROM prediction_cache
      WHERE rowid IN (
        SELECT rowid FROM prediction_cache WHERE expires_at <= ? LIMIT ${MAINTENANCE_BATCH_SIZE}
      )
    `).run(Date.now());
  } catch { /* table may not exist on very old schema, migration handles it */ }
  // Evict expired email verifications
  try {
    d.prepare(`
      DELETE FROM email_verifications WHERE expires_at <= ?
    `).run(Date.now());
  } catch { /* table may not exist on mock db */ }
}

export function db(): DatabaseSync {
  if (database) return database;
  const file = process.env.DATABASE_PATH || './data/cinepulse.db';
  const path = resolve(file);
  mkdirSync(dirname(path), { recursive: true });
  const opened = new DatabaseSync(path);
  try {
    // Check before any CREATE/ALTER so a newer database is never silently
    // downgraded or modified by an older application binary.
    if (schemaVersion(opened) > CURRENT_SCHEMA_VERSION) {
      throw new Error(`Unsupported database schema version ${schemaVersion(opened)}; this application supports up to ${CURRENT_SCHEMA_VERSION}`);
    }
    opened.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    migrate(opened);
    maintainDatabase(opened);
    database = opened;
    return opened;
  } catch (error) {
    try { opened.close(); } catch { /* preserve the startup error */ }
    throw error;
  }
}

/** Run one bounded cleanup pass on an already-open database. */
export function runMaintenance(): void {
  maintainDatabase(db());
}

export function now(): string { return new Date().toISOString(); }
export function id(): string { return randomUUID(); }
export function transaction<T>(fn: () => T): T {
  const d = db();
  d.exec('BEGIN IMMEDIATE');
  try { const result = fn(); d.exec('COMMIT'); return result; }
  catch (e) { try { d.exec('ROLLBACK'); } catch {} throw e; }
}
export function cacheGet<T>(key: string): T | null {
  const row = db().prepare('SELECT value FROM api_cache WHERE cache_key = ? AND expires_at > ?').get(key, Date.now()) as {value:string} | undefined;
  if (!row) return null;
  try { return JSON.parse(row.value) as T; } catch { return null; }
}
export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  const d = db();
  d.prepare('INSERT INTO api_cache(cache_key,value,expires_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET value=excluded.value, expires_at=excluded.expires_at').run(key, JSON.stringify(value), Date.now() + ttlMs);
  maintainDatabase(d);
}
