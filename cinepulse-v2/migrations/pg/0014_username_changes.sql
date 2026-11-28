-- Username changes (lib/social/profile.ts). users.username_changed_at drives the 14-day cooldown;
-- username_history maps each old handle (stored lowercase) to its owner so /u/<old> keeps
-- redirecting, and holds it for that owner for 30 days before anyone else can claim it.
-- Mirrors SQLite schema v25.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username_changed_at TEXT;
CREATE TABLE IF NOT EXISTS username_history (
  old_username TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_at TEXT NOT NULL,
  PRIMARY KEY(old_username, user_id)
);
CREATE INDEX IF NOT EXISTS idx_username_history_name ON username_history(old_username, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_username_history_user ON username_history(user_id);
