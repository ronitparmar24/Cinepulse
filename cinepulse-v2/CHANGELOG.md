# Changelog

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
