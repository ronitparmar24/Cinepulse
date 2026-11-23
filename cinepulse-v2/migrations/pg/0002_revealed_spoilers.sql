-- Spoiler reveals per viewer (was created on demand by lib/social/activity.ts).
CREATE TABLE IF NOT EXISTS revealed_spoilers (
  user_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  PRIMARY KEY (user_id, target_id)
);
