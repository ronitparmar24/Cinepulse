# Changelog

> Version numbers follow `package.json`. The "9.0.0" and "10.0.0" headings below were
> feature-track labels shipped inside the 2.1.x line.

## 2.4.0 — Security fix, diary, half stars, Letterboxd import (Phases 2–4)

- **Security (critical): session tokens could be forged.** Earlier versions accepted
  self-signed `cps_` session tokens and, when the session or user row was missing, re-created
  them from the token. The signing key fell back to a constant published in the repository, so
  anyone could sign in as any user. The same mechanism brought deleted accounts back and made
  logout ineffective. Now only a stored, unexpired session row signs a request in, and new tokens
  are 32 random bytes (only their hash is stored). After deploying, people whose session row was
  lost (e.g. in the old temporary database) are asked to sign in again. `verify-deploy.mjs`
  checks that a forged token is rejected.
- **Delete my account now deletes the account** (see above; covered by a new route test).
- Admin endpoints require a signed-in address listed in `ADMIN_EMAILS` (the AI community admin
  API was open to everyone).
- **Half-star ratings** (0.5–5) with an accessible star picker (slider semantics, keyboard).
- **Diary**: every viewing is logged with its date, rating, rewatch flag, tags and note
  (`/api/diary`); logging marks the film watched. Profile diaries show each viewing. Existing
  watched films were backfilled as one entry each.
- **Letterboxd import and export** (Account → Import). The export ZIP is read in the browser;
  films are matched to the catalogue by title and year, best guesses can be unticked, and the
  diary, ratings, reviews, likes and watchlist are written in batches. The import never
  overwrites a rating or review you already have, and running it again adds nothing twice.
  `GET /api/export/letterboxd.csv` writes your diary in Letterboxd's import format.
- Server-rendered `/film/<slug>` and `/tv/<slug>` pages with metadata and JSON-LD; sitemap
  links fixed (`/u/` profiles).
- Five-section navigation, 12px minimum text, 44px tap targets, self-hosted font, error and 404
  pages, lazy-loaded views (home page JS 255 → 177 KB gzip), axe-clean main views.
- Fixed: trending counts, case-insensitive search on Postgres, and the profile diary/watchlist.
- `TMDB_API_BASE` (ignored on Vercel) points the catalogue at a mock TMDB for offline
  end-to-end tests. `npm run test:integration` follows the emailed-code deletion flow.

## 2.3.0 — One persistent database (Phase 1)

- **Data no longer disappears on Vercel.** All tables live in Postgres when `DATABASE_URL` is a
  `postgres://` URL (Supabase recommended), in their own `cinepulse` schema. Without it, the local
  SQLite file is used, so offline development still works with no account.
- New async database client (`lib/db/client.ts`, `lib/db/drivers.ts`) with one portable SQL
  dialect, transactions that follow the async call chain, and automatic Postgres migrations
  (`migrations/pg/`) under an advisory lock. The stub LibSQL adapter, the second migration runner
  and the per-call `CREATE TABLE` statements are gone.
- Removed the duplicate writes to Supabase `public.library/reviews/forecasts`, which could drift
  from the main copy (and `deleteReview` left the local copy behind). Sign-in through Supabase
  Auth is unchanged.
- New commands: `npm run db:migrate`, `db:copy-sqlite`, `db:import-supabase`, `test:pg`,
  `lint:sql` (a static scan that rejects SQLite-only SQL).
- Bugs found and fixed while porting: trending films counted each title once per user who saved
  it; two-account sign-up races surfaced a raw database error instead of a 409; provider usage
  counters and a camelCase-alias query failed silently on Postgres; a conditional React hook in
  the box-office breakeven meter.
- `/api/*` is split from one 1,300-line file into nine modules under `lib/api/routes/`, behind a
  58-line dispatcher. URLs and responses are unchanged (verified by a 74-endpoint crawl on both
  databases).
