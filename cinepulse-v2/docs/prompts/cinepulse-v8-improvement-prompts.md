# CinePulse v8 — Honest Model, Unique Data Moat, India-First Features

Paste into Antigravity (or Claude Code) **after v7**. Each TRACK is a standalone prompt:
paste one at a time, run `npm run typecheck && npm test` after each, commit, then move on.

**Before every track, tell the agent:**
> Read `AGENTS.md` first (this Next.js version has breaking changes — check
> `node_modules/next/dist/docs/` before writing routes/components). Then read the files listed
> under "Read first" in the track. Do not invent data. If a provider returns nothing, show the
> existing "evidence unavailable" state instead of a made-up number.

---

## PART 1 — What I found in the repo (why these tracks exist)

| # | Finding | Where | Why it matters |
|---|---------|-------|----------------|
| 1 | Training set is **59 titles, 91.5% are "hits"** | `data/training.csv` | A classifier on this almost always says "hit". The out-of-time rows in the model report all show 92% (the cap). Reliability table has **0 samples** in every bin below 75%. |
| 2 | `competing_release_count` is **`Math.random()`** at training time, but is the **#2 classification weight (+0.8488)** | `scripts/build-training-set.ts:259`, `docs/model-report.md` | The model learned noise and reports it as a "top predictive feature". At inference it is hard-coded to `2`. |
| 3 | More hard-coded inputs at inference: `director_prior_median_rev: 400`, `cert_pg13: 1`, `sequel_index` (1 or 2), `cast_star_power` = TMDB popularity × 1.5 | `lib/prediction/model.ts:50-82` | Every title gets the same director/cert signal, so those weights do nothing. |
| 4 | Wikipedia / YouTube / Reddit / OMDb features are fetched but **never enter the model** (`featureMap` has none of them). They only move the confidence label and the explanation. | `lib/prediction/features.ts`, `model.ts` | You pay latency for hype data that doesn't change the number. |
| 5 | Explanation multipliers (`genreMultiplier 1.3`, `seasonMultiplier 1.2`, `franchiseBoost 1.4`) are hand-tuned and **not the model's coefficients** | `lib/prediction/model.ts:147-151` | The "why" panel can disagree with the actual prediction. |
| 6 | Test Brier `0.0080` is on **10 titles** | `docs/model-report.md` | Too small to claim; an interviewer will spot it. |
| 7 | Docs contradict code: `DATA-SOURCES.md` says YouTube/OMDb/TVmaze/Reddit are "not connected", `REMAINING-WORK.md` says "not an AI model", README says "AI heuristic prediction engine", but fetchers and a ridge+Platt model exist | `docs/*`, `README.md` | Pick one honest story. |
| 8 | `CINEPULSE_SOCIAL_FEATURES.md` specifies **FastAPI + MongoDB + Redis + Elasticsearch**; the app is **Next.js + node:sqlite** | `CINEPULSE_SOCIAL_FEATURES.md` | AI coding tools read it and drift toward the wrong stack. |
| 9 | Session/circle codes use `Math.random()` | `lib/movieNight.ts:47`, `lib/circles.ts:56` | Guessable join codes. Use `crypto.randomInt`. |

Strengths worth keeping (and showing off): provider fetcher with caching + token buckets + retries,
temporal split, Platt calibration, Brier scoring, Taste DNA, Contrarian Desk, Movie Night voting,
migrations, Playwright + a11y tests, CI.

---

## TRACK K — Make the model honest (P0, do this first)

**Read first:** `scripts/build-training-set.ts`, `scripts/train_model.py`, `lib/prediction/model.ts`,
`lib/prediction/features.ts`, `docs/model-report.md`, `data/model-weights.json`.

**Goal:** a smaller claim that is *true*, with real features, a bigger dataset and abstention.

### K1. Bigger, balanced dataset
- Replace the 59-row hand list with a pipeline that builds ≥ 3,000 rows from **free** sources:
  the Kaggle/`TMDB movies` public dump (or TMDB discover pages) filtered to `budget > 1_000_000`
  and `revenue > 0`, release 2005+. Cache raw responses under `data/raw/` (git-ignored).
- Fill missing budget/revenue from **Wikidata** (`P2130` cost, `P2142` box office) through the
  existing `lib/fetchers/wikidata.ts`. Record `source` per row.
- Report class balance in the script output. Define "hit" as `revenue >= 2.5 * budget` **but**
  also log a second label `profit_ratio` so we can model the ratio, not just a binary.
- Include flops: explicitly sample titles with ratio < 1.5 so hits are not > 65% of rows.

