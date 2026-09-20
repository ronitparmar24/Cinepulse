# CinePulse v5 — Everything Deferred From v4 (Antigravity Master Prompt)

Paste this into Antigravity once v4 (Phases 0–7) is actually shipped and
verified — not just started. This prompt covers three independent tracks
that were intentionally left out of v4: engineering hygiene, micro-
interactions, and the three deferred social/utility features (Movie Night
Generator, Watch Circles, Cinema Map). They don't depend on each other —
Antigravity can do them in any order, but Track A should go first since it
makes everything else easier to build correctly.

---

## ROLE

You are continuing CinePulse after v4 shipped: the CinePulse Score, Taste
DNA, prediction trust dashboards, "Why this movie?", the Movie Room layout,
Contrarian Desk, and the restructured homepage are all live and reading real
data. This prompt is cleanup + the features that were correctly postponed
because they're new subsystems rather than extensions of what existed.

**Before starting any track, confirm v4's Phase 0 gate is still true** —
`predictions_log` is still being written at serve time, the model is still
the validated one, `resolveVisibility()` still has a passing test. If any
regressed, fix that first; nothing below is worth building on a broken
foundation.

---

## TRACK A — Engineering hygiene (do this first, it's pure debt paydown)

### A1. Break up the root client component
`components/Cinepulse.tsx` currently holds navigation, auth flow, library
state, title selection, URL state, health checks, and global actions in one
file. Extract into hooks, one responsibility each:
```
useAuth()          — session, login/logout, current user
useLibrary()        — watchlist/watched/ratings state + mutations
useNavigation()      — active tab, URL sync, deep-link handling
useToast()          — global toast/notification queue
useCatalogHealth()   — TMDB/provider health checks (from the /api/health endpoint)
useTitleModal()     — open/close/selected-title state for the Movie Room
```
Each hook gets its own test file. `Cinepulse.tsx` should shrink to
composition — wiring hooks to layout — not logic. Do this incrementally:
extract one hook, run the full test suite, commit, move to the next. Don't
do a single giant refactor commit.

