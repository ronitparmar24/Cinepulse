# CinePulse QA Audit — Phase 2: Environment Parity Audit

**Audit Timestamp**: 2026-10-24 00:41 IST  
**Local Base URL**: `http://127.0.0.1:3000`  
**Deployed Base URL**: `https://cinepulse-kohl.vercel.app`  

---

## 1. Environment Variables Audit

Every environment variable referenced across the codebase (`process.env.*`) was audited against `.env.example`, `.env.local`, and observed runtime behavior on `DEPLOYED_URL`.

| Variable | Used In | Set Locally (.env.local) | Observed Deployed Status | Client/Server Boundary | Parity Status | Notes |
|---|---|---|---|---|---|---|
| `CATALOG_MODE` | `lib/catalog.ts` | `tmdb` | `tmdb` | Server-only | **OK** | Both environments running in TMDB live catalog mode. |
| `TMDB_READ_TOKEN` | `lib/catalog.ts` | Configured | Configured | Server-only | **OK** | Reachable and verified on both environments. |
| `TMDB_REGION` | `lib/catalog.ts` | `US` | `US` | Server-only | **OK** | Defaults to `IN` if unset; configured to `US`. |
| `TMDB_LANGUAGE` | `lib/catalog.ts` | Unset (default) | Unset (default) | Server-only | **OK** | Falls back cleanly to TMDB default. |
| `TMDB_API_READ_ACCESS_TOKEN` | `SUPABASE-AND-VERCEL-DEPLOYMENT.md` | Unset | Unset | Docs only | **MISMATCH** | **Bug in documentation**: Deployment guide lists `TMDB_API_READ_ACCESS_TOKEN`, but codebase strictly reads `TMDB_READ_TOKEN`. |
| `APP_ORIGIN` | `lib/auth.ts` | `http://127.0.0.1:3000` | Configured / Derived | Server-only | **OK** | Enforces CSRF origin checks on mutations. |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase.ts` | `https://lhymjvrpzyktgftlmvft.supabase.co` | `https://lhymjvrpzyktgftlmvft.supabase.co` | Client & Server (`NEXT_PUBLIC_`) | **OK** | Correct prefix for Next.js public client exposure. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabase.ts` | Configured | Configured | Client & Server (`NEXT_PUBLIC_`) | **OK** | Public publishable key. |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase.ts` | Configured | Configured | Server-only | **OK** | Grep of `.next/static` verified **zero** leaks to client bundle. |
| `SESSION_SECRET` / `APP_SECRET` | `lib/auth.ts` | Unset in `.env.local` | Unset / Fallback | Server-only | **MISMATCH** | Not defined in `.env.example` or `.env.local`. Falls back to hardcoded default `'cinepulse-persistent-session-secret-key-v1'`. |
| `CRON_SECRET` | `app/api/[...path]/route.ts` | Unset | Unset / Optional | Server-only | **MISMATCH** | If unset, `/api/cron/*` endpoints do not enforce authorization headers. |
| `TURNSTILE_SECRET_KEY` | `lib/auth/turnstile.ts` | Configured | Configured | Server-only | **MISMATCH (S1)** | Secret is set, which activates mandatory Turnstile token checks on `/api/auth/login` and `/api/auth/register`. |
| `VITE_TURNSTILE_SITE_KEY` | `.env.local` | Configured | Unknown | **Violation** | **MISMATCH (S1)** | Named with `VITE_` prefix instead of `NEXT_PUBLIC_`. In Next.js, this variable is inaccessible to the browser. Furthermore, no React component renders the Turnstile widget. |
| `DATABASE_PATH` | `lib/db.ts` | Unset (defaults to `./data/cinepulse.db`) | `/tmp/cinepulse.db` | Server-only | **MISMATCH (S1)** | On Vercel, writes to ephemeral `/tmp/cinepulse.db`. |
| `YOUTUBE_API_KEY` | `lib/fetchers/youtube.ts` | Configured | Configured | Server-only | **OK** | 10,000 units quota tracking active. |
| `OMDB_API_KEY` | `lib/fetchers/omdb.ts` | Configured | Configured | Server-only | **OK** | 1,000 req/day quota tracking active. |
| `GEMINI_API_KEY` | `lib/ai/complete.ts` | Configured | Configured | Server-only | **OK** | Verified via test call. |
| `GROQ_API_KEY` | `lib/ai/complete.ts` | Configured | Configured | Server-only | **OK** | Redundancy fallback tier active. |
| `HF_TOKEN` | `lib/fetchers/huggingface.ts` | Configured | Configured | Server-only | **MISMATCH** | Hugging Face returns `HTTP 402` (payment/quota limit reached). |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | `lib/fetchers/cloudflare.ts` | Configured | Configured | Server-only | **OK** | Seamless fallback active when HF returns 402. |
| `GNEWS_API_KEY` | `lib/fetchers/news.ts` | Configured | Configured | Server-only | **OK** | 100 req/day quota tracking active. |
| `TRAKT_CLIENT_ID` | `lib/fetchers/trakt.ts` | Configured | Configured | Server-only | **OK** | Verified operational. |
| `STREAMING_AVAIL_KEY` | `lib/fetchers/streaming-availability.ts` | Configured | Configured | Server-only | **MISMATCH** | RapidAPI returns `HTTP 403` (subscription required). Native Watchmode handles fallback. |
| `WATCHMODE_API_KEY` | `lib/fetchers/watchmode.ts` | Configured | Configured | Server-only | **OK** | Verified operational. |
| `FANART_API_KEY` | `lib/fetchers/fanart.ts` | Configured | Configured | Server-only | **OK** | Verified operational. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | `lib/providers/upstash.ts` | Configured | Configured | Server-only | **OK** | Distributed rate limits and caching active. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | `lib/mailer.ts` | Configured | Configured | Server-only | **OK** | Verified connection to Gmail SMTP. |
| `RESEND_API_KEY` | `lib/mailer.ts` | Configured | Configured | Server-only | **OK** | Fallback email service configured. |

