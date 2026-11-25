-- Yearly watch goals, and community reports with moderator-hidden reviews/comments.
CREATE TABLE IF NOT EXISTS user_goals (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  target INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, year)
);

CREATE TABLE IF NOT EXISTS content_reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution TEXT,
  UNIQUE(reporter_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_content_reports_open ON content_reports(resolved_at, target_type, target_id);

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS hidden_at TEXT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS hidden_at TEXT;
