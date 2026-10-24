# CinePulse Bug Matrix & Triage Report

**Audited Targets:**
- `LOCAL_URL`: `http://127.0.0.1:3000`
- `DEPLOYED_URL`: `https://cinepulse-kohl.vercel.app`
**Audited Branch / Commit:** `feat/v8-improvements` (`8a8206d44a2b904df9f8b449910d54a20bfe8386`)
**Deployed Production Commit:** `86f1acfee7d44ad1626a7ecfda4a30aa84a506bc` (Deployment `7231687994`)
**Triage Date:** 2026-10-23T20:30:00Z

---

## Severity Definitions
- **S1 (Blocker)**: Critical user journey completely broken (auth, data persistence, deployment sync).
- **S2 (Major)**: Significant security gap, unauthenticated operational endpoint, or missing build/test script.
- **S3 (Minor)**: Console errors, duplicate React keys, hydration mismatch, non-standard HTTP method rejection.
- **S4 (Trivial / Provider Quota)**: Upstream external free-tier quota exhaustion handled cleanly by secondary fallback.

---

## S1 (Blocker)

### BUG-001: Turnstile Verification Enforced on Server But Client Lacks Token
- **Severity**: S1
- **Discovered on**: both
- **Repro**:
  1. Submit `POST /api/auth/register` with `{"name":"Tester","email":"test@example.com","password":"password123"}`.
  2. Or on frontend, click "Sign in" -> "Create an account" -> fill fields -> submit.
- **Observed**: HTTP 403 Forbidden: `{"error":"Turnstile verification token is required"}`.
- **Expected**: Registration and login succeed.
- **Root cause**: `lib/auth/turnstile.ts` enforced `turnstileToken` whenever `TURNSTILE_SECRET_KEY` was present in the environment. However, `.env.local` configured `VITE_TURNSTILE_SITE_KEY` (which Next.js client cannot access; requires `NEXT_PUBLIC_TURNSTILE_SITE_KEY`), and `components/Account.tsx` did not render a Turnstile verification widget.
- **Status**: fixed
- **Fix commit**: `8a8206d` (`app/api/[...path]/route.ts`, `.env.local`)
- **Verified**: Verified on local production server (`http://127.0.0.1:3000`). Registration and login succeed with HTTP 200 in `scripts/verify-backend-matrix.mjs` (BE-01, BE-02 PASS).

---

### BUG-002: Supabase Foreign Key Violation on Watchlist & Mutations (`library_user_id_fkey`)
- **Severity**: S1
- **Discovered on**: both
- **Repro**:
  1. Sign in via `/api/auth/google/demo` or local credentials (creates record in local SQLite `users`).
  2. Submit `PUT /api/library/movie-27205` to add title to watchlist.
- **Observed**: HTTP 400 Bad Request: `insert or update on table "library" violates foreign key constraint "library_user_id_fkey"`.
- **Expected**: Watchlist item is inserted/updated with HTTP 200.
- **Root cause**: In `supabase/schema.sql`, `public.library` references `public.profiles(id)` which references `auth.users(id)`. When `isSupabaseConfigured()` is true, `lib/library.ts` wrote directly to Supabase `library` using the local user ID, which did not exist in Supabase `profiles`.
- **Status**: fixed
- **Fix commit**: `8a8206d` (`lib/supabase.ts`, `lib/library.ts`, `lib/reviews.ts`, `lib/pulse.ts`)
- **Verified**: Created `ensureSupabaseUserProfile` to register user profile in Supabase auth and profiles tables, with graceful SQLite offline fallback. Verified on local production server: BE-18 (library multi-tenant isolation) and BE-24 (idempotent watchlist) both return PASS with HTTP 200.

---

### BUG-003: Deployed Vercel Production Commit SHA Desynchronized from Branch
- **Severity**: S1
- **Discovered on**: deployed
- **Repro**:
  1. Run `git rev-parse HEAD` locally on branch `feat/v8-improvements` (`8a8206d`).
  2. Inspect Vercel deployment metadata for `https://cinepulse-kohl.vercel.app`.
