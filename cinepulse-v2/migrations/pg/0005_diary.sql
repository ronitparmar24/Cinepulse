-- Dated diary: one row per viewing (rewatches are separate rows), Letterboxd-style.
CREATE TABLE IF NOT EXISTS diary_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  title_json TEXT,
  watched_on TEXT NOT NULL,
  rating DOUBLE PRECISION,
  rewatch SMALLINT NOT NULL DEFAULT 0,
  liked SMALLINT NOT NULL DEFAULT 0,
  tags TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_diary_user_date ON diary_entries(user_id, watched_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diary_title ON diary_entries(title_id);

-- Existing "watched" library rows become their first diary entry (dated by when they were saved).
INSERT INTO diary_entries (id, user_id, title_id, title_json, watched_on, rating, rewatch, liked, created_at, updated_at)
SELECT 'lib:' || user_id || ':' || title_id, user_id, title_id, title_json, substr(updated_at, 1, 10), rating, 0, 0, updated_at, updated_at
FROM library WHERE status = 'watched'
ON CONFLICT DO NOTHING;
