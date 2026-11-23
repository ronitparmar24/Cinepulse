# CinePulse v4 — Product Identity & Trust Layer (Antigravity Master Prompt)

Paste this into Antigravity as the top-level brief. It assumes two prior
workstreams are either done or in progress: (1) the deployability + validated
prediction engine work from the "v3 master prompt", and (2) the social
profile layer from the "social profiles prompt". If neither exists yet,
tell Antigravity to do THIS prompt's Phase 0 first — everything here is
worthless if it's decorating an unvalidated model.

---

## ROLE

You are the lead product engineer taking CinePulse from "a TMDB browsing app
with extra pages" to "a personal cinema intelligence platform with one clear
identity." Plan in full before writing code. Work phase by phase, smallest
safe diffs, and do not start a phase whose prerequisite isn't actually true —
check the codebase, don't take the phase order on faith.

## THE ONE-LINE IDENTITY (do not dilute this)

> **"Know what to watch. Predict what will win. Prove your movie taste."**

Everything you build should serve one of three signals: **My Taste**,
**The Community Pulse**, **The Box-Office Pulse**. If a proposed feature
doesn't strengthen one of these three, it's scope creep — say so and skip it,
even if it's in this document.

---

## PHASE 0 — Hard gate before anything else (verify, don't assume)

Before building any UI that displays a "confidence" or "match %" number,
grep the codebase and confirm all three are true. If any is false, stop and
do that work first — it's a short detour, not a new project:

1. `predictions_log` (or equivalent) exists and is written **at serve time**,
   not recomputed later. If it doesn't exist, every "historical accuracy"
   UI in Phase 3 will be showing fiction.
2. The prediction model has been validated on a **date-based** train/test
   split with a reported MAE/Brier score somewhere in the repo (a script
   output, a doc, anything). If not, the number on screen is still just the
   old heuristic wearing a confidence label — fix the honesty of the label
   before building the dashboard that displays it (see Phase 3C).
3. `resolveVisibility()` from the social-profiles prompt exists and has a
   passing test that a non-follower cannot read a private user's watchlist.
   Taste DNA and taste-match features in Phase 2 read across user data —
   don't build them on top of a privacy layer that doesn't exist yet.

Report the status of all three before proceeding. If you have to build one,
that's this session's actual Phase 0 output — everything else waits.

---

## PHASE 1 — Unify the CinePulse Score (ties the app together)

Currently discovery, community, predictions, and accuracy are separate pages.
Add one component, `<CinePulseScoreCard>`, rendered on every title page:

```text
CinePulse Score
━━━━━━━━━━━━━━━━━━━━
Your Taste Match       87%      (only if user has ≥5 rated titles; else hidden, not "N/A")
Community Pulse        74% Hit  (only if ≥10 community calls exist; else "Not enough calls yet")
Critics / TMDB         8.1
Box-Office Forecast    $320M–$490M   (a range, never a point estimate — see Phase 0.2)
Streaming              Netflix · Rent · Buy
```

Rules, not suggestions:
- **Every number needs a minimum-sample-size gate with an honest empty state.**
  A "Taste Match: 0%" for a user with two ratings is worse than hiding the
  row. Define the thresholds in one `lib/scoreThresholds.ts` file so product
  can tune them without touching component code.
- Taste Match requires the user to be logged in with rated titles; compute
  it as cosine similarity or Pearson correlation between the user's genre/
  director/decade rating vector and the title's feature vector — reuse the
  feature vector already built for the prediction engine (Phase 0.2),
  don't build a second one.
- This card replaces scattered mini-widgets across Discovery/title modal —
  delete the duplicates, don't add this as a fifth thing on the page.

---

## PHASE 2 — Taste DNA (build this one, it's the differentiator)

`/u/[username]/taste-dna` — and a compact version embedded in the profile
from the social-profiles prompt.

**Compute, don't fabricate.** Every line must trace to a real query over the
user's actual watched/rated titles:

```ts
// lib/tasteDna.ts
interface TasteDna {
  genreDistribution: { genre: string; pct: number }[];   // GROUP BY genre over watched titles
  eraDistribution: { decade: string; pct: number }[];
  topCreators: { name: string; role: 'director'|'actor'; count: number }[];
  archetype: string;        // see below — rule-based, not ML
  tendencies: string[];     // rule-based observations, see below
  badges: Badge[];
}
```

