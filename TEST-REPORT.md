# Cinepulse 2.1 — verification report

**Run date:** 17 September 2026. **Environment:** Debian 12, Node 24.21.0, Next.js 16.3.5, headless Chromium via Playwright. No deployment performed.

## Final automated results

| Command | Result |
|---|---|
| `npm ci` | Original source dependencies installed successfully; final package also checked by clean installation before packaging |
| `npm run typecheck` | Passed |
| `npm test` | **27 passed, 0 failed, 0 skipped** |
| `npm run build` | Passed; optimized production build generated |
| `npm run test:integration` | **2 passed, 0 failed, 0 skipped** |
| `npm run test:browser` | **12 passed, 0 failed** |
| npm dependency audit during install/lock update | 0 known vulnerabilities reported at the time of the run; not an independent security audit |

**Total: 41 passing test cases**, plus TypeScript and production-build verification. A case may exercise many assertions or an entire user journey. Provider tests use controlled mock responses, not a real TMDB token.

## Coverage

### Unit, storage, provider, and regression checks — 27 cases

- Strict calendar dates, leap dates, and release eligibility at UTC day boundaries.
- Direct backend movie/TV library writes across released, future, and unknown-date cases. Watchlisting remains available; viewing statuses and ratings require release.
- Review classification for future/unknown dates and consistent whitespace normalization.
- Concurrent duplicate registration: one created user/session and one controlled 409 conflict.
- Separate-process SQLite persistence; sequential v2-to-v3 migration; preservation of populated records; unsupported newer-schema refusal.
- Independent restore of a stopped database directory; bounded expired-session/cache cleanup.
- Movie/TV search, genre mappings, mixed-source ordering metadata, people excluded from trending titles, honest partial totals, upcoming TV first-air constraints, and strict provider dates.
- Catalog/detail/episode caching and demo/live catalog-mode separation.
- Mocked transient provider recovery, invalid-credential no-retry behavior, verified/unavailable provider health, and token-free health output.
- Forecast cutoff rules and Wilson interval calculations, including empty samples; fictional metadata has no fabricated engagement.
- Aborted or unreadable JSON responses cannot become successful undefined catalog data. This regression previously caused an intermittent deep-link render failure and was fixed before the final run.

### API integration — 2 multi-step cases

A production-style server is started on port 3102 with an isolated temporary database. Checks include registration, login/logout, bad credentials, two-account library/review ownership, forecast edits/history, account export, deletion cascade, anonymous denials, Origin checks, malformed JSON/content types, and public catalog privacy.

The existing API cases plus direct backend release/concurrency regressions are not a complete adversarial security test suite. Public-launch hardening remains separate work.

### Browser — 12 journeys

The production build is started on port 3101 with another isolated database:

1. Desktop discovery/search/filtering, signup, persistent watchlist, forecast creation/edit, scenario calculation, review posting, saved forecasts, export, and account deletion.
2. Mobile layout, calendar, community empty state, and Escape dismissal.
3. Direct title links and review tabs across refresh.
4. Browser Back/Forward synchronized with title opening.
5. Arrow/Home/End keyboard behavior and selected-tab URLs.
6. Source-card focus restoration and closing without a back-navigation loop.
7. Invalid title errors and clean close behavior.
8. Mobile navigation and honest unavailable-provider status using controlled browser interception.
9. Review editing preloads saved text/spoilers, updates without duplication, survives refresh, discards unsaved edits, and renders HTML-shaped text safely.
10. Genre-provider failure is visible and retry recovers.
11. Axe WCAG 2 A/AA and WCAG 2.1 AA checks on discovery, sign-in, title overview, Prediction desk, and community panel: no reported violations in those checked states after animations settle.
12. UI movie/TV release matrix for released, future, and unknown dates with controlled metadata; viewing/rating controls match eligibility.

Desktop: **1440 × 1000**. Mobile: **390 × 844**. The mobile journey checks horizontal overflow. The main desktop journey checks for uncaught page errors. Desktop/mobile discovery screenshots were visually reviewed. Automated accessibility scans and keyboard assertions are not accessibility certification.

## Issues found and resolved during verification

- Browser executables/system libraries initially missing: installed Chromium and its Linux dependencies, then reran tests.
- Aborted JSON response handling could return undefined catalog data: fixed with a regression test.
- Own-review rendering duplicated/hidden states and stale spoiler visibility after editing: fixed and browser-tested.
- Several browser selectors/history assumptions were corrected to target actual controls and a real prior history entry.
- Shortcut/footer/tab contrast was improved. Browser accessibility checks now pass in the listed states.

## Blocked or not verified

- **Live TMDB: blocked.** No real token was supplied or used. Run `npm run check:tmdb` after entering the token privately in `.env.local`, then verify actual live UI data. Missing-token behavior was checked without making an external request.
- No Firefox/WebKit, physical phone, Windows/macOS, screen-reader, full manual 200% zoom, exhaustive artwork-contrast, or public load/security audit was performed.
- Provider retry/timeout code is bounded, but mocks do not reproduce every outage, malformed response, quota policy, or provider change.
- The community feed is explicitly latest-50 rather than paginated. Release dates are not asserted to be India-specific theatrical dates. Mixed movie/TV pages are not a global ranking.
- No paid integration, social/trailer analytics, trained model, financial outcome adjudication, password recovery, public moderation platform, or hosted service is supplied.

## Reproduce

Use Node 24 and npm, not Bun. From the extracted project folder:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:integration
npx playwright install chromium
# Linux only, if Playwright reports missing system libraries:
npx playwright install-deps chromium
npm run test:browser
```

Test databases are isolated from the normal `data/cinepulse.db`. Screenshots are generated under `test-results/screenshots/`. The source ZIP excludes credentials, databases, test accounts, dependencies, build output, and browser caches.
