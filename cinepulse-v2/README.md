# CinePulse v2.1 🎬

CinePulse is a modern, fast, local-first cinema tracking and prediction platform. It combines the community features of Letterboxd (reviews, watchlists, diaries) with a **built-in AI heuristic prediction engine** that estimates box office revenue and theatrical success probabilities for upcoming releases.

![CinePulse Discovery Page](file:///C:/Users/rey/.gemini/antigravity-ide/brain/ba770385-4553-4789-8ec2-02dc52d9ed59/discovery_hero_1789714781481.png)

## Features

- **AI Prediction Engine:** Heuristic model estimates revenue ranges and hit/flop probabilities for upcoming films using budget, genre, TMDB popularity, and release seasonality.
- **Community Forecasting:** Users can make their own "opening calls" (Hit/Flop) before a movie releases. Predictions are locked on release day.
- **Rich Title Details:** View synopses, cast, budget/revenue facts, and TMDB ratings.
- **Library Management:** Track your "Want to watch", "Watching", and "Watched" lists. Add private 5-star ratings.
- **Community Feed:** Share first impressions and full reviews (with spoiler protection).
- **Local-First Architecture:** Powered entirely by Next.js and Node's built-in SQLite (`node:sqlite`). No external database required.
- **Zero-Setup Demo Mode:** Runs immediately with a fictional catalog if you don't have a TMDB API token.

![Prediction Desk](file:///C:/Users/rey/.gemini/antigravity-ide/brain/ba770385-4553-4789-8ec2-02dc52d9ed59/prediction_desk_1789714961648.png)

## Tech Stack

- **Framework:** Next.js 16 (App Router) + React 19
- **Styling:** Custom Vanilla CSS (Zero-runtime, responsive, glassmorphism UI)
- **Database:** SQLite (via `node:sqlite` — requires Node.js 22.13+)
- **Icons:** Lucide React
- **Data Source:** TMDB API (Optional, falls back to local demo catalog)

## Getting Started

### Prerequisites
- Node.js **22.13.0** or newer (required for the native `node:sqlite` module).

### Installation

1. Clone the repository and install dependencies:
   ```sh
   git clone <your-repo-url>
   cd cinepulse-v2
   npm ci
   ```

2. (Optional) Set up TMDB Integration:
   By default, the app runs in `demo` mode with a few fictional titles. To use real movies, get a free API Read Access Token from [TMDB](https://www.themoviedb.org/settings/api).
   
   Create a `.env.local` file in the root directory:
   ```env
   CATALOG_MODE=tmdb
   TMDB_READ_TOKEN=your_tmdb_token_here
   TMDB_REGION=US
   ```

3. Start the development server:
   ```sh
   npm run dev
   ```

4. Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser.

## The AI Prediction Engine

The built-in prediction engine (`lib/prediction.ts`) is a rule-based heuristic model. It analyzes:
- **Genre:** Multipliers based on historical box-office performance (e.g., Action/Sci-Fi generally have higher ceilings than Drama).
- **Budget Tier:** Different ROI expectations for Mega ($180m+), Big, Mid, Low, and Micro budgets.
- **Release Season:** Adjustments for Summer blockbuster windows, Holiday releases, and slower periods like January/February.
- **Metadata Signals:** TMDB popularity scores and pre-release vote averages.

*Note: This is a transparent heuristic estimate for entertainment and exploration, not a trained financial machine-learning model.*

## Architecture Notes

- **Single Process:** Next.js API routes handle everything. There is no separate backend service.
- **Database:** `data/cinepulse.db` is created automatically on first run. Schema migrations are handled automatically in `lib/db.ts`.
- **Stateless Auth:** Uses encrypted HTTP-only cookies (`lib/auth.ts`) with scrypt password hashing.
- **Caching:** TMDB API responses are cached in SQLite to respect rate limits and improve performance.

## License

This project is for educational/demonstration purposes. Film metadata and artwork belong to their respective owners (TMDB or fictional creations).
