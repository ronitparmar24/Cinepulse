-- SQLite let INTEGER rating columns hold half stars (e.g. 4.5); keep that in Postgres.
ALTER TABLE library ALTER COLUMN rating TYPE DOUBLE PRECISION;
ALTER TABLE reviews ALTER COLUMN rating TYPE DOUBLE PRECISION;

-- The engine's leaderboard row, seeded by SQLite schema migration v13.
INSERT INTO brier_scores (entity_id, entity_type, entity_name, avatar_url, brier_score, accuracy_rate, total_calls, correct_calls, rank)
VALUES ('cinepulse-engine', 'engine', 'CinePulse v3 Engine', '🧠', 0.142, 82.5, 120, 99, 1)
ON CONFLICT DO NOTHING;
