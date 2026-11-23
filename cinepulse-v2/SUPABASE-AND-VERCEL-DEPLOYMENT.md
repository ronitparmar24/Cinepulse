# CinePulse — Supabase + Vercel deployment

CinePulse stores everything in one Postgres database in production (Supabase works well), and
in a local SQLite file when you run it on your own machine. The app creates and upgrades its own
tables, in their own schema (`cinepulse`), so it never touches Supabase's `public` tables.

> **Before 2.2.0** the live site kept most data in a temporary SQLite file on Vercel, which was
> wiped on every cold start, and wrote a few tables to Supabase `public.*`. Step 4 brings the
> data that survived in Supabase across.

---

## 1. Get the Postgres connection string

1. Supabase dashboard → your project → **Project Settings → Database → Connection string**.
2. Choose **Transaction pooler** (port `6543`) — best for serverless functions.
3. Copy the URI and put your database password in it:
   `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`

Keep this string secret: it gives full access to the database.

## 2. Set environment variables in Vercel

**Vercel → Project → Settings → Environment Variables** (Production, and Preview if you want):

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | **Yes** | The connection string from step 1. Without it, data is lost on every cold start. |
| `DATABASE_SCHEMA` | No | Schema for CinePulse tables. Default `cinepulse`. |
| `CRON_SECRET` | **Yes** | Random string. Vercel Cron sends it automatically; without it scheduled jobs refuse to run. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `APP_ORIGIN` | Recommended | Your site URL, e.g. `https://cinepulse-kohl.vercel.app` (used for origin checks and links). |
| `TMDB_READ_TOKEN` + `CATALOG_MODE=tmdb` | Recommended | Real film catalogue. |
| `RESEND_API_KEY` + `EMAIL_FROM`, or `SMTP_*` | Recommended | Sends sign-in codes. Without email, code-based sign-in returns an error (codes are never shown on screen in production). |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` | Recommended | Bot check on sign-in and sign-up. Enforced only when **both** are set. |
| `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (+ `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | If you used Supabase sign-in before | Existing accounts' passwords live in Supabase Auth; keep these so those users can still sign in. |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Optional | Real "Sign in with Google". The button is hidden when these are missing. |

Do **not** set `ALLOW_DEV_AUTH` on any public deployment (it is ignored on Vercel anyway).

On start-up each server instance logs `[CINEPULSE CONFIG]` lines for anything misconfigured
(variable names only, never values). Check them under **Vercel → Deployments → Logs**.

## 3. Deploy

Push to `main` (or click **Redeploy**). On the first request the app:

1. creates the `cinepulse` schema if needed,
2. applies `migrations/pg/*.sql` once each (guarded by an advisory lock, so parallel instances are safe),
3. seeds the AI critic personas.

To apply migrations ahead of time from your machine instead:

```bash
DATABASE_URL="postgresql://…" npm run db:migrate
```

## 4. Bring existing data across (one time)

**Data the old version wrote to Supabase `public.*`** (profiles, library, reviews, forecasts):

```bash
DATABASE_URL="postgresql://…" npm run db:import-supabase
```

**Your local SQLite database** (`data/cinepulse.db`, e.g. a seeded demo community):

```bash
DATABASE_URL="postgresql://…" npm run db:copy-sqlite -- ./data/cinepulse.db
```

Both are safe to run again: existing rows are skipped, never overwritten, and each runs in a
single transaction (all or nothing).

## 5. Check the deployment

```bash
node scripts/verify-deploy.mjs https://cinepulse-kohl.vercel.app
```

It confirms the health endpoints, that the demo login and OTP preview are closed (404), that cron
routes refuse unauthenticated calls, and that a new account can save to its watchlist.

## 6. GitHub Actions

- `ci.yml` runs typecheck, lint, the SQL portability scan, all tests on SQLite **and** Postgres,
  the production build and `npm audit` on every pull request. Turn on branch protection for `main`
  (Settings → Branches) and require the **CI / checks** job.
- `ai-tick.yml` triggers the AI community every 20 minutes. Add repository secrets `APP_URL`
  (your site URL) and `CRON_SECRET` (same value as in Vercel).

---

### Legacy: `supabase/schema.sql`

The `public.*` tables, RLS policies and triggers in `supabase/schema.sql` belong to the previous
storage design. They are no longer needed for new deployments; leave them in place until step 4
has been run, then they can be dropped.
