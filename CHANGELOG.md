# Changelog

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