### K2. Remove every fake feature
- Delete `Math.random()` from the builder. Compute `competing_release_count` for real:
  number of wide releases (TMDB `discover/movie` with `primary_release_date` in ±14 days,
  same region, `popularity` above a threshold). Same function must be used at inference.
- Compute `director_prior_median_rev` from the director's earlier films **released before** this
  title only (point-in-time — no leakage). Same function at inference.
- Real `cert` from TMDB `release_dates` (region-aware). Real `sequel_index` from
  `belongs_to_collection` order. Delete the hard-coded `400`, `2`, and `cert_pg13: 1`.
- Add a unit test: **training features and inference features come from one shared module**
  (`lib/prediction/featureBuilder.ts`). Fail the build if the two diverge.

### K3. Evaluation that can embarrass the model
- Rolling-origin (expanding window) CV by year, not one split. Report MAE in log-space **and**
  the median multiplicative error ("typically off by 1.4×").
- Calibration: isotonic regression or binned reliability with ≥ 30 samples per bin; show a
  reliability diagram image generated into `docs/` by `train_model.py`. Drop any bin < 30.
- Baselines: always compare against (a) "budget × 2.5" and (b) genre-median ratio. If the model
  does not beat both out-of-time, say so in `model-report.md`.
- Never print a Brier score computed on < 100 titles without a bold "small sample" warning.

### K4. Abstain instead of guessing
- If budget is missing **or** release is > 180 days out **or** feature coverage < 60%, return
  `status: "insufficient-evidence"` (no percentage). Cap hit probability to `[0.05, 0.95]` only
  after calibration, not as a cosmetic clamp.
- UI: `ForecastPanel` / `PredictionWaterfall` must render the abstain state with *which inputs
  were missing*.

### K5. Make the explanation the model
- Replace the hand-tuned multipliers in `model.ts:147-151` with per-feature contributions
  `coef × (value − mean)` from the actual ridge/logistic model (a real waterfall). Sum of
  contributions + intercept must equal the prediction; add a test for that identity.

**Acceptance:** `npm run build:training && npm run train:model` is reproducible; `model-report.md`
regenerates itself with the new numbers and a "limitations" section; no `Math.random` in any
prediction path (`grep` test); typecheck + tests green.

---

## TRACK L — Point-in-time snapshots (your unique data moat)

**Read first:** `lib/fetchers/*.ts`, `lib/prediction/features.ts`, `lib/cron/resolveCalls.ts`,
`lib/db/adapters`, `migrations/`.

Live APIs only give "now". To *train* on hype you need what the hype looked like **before**
release. So collect it yourself.

- Migration `0009_hype_snapshots.sql`: `hype_snapshots(title_id, taken_at, wiki_views_7d,
  wiki_slope, yt_views, yt_likes, yt_comments, tmdb_popularity, tmdb_vote_count, trakt_watchers,
  reddit_mentions)` with a unique `(title_id, date(taken_at))`.
- `lib/cron/snapshotHype.ts`: for every upcoming title in the next 120 days, store one row per
  day. Idempotent, rate-limited through the existing token buckets, never throws.
- Hook it to a route `app/api/cron/snapshot` protected by `CRON_SECRET`, and add a GitHub Action
  (`.github/workflows/snapshot.yml`, daily) — free cron without a server.
- Add features `wiki_slope_28d`, `yt_view_velocity_7d`, `popularity_delta_14d` computed **only
  from rows with `taken_at <= release_date − 14d`**. These become real model inputs in Track K
  once you have ~8 weeks of data.
- UI: a **"Hype Radar"** sparkline card on `TitleDetail` (Wikipedia views + trailer views over
  time), with a tooltip that says exactly which source and date range.

**Acceptance:** snapshot job is idempotent (test), snapshot features never read data after the
cutoff (test), Hype Radar renders an empty state when < 3 data points.

---

## TRACK M — India-first release calendar and "Where to watch"

You are in India; most clones of this idea ignore it. Make that your angle.

**Read first:** `lib/catalog.ts`, `components/Discovery.tsx`, `components/ExplorePage.tsx`,
`lib/fetchers/currency.ts`, `.env.example` (`TMDB_REGION`).

- Region switcher (IN default if browser locale is `en-IN`, else US) stored in the user profile.
- Language filter chips: Hindi, Gujarati, Tamil, Telugu, Malayalam, Kannada, Bengali, English
  (`with_original_language`). A "Regional cinema" row on the home page.
- **Where to watch:** TMDB `/movie/{id}/watch/providers` → show Flatrate / Rent / Buy for the
  selected region with provider logos. TMDB requires **JustWatch attribution** — render the
  required credit text next to it.
- Show box office in both USD and INR using the existing Frankfurter fetcher, labelled with the
  rate date (`≈ ₹1,660 cr at 4 Oct 2026 rate`). Never present a converted value without the date.
