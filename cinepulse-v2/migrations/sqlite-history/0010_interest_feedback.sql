-- CinePulse v10: Interest Feedback Loop & Learned Taste Affinity
-- SQLite Migration

CREATE TABLE IF NOT EXISTS interest_feedback (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  signal TEXT NOT NULL CHECK(signal IN ('interested', 'not_interested', 'already_seen', 'snooze')),
  reason TEXT CHECK(reason IS NULL OR reason IN ('not_my_genre', 'too_violent', 'seen_it', 'not_into_actor_director', 'language', 'too_long', 'other')),
  surface TEXT NOT NULL DEFAULT 'discovery',
  title_json TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (user_id, title_id)
);

CREATE INDEX IF NOT EXISTS idx_interest_feedback_user_signal
  ON interest_feedback(user_id, signal);

CREATE INDEX IF NOT EXISTS idx_interest_feedback_user_updated
  ON interest_feedback(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS interest_feedback_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('set', 'undo', 'update')),
  previous_signal TEXT,
  new_signal TEXT,
  previous_reason TEXT,
  new_reason TEXT,
  surface TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_interest_feedback_events_user
  ON interest_feedback_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_affinity (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_type TEXT NOT NULL CHECK(feature_type IN ('genre', 'director', 'actor', 'language', 'decade', 'runtime_bucket', 'keyword', 'media_type')),
  feature_value TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0.0,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (user_id, feature_type, feature_value)
);

CREATE INDEX IF NOT EXISTS idx_user_affinity_user_weight
  ON user_affinity(user_id, weight DESC);

CREATE INDEX IF NOT EXISTS idx_user_affinity_user_type
  ON user_affinity(user_id, feature_type);
