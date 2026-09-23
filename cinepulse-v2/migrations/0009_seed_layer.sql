-- Migration 0009: Synthetic Community Seed Layer (Track J1)
-- Adds is_seed flag to users to establish a hard boundary between
-- synthetic demo accounts and real user accounts.

ALTER TABLE users ADD COLUMN is_seed INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_users_is_seed ON users(is_seed);
