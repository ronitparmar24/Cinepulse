-- 0007_v5_v6_subsystems.sql
-- Subsystems for v5 & v6: Movie Night, Circles, Analytics, and Login Rate Limiting

CREATE TABLE IF NOT EXISTS movie_night_sessions (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  host_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'lobby',
  title_id TEXT,
  candidates_json TEXT DEFAULT '[]',
  votes_json TEXT DEFAULT '{}',
  voting_system TEXT DEFAULT 'borda',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_movie_night_code ON movie_night_sessions(code);

CREATE TABLE IF NOT EXISTS circles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  join_code TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_circles_owner ON circles(owner_id);
CREATE INDEX IF NOT EXISTS idx_circles_code ON circles(join_code);

CREATE TABLE IF NOT EXISTS circle_members (
  circle_id TEXT REFERENCES circles(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (circle_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_circle_members_user ON circle_members(user_id);

CREATE TABLE IF NOT EXISTS circle_watchlist (
  circle_id TEXT REFERENCES circles(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (circle_id, title_id)
);

CREATE TABLE IF NOT EXISTS circle_picks (
  id TEXT PRIMARY KEY,
  circle_id TEXT REFERENCES circles(id) ON DELETE CASCADE,
  week_of DATE NOT NULL,
  title_id TEXT,
  candidates_json TEXT DEFAULT '[]',
  votes_json TEXT DEFAULT '{}',
  decided_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_circle_picks_circle ON circle_picks(circle_id, week_of DESC);

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  event_type TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS login_rate_limits (
  ip TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 1,
  first_attempt_at INTEGER NOT NULL,
  last_attempt_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_limits_time ON login_rate_limits(last_attempt_at);
