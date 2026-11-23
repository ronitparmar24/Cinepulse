# CinePulse v7 — Synthetic Community Seeding

Paste into Antigravity after v6. This is not a feature track like D–I; it's
a data problem. Right now a fresh install shows "0 accounts · No community
evidence yet" on every title, which is honest but makes the product
undemoable — nobody can feel what the Pulse/Opening Calls panel is *for*
until it has weight behind it. The fix is a proper seeding pipeline, not a
one-off script: personas with a stable identity, activity spread
realistically over time, and a hard wall between seed data and anything a
real user ever sees as their own.

**Read `scripts/seed-demo.mjs`, `migrations/0001_init.sql` and
`migrations/0005_social_layer.sql` first** — this extends that seed, it
doesn't replace it. Confirm the `users` / `forecasts` / `forecast_events` /
`reviews` / `follows` / `activity_events` / `brier_scores` schema is still
what's below before writing anything; migrations drift.

---

## TRACK J — Persona bank

### J1. Identity table
Add `is_seed INTEGER NOT NULL DEFAULT 0` to `users` in a new migration
(`0008_seed_layer.sql`) rather than smuggling it into an existing column.
Every synthetic account is `is_seed=1`, id-prefixed `seed_` (`seed_priya_k`,
not `user_demo_curator`-style — that prefix is already taken by the single
hand-authored demo account and should stay untouched). This is the wall:
every query that computes a *public* leaderboard, a *"you vs the
community"* comparison, or anything else a real user's own standing is
measured against must be able to filter `WHERE is_seed=0` in one place, not
reconstructed per-query. Put that filter in `lib/db.ts` as a named helper
(`realUsersOnly()`) now, even though nothing needs it yet — Track F's
leaderboard from v6 will.

