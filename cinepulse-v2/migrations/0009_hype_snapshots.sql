-- Migration 0009: Hype Snapshots (Track L)
-- Point-in-time pre-release hype signals collected daily for upcoming titles.
-- These are used to compute wiki_slope_28d, yt_view_velocity_7d, popularity_delta_14d
-- model features once ~8 weeks of data is available.
--
-- IMPORTANT: features computed from hype_snapshots must only use rows
-- where taken_at <= release_date - 14 days (no data leakage).

CREATE TABLE IF NOT EXISTS hype_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id TEXT NOT NULL,
  taken_at TEXT NOT NULL,              -- ISO-8601 timestamp
  wiki_views_7d INTEGER,               -- Wikipedia pageviews in last 7 days
  wiki_slope REAL,                     -- Rate of change (views/day)
  yt_views INTEGER,                    -- YouTube trailer view count
  yt_likes INTEGER,                    -- YouTube trailer likes
  yt_comments INTEGER,                 -- YouTube trailer comments
  tmdb_popularity REAL,                -- TMDB popularity score
  tmdb_vote_count INTEGER,             -- TMDB vote count
  trakt_watchers INTEGER,              -- Trakt.tv watchers (if Trakt API available)
  reddit_mentions INTEGER,             -- Reddit mention count (if available)
  source_flags TEXT NOT NULL DEFAULT '{}', -- JSON: which sources succeeded
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Unique constraint: one snapshot per title per calendar day
CREATE UNIQUE INDEX IF NOT EXISTS hype_snapshots_title_date
  ON hype_snapshots(title_id, date(taken_at));

-- Index for efficient lookups by title and date range
CREATE INDEX IF NOT EXISTS hype_snapshots_title_idx
  ON hype_snapshots(title_id, taken_at);
