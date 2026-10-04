-- Migration 0010: AI Community / Pulse Crew (Track S, T, V, X)
-- Adds AI identity columns to users table and establishes dedicated
-- persona memory, batched content queues, and audit log tables.

ALTER TABLE users ADD COLUMN is_ai INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN ai_persona_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_is_ai ON users(is_ai);
CREATE INDEX IF NOT EXISTS idx_users_ai_persona ON users(ai_persona_id);

-- Persona memory table (Track T)
CREATE TABLE IF NOT EXISTS ai_persona_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_ai_persona_memory_lookup ON ai_persona_memory(persona_id, subject);
CREATE INDEX IF NOT EXISTS idx_ai_persona_memory_recency ON ai_persona_memory(persona_id, created_at DESC);

-- Batched content queue (Track V)
CREATE TABLE IF NOT EXISTS ai_content_queue (
  id TEXT PRIMARY KEY,
  persona_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  not_before TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  quality_score REAL NOT NULL DEFAULT 1.0,
  rejection_reason TEXT,
  tick_id TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_queue_status_time ON ai_content_queue(status, not_before);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_queue_idempotency ON ai_content_queue(persona_id, action, target_id, tick_id);

-- AI activity log for audit & realism dashboard (Track X)
CREATE TABLE IF NOT EXISTS ai_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tick_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  reason_code TEXT,
  provider TEXT NOT NULL DEFAULT 'template',
  model TEXT,
  draft_id TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_ai_activity_log_tick ON ai_activity_log(tick_id);
CREATE INDEX IF NOT EXISTS idx_ai_activity_log_time ON ai_activity_log(created_at DESC);