- Security: a Content-Security-Policy with a per-request nonce (`proxy.ts`), HSTS, the session
  token is no longer returned in JSON or kept in `localStorage` (HttpOnly cookie only), and every
  write request is rate-limited per user/IP across instances (`WRITE_LIMIT_PER_MINUTE`, default 60).
- Startup configuration check (`lib/env.ts`, `instrumentation.ts`) logs misconfiguration by
  variable name.
- ESLint with type-aware async rules (no floating promises) and Prettier. CI runs every test on
  SQLite and Postgres.

## 2.2.0 — Security and foundations (Phase 0)

- **Security — account takeover closed.** The demo Google login (`POST /api/auth/google/demo`,
  `GET /api/auth/google?demo=1`, and the fallback when Google OAuth is not configured) signed in
  as any posted email, including existing accounts. `GET /api/auth/otp/preview` returned the most
  recent OTP sent to anyone. OTP requests returned the code in the response whenever no email
  provider delivered it. All of these now work only in local development (`lib/auth/devAuth.ts`);
  in production they return 404, or 503 when email cannot be sent.
- Removed the mock "Sign in with Google" account picker. The Google button appears only when real
  Google OAuth credentials are configured.
- Cloudflare Turnstile is required on sign-in, sign-up and OTP requests whenever both
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set; the widget is rendered in
  the auth dialog.
- All `/api/cron/*` routes share one constant-time `CRON_SECRET` check, accept GET (what Vercel Cron
  sends — `resolve-calls` previously accepted only POST and never ran), and refuse in production
  when no secret is configured instead of trusting a forgeable `X-Forwarded-For`.
- Security updates: Next.js 16.3.5 → 16.4.6 (critical advisories incl. RCE in `next/og`),
  nodemailer → 10.6.0, sharp, source-map-js. `npm audit --omit=dev`: 0 vulnerabilities.
- `npm test` runs every `tests/*.test.ts` file (2 were previously skipped) and each test process
  uses its own temporary database instead of `data/cinepulse.db`.
- CI workflow (`.github/workflows/ci.yml`): typecheck, tests, build and audit on every PR.
- AI-tick workflow reads `APP_URL` from a secret and fails on a non-2xx response.
- Node pinned to 22 (`engines`, `.nvmrc`, Dockerfile). Prompt files moved to `docs/prompts/`.
- The deploy bundle includes only `data/*.json`, never SQLite files.

## 10.0.0 — "Interested / Not Interested" Feedback Loop & Taste Affinity Engine

- **One-Tap Feedback Controls (`components/FeedbackControls.tsx`):**
  - Instant optimistic UI across recommendation cards (Personalized strip, WhyThisMovie, Explore trending, Movie Night ballots, and Taste Onboarding).
  - Tapping Interested immediately pulses the card and adapts recommendations.
  - Tapping Not Interested animates the card out, slides in a fresh replacement candidate from `nextSuggestion`, and displays a 6-second Undo banner with countdown timer.
  - One-tap "Tell us why" chips (Not my genre, Too violent, Seen it, Not into actor/director, Wrong language).
- **Learned Taste Affinity Vector (`lib/feedback/`):**
  - Exponential time decay with configurable half-life (default 45 days, `FEEDBACK_HALF_LIFE_DAYS`).
  - Strict mathematical clamping within [-5.0, +5.0] so single taps never overpower a whole profile.
  - Reason-specific targeting: `seen_it` is completely neutral for taste vectors, `not_into_actor_director` lowers only person features, `not_my_genre` targets genres.
- **Dynamic Reranking & Bubble-Free Exploration (`lib/feedback/rerank.ts`):**
  - Enforces ~15% exploration share ("Outside your usual taste") to prevent echo chambers.
  - Repetition penalty avoids 10 clones of the same genre.
  - Honest stored-data attribution reasons ("Because you liked Dune", "More like the sci-fi you're into", "Fewer horror picks since you said not interested", "Outside your usual taste").
- **Cold-Start Support:**
  - New users with 0 reviews get non-empty personalized recommendations after 5 feedback taps.
  - Instant 8-anchor onboarding calibration widget in Taste DNA view.
