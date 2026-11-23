-- Migration v7: Social Enhancements
-- Adds: list_bookmarks, taste_tags, mutes tables
-- Adds: banner_url column to users
-- These are all additive, non-breaking changes

ALTER TABLE users ADD COLUMN banner_url TEXT;

CREATE TABLE IF NOT EXISTS list_bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  list_id TEXT NOT NULL REFERENCES user_lists(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (user_id, list_id)
);
CREATE INDEX IF NOT EXISTS idx_list_bookmarks_user ON list_bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_list_bookmarks_list ON list_bookmarks(list_id);

CREATE TABLE IF NOT EXISTS taste_tags (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 1.0,
  computed_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (user_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_taste_tags_user ON taste_tags(user_id, score DESC);

CREATE TABLE IF NOT EXISTS mutes (
  muter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (muter_id, muted_id),
  CHECK (muter_id != muted_id)
);
CREATE INDEX IF NOT EXISTS idx_mutes_muter ON mutes(muter_id);

CREATE TABLE IF NOT EXISTS pinned_lists (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  list_id TEXT NOT NULL REFERENCES user_lists(id) ON DELETE CASCADE,
  pin_order INTEGER NOT NULL DEFAULT 0,
  pinned_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (user_id, list_id)
);
CREATE INDEX IF NOT EXISTS idx_pinned_lists_user ON pinned_lists(user_id, pin_order ASC);
