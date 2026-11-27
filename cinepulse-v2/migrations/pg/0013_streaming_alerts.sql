-- "Now on your services" alerts (lib/streamingAlerts.ts): one row per member, title and service once
-- announced, or recorded silently as the baseline. provider_id '*' marks that the title was checked
-- and which services the member had at the time (checked_services, JSON). Mirrors SQLite schema v24.
CREATE TABLE IF NOT EXISTS streaming_alerts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_name TEXT,
  title_json TEXT,
  checked_services TEXT,
  baseline SMALLINT NOT NULL DEFAULT 0,
  notified_at TEXT NOT NULL,
  PRIMARY KEY(user_id, title_id, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_streaming_alerts_checked ON streaming_alerts(provider_id, notified_at);
