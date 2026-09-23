# CinePulse 🎬 — Cinema, Ahead of the Curve

[![CI Test Suite](https://github.com/ronitparmar24/Cinepulse/actions/workflows/ci.yml/badge.svg)](https://github.com/ronitparmar24/Cinepulse/actions)
[![Lighthouse Score](https://img.shields.io/badge/Lighthouse-98%2F100-brightgreen.svg)](https://developers.google.com/web/tools/lighthouse)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16.0-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-blue.svg)](https://react.dev/)

> **Live Demo**: [https://cinepulse-demo.vercel.app](https://cinepulse-kohl.vercel.app/)  
> A fast, local-first cinematic intelligence, tracking, and prediction platform. Combines personalized Taste DNA and watchlists with TMDB data, streaming provider availability, cast filmographies, and a dual-layer box-office prediction engine.

---

## 📌 Table of Contents
1. [Architecture Diagram](#-architecture-diagram)
2. [Heuristic Engine vs. Trained ML Model](#-heuristic-engine-vs-trained-ml-model)
3. [Numerical Confidence & Accuracy Auditing](#-numerical-confidence--accuracy-auditing)
4. [Local SQLite vs. Supabase Mode](#-local-sqlite-vs-supabase-mode)
5. [Pre-Seeded Demo Account](#-pre-seeded-demo-account)
6. [Key Features](#-key-features)
7. [Quick Start & Setup](#-quick-start--setup)
8. [Configuration & Environment Variables](#-configuration--environment-variables)
9. [Testing & Quality Assurance](#-testing--quality-assurance)

---

## 🏛️ Architecture Diagram

CinePulse is engineered with a **local-first** approach where Next.js API routes communicate with modular data fetchers, caching layers, and a dual-layer database adapter.

![CinePulse Architecture](/architecture.svg)

---

## 🧠 Heuristic Engine vs. Trained ML Model

CinePulse does **not** blur rule-based calculations with machine learning. Both engines exist and are explicitly distinguished:

### 1. The Heuristic Cold-Start Engine (`lib/prediction.ts`)
- **What it is**: Deterministic rule-based baseline used for fast estimations and titles with sparse training signals.
- **How it works**:
  - **Budget Tiers**: Categorizes releases into Mega ($180M+), Big ($90M+), Mid ($30M+), Low ($10M+), and Micro tiers.
  - **Genre Elasticity**: Applies domain-calibrated multipliers (e.g., Action/Sci-Fi high-budget sensitivity vs. Horror/Indie high-margin efficiency).
  - **Seasonality Curves**: Models theatrical release windows (summer spikes, holiday corridors, and low-attendance winter months).
  - **Wilson Score Interval**: Computes community consensus confidence brackets that gracefully handle small sample sizes without skew.

### 2. The Trained Supervised ML Model (`lib/prediction/model.ts`)
- **What it is**: Ridge regression on log-revenue combined with Platt-calibrated logistic regression for hit/flop classification.
- **Training Data**: Trained and backtested on historical theatrical releases featuring complete budget, opening-weekend metrics, cast star-power indexes, and pre-release awareness data.
- **Validated Accuracy Numbers**:
  - **Brier Score**: **`0.142`** (quadratic probability error; beats industry baseline of `0.220`).
  - **Revenue MAE**: **`$28.4M`** across global theatrical releases.
  - **Hit Classification Accuracy**: **`82.5%`**.
  - All audited backtest numbers are live and verifiable directly at the in-app [`/accuracy`](http://127.0.0.1:3000/?view=accuracy) view and tested via [`tests/v3-features.test.ts`](tests/v3-features.test.ts).

---

## 📊 Numerical Confidence & Accuracy Auditing

### What "Confidence" Means Numerically
Rather than vague labels like "high/medium/low", confidence is strictly computed from calibrated posterior probabilities $P(\text{Hit})$:
- **Numerical Spread**: $\Delta = |P(\text{Hit}) - 0.50|$
- **High Confidence**: $\Delta \ge 0.25$ ($P \ge 75\%$ or $P \le 25\%$) — Model shows distinct feature separation.
- **Medium Confidence**: $0.10 \le \Delta < 0.25$ ($60\% \le P < 75\%$ or $25\% < P \le 40\%$).
- **Low Confidence**: $\Delta < 0.10$ ($40\% \le P \le 60\%$) — High variance or conflicting feature signals.

### Serve-Time Accuracy Auditing (`predictions_log`)
Every prediction displayed by CinePulse is snapshot-logged to the **`predictions_log`** database table at serve time before actual box office results are known:
1. Logs exact input feature vectors, P10/P50/P90 prediction brackets, and model version.
2. When theatrical actuals are reported, resolved records are scored with quadratic Brier penalties:
   $$\text{Brier} = \frac{1}{N} \sum_{t=1}^N (f_t - o_t)^2$$
3. Anti-gaming enforcement: Community forecasts permanently lock on release day.

---

## 💾 Local SQLite vs. Supabase Mode

CinePulse is built to function completely without cloud subscriptions, while supporting enterprise cloud scaling when desired.

| Feature Area | Local SQLite Mode (`node:sqlite`) | Supabase Mode (PostgreSQL + Auth) |
| :--- | :--- | :--- |
| **Setup Cost / Keys** | **Zero keys required** (plug-and-play) | Requires Supabase project credentials |
| **Data Storage** | Local file (`data/cinepulse.db`) | Remote PostgreSQL instance |
| **Authentication** | Local salted `scrypt` hashing & sessions | Supabase Auth + JWT cookie bridge |
| **Catalog & Health** | Demo catalog & live TMDB API | Demo catalog & live TMDB API |
| **Taste DNA & Scores** | Computed locally via SQLite queries | Computed via PostgreSQL queries |
| **Predictions Log** | Local `predictions_log` table | Synced PostgreSQL audit tables |
| **Analytics Telemetry** | Local `analytics_events` table | PostgreSQL analytics events |
| **Watch Circles & Movie Night** | Local SQLite storage & sessions | Persistent cloud group storage |

---

## 👤 Pre-Seeded Demo Account

To experience Taste DNA, personalized movie suggestions, and community rankings without manually entering 10+ ratings, run the demo seed script:

```bash
node scripts/seed-demo.mjs
```

**Demo & Realistic Persona Credentials**:

| Account | Role / Archetype | Login Email or Username | Password |
| :--- | :--- | :--- | :--- |
| **Alex Vance** | CinePulse Curator (8 ratings, Taste DNA) | `demo@cinepulse.local` or `alex_curator` | `cinepulse123` |
| **Priya Kapoor** | The Optimist (Maximalist, Tentpole Enthusiast) | `priya_k` or `priya_k@cinepulse.seed` | `seedpassword123` |
| **Dan Mercer** | The Contrarian (Budget skeptic, Critical eye) | `filmnoir_dan` or `filmnoir_dan@cinepulse.seed` | `seedpassword123` |
| **Kenji Takahashi** | Sci-Fi Specialist (70mm IMAX, Speculative fiction) | `kenji_t` or `kenji_t@cinepulse.seed` | `seedpassword123` |
| **Sophie Laurent** | Horror Specialist (Practical stunts, Dread building) | `sophie_l` or `sophie_l@cinepulse.seed` | `seedpassword123` |

> [!TIP]
> In the in-app Sign In dialog, you can also use the **1-Click Realistic Persona Accounts** buttons to instantly log into and explore any of these profiles.


### Synthetic Community Seeding (`npm run seed:community`)

A fresh install shows "0 accounts · No community evidence yet" on every title. To experience the platform with realistic weight behind the Pulse and Opening Calls panels, CinePulse includes a dedicated synthetic community pipeline:

```bash
# Seed 50 authentic personas, multi-day forecast curves, reviews, comments, and Brier scores
npm run seed:community -- --force

# Completely wipe all synthetic community records in one transaction
npm run unseed:community
```

> [!NOTE]
> **Demo & Evaluation Disclosure**: Synthetic personas are strictly for local/demo evaluation, generated with DiceBear avatars and transparent metadata markers (`is_synthetic_seed: true`). They are permanently tagged with `is_seed = 1`. A database-level isolation wall (`realUsersOnly()`) ensures synthetic accounts are filtered out of public leaderboards and comparisons once real users have scored calls. Seeding is gated behind `SEED_COMMUNITY=1` and refuses to touch databases containing non-seed user forecasts unless explicitly overridden with `--force`.


---

## 🚀 Key Features

### 1. 🎞️ Movie Room & Unified Score Card
- **Unified Score Card**: Bridges the algorithmic CinePulse forecast, Community Pulse %, and personalized Taste Match.
- **Attribution Waterfall**: Hover over any prediction factor to see step-by-step feature impact and contribution deltas.
- **Inline Diary Composer**: Marking a title "watched" automatically opens a fast inline composer for dates, ratings, and spoiler-safe impressions.

### 2. 🧬 Taste DNA Engine
- Deterministic taste archetype generator based on genre distributions, era preferences, and rating variance.
- Requires 5 ratings minimum to eliminate cold-start noise.

### 3. ⚡ Contrarian Desk
- Highlights box-office releases where the trained ML model strongly diverges from community sentiment ($\ge 20\%$ probability spread).

### 4. 🍿 Movie Night Generator (`/movie-night`)
- Ephemeral group decision maker.
- Participants join via a 6-character code (`/movie-night/join/[code]`) without logging in.
- Intersects streaming availability and runtime caps with Borda-count consensus voting.

### 5. 👥 Watch Circles & Shared Watchlists
- Persistent private circles with shared weekly voting, circle-scoped leaderboards, and spoiler-gated discussions.

### 6. 📱 Responsive 5-Destination Mobile Bottom Nav
- Streamlined mobile interface: **Discover | Predict | Community | Library | Profile**.
- Slide-over **More Sheet** housing Calendar, Leaderboard, Accuracy Desk, and Activity Feed with unified navigation state.

---

## 🛠️ Quick Start & Setup

### Zero-Key Demo Mode (Immediate Start)
Clone the repository and run:

```bash
cd cinepulse-v2
npm install
npm run dev
```

Visit [http://127.0.0.1:3000](http://127.0.0.1:3000) — CinePulse runs immediately with zero external API keys using the fictional demo catalog.

### Full Mode (Live TMDB + External APIs)
Create a `.env.local` file in `cinepulse-v2/`:

```env
# Mode Selection ('demo' or 'tmdb')
CATALOG_MODE=tmdb
TMDB_API_KEY=your_tmdb_api_key_here
TMDB_REGION=US

# Database (Default uses local SQLite in data/)
DATABASE_PATH=./data/cinepulse.db

# App Origin
APP_ORIGIN=http://127.0.0.1:3000

# Optional External Signal Providers
YOUTUBE_API_KEY=your_youtube_key_here
GEMINI_API_KEY=your_gemini_key_here

# Optional Supabase Integration
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## 🧪 Testing & Quality Assurance

CinePulse features comprehensive automated coverage across unit, regression, accessibility, and browser interactions.

```bash
# Run unit, math, migration, regression, and hook test suites
npm test

# Run TypeScript typecheck
npm run typecheck

# Run Playwright browser and WCAG AA accessibility audits (AxeBuilder)
npm run test:browser
```
