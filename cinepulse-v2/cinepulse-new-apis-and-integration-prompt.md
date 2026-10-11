# CinePulse — New Free APIs: Steps + Integration Prompt

You already have: TMDB, YouTube, OMDb, Gemini, Groq, HF, Cloudflare, GNews,
email. Below are additions that fill real gaps (not just "more APIs"), ranked
by impact. Free-tier limits change, so every number marked **(verify)** should
be checked in the provider's dashboard before you rely on it.

---

## PART 1 — Which APIs, and the gap each one fills

| # | API | Key? | Gap it fills | Priority |
|---|---|---|---|---|
| 1 | **Trakt** | Free client ID | Real "what people are tracking right now" signal: trending, *anticipated*, watcher counts, release calendar | ⭐⭐⭐ |
| 2 | **Streaming Availability API** (or Watchmode) | Free key | "Leaving soon" with real expiry dates; TMDB's providers endpoint can't do this | ⭐⭐⭐ |
| 3 | **Indian festival/holiday table** (seeded, or Calendarific) | None / free key | Holiday-window feature for the model. Diwali/Eid/Independence Day openings move Bollywood revenue far more than month alone | ⭐⭐⭐ |
| 4 | **YouTube commentThreads** (existing key) + **HF sentiment** (existing key) | Already have | Trailer *sentiment*, not just view counts. Costs 1 unit/call | ⭐⭐ |
| 5 | **Fanart.tv** | Free personal key | Logos, clearart, textless backgrounds — makes Movie Room hero look far better than TMDB posters alone | ⭐⭐ |
| 6 | **AniList** (GraphQL) | None | Anime coverage and popularity; complements Jikan | ⭐ |
| 7 | **Cloudflare Turnstile** (existing CF account) | Free site key | Bot protection on signup/login/forecast submit — part of the security track | ⭐⭐ |
| 8 | **Upstash Redis** | Free account | Real shared rate-limit counters + cache across serverless instances (in-memory counters reset on every cold start on Vercel) | ⭐⭐ |
| 9 | **Sentry** / **PostHog** | Free accounts | Error tracking and product analytics without building your own | ⭐ |

Things I would **not** add: more LLM providers (you have three), more rating
aggregators (OMDb covers it), anything requiring a credit card or business
verification.

---

## PART 2 — Step-by-step per API

### 1. Trakt
1. Create account at trakt.tv → Settings → Your API Apps → New Application.
2. Name it `CinePulse`, redirect URI `urn:ietf:wg:oauth:2.0:oob`, save.
3. Copy the **Client ID** → `TRAKT_CLIENT_ID` in `.env`. (Client secret is
   only needed for per-user OAuth, which you do not need.)
4. Every request needs headers:
   `trakt-api-key: <client_id>`, `trakt-api-version: 2`, `Content-Type: application/json`.
5. Test it:
   ```bash
   curl -H "trakt-api-key: $TRAKT_CLIENT_ID" -H "trakt-api-version: 2" \
     "https://api.trakt.tv/movies/anticipated?limit=10"
   ```
6. Endpoints that matter: `/movies/trending`, `/movies/anticipated`,
   `/movies/popular`, `/calendars/all/movies/{start_date}/{days}`.
   Anticipated returns `list_count` (how many users put it on a list) —
   that is a strong pre-release hype feature.
7. Limits: one catalogue lists 1000 unauthenticated GETs per 5 minutes.
   One catalogue also marked the service "dead" on a health check, so run
   the curl above first and confirm it responds before building on it.
8. Map Trakt → TMDB using the `ids.tmdb` field in every response; no
   separate ID resolution needed.

### 2. Streaming Availability API (expiry dates)
1. Sign up for the free plan (RapidAPI-hosted, no payment info needed per
   its README). Copy key → `STREAMING_AVAIL_KEY`.
2. It supports querying **upcoming and expiring titles** and returns expiry
   dates plus first-detection time. That expiry date is exactly what the
   v4 "Leaving streaming soon" mode needed.
3. Check the plan's quota in the dashboard **(verify)**.
4. **Alternative, Watchmode:** free key from api.watchmode.com/requestApiKey.
   Sources disagree on its free quota (2,500/month, 500/month, and 500/day
   all appear), so read your own dashboard **(verify)**. The free plan is
   non-commercial, requires attribution, and asks you refresh cached data
   within 30 days. Change feeds are paid-only.
5. Use one provider, not both. Pick Streaming Availability if expiry dates
   are the goal; Watchmode if broad availability is.

### 3. Indian festival table (no API needed)
1. Create `data/release-windows.json` with one row per year per festival:
   `{ name, date, region, weight }` — Diwali, Eid al-Fitr, Eid al-Adha,
   Holi, Independence Day, Republic Day, Christmas, Dussehra, Pongal,
   Onam, Ganesh Chaturthi.
2. Seed 2015–2027 once (lunar dates differ per year, so look them up once
   and commit the file; this is cheaper and more reliable than a live API).
3. Feature = days from release to nearest festival, plus a `festival_weight`
   (Diwali/Eid high, regional lower). Feeds Track D's Indian-verdict model.
4. If you later want a live source, Calendarific has a free tier **(verify
   limits)**; Nager.Date is keyless but check whether India is in its
   supported-country list before relying on it.

### 4. YouTube comments + HF sentiment (no new key)
1. `commentThreads.list?part=snippet&videoId={id}&maxResults=100&order=relevance`
   costs 1 unit, same as `videos.list`.
2. Run the top ~100 comments through HF
   `distilbert-base-uncased-finetuned-sst-2-english`, store
   `positive_ratio` and `sample_size`.
3. Weekly per upcoming title, never per pageview. Skip videos with comments
   disabled (the API errors; treat as `null`).