- **Your Taste Panel (`components/YourTastePanel.tsx`):**
  - Surfaces what the user is into and what is suppressed with one-click chip removal.
  - "Reset My Recommendations" action with double-confirmation dialog.
  - Available in Account Profile Dialog and Taste DNA view.
- **Real Social Proof & Hype Radar Integration:**
  - Aggregate real counts only (strictly hidden under 5, zero fabricated numbers).
  - Low-weight community interest feature incorporated into pre-release Hype Radar.
- **Guest / Anonymous Visitor Support:**
  - `localStorage` persistence and `?exclude=` query parameter for client-side reranking.
  - Automatic guest-to-account feedback merge on login.
- **Schema Version 13 Migration (`migrations/0010_interest_feedback.sql`):**
  - Added `interest_feedback`, `interest_feedback_events`, and `user_affinity` tables with complete SQLite and Supabase RLS policies.
  - Account export (`/api/export`) and deletion (`/api/account/delete`) include and clean all feedback and affinity records.

## 9.0.0 — "Ask CinePulse" Chatbot Upgrade

- Added floating "Ask CinePulse" drawer with glassmorphism UI, `/` keyboard shortcut, and mobile bottom sheet.
- Implemented real-time Server-Sent Events (SSE) streaming engine with Gemini Flash -> Groq -> Cloudflare -> Rule-based Lite fallback.
- Added 12 cinema tools (`search_titles`, `get_forecast`, `get_community_pulse`, `get_trending`, `compare_titles`, `mood_search`, `recommend_for_me`, etc.).
- Embedded rich UI cards for hit probability rings, head-to-head title comparisons, community sentiment bars, and action confirmations.
- Strict human-in-the-loop action verification for library writes and predictions.
- Schema version 12 database migration introducing `chat_threads`, `chat_messages`, `chat_daily_usage`, and `chat_minute_limits`.
- Comprehensive 25-prompt evaluation suite checking tool accuracy, cinema refusal, and zero fabricated numbers.

## 2.1.0 — local completion documentation

This release documents the completed local Cinepulse 2.1 source. No deployment or paid service is required.

### Connected application

- Retains the Next.js App Router + React + TypeScript + Node built-in SQLite architecture, with internal API routes and automatic local database creation.
- Adds/records schema 3 additive migration behavior, bounded maintenance, refusal of unsupported newer databases, and whole-folder backup/restore guidance.
- Applies one release-eligibility policy to movies and TV: future/unknown dates allow watchlist and first impressions, but not watching, watched, ratings, or released-title review ratings.
- Keeps duplicate-registration conflicts controlled and account data private.

### Catalog and provider honesty

- Documents demo/TMDB separation, server-only TMDB credentials, optional `TMDB_LANGUAGE`, cache-key scope, and the opt-in `npm run check:tmdb` smoke check.
- Adds provider-health states: configured, checking, verified reachable, and unavailable. Reachability is a snapshot, not a completeness guarantee.
- Documents search/collection/genre semantics, mixed-source ordering caveats, loaded-release calendar wording, strict dates, and missing-data behavior.
- Uses bounded retry behavior for appropriate transient provider failures and does not silently substitute fictional data after a live error.

### UX and privacy

- Documents shareable URL state for views, titles, and all three detail tabs, including Back/Forward and focus behavior.
- Documents keyboard tab behavior, edit/spoiler review flows, destructive library-removal confirmation, recoverable writes, and the latest-50 community limit.
- Documents export/deletion boundaries, private forecast reasoning, local plaintext database risk, and no seeded account/community activity.

### Verification and limitations

- `README.md`, `.env.example`, `docs/CONNECTIONS.md`, and `docs/REMAINING-WORK.md` explain local setup and remaining work.
- See `TEST-REPORT.md` for actual verification results. Live TMDB verification is blocked until the owner enters a token locally; no credential is included.
- Public launch, password recovery/email, moderation, physical-device/accessibility review, and validated prediction-model work remain outside this local release.
