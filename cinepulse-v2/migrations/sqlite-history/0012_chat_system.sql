-- Migration 0012: Chat threads, messages, and rate limit tracking for CinePulse Chatbot
CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_chat_threads_user ON chat_threads(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_json TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  feedback TEXT
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, created_at ASC);

CREATE TABLE IF NOT EXISTS chat_daily_usage (
  key TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS chat_minute_limits (
  ip TEXT PRIMARY KEY,
  minute INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1
);
