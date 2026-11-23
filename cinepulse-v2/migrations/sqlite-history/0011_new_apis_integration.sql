-- Migration 0011: New APIs & Signals Integration (Track: Trakt, Streaming Expiry, Trailer Sentiment)
-- Backed by nightly and weekly scheduled background syncs; pages read tables with zero live external calls.

CREATE TABLE IF NOT EXISTS trakt_stats (
  title_id TEXT NOT NULL,
  date TEXT NOT NULL,
  list_count INTEGER,
  watchers INTEGER,
  rank_anticipated INTEGER,
  PRIMARY KEY (title_id, date)
);
CREATE INDEX IF NOT EXISTS idx_trakt_stats_title ON trakt_stats(title_id, date DESC);

CREATE TABLE IF NOT EXISTS availability_expiry (
  title_id TEXT NOT NULL,
  service TEXT NOT NULL,
  region TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (title_id, service, region)
);
CREATE INDEX IF NOT EXISTS idx_availability_expiry_time ON availability_expiry(region, expires_at);

CREATE TABLE IF NOT EXISTS trailer_sentiment (
  title_id TEXT NOT NULL,
  week TEXT NOT NULL,
  positive_ratio REAL,
  sample_size INTEGER,
  language_coverage REAL,
  PRIMARY KEY (title_id, week)
);
CREATE INDEX IF NOT EXISTS idx_trailer_sentiment_title ON trailer_sentiment(title_id, week DESC);