---

## 2. Supabase Parity & Security Audit

### 2.1 Table and RLS Coverage
- Ran `scripts/verify-supabase-schema.mjs` against live Supabase endpoint `https://lhymjvrpzyktgftlmvft.supabase.co`.
- All **25 tables** verified present in schema with **RLS enabled**:
  - `profiles`, `library`, `reviews`, `forecasts`, `forecast_events`, `api_cache`, `predictions_log`, `user_call_scores`, `follows`, `privacy_settings`, `activity_events`, `likes`, `comments`, `blocks`, `notifications`, `taste_dna_cache`, `user_badges`, `title_links`, `pageview_stats`, `trailer_stats`, `movie_night_sessions`, `movie_night_participants`, `circles`, `circle_members`, `analytics_events`.
- Strict RLS policies verified:
  - `forecasts` immutability (no client update policy).
  - `api_cache` zero-client access policy (`USING (false)`).
  - `analytics_events` write-only client policy.
  - `activity_events` follower-only gating.

### 2.2 Client vs Server Key Usage
- Client-side code exclusively uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Server-side admin routes use `SUPABASE_SERVICE_ROLE_KEY` via `lib/supabase.ts` (`supabaseAdmin()`).
- Grep of the compiled `.next/static` JavaScript bundles confirmed:
  **Zero occurrences** of the service-role key string (`sb_secret_*`).

### 2.3 Auth Redirect URLs
- Tested `GET /api/auth/google` on deployed site `https://cinepulse-kohl.vercel.app`.
- Successfully returned `HTTP 307 Redirect` to Supabase OAuth:
  `https://lhymjvrpzyktgftlmvft.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fcinepulse-kohl.vercel.app`
- Supabase correctly accepted `https://cinepulse-kohl.vercel.app` as an authorized redirect URI and forwarded to Google Accounts login.

---

## 3. Serverless & Runtime Differences (Local vs Vercel)

### 3.1 Ephemeral Local Disk & Split-Brain State (CRITICAL)
- **Code**: `lib/db.ts` lines 828-842:
  ```ts
  if (process.env.VERCEL) {
    file = '/tmp/cinepulse.db';
    // copies ./data/cinepulse.db to /tmp/cinepulse.db
  }
  ```