- **Archetype ("The Atmospheric Strategist") is a rule-based lookup**, not a
  generative-AI call. Build a small decision table: e.g. high sci-fi% +
  high avg-runtime + low-rated-action → "The Atmospheric Strategist". Keep
  it deterministic and debuggable. Save the LLM budget for Phase 4's review
  summarization, where it's actually the right tool.
- **Tendencies are templated from real stats**, not invented text: "You rate
  ambiguous-ending films 0.6 stars higher on average" is computed by joining
  a `films.has_ambiguous_ending` tag (seed this manually for ~200 well-known
  titles, expand over time) against the user's ratings. If you don't have
  the tag data for a tendency, don't ship that tendency — a wrong "insight"
  erodes trust in the whole feature.
- **Badges are simple threshold rules** against existing tables, computed
  on read (or nightly, cached): `Franchise Completionist` = watched all
  entries in ≥1 `belongs_to_collection` group with ≥4 entries. `Midnight
  Horror Hunter` = ≥60% of horror-genre watches logged with a diary
  timestamp after 22:00 local (needs diary timestamps — check they exist
  before promising this badge). Ship only the badges whose underlying data
  you actually have; a roadmap of aspirational badges is fine to list in
  the UI as "locked / coming soon," never fake-unlock one.
- Recompute on a debounced trigger (new rating, not every page load) and
  cache the result; this is a batch-style computation, not a live query.

---

## PHASE 3 — Prediction trust layer (this is what makes Phase 1 honest)

### 3A. Historical accuracy dashboard — `/accuracy`
Reliability diagram (predicted probability bucket vs observed hit-rate),
rolling 30/90-day accuracy, breakdown by genre and confidence tier, and a
head-to-head of the current model vs the old heuristic baseline. Pull
exclusively from `predictions_log` — if a metric can't be computed from that
table, it doesn't go on the page, full stop.

### 3B. Per-title prediction history
On any released title whose prediction was logged pre-release, show:
```text
Before release:  CinePulse forecast 68% Hit
After release:   Opening weekend $54M · Worldwide $287M · Result: Correct
Why it worked:   strong franchise awareness · summer release · high pre-release engagement
```
The "why it worked" line reuses the Phase 0.2 explanation/waterfall output
frozen at prediction time — do not regenerate the explanation with today's
model against yesterday's prediction, that's a subtly dishonest mismatch.

### 3C. Language audit (do this pass across the whole app, it's cheap)
Grep every UI string near a prediction number. Replace "AI Prediction" /
"AI-powered" with "CinePulse Forecast," "Model estimate," or "Data-backed
forecast" everywhere the underlying system is a heuristic or a small trained
model rather than a general AI system. This is a find-and-replace plus a
copy review, not a feature — do it in one PR, ship it immediately, don't
bundle it with anything riskier.

### 3D. Waterfall explanation component
Reusable `<PredictionWaterfall>` taking the per-title contribution array
already specified in Phase 0.2's `explain.ts`. Render as horizontal bars
from a base value, one row per factor, signed. Use it in both the title
page's Intelligence section (Phase 5) and the per-title history (3B) — one
component, two call sites, not two implementations.

---

## PHASE 4 — "Why this movie?" recommendations

Replace any generic "similar titles" carousel with labeled reasoning:

```text
Because you liked: Arrival · Ex Machina · Blade Runner 2049
Shared signals: cerebral sci-fi · atmospheric cinematography · ambiguous endings
Taste match: 91%
```

- The "shared signals" line must come from actual shared tags/features
  between the anchor titles and the candidate (same feature vectors as
  Taste DNA and the Score Card — one feature store, three consumers).
- Ship 2–3 recommendation modes for v1, not all eight in the brainstorm doc:
  **Because you liked…**, **Hidden gems below 50k votes** (pure SQL filter
  on TMDB vote_count, no model needed), and **Leaving streaming soon**
  (needs a `watch/providers` diff job — check TMDB actually exposes a
  leaving-date before promising this; if it doesn't, cut this mode rather
  than fake it with a random countdown).
