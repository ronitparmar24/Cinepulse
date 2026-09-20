# Remaining work

Cinepulse 2.1 meets the intended **local student application** scope, but “local complete” does not mean production-ready, live-provider-verified, model-validated, or publicly deployable.

## Blocked until the owner runs it locally

### Live TMDB smoke test

No TMDB token was available during this delivery, so live verification is explicitly **blocked, not complete**. The owner must enter a Read Access Token privately in `.env.local`, restart the local server, and optionally run:

```sh
npm run check:tmdb
```

The script is opt-in and credential-safe. A successful reachability snapshot still does not establish exhaustive catalog coverage, current metadata, image rights, or India-specific dates.

### Manual device and accessibility review

Automated/unit/integration/browser checks are documented in `TEST-REPORT.md`, but physical iPhone/Android, Windows/macOS runtime, Safari/Firefox, screen-reader, 200% zoom, reduced-motion, contrast, and touch-target review remain outstanding. Automated checks are not accessibility certification.

## Optional local improvements

- More complete/paginated community browsing beyond the clearly stated latest-50 feed.
- Additional library sorting/filtering and richer account settings.
- Further catalog resilience and provider-specific date/territory presentation as requirements become clear.
- Restore drills on the owner's own separate backup copy; never test against the real working database.

## Deferred public-readiness work (not required for this local release)

Do not deploy this source as a public service without separately addressing:

- Email verification and safe password recovery.
- HTTPS/cookie and security-header/CSP configuration, trusted origins, and independent security review.
- Distributed abuse controls for signup, credential attacks, reviews, forecasts, and denial of service.
- Community rules, reporting/moderation, retention/deletion policy, privacy notices, and operational support.
- Durable backups, restore drills, monitoring with redacted logs, dependency maintenance, incident handling, and suitable persistent hosting/database decisions.
- Provider licenses, image/brand attribution, commercial-use terms, and any future streaming terms.

Local email addresses are not ownership-verified, and one account is not guaranteed to represent one person. Keep that limitation visible in community methodology.

## Deferred prediction-model work (Phase 3/4)

The current product is a transparent community-outlook tool, not an AI or financial prediction model. It does not collect social sentiment or trailer analytics, adjudicate outcomes, or claim accuracy. Future work would first require a measurable prediction question, release cutoff, permitted historical evidence, provenance, point-in-time feature policy, chronological evaluation, calibration metrics, and a model card. If suitable licensed data is unavailable, retain the evidence-unavailable state rather than inventing percentages.

Potential future work includes versioned prediction questions, evidence snapshots, outcome observations, forecast journaling, comparison/release-competition views, abstention, and a validated interpretable model. None is promised by 2.1.
