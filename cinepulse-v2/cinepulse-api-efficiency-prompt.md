# CinePulse — Use Your Existing Keys Better (Efficiency + Coverage Prompt)

Paste into Antigravity. You already have YouTube, OMDb, Gemini, Groq, HF,
Cloudflare, and GNews keys provisioned. The problem isn't missing APIs —
it's that each one is likely wired into one feature when it could serve
three, and nothing currently stops you from silently blowing through a free
tier at 2am. This prompt fixes coverage and efficiency together, not either
alone.

---

## STEP 0 — Security first, this takes five minutes

- Confirm `.env` / `.env.local` is in `.gitignore` and has never been
  committed (`git log --all --full-history -- .env*`).
- If any of these keys have ever been visible in a screenshot, commit, or
  shared link, rotate them now — OMDb, YouTube, GNews, HF, Groq, and
  Cloudflare all support instant key regeneration from their dashboards.
  Five minutes now beats a quota-exhaustion surprise later.
- Confirm every provider call happens server-side only (route handlers,
  not client components) — grep for each key name across the codebase and
  verify zero matches outside `lib/fetchers/` and server files.

---

## STEP 1 — One provider registry, so you can see what you're spending

```ts
// lib/providers/registry.ts
export const PROVIDERS = {
  youtube:   { dailyQuota: 10_000, unit: 'units',   costPerCall: 1,    ttlHours: 24 },
  omdb:      { dailyQuota: 1_000,  unit: 'requests', costPerCall: 1,    ttlHours: 168 }, // 7d for released titles
  gnews:     { dailyQuota: 100,    unit: 'requests', costPerCall: 1,    ttlHours: 12 },
  gemini:    { dailyQuota: null,   unit: 'requests', costPerCall: 1,    ttlHours: 0 },   // check current free-tier rpm/rpd in AI Studio console
  groq:      { dailyQuota: null,   unit: 'requests', costPerCall: 1,    ttlHours: 0 },
  hf:        { dailyQuota: null,   unit: 'requests', costPerCall: 1,    ttlHours: 0 },
  cloudflare:{ dailyQuota: null,   unit: 'neurons',  costPerCall: 1,    ttlHours: 0 },
} as const;
```
Every fetcher increments a same-day counter (one `provider_usage` table,
`provider, date, count`) before calling out. If `count >= dailyQuota`,
skip the call, serve cache, mark the field `stale: true` — never let a
feature crash because YouTube hit 10,000 units.

Extend your existing `/api/health` endpoint (from the v3 prompt) to show,
per provider: today's usage / quota, cache hit rate over the last 24h, and
last error if any. This is the dashboard that makes "efficient" visible
instead of assumed.

---

## STEP 2 — Make each key do more than one job

### YouTube (currently: probably just trailer embeds)
- **Already planned (Track I):** trailer view/like velocity feeding the
  hype model. If not done yet, this is the highest-value use of this key —
  prioritize it.
- **New:** a "Trending Trailers" row on the homepage (Phase 7) — your
  `trailer_stats` table, sorted by 7-day view growth, is a free homepage
  section with zero new API calls once Track I's daily snapshot job exists.
- **Efficiency:** you're paying 1 unit per `videos.list` call already (good
  — don't ever call `search.list` at 100 units when TMDB already gives you
  the video ID). Batch multiple video IDs into one call
  (`videos.list?id=ID1,ID2,ID3`, up to 50 IDs per call) instead of one call
  per title — this alone can cut your daily unit usage by 10–50x if you're
  currently snapshotting titles one at a time.

### OMDb (currently: probably just the ratings line on title pages)
- **New:** feed OMDb's Rotten Tomatoes/Metascore into the Contrarian Desk
  (Phase 6) as a third data point — "Critics say 91%, model says 68% Hit,
  community says 55%" is a richer disagreement view than model-vs-community
  alone.
- **New:** use it in Taste DNA (Phase 2) for a "critic alignment" stat —
  correlation between the user's ratings and RT/Metascore on titles they've
  both watched and that OMDb covers.
- **Efficiency:** 1,000/day is tight if called per-pageview. Cache 7 days
  for released titles (ratings rarely change), 24h for upcoming (nothing to
  fetch yet anyway, so this mostly guards against redundant calls on
  pre-release pages). Pre-warm the cache nightly for your top 100 most-
  viewed titles via a cron job instead of waiting for a user to trigger the
  fetch live — turns a live dependency into a pre-computed one.

