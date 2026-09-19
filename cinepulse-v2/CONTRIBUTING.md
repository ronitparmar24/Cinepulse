# Contributing to CinePulse v3

Welcome to CinePulse! We build transparent cinema tracking and community box-office forecasting.

## Architecture Guidelines

1. **Deployable Data Layer**:
   - Local development uses Node's built-in `node:sqlite`.
   - Production uses LibSQL / Turso over HTTP (`DATABASE_URL`).
   - All migrations live in `migrations/` as numbered SQL files.

2. **Unified Fetchers (`lib/fetchers/`)**:
   - Every external network call goes through `lib/fetchers/base.ts`.
   - All external calls must feature timeout (8s), exponential retry + jitter (max 3), token-bucket rate limiting, and SQLite response caching.
   - **Graceful degradation**: Never crash on a missing API key. Disable the signal, return `null`, and log once.

3. **Prediction Engine**:
   - Layer 1: Typed feature vectors with provenance in `lib/prediction/features.ts`.
   - Layer 2: Calibrated scoring engine with P10/P50/P90 intervals in `lib/prediction/model.ts`.
   - Layer 3: Feature waterfall explanations in `lib/prediction/explain.ts`.
   - Every prediction served is snapshot-logged to `predictions_log`.

4. **Testing & Quality Gates**:
   - Run `npm run typecheck` to verify TypeScript strict mode.
   - Run `npm run test` to verify unit and regression suites.
   - Run `npm run test:browser` for Playwright end-to-end tests.
