# Cinepulse connections and data boundaries

Cinepulse 2.1 is a local full-stack application. The browser talks to the Next.js internal API; the API talks to the local SQLite database and, only in TMDB mode, the TMDB provider. There is no hosted backend, paid service, authentication SaaS, streaming service, or extra external API connection.

## Local application path

```text
Browser
  │ same local origin (127.0.0.1:3000)
  ▼
Next.js App Router + internal /api route
  ├── SQLite (DATABASE_PATH, default data/cinepulse.db)
  └── TMDB HTTPS API (optional, server-side only)
```

Accounts, sessions, library entries, reviews, forecasts, forecast revisions, and operational catalog cache are persisted locally. The browser never receives the TMDB read token. API mutations require Origin protection and use parameterized SQL plus account-scoped authorization.

## TMDB boundary

Set `CATALOG_MODE=tmdb` and enter `TMDB_READ_TOKEN` privately in `.env.local`. `TMDB_REGION` defaults to `IN`; optional `TMDB_LANGUAGE` is blank by default and uses the provider default. Relevant filters, region, and language participate in cache keys. Keep `.env.local` out of Git, screenshots, logs, public archives, and client variables.

The app reports configured/checking/verified/unavailable health. Provider retries are bounded and limited to appropriate transient failures; invalid credentials are not retried, and a `Retry-After` delay is honored rather than retried early. Verified means a reachability check succeeded at that time; it does not promise exhaustive, current, or territory-perfect metadata. Catalog requests, images, videos, cast, and episode metadata can still be missing or unavailable. Search is separate from collection/genre filtering. Mixed movie/TV pages merge provider pages without claiming a global ranking, and the calendar is only a loaded release list.

The optional `npm run check:tmdb` script reads `.env.local` and makes external calls only when a non-placeholder token exists. It prints labels/statuses and limited counts, never the token or response bodies. Run it only on the owner's machine after local token entry. Live TMDB verification was not performed for this source because no token was available.

## Demo boundary

Demo mode uses fictional titles and bundled original artwork. Demo records are namespaced separately from TMDB records. It contains no seeded accounts, reviews, ratings, votes, forecasts, social metrics, or model outputs. Switching catalog modes does not migrate records between sources.

## Not connected by design

- No YouTube analytics; trailer links are metadata only.
- No social-platform scraping or sentiment collection.
- No TVmaze, OMDb, financial-outcome, studio-profit, or audience-measurement integration.
- No trained hit/flop model, automatic resolution, or accuracy leaderboard.
- No full-film/episode streaming provider.
- No deployment, hosted preview, cloud database, or paid service.

Provider terms, attribution, image rights, and noncommercial eligibility must be checked again before any publication or monetization. See `docs/DATA-SOURCES.md` for source details.
