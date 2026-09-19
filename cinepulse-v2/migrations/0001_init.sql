CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS library (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  title_json TEXT NOT NULL,
  status TEXT NOT NULL,
  rating INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, title_id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  title_name TEXT NOT NULL,
  body TEXT NOT NULL,
  rating INTEGER,
  spoiler INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, title_id)
);

CREATE INDEX IF NOT EXISTS reviews_created_idx ON reviews(created_at DESC);

CREATE TABLE IF NOT EXISTS forecasts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  choice TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, title_id)
);

CREATE TABLE IF NOT EXISTS forecast_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  choice TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  first_submission INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS forecast_events_title_idx ON forecast_events(title_id, created_at);

CREATE TABLE IF NOT EXISTS api_cache (
  cache_key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL
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
