CREATE TABLE IF NOT EXISTS prediction_cache (
  title_id TEXT PRIMARY KEY,
  model_version TEXT NOT NULL,
  result_json TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS prediction_cache_expiry_idx ON prediction_cache(expires_at);