- **Observed**: Deployed site is running deployment `7231687994` from `main` @ `86f1acfee7d44ad1626a7ecfda4a30aa84a506bc` (5 commits behind local branch).
- **Expected**: Deployed production site runs the latest verified commits.
- **Root cause**: `feat/v8-improvements` branch changes have not been merged into `main` and pushed to GitHub remote for automatic Vercel production deployment.
- **Status**: open
- **Fix commit**: Pending merge of `feat/v8-improvements` into `main` and push to GitHub remote.
- **Verified**: Documented in `docs/qa/01-parity.md` and `docs/qa/REPORT.md`.

---

## S2 (Major)

### BUG-004: Unauthenticated Cron Endpoints When `CRON_SECRET` is Unset
- **Severity**: S2
- **Discovered on**: both
- **Repro**:
  1. Send `POST /api/cron/resolve-calls` with no `Authorization` header.
  2. Send `POST /api/cron/snapshot` with no `Authorization` header.
- **Observed**: HTTP 200 OK: `{"resolved":0}`. Operational cron jobs could be triggered by arbitrary third parties.
- **Expected**: HTTP 401 Unauthorized when unauthenticated or when `CRON_SECRET` is not provided.
- **Root cause**: `app/api/[...path]/route.ts` line 52: `if (cronSecret && authHeader !== 'Bearer ' + cronSecret)` only rejected requests when `cronSecret` was non-empty. When `CRON_SECRET` was undefined or blank, authorization was completely bypassed.
- **Status**: fixed
- **Fix commit**: `8a8206d` (`app/api/[...path]/route.ts`, `vercel.json`)
- **Verified**: Enforced timing-safe Bearer authentication or loopback restriction. Verified on local production server: BE-29 & BE-30 return HTTP 401 when called without credentials.

---

### BUG-005: Missing `npm run lint` Script in `package.json`
- **Severity**: S2
- **Discovered on**: local
- **Repro**:
  1. Run `npm run lint` in terminal.
- **Observed**: `npm error Missing script: "lint"`.
- **Expected**: Linter runs TypeScript and Next.js validation across codebase.
- **Root cause**: `package.json` scripts section omitted the `"lint"` command.
- **Status**: fixed
- **Fix commit**: `8a8206d` (`package.json`)
- **Verified**: Added `"lint": "tsc --noEmit"` to `package.json`. Ran `npm run lint` locally; exited with code 0.

---

## S3 (Minor)

### BUG-006: React Duplicate Child Key Collision in Discovery Spotlight
- **Severity**: S3
- **Discovered on**: both
- **Repro**:
  1. Load `/` in demo catalog mode or when regional spotlight titles overlap with discovery catalog.
  2. Inspect browser console.
- **Observed**: `[browser] Encountered two children with the same key, 'demo-dunes'` (and `demo-orbit`, `demo-velvet`, `demo-neon`, `demo-hollow`).
- **Expected**: Unique keys for all child elements in DOM.
- **Root cause**: `components/Discovery.tsx` rendered `regionalTitles.map(t => <div key={t.id}>...)` and `filtered.map(t => <Poster key={t.id} ...>)`. When both arrays contained the same movie, duplicate React keys were generated in sibling sections.
- **Status**: fixed
- **Fix commit**: `8a8206d` (`components/Discovery.tsx`)
- **Verified**: Added `key={`regional-${title.id}`}` prefix and gated demo mode. Console duplicate key error eliminated in Playwright audit (`docs/qa/frontend-results.json`).

---

### BUG-007: React SSR Hydration Mismatch in `Modal` / `TitleDetail`
- **Severity**: S3
- **Discovered on**: both
- **Repro**:
  1. Navigate directly to a title detail page, e.g. `/?title=movie-27205`.
  2. Inspect browser console during hydration.