### GNews (currently: likely unused — you had it listed as optional before, now provisioned)
- **New, and this is the gap:** wire it into Track I's hype feature set as
  "press coverage count" — article volume in the 14 days pre-release is a
  real signal your model doesn't have yet. Add it to `lib/prediction/
  features.ts` alongside Wikipedia pageviews and trailer velocity.
- **New:** an "In the News" widget on the Movie Room's Discussion section,
  2–3 recent headlines with outbound links (titles + link only, never
  reproduce article text — standard copyright rule).
- **Efficiency:** 100/day is the smallest budget you have. Don't call it
  per-pageview at all — one nightly batch job pulling news for titles
  releasing in the next 30 days (a small, known list) and caching 12h,
  never a live per-request call.

### Gemini + Groq (currently: probably Gemini only, Groq idle)
This is the one with real waste right now: you're paying for two LLM
providers and likely using one. Fix it with one shared interface and a
fallback chain, not two separate integrations:

```ts
// lib/ai/complete.ts
async function complete(prompt: string, opts?: { cacheKey?: string }) {
  if (opts?.cacheKey) {
    const cached = await getCached(opts.cacheKey);
    if (cached) return cached;
  }
  try {
    const result = await callGemini(prompt);
    if (opts?.cacheKey) await setCached(opts.cacheKey, result);
    return result;
  } catch (err) {
    if (isRateLimitOrDown(err)) {
      const result = await callGroq(prompt); // fallback, not a second feature
      if (opts?.cacheKey) await setCached(opts.cacheKey, result);
      return result;
    }
    throw err;
  }
}
```
- Use this ONE function for every LLM call in the app: the "Why this
  movie?" sentence (Phase 4), spoiler-safe review summarization, Taste DNA
  tendency phrasing (phrasing only — the tendency itself stays rule-based
  per the v4 prompt's explicit instruction, don't let the LLM decide facts).
- Cache every LLM output by a content hash of its input (the shared-signal
  tags, the review text, etc.) — identical inputs should never trigger a
  second call. This is the single biggest efficiency win available: most
  LLM calls in a content app are regenerating the same sentence for the
  same data.
- Groq's value here isn't "a second AI feature," it's redundancy — the app
  keeps working the moment Gemini's free tier is tight for the day.

### Hugging Face (currently: likely unused)
- **New, matches the original API plan:** sentiment scoring on Reddit
  mention volume for the hype model (Track I) — `distilbert-base-uncased-
  finetuned-sst-2-english` via the Inference API.
- **New:** sentence embeddings (`all-MiniLM-L6-v2`) for "more like this" —
  embed every title's overview once, store the vector, compute cosine
  similarity locally for recommendations instead of calling an API per
  comparison. This is the efficient pattern: **one embedding call per
  title, computed once and cached forever** (overviews don't change),
  versus a live similarity API call per page view.
- **Efficiency:** HF's free tier is rate-limited per model; batch embedding
  generation as a backfill job (e.g. 50 titles/run on a cron) rather than
  computing on-demand when a user visits an unembedded title.

### Cloudflare (currently: unclear what it's wired to — confirm first)
- Check whether this key is being used for Workers AI, R2 storage, or just
  DNS/CDN — the account ID + API token alone doesn't tell us which.
- **If Workers AI:** use it as the fallback tier below HF for embeddings/
  sentiment specifically — HF free tier exhausted → Cloudflare Workers AI's
  daily free neuron allocation → only then skip the feature and mark it
  `null`. Three-tier fallback, same caching discipline as the Gemini/Groq
  pair above.
- **If R2:** this would be for storing generated assets (e.g. cached chart
  images, user-uploaded avatars) rather than inference — different use
  case entirely, confirm before building anything assuming it's AI.

### Email (EMAIL_FROM visible in the screenshot)
- This was already scoped as "cheap and expected" in the social-profiles
  prompt — a weekly digest of followed-users' activity. If not built yet,
  it's a single cron + template, no new infra. Confirm the actual provider
  behind this key (Resend/SendGrid/etc. — the screenshot only shows the
  sender address) before wiring the send call.

---

## STEP 3 — The efficiency rules that apply to every provider above

1. **Batch, don't loop.** Anywhere you're calling a provider once per title
   in a loop (YouTube especially), check if the API supports multiple IDs
   per call first.
2. **Nightly batch jobs for anything that doesn't need to be live.** News,
   trailer stats, pageviews, OMDb ratings for upcoming titles — none of
   these need to be fetched at the moment a user loads a page. Precompute
   and cache; the user should never be the trigger for an external call.
3. **Cache key = content, not time.** An LLM call and an embedding call
   should be cached by a hash of their input, not by a TTL alone — the same
   input should never produce a second paid call, ever, regardless of when
   it's asked again.
4. **One shared fetcher wrapper, already specified in the v6 prompt's
   Track I** — if `lib/fetchers/base.ts` doesn't exist yet, build it before
   wiring any of the above; every provider above should go through it, not
   have its own ad hoc fetch call.
5. **Degrade visibly, never silently.** A feature running on `stale: true`
   or disabled data should say so quietly in the UI (a small "last updated"
   note, or just omitting the feature) — not crash, and not pretend the
   data is live when it's a week old.

---

## DEFINITION OF DONE

`/api/health` shows real daily usage against quota for every provider in
`PROVIDERS`. Gemini and Groq are called through one shared `complete()`
function with caching, not two separate integrations. YouTube calls are
batched, not looped. GNews feeds the hype model and nothing else calls it
live. HF embeddings are computed once per title and cached, not fetched
per comparison. Every provider has a documented fallback (cache, a backup
provider, or `null`) — nothing in the app can go down because one free
tier ran out for the day.

## HOW TO WORK

Start with Step 0 (security) today regardless of anything else. Then Step 1
(the registry + health dashboard) before touching any individual provider —
you need visibility into usage before you can tell if the efficiency changes
in Step 2 actually worked. One provider per PR after that.