### J2. Persona generation
`scripts/generate-personas.mjs` — produces `data/seed-personas.json`, not
inline in the seed script, so it's reviewable and regeneratable without
touching DB logic. 40–60 personas, each with:
- `username`, `displayName`, `bio` (one line, varied register — some
  terse, some enthusiastic, some contrarian-critic voice; a `founder-era
  film-twitter cadence`, not fifty variations of "Movie lover and
  popcorn enthusiast")
- `avatarUrl` — pull from a free placeholder service (e.g. DiceBear's
  identicon/avataaars API, no key required) keyed by username, not real
  human photos; do not scrape or generate photoreal faces of real people
- a small `tastePreferences` object (favored genres, a
  harsh/generous rating bias, hit/flop optimism bias) that later steps
  read from instead of rolling fresh randomness per action — this is what
  makes one persona's history look like a person instead of noise
- `archetype` tag (`optimist`, `contrarian`, `genre-specialist:horror`,
  `casual`, `lurker-who-rarely-votes`) driving how often and how
  confidently they act in J3–J4

Generate bios/reasons with an LLM call (reuse whatever provider key the
app already has in `.env.example`, same `lib/fetchers/base.ts` wrapper
Track I specifies — timeout, retry, cache the raw output to
`data/seed-personas.json` so this only runs once and isn't a runtime
dependency). If no key is configured, fall back to a hand-written pool of
~15 phrasing templates per archetype with slot-filled variables, so the
script still works offline. Never ship the same reason text twice for the
same title — dedupe against what's already in `forecast_events`.

---

## TRACK K — Seeded activity

### K1. Forecasts
For every title in `lib/demo-catalog.json` (and, if TMDB is configured,
the current upcoming catalog), pick a subset of personas weighted by
archetype fit (a horror specialist skips a romance title) and insert
through the *same* `forecasts` / `forecast_events` write path `lib/
pulse.ts#putForecast` already uses — don't hand-roll a second INSERT that
can drift from the real schema (title_json, first_submission, the Wilson
interval all depend on this being identical to a real submission). Vary
`confidence` (50–100, biased by archetype optimism) and pick `choice` from
the persona's genre affinity, not uniformly — an all-50/50 split reads as
obviously fake next to a real skewed community.

### K2. Timing — this is the part that actually sells it
`created_at` must **not** be "now" for everything. Backdate
`forecast_events` across a plausible window (title announcement → today),
front-loaded near release-date-adjacent news beats if you want to be
fancy, otherwise a simple decaying random spread is enough. `getPulse`'s
`history` array (grouped by day) is what renders the "how the conversation
grows" trend — a flat wall of same-day activity is the single biggest
tell that a community is fake. Respect `first_submission` correctly when
backdating (it must match actual insert order per user/title, not be
independently randomized) or the growth chart will show impossible
patterns like negative net accounts on a given day.

### K3. Reviews + comments + likes
Through `lib/reviews.ts`'s existing insert path, 15–30 reviews spread
across titles, rating distribution pulled from each persona's bias, body
text from J2's generator constrained to 2–4 sentences, spoiler-tagged
correctly for released titles. Comments (`lib/social/interactions.ts`)
on a fraction of reviews and forecasts — replies, not just top-level noise
— and `likes` at a realistic ratio (most content gets 0–3, a few get
double-digit). Don't seed every persona onto every title; sparse-but-real
beats dense-but-uniform.

### K4. Follows + activity feed
Seed a follow graph among personas (power-law, not uniform — a few
personas end up with 15+ followers, most have 2–4) through `lib/social/
follows.ts` so `activity_events` populates and the feed isn't empty either.
Do **not** auto-follow the real signed-in user from any seed persona —
that crosses from "populated demo" into "fake social proof aimed at the
one real person here," which is a different thing and out of scope.

### K5. Leaderboard entries
Only for titles whose `releaseDate` is already in the past in the seed
data (invent a few backdated ones if the live catalog is all-upcoming),
resolve a handful of seed forecasts through the same scoring path Track F
(v6) defines, so `brier_scores` has real-shaped entries instead of the
leaderboard also reading empty. This is the one place `is_seed` filtering
in J1 actually gets exercised — confirm `realUsersOnly()` correctly drops
these the moment a real user's own call resolves, so a new user isn't
comparing themselves only against ghosts forever.

---

## TRACK L — Safety rails (do not skip this to save time)

- `npm run seed:community` runs J+K end to end; `npm run unseed:community`
  deletes everything with `is_seed=1` and its dependent rows in one
  transaction. Both must be idempotent — re-running seed shouldn't
  duplicate personas.
- Gate seeding behind `SEED_COMMUNITY=1` in env, off by default, and
  refuse to run against a database that has any `is_seed=0` forecast
  already in it unless `--force` is passed — this is a demo/dev tool, not
  something that should ever touch a database with real users in it.
- Every seed persona's `bio` gets a consistent, honest marker in its
  `metadata` (not necessarily shown in the UI, but queryable) so the
  dataset is self-documenting six months from now when you've forgotten
  which 40 accounts aren't real.
- Document this in `README.md` next to the existing "demo mode" note —
  one paragraph: what's seeded, how to turn it off, and that it's for
  local/demo use, the same way the README already discloses demo-mode
  uses a fictional catalog when no TMDB key is set. That existing
  disclosure is the right model to follow here, not something to bury.

---

## SEQUENCING

```
J1 (is_seed + realUsersOnly helper) → do first, everything else depends on the wall existing
J2 (persona bank)                    → depends on J1's id scheme
K1–K4 (activity)                     → depend on J2, can be built in parallel with each other
K5 (leaderboard)                     → depends on K1 and on Track F (v6) existing
L (safety rails)                     → alongside J1, not bolted on after
```

## DEFINITION OF DONE

A fresh `npm run setup && npm run seed:community` produces titles whose
Pulse panel shows a non-zero, unevenly-split hit/flop count with a
multi-day growth history, a leaderboard with plausible-looking entries,
and an activity feed with follows/likes/comments — all without a single
uniform-looking number anywhere. `npm run unseed:community` removes every
trace cleanly. `realUsersOnly()` is used everywhere Track F's leaderboard
and "you vs community" comparisons read from `users`/`forecasts`, verified
by grep, not assumption. `SEED_COMMUNITY` is off by default and the
README discloses what this is.

## HOW TO WORK

Build J1 and the `realUsersOnly()` wall before generating a single fake
account — retrofitting the seed/real boundary after 60 personas already
exist is how it gets forgotten. Confirm honestly whether Track F (v6) is
actually live yet; if it isn't, K5 has nothing to attach to and should be
stubbed, not faked with its own parallel scoring logic. One track per PR
series, same as v4–v6.