### A2. README rewrite
Update to explain, in plain language:
- What's heuristic vs what's the trained model (name both, don't blur them)
- What data trains the model, and where the validated MAE/Brier numbers live
  (link to `/accuracy` and to the training script)
- What "confidence" means numerically, not just "high/medium/low"
- How prediction accuracy is measured (point to `predictions_log`)
- Which features need Supabase/a real DB vs which work in local SQLite mode
- Setup: zero-key demo mode vs full mode, exact env vars, one-command start
Replace any broken image embeds. Add real screenshots (see A3) once they exist.

### A3. Deployed demo checklist
- Live demo URL (Vercel), linked at the top of the README
- Real screenshots: homepage, a title's Movie Room, Taste DNA, /accuracy,
  Contrarian Desk — six images, not stock placeholders
- A demo account with pre-seeded ratings/watchlist so a visitor sees Taste
  DNA and personalized sections immediately, not empty states
- Architecture diagram (one image: Next.js → API routes → DB adapter →
  TMDB/Wikipedia/YouTube fetchers → cache) — a simple boxes-and-arrows SVG
  is enough, don't over-invest in this
- Lighthouse score badge and CI test-status badge in the README header

### A4. Product analytics
Add a minimal event log (own DB table `analytics_events`, not a third-party
SDK — you don't have the traffic to justify one yet, and it keeps this
consistent with the local-first philosophy). Track: search submitted, movie
opened, added to watchlist, prediction submitted, review posted,
recommendation clicked (with which mode from Phase 4), movie night generated
(once Track C ships), share link created. One `logEvent(type, metadata)`
helper called from existing action handlers — don't restructure code to add
this, just instrument what's there.

### A5. Mobile bottom navigation
Five primary destinations on mobile:
```
Discover | Predict | Community | Library | Profile
```
Move Calendar, Leaderboard, Accuracy, and Activity Feed into a "More" sheet
reachable from Profile or a dedicated icon. Use `useNavigation()` from A1 as
the single source of truth for active-tab state so desktop nav and mobile
nav can't drift out of sync.

### A6. CI accessibility + browser tests
If Playwright/axe tests exist per the package.json testing foundation
mentioned in the earlier audit, wire them into the GitHub Actions workflow
so they block merge, not just exist as scripts nobody runs. Add a11y checks
for the components built in v4 specifically (Score Card, Taste DNA page,
waterfall chart) since those are new since the last CI pass.

---

## TRACK B — Micro-interactions (small, do in one pass, low risk)

Each of these is a CSS/animation addition to an existing interaction — no
new data, no new endpoints. Implement with CSS transitions/`framer-motion`
if already a dependency; don't add a new animation library for this.

1. **Prediction factor hover** — hovering a row in `<PredictionWaterfall>`
   (built in v4 Phase 3D) highlights that row and dims the others, with a
   connecting line/tooltip showing its exact contribution. Pure UI state on
   an existing component, no data change.
2. **Watchlist add pulse** — adding a title triggers a brief scale+fade
   pulse on the button and the card. Respect `prefers-reduced-motion`.
3. **Live Taste DNA update on rate** — after submitting a rating, animate
   the affected genre/era percentage bars on the Taste DNA page if the user
   navigates there next (don't push a live update to a page they're not on;
   just don't show stale cached percentages when they do visit).
4. **Diary auto-entry on completion** — marking a title "watched" opens a
   lightweight inline diary composer (date defaults to today, optional
   rating/note) instead of silently logging it with no confirmation.
5. **Poster-to-backdrop transition** — opening a title from a poster
   crossfades into the Movie Room's backdrop hero rather than a hard cut.
6. **Forecast-locked confirmation** — submitting a community "opening call"
   shows a brief locked/checkmark animation confirming the call is
   immutable, reinforcing the anti-gaming rule from the community-loop spec.
7. **Community percentage meter animation** — Community Pulse % on the
   Score Card animates from 0 to its value on first render (once per
   session, not on every re-render — guard with a ref).

All seven respect `prefers-reduced-motion: reduce` by disabling the
animation and applying the end state instantly. This is not optional —
add one shared `useReducedMotion()` hook and use it everywhere in this track.

---

## TRACK C — Deferred features (each is genuinely a new subsystem — build one at a time, fully, before starting the next)

### C1. Movie Night Generator
New page, `/movie-night`, single-session (no login required to start,
optional to save results).

**Inputs (a form, not a wizard — one screen):**
number of people · available streaming services (multi-select, prefilled
from the user's region via `watch/providers` if logged in) · runtime cap ·
mood (tag-based: dark comedy, cozy, tense, etc. — reuse tags from Taste DNA's
feature store, don't invent a parallel taxonomy) · genre · language ·
age rating ceiling · "has everyone seen it" toggle.

**Output:**
```text
Tonight's Movie Night
Pick: The Menu
Runtime: 1h 47m · Mood: Dark comedy · Available on: Hulu
Group compatibility: 84%
Backup picks: Ready or Not · Triangle of Sadness · Bodies Bodies Bodies
```
Query: filter your catalog by the hard constraints (runtime, rating, service
availability, language) then rank by mood-tag match; "group compatibility %"
is only meaningful if multiple real users' taste vectors are in the session
(see below) — for a single anonymous user, compute it as tag-match strength
and label it "Match" not "Group compatibility," don't fabricate a group
number with one person in the room.

**Group sessions (the part that's genuinely new infrastructure):**
- `POST /api/movie-night` creates a session with a short shareable code
  (`/movie-night/join/{code}`), no auth required to join.
- Each participant answers mood/genre/service quickly; server intersects
  constraints and unions preference tags.
- Simple polling for "who's joined" (reuse the notification-badge polling
  pattern from the social-profiles prompt — 5s interval, not websockets).
- Session expires after 24h; this is intentionally ephemeral, don't build
  persistent group state here — that's C2's job if the user wants an
  ongoing group, not this feature's.
- Voting: each participant ranks/thumbs the top 3 candidates; simple
  Borda-count or approval-voting tally, resolved when the host clicks
  "decide" or a timer (default 10 min) elapses.

### C2. Watch Circles (persistent private groups — build only after C1 ships, they share the voting/ranking logic)
```sql
CREATE TABLE circles (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, owner_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE circle_members (
  circle_id INTEGER REFERENCES circles(id), user_id INTEGER REFERENCES users(id),
  role TEXT DEFAULT 'member', joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (circle_id, user_id)
);
CREATE TABLE circle_watchlist (
  circle_id INTEGER REFERENCES circles(id), title_id INTEGER NOT NULL,
  added_by INTEGER REFERENCES users(id), added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (circle_id, title_id)
);
CREATE TABLE circle_picks (  -- weekly pick + voting, reuses C1's tally logic
  id INTEGER PRIMARY KEY, circle_id INTEGER REFERENCES circles(id),
  week_of DATE NOT NULL, title_id INTEGER, decided_at TIMESTAMP
);
```
Features: create/join via invite link (reuse C1's join-code pattern),
shared watchlist, weekly pick + vote (same tally logic as C1, extracted into
`lib/voting.ts` so it's one implementation used twice), group reviews
(reuse the `comments`/`likes` tables from the social-profiles prompt scoped
to `target_type = 'circle_pick'`), a circle-scoped prediction leaderboard
(reuse the existing Brier-score leaderboard query, filtered to circle
members). **Do not build a new comment/review/voting system** — every piece
here should be an existing table or function reused with a new scope filter.
Spoiler-safe discussion reuses the server-side spoiler enforcement from the
social-profiles prompt, not a new mechanism.

### C3. Cinema Map (build last — it's the most self-contained and the most optional)
`/explore/map` or an expandable panel from any title's Connections section
(v4 Phase 5).

- Data model: don't build a generic graph database. Compute edges on demand
  from existing relations — `cast`, `crew`, `belongs_to_collection`, `genres`,
  `production_countries`, `release_date` (for decade) — you already have all
  of these from TMDB. A graph DB is over-engineering for what's really a
  handful of JOIN queries rendered as a tree/force layout.
- Rendering: a simple force-directed or radial-tree SVG (d3-force is fine,
  you likely don't need a dedicated graph-viz library). Depth-limit to 2
  hops from the center node by default — an unbounded graph from a prolific
  actor is unreadable and slow.
- Interaction: clicking any node re-centers the map on that node and
  refetches its 2-hop neighborhood — lazy expansion, not one giant upfront
  query.
- This is a "nice to explore" feature, not a primary nav destination — link
  to it from title pages, don't add it to the bottom nav from A5.

---

## SEQUENCING

```
Track A (hygiene)         → do first, unblocks clean work on B and C
Track B (micro-interactions) → do anytime after A1 (needs the extracted hooks)
Track C1 (Movie Night)     → standalone, can start anytime
Track C2 (Watch Circles)   → after C1 (reuses its voting logic)
Track C3 (Cinema Map)      → last, fully optional, lowest product priority
```

## DEFINITION OF DONE

Track A: `Cinepulse.tsx` is composition-only, README accurately describes
the ML/heuristic split, a live demo URL loads with seeded data, CI blocks
merge on failing a11y/browser tests. Track B: all seven interactions ship
behind `prefers-reduced-motion`, none of them required a new endpoint. Track
C: C1 works fully anonymously with a shareable join code before any auth is
required; C2 reuses C1's tally function rather than reimplementing voting;
C3 renders from existing TMDB relational data with no new data source.

## HOW TO WORK

Confirm the v4 Phase 0 gate still holds, then propose which track to start
with (recommend A) and get it approved before writing code. One track per
PR minimum — C1/C2/C3 are each big enough to be their own PR series. Flag
anywhere you're about to reimplement logic that already exists elsewhere in
the app (voting, spoiler-gating, polling patterns) — reuse it instead.
