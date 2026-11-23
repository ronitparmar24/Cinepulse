-- Shared fixed-window counters for lib/auth/writeLimit.ts.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start BIGINT NOT NULL,
  count BIGINT NOT NULL DEFAULT 0
);
