CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS library_user_updated_idx ON library(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS api_cache_expiry_idx ON api_cache(expires_at);