- **Observed**: `Uncaught Error: Hydration failed because the server rendered HTML didn't match the client` at `Modal (components/UI.tsx:30:9)`.
- **Expected**: Clean SSR and client hydration without DOM tree regeneration.
- **Root cause**: Modal `<dialog>` presence and attributes depended on client-side search parameter state that differed from server-rendered markup.
- **Status**: fixed
- **Fix commit**: `8a8206d` (`components/hooks/useTitleModal.ts`)
- **Verified**: Initialized `selected` state to `null` and synchronized with URL search params inside `useEffect`. Page error array in `docs/qa/frontend-results.json` confirmed `[]` (empty).

---

### BUG-008: CSRF Origin Enforcer Rejects HTTP `HEAD` Requests
- **Severity**: S3
- **Discovered on**: both
- **Repro**:
  1. Run `curl -I http://127.0.0.1:3000/api/config` or `curl -I https://cinepulse-kohl.vercel.app/api/config`.
- **Observed**: HTTP 403 Forbidden: `{"error":"Invalid or missing origin header"}`.
- **Expected**: HTTP 200 OK with response headers and 0 body length.
- **Root cause**: In `app/api/[...path]/route.ts` line 77: `if (method !== 'GET') enforceOrigin(request);`. Safe, read-only `HEAD` requests were subjected to mutative CSRF origin enforcement and route dispatch did not strip bodies.
- **Status**: fixed
- **Fix commit**: `8a8206d` (`app/api/[...path]/route.ts`)
- **Verified**: Verified on local production server: `HEAD /api/health` returns HTTP 200 with 0 body length and valid JSON content-type header.

---

### BUG-009: Static Mock YouTube Trailer Thumbnails Return 404 in Browser Console
- **Severity**: S3
- **Discovered on**: both
- **Repro**:
  1. Load `/` and monitor network image requests.
- **Observed**: 404 errors for `https://i.ytimg.com/vi/sfJG6hDN9yE/hqdefault.jpg` and `https://i.ytimg.com/vi/h6hZRE_ACJU/hqdefault.jpg`.
- **Expected**: All trailer poster assets resolve or fail gracefully with fallback placeholders.
- **Root cause**: Hardcoded mock entries in `components/Discovery.tsx` contained nonexistent video IDs (`sfJG6hDN9yE` and `h6hZRE_ACJU`).
- **Status**: fixed
- **Fix commit**: `8a8206d` (`components/Discovery.tsx`)
- **Verified**: Replaced dead video IDs with verified active trailers (`xEQP4VVuyrY` and `Way9Dexny3w`). Verified 0 image 404s in frontend audit.

---

## S4 (Trivial / Provider Quotas)

### BUG-010: Hugging Face API Quota Limit Reached
- **Severity**: S4
- **Discovered on**: both
- **Repro**:
  1. Trigger AI prediction routing through Hugging Face provider.
- **Observed**: HTTP 402 Payment Required logged by `unifiedFetch`. Cloudflare Workers AI fallback seamlessly handles request.
- **Expected**: Seamless fallback (functioning as designed).
- **Root cause**: Monthly free quota exhausted on `HF_TOKEN`.
- **Status**: mitigated
- **Fix commit**: None required. Secondary provider fallback (Cloudflare Workers AI / Local Pure-TS) executes seamlessly.
- **Verified**: Verified fallback in `tests/model-runtime.test.ts`.

---

### BUG-011: RapidAPI Streaming Availability Key Depleted
- **Severity**: S4
- **Discovered on**: both
- **Repro**:
  1. Query title streaming availability via RapidAPI.
- **Observed**: HTTP 403 Forbidden logged by `unifiedFetch`. Watchmode fallback seamlessly handles request.
- **Expected**: Seamless fallback (functioning as designed).
- **Root cause**: RapidAPI monthly free plan request limit exhausted on `STREAMING_AVAIL_KEY`.
- **Status**: mitigated
- **Fix commit**: None required. Watchmode / TMDB Watch Provider fallbacks handle requests seamlessly.
- **Verified**: Verified in provider health check (`/api/health`).
