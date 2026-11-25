-- Release-day reminders (one per member and title) and per-member notification preferences.
CREATE TABLE IF NOT EXISTS release_reminders (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  title_json TEXT NOT NULL,
  release_date TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  notified_at TEXT,
  PRIMARY KEY(user_id, title_id)
);
CREATE INDEX IF NOT EXISTS idx_release_reminders_due ON release_reminders(notified_at, release_date);

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  watchlist_reminders SMALLINT NOT NULL DEFAULT 1,
  email_reminders SMALLINT NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
