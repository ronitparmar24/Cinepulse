-- Announcement emails (one row per campaign and member, with a one-time unsubscribe token)
-- and the "product news" email preference (on by default).
CREATE TABLE IF NOT EXISTS email_campaign_sends (
  campaign TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  error TEXT,
  sent_at TEXT NOT NULL,
  PRIMARY KEY(campaign, user_id)
);
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS product_updates SMALLINT NOT NULL DEFAULT 1;
