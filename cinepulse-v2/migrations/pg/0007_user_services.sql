-- The streaming services each member subscribes to (JSON array of service ids, see lib/services.ts).
CREATE TABLE IF NOT EXISTS user_services (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  services TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
