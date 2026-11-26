-- Movie Night rooms: one JSON document per room, updated with optimistic versioning (lib/movieRoom.ts).
CREATE TABLE IF NOT EXISTS movie_rooms (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  host_user_id TEXT,
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_movie_rooms_expires ON movie_rooms(expires_at);
