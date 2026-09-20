CREATE TABLE IF NOT EXISTS predictions_log (
  id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL,
  title_name TEXT,
  model_version TEXT NOT NULL,
  predicted_revenue_p10 INTEGER,
  predicted_revenue_p50 INTEGER,
  predicted_revenue_p90 INTEGER,
  hit_probability INTEGER NOT NULL,
  confidence TEXT NOT NULL,
  features_json TEXT NOT NULL,
  explanation_json TEXT,
  actual_revenue INTEGER,
  actual_hit INTEGER,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_predictions_log_title ON predictions_log(title_id);
CREATE INDEX IF NOT EXISTS idx_predictions_log_created ON predictions_log(created_at DESC);

CREATE TABLE IF NOT EXISTS brier_scores (
  entity_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL DEFAULT 'user', -- 'user' | 'engine'
  entity_name TEXT NOT NULL,
  avatar_url TEXT,
  brier_score REAL NOT NULL DEFAULT 0.0,
  accuracy_rate REAL NOT NULL DEFAULT 0.0,
  total_calls INTEGER NOT NULL DEFAULT 0,
  correct_calls INTEGER NOT NULL DEFAULT 0,
  rank INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_brier_scores_score ON brier_scores(brier_score ASC, total_calls DESC);

CREATE TABLE IF NOT EXISTS title_links (
  title_id TEXT PRIMARY KEY,
  imdb_id TEXT,
  wikidata_id TEXT,
  wikipedia_title TEXT,
  youtube_trailer_key TEXT,
  omdb_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_title_links_imdb ON title_links(imdb_id);

CREATE TABLE IF NOT EXISTS trailer_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id TEXT NOT NULL,
  youtube_video_id TEXT NOT NULL,
  view_count INTEGER NOT NULL,
  like_count INTEGER,
  comment_count INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_trailer_stats_title_time ON trailer_stats(title_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS hype_signals (
  title_id TEXT PRIMARY KEY,
  wiki_pageviews_30d INTEGER,
  wiki_slope_7d REAL,
  youtube_view_velocity REAL,
  reddit_mentions INTEGER,
  reddit_avg_score REAL,
  imdb_rating REAL,
  rotten_tomatoes_pct INTEGER,
  metascore INTEGER,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 1,
  first_attempt_at INTEGER NOT NULL,
  blocked_until INTEGER
);