4. For Hindi/Hinglish comments the English model is weak. Drop comments
   under 3 words or mostly non-Latin, and flag `language_coverage` so the
   feature is down-weighted rather than trusted blindly.

### 5. Fanart.tv
1. Register at fanart.tv, create a personal API key → `FANART_API_KEY`.
2. `GET https://webservice.fanart.tv/v3/movies/{tmdb_id}?api_key=...`
3. Use `hdmovielogo` (title logo) and `moviebackground` in the Movie Room
   hero. Cache forever; artwork rarely changes.
4. Fallback chain: Fanart logo → TMDB `/images` logo → plain text title.

### 6. AniList
1. No key. POST GraphQL to `https://graphql.anilist.co`.
2. Query `Media(search: $q, type: ANIME)` for title, score, popularity,
   trending, format. Keep it behind your fetcher wrapper like everything else.

### 7. Cloudflare Turnstile
1. Cloudflare dashboard → Turnstile → Add site → get site key + secret key.
2. Client renders widget on signup, login, and forecast-submit forms.
3. Server verifies by POSTing token to
   `https://challenges.cloudflare.com/turnstile/v0/siteverify`.
4. Fail closed: no valid token, no write.

### 8. Upstash Redis
1. Create free Redis DB at upstash.com, copy REST URL + token.
2. Use `@upstash/ratelimit` for login (5 / 15 min / IP) and provider quota
   counters. This replaces the in-memory counters from the efficiency
   prompt, which silently reset on every serverless cold start.

---

## PART 3 — The integration prompt (paste into Antigravity)

````markdown
# ROLE
You are extending CinePulse's provider layer. Read `lib/providers/registry.ts`,
`lib/fetchers/base.ts`, and the existing `provider_usage` table first. If any
are missing, build them before adding anything below. Do not add a provider
that bypasses the shared fetcher wrapper.

# GROUND RULES
- Every new provider is one file in `lib/fetchers/`, one registry entry
  (daily quota, TTL, fallback), and one health-check row in `/api/health`.
- Missing key => log once, disable the signal, return `null`. Never throw
  into a page render.
- Never call a provider from a user request path. Nightly or weekly jobs
  fill tables; pages read tables.
- Verify each provider with one curl and record the real response shape in
  a comment before writing the Zod schema. Do not trust remembered shapes.
- Quotas marked (verify) in the plan: read the dashboard value and put it in
  the registry. Do not guess.

# TASK 1 — Trakt hype features
- `lib/fetchers/trakt.ts`: trending, anticipated, calendar.
- Nightly job stores `trakt_stats(title_id, date, list_count, watchers, rank_anticipated)`.
- Add to `features.ts`: anticipated rank, 14-day list_count slope.
- Homepage: "Most Anticipated" row from this table. Zero live calls.

# TASK 2 — Leaving soon
- `lib/fetchers/streaming-availability.ts` (or watchmode), nightly job
  stores `availability_expiry(title_id, service, region, expires_at)`.
- Implement the v4 "Leaving streaming soon" mode from that table only.
- If the provider returns no expiry for a title, omit it. Never fabricate a countdown.

# TASK 3 — Festival window feature
- Load `data/release-windows.json`; add `days_to_nearest_festival` and
  `festival_weight` to the Indian-verdict model's features.
- Retrain, then report in `docs/model-report.md` whether this feature
  improved the held-out (2024+) error. If it did not, say so and keep the
  report honest rather than keeping a feature for its story.

# TASK 4 — Trailer sentiment
- Weekly job: commentThreads (100) -> HF sentiment -> `trailer_sentiment`
  table with `positive_ratio`, `sample_size`, `language_coverage`.
- Gate: sample_size < 30 => `null`.

# TASK 5 — Fanart artwork
- `lib/fetchers/fanart.ts`; Movie Room hero uses logo+background with the
  three-step fallback chain. Cache indefinitely.

# TASK 6 — Turnstile + Upstash
- Add Turnstile verification middleware to signup, login, forecast submit.
- Swap in-memory rate-limit and quota counters for Upstash-backed ones.
  Keep an in-memory fallback if Upstash env vars are absent (dev mode).

# SCHEMA (Postgres/Supabase, RLS enabled on every table)
```sql
create table trakt_stats (
  title_id bigint not null, date date not null,
  list_count integer, watchers integer, rank_anticipated integer,
  primary key (title_id, date));
create table availability_expiry (
  title_id bigint not null, service text not null, region text not null,
  expires_at timestamptz not null, fetched_at timestamptz default now(),
  primary key (title_id, service, region));
create table trailer_sentiment (
  title_id bigint not null, week date not null,
  positive_ratio numeric, sample_size integer, language_coverage numeric,
  primary key (title_id, week));
alter table trakt_stats enable row level security;
alter table availability_expiry enable row level security;
alter table trailer_sentiment enable row level security;
create policy "public read" on trakt_stats for select using (true);
create policy "public read" on availability_expiry for select using (true);
create policy "public read" on trailer_sentiment for select using (true);
-- writes: service role only (no insert/update policies).
```

# DEFINITION OF DONE
`/api/health` lists every new provider with usage/quota. No page render makes
an external call. Each new model feature has a before/after error number in
`docs/model-report.md`. "Leaving soon" shows only real expiry dates.

# HOW TO WORK
One task per PR. Start by curl-testing Trakt and the streaming provider and
report the real responses and real quotas before writing any code.
````

---

## PART 4 — Suggested order

1. Festival table (30 minutes, no signup, biggest win for Bollywood accuracy)
2. Trakt (best new hype signal)
3. Upstash + Turnstile (do before any public launch)
4. Streaming expiry (unlocks the "leaving soon" row)
5. Trailer sentiment, Fanart (polish and extra signal)
6. AniList, Sentry/PostHog only if you actually need them