- This is genuinely where an LLM call is appropriate: use Gemini/Groq (free
  tier, from the earlier API doc) to turn the computed shared-signal tags
  into one natural sentence, with the tags themselves computed
  deterministically. Never let the LLM invent the signals — it phrases,
  it doesn't decide.

---

## PHASE 5 — Movie Room (title page redesign)

Restructure the title page/modal into five sections, reusing components
already built above — this phase is mostly layout, not new logic:

```
Hero            → existing backdrop/poster/trailer/add-to-library + CinePulseScoreCard (Phase 1)
Intelligence    → community pulse, PredictionWaterfall (3D), confidence, release timeline
Viewing         → existing watch-providers, add territory selector, "watch with friends" → deep-link to Phase 6 if built, else omit the button rather than dead-end it
Discussion      → existing reviews, spoiler toggle (enforce server-side per the social-profiles prompt, not CSS blur)
Connections     → existing cast/crew/similar-titles, plus "Why this movie?" (Phase 4) for the similar-titles row specifically
```
Do not add a sixth section or new data source here — this phase's job is
information architecture, and its Definition of Done is "every element
already existed somewhere in the app before this phase started."

---

## PHASE 6 — Contrarian Desk (community vs model disagreement)

`/contrarian` — a filtered view, not new data:
```text
CinePulse says: 79% Hit    Community says: 42% Hit
Why the disagreement: model favors the release window · community dislikes the trailer · low director confidence
```
Query: `ABS(model_probability - community_probability) > threshold`, joined
against the explanation factors from both sides. This is a SQL query and a
diff-rendering component over data you already have from Phases 0–3 — resist
turning it into a new subsystem.

---

## PHASE 7 — Homepage restructure

```
[Personalized hero]   "Your next great movie is 87% likely to be..." — only if Phase 1's gate is met, else a neutral hero
[Quick actions]       Find something · Movie night (if 6 built) · Explore predictions · My library
[Your pulse]          Watchlist progress · accuracy · Taste DNA teaser
[Community]           Most-predicted hits · biggest disagreements (Phase 6)
[Personalized]        Because you watched... (Phase 4) · Hidden gems · Leaving soon
[Activity]            Followed-users feed (from the social-profiles prompt)
```
Every section needs the same empty-state discipline as Phase 1: a new user
with no ratings sees a neutral, still-useful homepage, not six broken
personalization widgets.

---

## EXPLICITLY DEFERRED — do not build in this pass

State this back to the user before starting: **Movie Night Generator, Watch
Circles/group voting, and the Cinema Map graph view are real, good ideas but
are new subsystems** (group state, shareable session links, a graph
renderer) rather than extensions of what exists. They belong in a dedicated
follow-up prompt once Phases 0–7 ship and the identity actually holds
together. Building them now, before the trust layer is real, adds surface
area to a product whose core number (the forecast) isn't validated yet.

## VISUAL DIRECTION (apply during Phase 5, not before)

Move from generic glassmorphism toward "editorial cinema terminal": near-
black background, warm ivory type, one warm accent (coral/cinema red) for
primary actions, neon mint reserved specifically for "model and community
agree," yellow for uncertainty, red for disagreement, purple for
personalization, blue for availability. Monospace for numeric data values
only (scores, percentages, currency), not body text. Reserve glass/blur
effects for navigation and overlays — remove them from ordinary content
cards. Do this as a design-tokens pass (`app/globals.css` variables) so it's
one place to change, not a hunt through every component.

## DEFINITION OF DONE FOR THIS ENTIRE PROMPT

A new anonymous visitor sees a coherent, honestly-empty-stated homepage. A
user with 5+ ratings sees a real Taste DNA page whose every claim traces to
a SQL query you can point to. Every prediction number on the site says
"Forecast" or "Model estimate," never bare "AI." `/accuracy` and
`/contrarian` both read only from logged, frozen data. Nothing in Phases
1–7 introduces a data source or number that Phase 0 didn't already validate
exists and is honest.

## HOW TO WORK

Report Phase 0's three checks first. Then propose the phase order given
what's actually true in the repo (some phases may already be partially
done from earlier prompts — check before rebuilding). One phase per PR,
report what you verified against real data after each, and flag anywhere
you were tempted to fabricate a number to fill a UI slot — that flag is
more valuable to me than the feature shipping on schedule.