- Movie Night integration: add toggle **"Only titles on our platforms"** — candidates are
  filtered by the providers each participant selected.
- Release calendar view: week-by-week grid of upcoming releases for the chosen region, with the
  `competing_release_count` from Track K shown per week ("3 big films this Friday").

**Acceptance:** switching region changes dates + providers, empty providers show a clear
"not streaming in your region yet" state, attribution visible, Playwright test for the region
switch.

---

## TRACK N — Cinemas near you (replace any static map data)

**Read first:** `lib/cinemaMap.ts`, `components/CinemaMapView.tsx`, `tests/cinema-map.test.ts`.

- If the map uses a static list, switch to **OpenStreetMap Overpass** query `amenity=cinema`
  around the user's coordinates (browser geolocation, opt-in; fallback: city typed by user via
  **Nominatim** — respect its 1 req/s policy and send a proper `User-Agent`).
- Cache results 24h in the existing cache table. Show name, address, website if present.
- Be honest: OSM has no showtimes. Link out to the cinema's website; do **not** scrape
  BookMyShow. Label the card "Cinemas from OpenStreetMap — showtimes on their site".
- Use **Leaflet + OSM tiles** (free; keep the attribution control on).

**Acceptance:** works with geolocation denied, rate-limit-safe, attribution visible, tests mock
Overpass responses.

---

## TRACK O — Public track record ("Receipts") — your signature feature

**Read first:** `lib/accuracy/backtest.ts`, `lib/cron/resolveCalls.ts`, `lib/pulse/adjudication.ts`,
`components/AccuracyView.tsx`, `components/LeaderboardView.tsx`, `lib/db.ts` (`realUsersOnly()`).

Most prediction apps hide their misses. Make CinePulse publish them.

- When a title's revenue becomes known (TMDB `revenue` or Wikidata `P2142`), auto-resolve:
  store `{predicted p10/p50/p90, hit prob, actual, hit/flop, resolved_at, model_version}`.
- **Receipts page** `/receipts`: three tracks side by side — *Model*, *Community crowd*,
  *Top forecasters* — with Brier score, hit rate, and a *"We were wrong about…"* section listing
  the biggest misses with the one-line reason (largest feature contribution).
- Each forecast gets a permalink + OG image (reuse `app/opengraph-image.tsx`) showing
  "Called it ✅ / Missed ❌" — shareable.
- Forecaster leaderboard uses `realUsersOnly()` and needs ≥ 10 resolved calls to rank.
- Version everything: a new model version never rewrites old receipts.

**Acceptance:** resolver is idempotent, receipts never include seeded users, a missed prediction
renders as prominently as a correct one (visual test).

---

## TRACK P — Spoiler-safe AI layer (Gemini / Groq free tiers)

**Read first:** `lib/fetchers/gemini.ts`, `lib/fetchers/groq.ts`, `lib/fetchers/base.ts`.

- **Critical consensus**: summarise *only text you actually have* (TMDB reviews + CinePulse
  reviews). Return JSON `{summary, praise[], criticism[], vibeTags[], spoilerRisk}`; validate
  with a schema, retry once, then fall back to the heuristic. Cache 7 days per title+hash of
  inputs. Show a small "AI-generated from N reviews" label and the provider name.
- **"Why this movie for me"** (`WhyThisMovie.tsx`): feed Taste DNA numbers (not raw reviews) to
  the model and require it to reference at least two real stats from the input; reject outputs
  that don't (cheap string check) and fall back to the rule-based text.
- **Mood search**: natural-language box ("slow-burn thriller under 2 hours, no gore") → LLM turns
  it into structured filters (`genres`, `maxRuntime`, `excludeKeywords`, `era`) → **your own**
  catalog query runs. The LLM never invents titles.
- Prompt-injection guard: review text is wrapped in delimiters and the system prompt says to
  treat it as data. Add a test with a review that says "ignore previous instructions".
- Budget guard: per-user daily cap and a global kill switch env `AI_ENABLED=false`.

**Acceptance:** works with no keys (fallbacks), invalid JSON never crashes the UI, injection test
passes.

---

## TRACK Q — Stronger Taste DNA / social differentiators

**Read first:** `lib/tasteDna.ts`, `lib/tasteMatch.ts`, `lib/recommendations.ts`,
`components/TasteDnaView.tsx`, `lib/social/differentiators.ts`.

- **Taste Blend** for two users or a Watch Circle: intersection of genres/eras/creators, a
  "disagreement meter" (where you two differ most), and 5 picks maximising *minimum* predicted
  enjoyment (not average) — feeds Movie Night.
