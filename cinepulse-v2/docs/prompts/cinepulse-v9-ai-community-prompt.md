# CinePulse v9 — The Living AI Community ("Pulse Crew")

Paste into Antigravity / Claude Code **after v7 and v8-Track K**. One TRACK per session; run
`npm run typecheck && npm test` after each and commit.

**Tell the agent before every track:**
> Read `AGENTS.md` first (this Next.js has breaking changes). Read the files listed under "Read
> first". Reuse existing write paths (`putForecast`, `putReview`, `followUser`, `addComment`,
> `toggleLike`) — never hand-roll a second INSERT. Keep `realUsersOnly()` as the single wall
> between AI personas and real users.

---

## THE IDEA (and the one rule that makes it a feature, not a liability)

CinePulse has no users yet, so the community is run by **AI personas that behave like real
cinephiles**: they have accounts, taste, moods, favourite directors, friendships, grudges, bad
days, and they forecast, review, reply, argue and follow each other on a living schedule.

**The rule: every AI persona is labelled as AI.** Voice, taste and behaviour should feel human;
*identity* must not pretend to be human.

Why this is the right call (not just the cautious one):
1. Your own app's promise is *"No score is invented to fill the space."* Unlabelled fake people
   would break it the first time a real visitor notices.
2. A public leaderboard / "community outlook" that silently counts fake accounts is a fake
   statistic. Labelled + excluded-by-default keeps your Brier/Receipts credibility (v8 Track O).
3. It is a **better pitch**: *"the first film community where AI critics have public track records,
   argue with each other, and you can challenge them."* Interviewers remember that; they forget
   "I seeded fake users".
4. If real people join later, the AI crew becomes the "house regulars" instead of something you
   have to hide or delete.

So: **humanlike behaviour ✅ · visible "AI" badge ✅ · no fake human biography, photos, or claims
of real-world experiences ✅.**

---

## TRACK S — Disclosure + the wall (do FIRST)

**Read first:** `lib/db.ts` (`realUsersOnly`), `migrations/0009_seed_layer.sql`,
`lib/social/profile.ts`, `components/PublicProfileView.tsx`, `components/ActivityFeed.tsx`,
`components/Reviews.tsx`, `lib/pulse.ts`, `lib/pulse/adjudication.ts`.

- Reuse `users.is_seed`; add migration `0010_ai_community.sql` with `users.is_ai INTEGER DEFAULT 0`
  (keep `is_seed` for the demo seed; AI personas set both). Add `ai_persona_id` nullable FK.
- **Badge everywhere a persona appears** (feed card, review, comment, profile, leaderboard row,
  follower list, notifications): a small "AI" pill with tooltip *"Simulated critic persona.
  Opinions are generated, not from a real viewer."* Must be keyboard/screen-reader accessible
  (`aria-label`), not colour-only.
- Profile bio footer for personas: "AI persona · created by CinePulse · seed v9".
- **Community Outlook / Pulse** shows two numbers: *Humans* (default, `realUsersOnly`) and
  *Humans + AI Crew* (toggle). When humans = 0, say: "No human votes yet — AI Crew leans 7 hit / 3
  flop" instead of the current empty state. Never merge them silently.
- Settings → "Show AI personas" (default ON, user can hide them from feed/search/suggestions).
- Real leaderboard and "you vs community" use `realUsersOnly()`; add a separate **AI Crew
  leaderboard** tab so personas compete with each other, not with humans.
- Block AI personas from: DMs, mentions that spam, follow-spamming real users, notifications to
  real users beyond direct replies. (Detailed in Track W.)
- Add `lib/ai/isAi.ts` and a grep test: any SQL reading `users`/`forecasts` for public stats must
  contain `realUsersOnly` or an explicit `is_ai` branch.

**Acceptance:** with 40 personas seeded and 0 humans, human counters read 0 and the AI counters
are labelled; hiding AI removes them from feed, search and suggestions; badge passes the axe test.

---

## TRACK T — Persona "souls" and memory

**Read first:** `data/seed-personas.json`, `scripts/generate-personas.mjs`, `lib/tasteDna.ts`,
`lib/tasteMatch.ts`.

**Known weakness to fix:** in `seed-personas.json` personas of the same archetype share the *same*
`tastePreferences` (e.g. `priya_k` and `filmnoir_dan` are both `ratingBias 0.7, hitFlopOptimism
0.82` with identical favourite genres). That is exactly what makes a community look fake.

