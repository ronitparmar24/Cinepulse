# CinePulse v6 — The Foundational Pieces That Were Only Ever Bullet Points

Paste into Antigravity after v5. This closes out everything from the v3
prompt that got named but never detailed, plus the free-API wiring that's
been documented as curl commands but never as a build spec.

**Track D (model training) is the priority.** Confirm honestly, by reading
the code, whether the "validated model" v4's Phase 0 asked you to check for
actually exists — or whether that check has been passing against the
original heuristic the whole time. If it's the heuristic, everything in
v4/v5 that displays a confidence number has been decorating an unvalidated
guess. Say so plainly before doing anything else.

---

## TRACK D — Prediction model training pipeline (do this first)

### D1. Build the training set
`scripts/build-training-set.ts` — pull every TMDB movie 2010–present with
`budget > 0 AND revenue > 0` (~8–10k rows) via `/discover/movie` paginated
by year, fetch full details + credits + keywords per title, compute the
feature vector already specified in the v3 prompt (log-budget, genre
one-hot, runtime, cert, franchise flag, sequel index, release month,
holiday-window flag, competing-release count, cast star power, director's
prior median revenue, studio tier). Output `data/training.csv`. Rate-limit
against TMDB's own limits; this script runs once, offline, not in prod.

### D2. Train and export
Train in a `scripts/train_model.py` (Python is fine here — it never ships,
only its output does): gradient boosting or ridge regression on
`log10(worldwide_revenue)`, plus a classifier on `revenue >= 2.5 × budget`
for the hit/flop head. **Split by release date** — train ≤2021, validate
2022–2023, test 2024+. A random split will leak franchise info and lie
about accuracy. Export coefficients/tree structure to
`data/model-weights.json`. Report MAE (log-space) and Brier score in a
`docs/model-report.md` committed to the repo — this file is what the
`/accuracy` page's "current model" numbers must trace back to.

### D3. Calibrate
Isotonic regression or Platt scaling on the validation split, applied to
the classifier's raw output before it's ever shown to a user. An
uncalibrated "80% Hit" that's actually right 55% of the time is worse than
not showing a number — verify calibration explicitly with a reliability
check and include it in `model-report.md`.

### D4. Score at runtime, pure TypeScript
`lib/prediction/model.ts` loads `model-weights.json` and scores a feature
vector with no Python dependency in the deployed app. `lib/prediction/
explain.ts` produces the per-factor waterfall contributions already
consumed by `<PredictionWaterfall>` from v4.

### D5. Wire it in and re-verify v4/v5
Once D1–D4 are live, re-run the same checks v4's Phase 0 asked for and
confirm they now pass against the real model, not the heuristic. Spot-check
3–5 already-released titles: does the frozen `predictions_log` entry match
what D2's backtest would have said? If the numbers on `/accuracy` or the
Score Card change materially once this ships, that's expected and correct
— note it in the PR description, don't quietly reconcile it.

---

## TRACK E — Deployment infrastructure

### E1. DB adapter layer
`lib/db/adapters/sqlite.ts` (better-sqlite3, local dev) and
`lib/db/adapters/libsql.ts` (Turso free tier, production), selected via
`DATABASE_URL`, same query interface for both. Replace any remaining
`node:sqlite` usage — that module has no persistent filesystem on Vercel
and will silently reset data on every deploy.

### E2. Versioned migrations
`migrations/0001_init.sql`, `0002_...sql`, etc., with a `migrate.ts` runner
that tracks applied migrations in a `_migrations` table. Move all schema
changes accumulated across v3–v5 (privacy_settings, follows, activity_events,
likes, comments, blocks, circles, circle_members, circle_watchlist,
circle_picks, analytics_events, predictions_log, notifications) into
ordered migration files if they aren't already — check first, don't
duplicate what's there.

### E3. Docker + one-command setup
`Dockerfile`, `docker-compose.yml`, `npm run setup` that installs, runs
migrations, and seeds demo data in one step.

### E4. Deploy to Vercel
`.env.example` listing every env var used anywhere in the app (grep for
`process.env` to make sure none are missing), with a comment on which are
required vs optional-with-graceful-degradation.

### E5. LICENSE
Add an actual `LICENSE` file (MIT, unless you want otherwise) — the README
has referenced a license that doesn't exist as a file.

---

## TRACK F — Community call scoring (the retention loop that was never finished)

### F1. Resolution job
A cron/scheduled job that, 30 days after a title's release, pulls actual
revenue from TMDB and resolves every open community call for that title.

### F2. Scoring
Score each user's call with a Brier score against the resolved outcome;
maintain a running per-user accuracy. Score the model itself (from Track D)
on the same set of titles so users and model are compared on identical data.

