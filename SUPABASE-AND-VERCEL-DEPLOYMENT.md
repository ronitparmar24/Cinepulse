# CinePulse — Supabase Schema & Vercel Deployment Guide

This guide walks through applying the full PostgreSQL schema + RLS policies on Supabase and deploying CinePulse to Vercel.

---

## 1. Apply Schema & RLS in Supabase

1. Open your **Supabase Dashboard**:
   [https://supabase.com/dashboard/project/lhymjvrpzyktgftlmvft/sql](https://supabase.com/dashboard/project/lhymjvrpzyktgftlmvft/sql) (or your target project).
2. Click **New Query**.
3. Open the file [`supabase/schema.sql`](file:///c:/Users/rey/Downloads/cinepulse-v2.1-completed/cinepulse-v2/supabase/schema.sql) in this repository.
4. Copy the entire contents and paste into the SQL Editor.
5. Click **Run** (Ctrl + Enter).

### What this configures:
- **Step 0 (Core Tables & RLS)**:
  - `profiles`: Public read, owner update/insert, auto-sync trigger on `auth.users` creation.
  - `library`: Public read, owner-only insert, update, and delete.
  - `reviews`: Public read, owner-only insert, update, and delete.
  - `forecasts`: Public read, owner insert. **Immutable** once submitted (anti-gaming: no client update policy).
  - `forecast_events`: Public read, append-only event log.
  - `api_cache`: RLS enabled with `USING (false)` (zero client access; service-role only).
- **Step 1 (Predictions & Scoring)**:
  - `predictions_log`: Model predictions logged at serve time.
  - `user_call_scores`: Resolves Brier score against theatrical outcomes.
- **Step 2 (Social Layer)**:
  - `follows`: Mutual and pending follow relationships.
  - `privacy_settings`: Granular visibility controls (watchlist, ratings, reviews, diary, activity).
  - `activity_events`: Public and followers-only feed events.
  - `likes`, `comments`, `blocks`, `notifications`.
- **Step 3 (Taste DNA & Badges)**:
  - `taste_dna_cache`: Cached archetype and genre vectors.
  - `user_badges`: Earned community badges.
- **Step 4 (Hype Signals)**:
  - `title_links`: IMDb, Wikidata, Wikipedia, trailer keys.
  - `pageview_stats`, `trailer_stats`.
- **Step 5 (Movie Night & Watch Circles)**:
  - `movie_night_sessions`, `movie_night_participants`.
  - `circles`, `circle_members`.
- **Step 6 (Analytics)**:
  - `analytics_events`: Anonymous & user telemetry (write-only client access).

---

## 2. Verify Supabase Setup

Run the built-in verification tool from your terminal:

```bash
npm run verify:supabase
```

This verifies:
1. Complete DDL definitions for all 25 tables.
2. RLS enabled on every table.
3. Strict security policies (anti-gaming, cache restriction, and follower checks).
4. Live connection to your Supabase instance.

---

## 3. Deploy to Vercel

### Step A: Connect Repository in Vercel
1. Go to [Vercel Dashboard](https://vercel.com/new).
2. Import the `ronitparmar24/Cinepulse` repository.
3. Set **Framework Preset** to `Next.js`.
4. Root Directory: `./` (or `cinepulse-v2` if repository root is parent).

### Step B: Configure Environment Variables in Vercel
Add the following in **Vercel Project Settings → Environment Variables**:

| Variable Name | Required | Description | Example Value |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Your Supabase Project URL | `https://lhymjvrpzyktgftlmvft.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Public Supabase Anon Key | `eyJhbGciOi...` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Service Role Key (for cron & admin ops) | `eyJhbGciOi...` |
| `TMDB_API_READ_ACCESS_TOKEN` | Recommended | TMDB v4 token for real-time catalog | `eyJhbGciOi...` |
| `APP_ORIGIN` | Recommended | Production domain | `https://your-domain.vercel.app` |
| `CRON_SECRET` | Optional | Bearer secret protecting `/api/cron/*` | `your-random-secret-key` |
| `OMDB_API_KEY` | Optional | Free OMDb API key (1,000 req/day) | `abc12345` |
| `YOUTUBE_API_KEY` | Optional | YouTube Data API v3 key for trailers | `AIzaSy...` |
| `SMTP_HOST` | Optional | SMTP mailer host for live OTP | `smtp.resend.com` |
| `SMTP_PORT` | Optional | SMTP port | `587` |
| `SMTP_USER` | Optional | SMTP user | `resend` |
| `SMTP_PASS` | Optional | SMTP API key | `re_...` |

### Step C: Deploy
Click **Deploy**. Vercel will run `npm run build` and launch the app globally with:
- Serverless API routes on `/api/*`
- Automatic `/tmp` database path isolation for serverless safety
- Edge-cached OpenGraph preview cards (`/opengraph-image`)
- Dynamic sitemap (`/sitemap.xml`) and robots policy (`/robots.txt`)
- PWA manifest (`/manifest.json`)
