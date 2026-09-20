-- 0007_v5_v6_subsystems.sql
-- Subsystems for v5 & v6: Circles, Movie Night, Analytics, Rate Limiting, and Benchmark Adjudication

CREATE TABLE IF NOT EXISTS circles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_circles_owner ON circles(owner_id);
CREATE INDEX IF NOT EXISTS idx_circles_invite ON circles(invite_code);

CREATE TABLE IF NOT EXISTS circle_members (
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'admin' | 'member'
  joined_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (circle_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_circle_members_user ON circle_members(user_id);

CREATE TABLE IF NOT EXISTS circle_watchlist (
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  title_json TEXT NOT NULL,
  added_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (circle_id, title_id)
);

CREATE TABLE IF NOT EXISTS circle_picks (
  id TEXT PRIMARY KEY,
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  week_start_date TEXT NOT NULL,
  title_id TEXT NOT NULL,
  title_name TEXT NOT NULL,
  picked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_circle_picks_circle ON circle_picks(circle_id, week_start_date DESC);

CREATE TABLE IF NOT EXISTS movie_night_sessions (
  id TEXT PRIMARY KEY,
  room_code TEXT UNIQUE NOT NULL,
  host_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'waiting', -- 'waiting' | 'voting' | 'completed'
  voting_method TEXT NOT NULL DEFAULT 'borda', -- 'borda' | 'approval'
  max_runtime INTEGER,
  selected_genres TEXT,
  candidates_json TEXT NOT NULL DEFAULT '[]',
  votes_json TEXT NOT NULL DEFAULT '{}',
  winner_title_id TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_movie_night_room ON movie_night_sessions(room_code);
CREATE INDEX IF NOT EXISTS idx_movie_night_expires ON movie_night_sessions(expires_at);

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  user_id TEXT,
  metadata_json TEXT,
  timestamp TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type, timestamp DESC);

CREATE TABLE IF NOT EXISTS login_rate_limits (
  ip TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 1,
  first_attempt_at INTEGER NOT NULL,
  last_attempt_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_limits_time ON login_rate_limits(last_attempt_at);