- **The Problem**:
  - AWS Lambda / Vercel Serverless containers have **isolated, read-only, ephemeral** filesystems, with only `/tmp` writable.
  - `/tmp` is **not shared** across concurrent lambdas and is discarded on container recycle / cold start.
  - **Symptom 1**: If a user submits an OTP request via `/api/auth/otp/request`, the OTP code hash is written to `/tmp/cinepulse.db` on Lambda Instance A. When the user submits `/api/auth/otp/verify`, Vercel routes the request to Lambda Instance B. Instance B does not have the record, resulting in: `"No pending verification found for this email, or code expired."`
  - **Symptom 2**: Session tokens (`sessions` table) created on Instance A do not exist on Instance B. (Fortunately, CinePulse has a stateless HMAC fallback `cps_<payload>.<sig>`, which mitigates session loss, but database rows are still lost).

### 3.2 In-Memory State & Rate Limiting
- `lib/auth.ts`: `const attempts = new Map<string, {count:number; until:number}>();`
- `lib/providers/usage.ts`: module-level in-memory quota and error counters.
- On Vercel, in-memory state resets on cold starts and is not shared across lambda instances.
- Mitigation: Upstash Redis is configured in `.env.local` for distributed rate limiting, but local fallback `Map` is used when Redis is unreachable or for certain auth attempts.

### 3.3 Cron Jobs Scheduling
- The following cron endpoints exist in `app/api/[...path]/route.ts`:
  - `POST /api/cron/resolve-calls`
  - `POST /api/cron/snapshot`
  - `POST /api/cron/prewarm`
  - `POST /api/cron/ai-tick`
- **Audit Finding**:
  - There is **no `vercel.json`** in the repository.
  - No cron jobs are scheduled on Vercel. Consequently, hype snapshots, call resolutions, and cache prewarming **never execute automatically in production**.
  - If `CRON_SECRET` is unset, these endpoints can be invoked by anyone without authentication.

---

## 4. Network and Headers Parity

### 4.1 Security Headers
Configured in `next.config.ts`:
- `X-Content-Type-Options: nosniff` (Verified on both Local and Deployed)
- `Referrer-Policy: strict-origin-when-cross-origin` (Verified on both)
- `X-Frame-Options: DENY` (Verified on both)
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` (Verified on both)
- `Strict-Transport-Security`: Present on Deployed via Vercel (`max-age=63072000; includeSubDomains; preload`).

### 4.2 CSRF & Origin Enforcement
- `enforceOrigin` in `lib/auth.ts` validates incoming `Origin` and `Referer` against `APP_ORIGIN` or request host.
- **Bug Identified**: In `app/api/[...path]/route.ts`:
  ```ts
  if (method !== 'GET') enforceOrigin(request);
  ```
  `HEAD` requests are sent with `method === 'HEAD'`. Because `method !== 'GET'` evaluates to true, `HEAD` requests to read-only endpoints (e.g. `curl -I /api/auth/google`) fail with `403 Forbidden` unless an `Origin` header is explicitly passed.

### 4.3 Images & Remote Patterns
- `next.config.ts` does **not** declare `images.remotePatterns`.
- Codebase grep confirmed that `next/image` is **not imported**.
- All components use standard HTML `<img>` elements, which load remote images directly from TMDB (`image.tmdb.org`), Fanart (`assets.fanart.tv`), and Supabase Storage without Next.js Image Optimization host restrictions.

---

## 5. Caching Parity

- **Static Pages**:
  - Home route `/` is prerendered as static HTML (`○ /`).
  - Auth and user-specific state are fetched client-side by React hooks (`useAuth` calling `/api/auth/me`), ensuring logged-in user data is never leaked into static cached HTML.
- **Dynamic API Routes**:
  - `app/api/[...path]/route.ts` specifies:
    ```ts
    export const dynamic = 'force-dynamic';
    export const runtime = 'nodejs';
    ```
  - API responses carry `Cache-Control: public, max-age=0, must-revalidate` on Vercel, preventing stale API caching.
  - LLM outputs are cached deterministically by input content-hash in the `llm_cache` table.
