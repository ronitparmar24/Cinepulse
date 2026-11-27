-- TV episode tracking (lib/episodes.ts): one row per watched episode, optionally rated ½–5 stars.
-- Mirrors SQLite schema v23.
CREATE TABLE IF NOT EXISTS episode_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  episode INTEGER NOT NULL,
  watched_at TEXT NOT NULL,
  rating DOUBLE PRECISION,
  PRIMARY KEY(user_id, title_id, season, episode)
);
CREATE INDEX IF NOT EXISTS idx_episode_progress_user_watched ON episode_progress(user_id, watched_at DESC);
