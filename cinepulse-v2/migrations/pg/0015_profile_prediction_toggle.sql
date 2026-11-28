-- "Show prediction summary on my profile" (lib/social/profile.ts). On by default; when 0, the
-- Brier score / hit rate summary is only sent to the profile owner, never to other viewers.
-- Mirrors SQLite schema v26.
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_prediction_summary INTEGER NOT NULL DEFAULT 1;