- **Year in Pulse** (Spotify-Wrapped style): shareable image/OG card — top genre, most
  contrarian rating vs. community, forecast accuracy, longest watch streak.
- **Blind-spot nudge**: "You've rated 0 films before 1980 — here are 3 with high taste-match."
- Recommendations: add a free **MovieLens** (GroupLens, research licence — read the terms) item
  co-occurrence table as an offline-built `data/item-similarity.json`, so cold-start users get
  "people who liked X also liked Y" before they have any ratings of their own. Label the source.
- Explainability: every recommendation shows its top reason and the number behind it.

**Acceptance:** works with a brand-new user (cold start) and a heavy user, no seeded users in any
public stat, tests for the blend maths.

---

## TRACK R — Hygiene, security and portfolio polish (cheap, high value)

1. Replace `Math.random()` in `lib/movieNight.ts` and `lib/circles.ts` with `crypto.randomInt`,
   lengthen codes to 8 chars, add expiry + attempt rate-limit.
2. Rewrite `CINEPULSE_SOCIAL_FEATURES.md` for the **actual** stack (Next.js + node:sqlite +
   Supabase option); delete the Mongo/Redis/Elasticsearch/Celery sections or move them to
   `docs/archive/`.
3. Reconcile `README.md`, `DATA-SOURCES.md`, `REMAINING-WORK.md`: one table listing every
   provider, its key, its free limit, and whether it feeds the model or only the UI.
4. Add `docs/ARCHITECTURE.md` with one diagram (request → route → lib → db → fetchers) and a
   "Model card" link. Add GitHub topics + a repo description (currently empty) and 4 screenshots
   to the README.
5. CI: add `npm run build` and the Playwright a11y job to `.github/workflows/ci.yml` if not
   already there; add `npm audit --omit=dev` as a non-blocking step.
6. Add a seeded **demo video/GIF** to README (you edit video — use it, it sets this repo apart).

---

## PART 2 — Free APIs to integrate (check each provider's current limits/terms before shipping)

| API | Key? | Use it for | Notes |
|-----|------|-----------|-------|
| **TMDB** (already used) | Free token | Catalog, `watch/providers`, `release_dates`, `discover` (competition), collections | Attribution + JustWatch credit required; non-commercial tier |
| **Wikipedia Pageviews** (already) | No | Hype Radar, slope features | Needs a descriptive `User-Agent` |
| **Wikidata SPARQL** (already) | No | Fill budget/box-office (`P2130`, `P2142`), awards, director filmography | Fill gaps for training set |
| **OMDb** (already) | Free key | IMDb/RT/Metascore post-release | 1,000 req/day free tier |
| **YouTube Data API** (already) | Free key | Trailer views/likes/comments snapshots | Daily quota; store snapshots (Track L) |
| **Trakt** | Free client id | Trending/anticipated lists, watchers count, calendars | Great hype proxy; OAuth only for user data |
| **TVmaze** (already) | No | TV schedules, episode air dates | Rate-limited, be polite |
| **Jikan** (already) | No | Anime titles | 3 req/s |
| **Overpass + Nominatim (OSM)** | No | Cinemas near you, geocoding | Respect usage policies, show attribution |
| **Open-Meteo** | No | "Rainy-day watchlist" nudge (weather-aware picks) | Fun, cheap, unique |
| **Frankfurter** (already) | No | USD ↔ INR box office | Always show rate date |
| **Gemini / Groq / Hugging Face** (already wired) | Free tiers | Consensus, mood search, sentiment | Add caching, caps, `AI_ENABLED` switch |
| **GDELT** | No | News volume/tone around a title (hype proxy) | Heavy responses; cache hard |
| **MovieLens (GroupLens)** | Dataset | Offline similarity table for cold start | Research licence — read terms |
| **Internet Archive** | No | Public-domain film pages with embedded players | Legal free-to-watch row |

Skip: scraping BookMyShow/IMDb/Letterboxd/Box Office Mojo (no API, terms risk), and Reddit unless
you register an OAuth app (anonymous access is unreliable now).

---

## PART 3 — Suggested order (4 weekends)

1. **Weekend 1:** Track K (honest model) + Track R items 1–3. This alone makes the project
   interview-proof.
2. **Weekend 2:** Track L (start snapshotting immediately — data only accumulates with time!) +
   Track M.
3. **Weekend 3:** Track O (Receipts) + Track P.
4. **Weekend 4:** Track Q + Track N + README/video polish.

> **Extra Fundas (interview angle):** lead with *"my model abstains when evidence is missing and
> I publish my misses."* Leakage (using post-release data to predict pre-release outcomes), class
> imbalance (91% hits) and small-sample Brier are the exact traps interviewers probe — Track K
> fixes all three, so you can explain them with your own repo as the example.
