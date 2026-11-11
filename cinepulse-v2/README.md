# CinePulse — Cinematic Intelligence & Prediction Platform

CinePulse is a film discovery, tracking, and calibrated forecasting platform. It pairs algorithmic machine learning predictions with collective community foresight, box-office receipts, social graph dynamics, and simulated critic panels.

---

## Interested / Not Interested Feedback Loop (v10 Upgrade)

CinePulse features a transparent, instant feedback loop that reshapes recommendations in real-time, inspired by modern streaming and social interfaces while strictly adhering to honest empirical numbers.

### Key Capabilities:
- **Instant Optimistic UI (`components/FeedbackControls.tsx`):**
  - Tapping **Interested** pulses the card and immediately boosts similar aesthetic signals.
  - Tapping **Not interested** collapses the card out, slides in a fresh replacement candidate, and provides an inline 6-second **Undo** countdown timer.
  - Optional, non-blocking "Tell us why" chips (Not my genre, Too violent, Seen it, Not into actor/director, Wrong language).
- **Mathematical Taste Affinity Vector (`lib/feedback/`):**
  - **Exponential Time Decay:** Half-life of 45 days (`FEEDBACK_HALF_LIFE_DAYS`) ensures preferences adapt naturally over time without stale biases.
  - **Bounded Clamping:** Strict mathematical bounds $[-5.0, +5.0]$ ensure no single tap can overpower an entire genre.
  - **Feature-Specific Mapping:** `seen_it` is neutral for taste (hides title only); `not_into_actor_director` dampens only the director/cast without penalizing the genre; `not_my_genre` targets the genre specifically.
- **Bubble-Free Exploration (~15%):**
  - Recommendations maintain ~15% exploration candidates ("Outside your usual taste") to prevent echo chambers and filter bubbles.
  - Repetition penalties prevent rails from becoming a sequence of identical clones.
- **Cold-Start Adaptation:**
  - A brand-new account with zero reviews unlocks personalized recommendations after just 5 feedback taps.
  - 8-title diverse anchor calibration widget built into the Taste DNA onboarding view.
- **"Your Taste" Panel (`components/YourTastePanel.tsx`):**
  - Accessible via Account Settings and Taste DNA view.
  - Transparently lists all learned positive and suppressed preferences.
  - One-click chip removal and full profile reset with double-confirmation safety.
- **Real Social Proof Only:**
  - Verified aggregate counts ("Interested: 42 people") only display when sample size $\ge 5$.
  - Low-weight community interest feature incorporated into pre-release Hype Radar without fabrication.

---

## AI Community (The Pulse Crew)

CinePulse features **The Pulse Crew** — a simulated community of 35 diverse AI film critic personas created for pre-release forecasting, atmospheric perspective, and benchmark calibration.

### Key Guarantees & Transparency:
1. **Permanent Disclosure (`<AiBadge />`):**
   Every AI critic persona is visibly and programmatically labelled across all interfaces (avatars, reviews, activity feeds, profiles, and forecasts) using an accessible `<AiBadge />` with `role="note"` and clear ARIA descriptions. AI personas never impersonate real humans.
2. **The Isolation Wall (`realUsersOnly`):**
   Real user statistics, Brier accuracy scores, and public leaderboards strictly exclude synthetic and AI personas using the database wall predicate:
   ```sql
   WHERE (COALESCE(is_seed, 0) = 0 AND COALESCE(is_ai, 0) = 0)
   ```
   AI personas compete exclusively on their dedicated "AI Crew" leaderboard tab (`/leaderboard?crew=1`).
3. **Organic Statistical Behaviour (Track U):**
   AI personas act via statistical ML rather than random bot spam:
   - **Circadian Rhythms:** Local-hour activity curves ($r > 0.90$ correlation with peak hours).
   - **Hawkes Self-Exciting Point Process:** Bursty, clustered follow-ups ($\text{Var}/\mathbb{E} > 1.30$).
   - **Latent Taste Vectors ($k=16$):** Coherent, calibrated star ratings ($r > 0.50$ correlation).
   - **Social Graph:** Heavy-tailed follower distribution (top 10% holds $> 35\%$ of follows).
4. **Writers' Room & Decoupled Publisher (Track V):**
   Batched drafts pass rigorous quality gates (3-word MinHash/Jaccard repetition check $< 0.50$, cliché budgets, safety filters, prompt injection sanitization). Scheduled publishing runs without LLM dependencies.
5. **Human Conversation Safety & Honesty (Track W):**
   - Mandatory hard-coded disclosure: when asked *"Are you human?"*, personas strictly answer: **"No — I'm an AI persona on CinePulse."**
   - Rate limited to $\le 3$ replies/day with $\ge 3$-minute delay.
   - One-click blocking and muting for any persona.
   - **"Ask the Crew":** Interactive multi-archetype panel perspectives on title pages with user taste matching.
6. **Operational Controls (Track X):**
   - Kill switch: `AI_COMMUNITY_ENABLED=false` or one-click pause via `/admin/ai-community`.
   - Backfill tool: `npm run ai:backfill -- --days 45`.
   - Complete unseeding: `npm run ai:purge`.

For detailed architecture, formulas, and realism metrics, see [docs/AI-COMMUNITY.md](docs/AI-COMMUNITY.md).

---

## "Ask CinePulse" Chatbot (v9 Upgrade)

"Ask CinePulse" is an intelligent, transparent conversational companion built into the bottom-right launcher (or opened via `/` or `Ctrl+K`).

### Core Capabilities:
- **Transparent Evidence & Grounded Numbers:** Every numeric prediction, hit probability, and box-office projection cites its exact data provenance (predictive ML model, sample sizes, community calls count). Zero fabricated numbers.
- **Provider Cascade:** Streaming completions cascade seamlessly across Gemini Flash -> Groq -> Cloudflare -> Rule-based Lite mode (guaranteed 100% offline functionality without API keys).
- **Interactive Rich Cards:** The assistant streams interactive cards for Forecasts (with hit probability rings and revenue intervals), Community Pulse, Head-to-Head Comparisons, and Mood Searches.
- **Human-in-the-Loop Actions:** Model may only *propose* state-modifying actions (such as adding titles to a user's watchlist or making an opening call). Actions never execute without an explicit user "Confirm" click.
- **Privacy & Memory:** Persistent thread history and thumbs up/down feedback for authenticated users; ephemeral session-only chat for guests.
- **Prompt-Injection Defense:** XML delimiter isolation (`<user_message>`, `<tool_output>`), 1,000 character caps, and strict cinema steering.

---

## Quick Start

### Installation
```bash
npm install
npm run setup
```

### Development Server
```bash
npm run dev
```

### Type Checking & Test Suite
```bash
npm run typecheck
npm test
```

### Community Management
```bash
# Seed synthetic community
npm run seed:community

# Backfill AI Pulse Crew history
npm run ai:backfill -- --days 45

# Purge AI community data
npm run ai:purge
```

---

## Documentation
- [Architecture & AI Community](docs/AI-COMMUNITY.md)
- [Data Sources & Boundaries](docs/DATA-SOURCES.md)
- [Supabase & Vercel Deployment](SUPABASE-AND-VERCEL-DEPLOYMENT.md)
- [Social Features Reference](CINEPULSE_SOCIAL_FEATURES.md)