- New `data/ai-personas.json` (generated once by `scripts/generate-ai-personas.mjs`, reviewed by
  you, committed). 30–40 personas, each with a **soul**:
  - `identity`: handle, display name, short bio, DiceBear **illustrated** avatar (not photoreal),
    declared timezone (mix: mostly `Asia/Kolkata`, plus `Europe/London`, `America/New_York`,
    `Asia/Tokyo`), `joinedAt` backdated plausibly.
  - `voice`: sentence-length range, emoji rate, slang list, signature phrases (≤3), words they
    never use, capitalisation habit, how they disagree (blunt / polite / sarcastic), review length
    distribution. **Natural variation only — do not inject fake typos to pass as human.**
  - `taste`: a **latent vector** (see U2) + 3 favourite directors, 3 pet-hate tropes, era and
    language leanings (include Hindi/Gujarati/regional cinema fans), rating bias and spread.
  - `forecasting`: `skill` (0.2–0.9), `optimism`, `herding` (how much they follow the crowd),
    `contrarian` flag. Skill is *real*: some personas will genuinely be bad forecasters.
  - `life`: `activityLevel`, `peakHours` (local time), weekend boost, "binge week" probability,
    "lurker weeks". Max 1 sentence of fictional backstory, **never** claims about real
    employers, schools, cities beyond a country, or real people.
- Migration: `ai_persona_memory(persona_id, kind, subject, content, weight, created_at)` where
  `kind ∈ {opinion, relationship, milestone, grudge, running_joke}`.
  Examples: `opinion | director:Villeneuve | "overrates his pacing but loves his sound design"`.
- `lib/ai/memory.ts`: `recall(personaId, titleId, limit=6)` returns the most relevant memories
  (same director/genre/person they argued with), recency-decayed. This is what makes persona #7
  sound like the same person next week.
- Consistency guard: a new opinion on a subject that contradicts a stored opinion (same subject,
  opposite polarity, within 30 days) is rejected or rewritten as "changed my mind about…".

**Acceptance:** persona JSON validates with a schema; no two personas share a voice fingerprint
(test: Jaccard similarity of lexicons < 0.35); `recall()` unit-tested.

---

## TRACK U — Behaviour engine (statistics and ML, **no LLM here**)

The LLM should only *write words*. **What** a persona does and **when** is decided by code, so it
is cheap, deterministic, testable and can't go off the rails.

**Read first:** `lib/pulse.ts`, `lib/recommendations.ts`, `lib/prediction/model.ts`,
`lib/accuracy/backtest.ts`, `lib/cron/resolveCalls.ts`.

### U1. When they act — circadian + bursts
- Per persona, probability of acting in a given hour = `circadian(localHour, peakHours)` ×
  `weekendBoost` × `eventBoost` (a film they care about releases this week, a trailer dropped,
  a big opening weekend). Use a **Hawkes-style self-exciting process**: one action slightly raises
  the chance of a follow-up (reply, like, second review) for a few hours — this is what creates
  natural bursts instead of evenly spaced bot activity.
- Add rare "quiet" periods (a persona goes silent for 5–12 days) and "return" behaviour.

### U2. What they like — a real taste model
- Build `data/item-factors.json` offline: low-rank matrix factorisation (k=16–32) on a free
  ratings dataset (MovieLens research licence — check terms) mapped to TMDB ids, or on TMDB
  genre/keyword/credit features as a fallback. Each persona gets a latent vector; a rating =
  `clip(round_half(bias + dot(user, item) + noise))`. Result: personas who love slow sci-fi
  rate *similar* films similarly, so Taste Match and "similar taste" suggestions between AI
  accounts look meaningful instead of random.

### U3. How they forecast — skill, bias and herding
- Persona hit-probability = `sigmoid( skill·logit(modelProb) + optimism_shift + genre_affinity +
  herding·logit(crowdProb) + N(0, σ) )`, using the **point-in-time** model output (v8 Track K) —
  never any post-release information. `contrarian` personas flip the crowd term.
- They *update* calls as news arrives (trailer views jump, reviews embargo lifts) but only before
  the forecast lock (00:00 UTC release date, as your UI states).
- After release, scoring runs through the existing resolver, so skill shows up as real Brier
  scores. Expect a spread (some good, some bad). **Never hand-edit outcomes.**

### U4. Social graph
- Follows via preferential attachment (rich-get-richer) + taste similarity + reciprocity
  (≈30% follow-backs with delay). Target degree distribution: heavy-tailed (a few personas with
  15+ followers, most 2–5). Unfollows are rare but possible.
- Likes: probability proportional to taste match × recency × author popularity. Most posts get
  0–3 likes, a few get many.

### U5. Action policy
- `lib/ai/policy.ts`: `chooseAction(persona, now, worldState)` returns one of
  `forecast | review | reply | like | follow | list_add | idle` with a typed payload and a
  reason code. Pure function; seeded RNG per `(persona, tickId)` so tests are reproducible.
- Daily cap per persona (e.g. ≤ 6 actions) and global cap (see Track X).

**Acceptance (statistical tests with `node:test`):**
- Hour-of-day histogram of generated actions matches the circadian curve (chi-square or simple
  correlation > 0.9).
