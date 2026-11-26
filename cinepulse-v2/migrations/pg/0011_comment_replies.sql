-- Replies on comments (one level, like most social apps).
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