### F3. Leaderboard + "You vs the Engine"
`/leaderboard` — public ranking by rolling Brier score, minimum-calls
threshold to appear (don't let one lucky guess top the board). Per-user
profile card (from the social-profiles prompt) shows "You vs the Engine"
head-to-head using this same data — this was called out as the retention
hook in the original audit and it depends entirely on F1/F2 existing.

### F4. Anti-gaming
One call per user per title, immutable after submission (enforce at the DB
level with a check constraint or a trigger, not just app-layer validation),
calls hidden from other users until the title locks, minimum account age
before a call counts toward the public leaderboard.

---

## TRACK G — Security hardening

- Rate-limit login: 5 attempts / 15 min / IP, backed by a simple table or
  in-memory store with TTL (no need for Redis at this scale).
- Rotate session token on any privilege change (password reset, role change).
- `SameSite=Lax` cookies; CSRF token required on all mutating routes
  (POST/PUT/DELETE) that rely on cookie auth.
- Audit every route added since v3 (follows, likes, comments, blocks,
  circles, movie-night sessions) for the same auth checks applied
  consistently — write one `requireAuth()` / `requireOwnership()` middleware
  and confirm every mutating route actually uses it, don't assume.

---

## TRACK H — SEO / PWA / discoverability

- `app/opengraph-image.tsx` — dynamic OG image per title page (poster +
  CinePulse Score overlay is a nice touch, but a static branded card is a
  fine v1).
- `app/sitemap.ts` — every public title page, public user profile, and
  static route.
- `app/robots.ts` — disallow private/auth-only routes explicitly.
- PWA manifest (`manifest.json`) + icons — installable on mobile, matters
  given the mobile bottom nav already built in v5.
- Run Lighthouse, target ≥95 on SEO and accessibility; fix whatever it flags
  rather than chasing the score cosmetically.

---

## TRACK I — Free API fetcher wiring (turn the documented endpoints into real code)

Build `lib/fetchers/base.ts` first — every provider below goes through it:
timeout (8s), retry with backoff + jitter (max 3), per-provider token-bucket
rate limiter, ETag support, cache in the DB from Track E keyed by
`(provider, endpoint, params_hash)` with a per-provider TTL. Never call a
provider directly from a route handler — always through this wrapper, so
adding a new provider later is one file, not a new pattern.

Wire these in priority order (impact per hour of work, from the earlier doc):

1. **Wikidata → Wikipedia pageviews** (both keyless). Resolve TMDB→IMDb→
   Wikidata→Wikipedia title once per new title, cache the mapping forever.
   Pull daily pageviews for the 60 days pre-release; compute total views,
   7-day slope, peak-to-release ratio as features feeding Track D's model.
2. **YouTube Data API** — get the trailer's video ID from TMDB's own
   `/movie/{id}/videos` (free with your existing key) then call
   `videos.list?part=statistics` (1 unit/call). Snapshot view/like/comment
   counts daily into a `trailer_stats` table.
3. **OMDb** — free key, 1,000 req/day. Adds IMDb/RT/Metascore ratings TMDB
   lacks. Cache 7 days for released titles, 24h for upcoming; on quota
   exhaustion serve stale cache with a `stale: true` flag, never crash.
4. **Reddit public JSON** (keyless) — mention volume + sentiment for hype
   features. Set a real `User-Agent` or expect 429s.
5. **TVmaze + Jikan** (both keyless) — TV series and anime coverage, natural
   catalog expansion, near-zero integration cost.

Every provider must degrade gracefully per the original constraint: missing
key → log once, disable that signal, mark it `null` in the API response,
never throw an unhandled error that takes down a title page.

---

## SEQUENCING

```
Track D (model)      → do first, everything else's numbers depend on it being real
Track E (deploy)      → do second, needed before real users touch F/community features
Track F (scoring)     → depends on D (needs the model to compare against) and E (needs real deploy for the cron job)
Track G (security)    → anytime, but before any public launch
Track H (SEO/PWA)     → anytime, cheap, low risk
Track I (free APIs)   → improves Track D's features; can start in parallel with D1 since D1 needs these signals too
```

## DEFINITION OF DONE

`docs/model-report.md` exists with real MAE/Brier numbers from a date-split
backtest. The app deploys to Vercel from a clean checkout with only
`.env.example` filled in. A resolved community call updates both a user's
and the model's Brier score visible on `/leaderboard`. Login is rate-limited
and every mutating route requires auth+ownership via one shared middleware.
Lighthouse SEO/a11y ≥95. At least Wikidata+Wikipedia pageviews are live and
feeding Track D's feature vector.

## HOW TO WORK

Report on Track D's honest status first — heuristic or real model — before
anything else. Then confirm Track E is safe to do without data loss (back
up whatever's in the current DB before migrating). One track per PR series,
same as before.