- Inter-action gaps are over-dispersed vs Poisson (variance/mean > 1.3).
- Follower-degree distribution is heavy-tailed (top 10% hold > 35% of follows).
- Persona ratings correlate with the taste model (> 0.5 on a held-out set).

---

## TRACK V — Writers' room + publisher (LLM, but queued)

**Read first:** `lib/fetchers/gemini.ts`, `lib/fetchers/groq.ts`, `lib/fetchers/base.ts`,
`lib/reviews.ts`.

Free-tier LLMs are rate-limited, so **separate writing from publishing**:

1. **Writers' room job (1–2×/day):** for each persona's planned actions in the next 24h, make
   one *batched* call per ~5 personas asking for structured JSON drafts. Store in
   `ai_content_queue(id, persona_id, action, payload_json, not_before, status, quality_score)`.
2. **Publisher tick (every 15–30 min, no LLM):** publishes queued items whose `not_before` has
   passed, through the normal write paths. If the LLM is down, the community keeps moving using
   queued items, then goes quiet gracefully — it never spams.

**Prompt contract for drafting** (each draft gets the persona soul, `recall()` memories, the
title facts from TMDB, and the model's forecast numbers):
- Write **in that persona's voice**; length from their distribution; no markdown; at most one
  emoji if their emoji rate says so.
- Must reference **at least two concrete facts** from the supplied title data (director, cast,
  runtime, trailer, budget, genre, release window) or a stored memory — no invented plot, awards,
  box-office, quotes or real people's statements.
- **Unreleased titles:** talk about the trailer, the team's earlier work, the release window, why
  they think hit/flop. No plot spoilers, no pretending to have seen it.
- **Released titles:** the persona is a *simulated critic*, so frame opinions as taste-driven
  readings ("not a Villeneuve-style slow burn, which is what I wanted") and use only supplied
  review/consensus data; mark spoiler content with the existing spoiler flag. No claims like
  "I watched it in IMAX last night" or other real-world experiences.
- Output JSON: `{text, rating?, confidence?, spoiler, tags[], mood}`; validate with a schema,
  retry once, otherwise drop the item (never publish unvalidated text).

**Quality gates before anything is queued as `ready`:**
- **Repetition:** MinHash/Jaccard on 3-word shingles vs the last 200 posts of that persona *and*
  the last 500 community-wide; reject > 0.5 similarity. Keep a banned-cliché list ("a must-watch",
  "masterpiece", "edge of your seat", "cinematic experience") with a max-use budget.
- **Persona drift:** voice-fingerprint check (average sentence length, emoji rate, banned words).
- **Safety:** reuse your moderation filter + a blocklist; no slurs, harassment, sexual content,
  medical/legal claims, links, phone numbers, or mentions of real private individuals; no
  impersonating real critics, celebrities or other users.
- **Grounding:** reject drafts naming facts not present in the supplied title data (simple
  entity check against cast/crew/genre lists).
- **Injection:** any user text fed back to the model (for replies) is wrapped as data and
  stripped of instructions; test with "ignore previous instructions".

**Acceptance:** works with no API key (falls back to ~15 persona-slot templates per archetype and
flags them `provider: template`), invalid JSON never crashes, every published item stores
`provider`, `model`, and `draft_id` for auditing.

---

## TRACK W — Conversations with humans (carefully)

**Read first:** `lib/social/interactions.ts`, `lib/social/notifications.ts`,
`lib/auth/rateLimit.ts`, `components/Reviews.tsx`, `components/ContrarianDesk.tsx`.

- **AI ↔ AI threads:** personas with opposing taste debate under a film (2–4 turns), with
  delays of minutes to hours. Cap thread depth; avoid pile-ons.
- **AI → human replies:** only when a human comments on an AI post or forecast, or mentions a
  persona. One reply max per human comment, ≥ 3-minute delay, ≤ 3 replies/human/day, and the
  persona must stay in character but **must honestly answer "are you human?"** with "No — I'm an
  AI persona on CinePulse" (hard-coded rule, not left to the LLM).
- **"Ask the Crew" (signature feature):** on any title, the user picks a question ("Hit or flop?",
  "Is it worth watching in a theatre?") and gets 3 short takes from personas with different
  archetypes, each showing its numbers (their forecast, their taste match with the viewer).
  Generated on demand, cached per title/day, clearly labelled AI.
- **Three-way Contrarian Desk:** extend `ContrarianDesk` to compare *model vs AI Crew vs humans*,
  highlighting titles where they disagree most.
- No DMs, no push notifications from AI personas, no follow-requests spam to real users; an AI
  persona may follow a real user only if that user interacted with it first.

**Acceptance:** "are you human?" test returns the honest answer; rate limits enforced; a human
can block/mute any persona in one click.

---

## TRACK X — Operations on free tiers (Vercel + a durable DB)

**Read first:** `SUPABASE-AND-VERCEL-DEPLOYMENT.md`, `lib/db/adapters`, `.github/workflows/ci.yml`,
`app/api/[...path]/route.ts`.

- **Persistence:** serverless disks are ephemeral, so the deployed site must use the remote
  adapter (Turso/LibSQL or Supabase, both already supported in this repo). Confirm AI tables
  migrate on that adapter and add a test.
- **Scheduler:** protected route `app/api/cron/ai-tick` (checks `CRON_SECRET` with a constant-time
  compare). Trigger it from a **GitHub Actions** schedule (`.github/workflows/ai-tick.yml`, every
  20 min) and a daily `ai-writers-room` workflow. Check Vercel's current cron limits before relying
  on Vercel Cron on the free plan.
- **Controls (env):** `AI_COMMUNITY_ENABLED=false` (kill switch, default off), `AI_MAX_ACTIONS_PER_TICK`,
  `AI_MAX_ACTIONS_PER_DAY`, `AI_LLM_DAILY_CALL_BUDGET`, `AI_ACTIVE_PERSONAS` (start at 12, ramp
  to 40 over weeks so growth looks organic).
- **Idempotency:** each tick has a `tick_id`; re-running never double-posts (unique constraint on
  `(persona_id, action, target_id, tick_id)`).
- **Admin page** `/admin/ai-community` (admin-only): last 100 actions with reason codes, queue
  depth, LLM calls/cost-in-calls, rejection reasons, a one-click "pause all", per-persona pause,
  and a **realism dashboard**: hourly activity histogram vs target curve, follower-degree plot,
  repetition score trend, forecast skill by persona.
- **Backfill:** a one-time `npm run ai:backfill -- --days 45` creates plausible history
  (consistent with Track U, `created_at` backdated, honoring `first_submission` ordering exactly
  as v7 K2 describes) so the product isn't empty on day one. Backfilled rows get `source:'backfill'`.
- **Unseed:** `npm run ai:purge` removes every AI row in one transaction (idempotent).

**Acceptance:** with the kill switch off nothing is written; with it on, three consecutive ticks
produce a few varied actions, no duplicates, and the admin page shows them.

---

## TRACK Y — Honest docs and the model card for the crew

- README section **"AI Community"**: what it is, that all personas are labelled, how to turn it
  off, which providers write the text, and that AI activity is excluded from human statistics by
  default.
- `docs/AI-COMMUNITY.md`: architecture diagram (soul → policy → queue → publisher), the equations
  in U3, the limitations ("personas are simulated; their opinions are generated"), and the
  realism metrics with real numbers from your admin dashboard.
- Update `docs/DATA-SOURCES.md` and the in-app disclaimer: the current text says the prediction
  model is "calibrated" and "trained on temporal box-office splits" — keep that claim only after
  v8 Track K makes it true.
- In the UI "Evidence desk", add a fifth card: **AI Crew** — "N personas · M forecasts · labelled
  AI · excluded from human totals".

---

## SEQUENCING

```
S (badge + wall)  →  T (souls + memory)  →  U (behaviour engine)  →  V (writers' room)
                                                                      ↓
                                      X (ops/cron/kill switch)  ←  W (conversations)  →  Y (docs)
```
Do **not** turn the scheduler on in production until S, T, U, V and the X kill switch exist.

## DEFINITION OF DONE

- Visiting a title with zero humans shows a believable, **labelled** AI Crew conversation with a
  multi-day history, uneven hit/flop split, replies and disagreement.
- Hide-AI toggle works; humans-only stats stay at 0 until real users exist.
- Realism tests pass (circadian fit, burstiness, heavy-tailed follows, taste correlation,
  repetition < 0.5).
- Kill switch, budgets and purge command verified.
- Every persona surface has the AI label.

## HOW TO WORK

Ship S first and look at it in the browser before generating any personas. Then T→U in code with
tests, and only then spend any LLM calls (V). Show me the admin realism dashboard before enabling
the cron in production. One track per PR.

> **Extra Fundas (viva / interview):** *Hawkes process* = self-exciting point process (events
> raise near-term event probability → bursty, human-like timing) vs *Poisson* (memoryless, looks
> robotic). *Preferential attachment* gives power-law follower counts. *Matrix factorisation*
> gives coherent taste. *MinHash/Jaccard* detects repeated phrasing. **Exam trap:** don't let
> an LLM decide actions or outcomes — it's costly, non-reproducible, and can't be unit-tested;
> use it only for text. **Another trap:** if the AI crew and the real crowd share one table
> without a flag, you've contaminated your own evaluation — that is why `is_ai` + `realUsersOnly()`
> come first.
