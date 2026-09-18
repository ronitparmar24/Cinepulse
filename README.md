# CinePulse 🎬

CinePulse is a modern, fast, local-first cinema tracking and prediction platform. It combines the community features of Letterboxd (reviews, watchlists, diaries) with a **built-in AI heuristic prediction engine** that estimates box office revenue and theatrical success probabilities for upcoming releases.

## 🚀 Quick Start Instructions

This repository contains two parts:
1. `cinepulse-frontend/` - Static HTML/CSS frontend concept
2. `cinepulse-v2/` - **The main Next.js application with the AI Prediction Engine**

### Running the App

You will need **Node.js 22.13.0** or newer.

```bash
# 1. Navigate to the v2 app directory
cd cinepulse-v2

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser to see the app!

By default, the app runs in `demo` mode with a fictional catalog. To use real movie data, see the detailed instructions in [`cinepulse-v2/README.md`](cinepulse-v2/README.md) to add a TMDB API token.

---

### Features inside `cinepulse-v2`
- **AI Prediction Engine:** Heuristic model estimating revenue ranges and hit/flop probabilities for upcoming films.
- **Community Forecasting:** Make your own "opening calls" (Hit/Flop) before a movie releases.
- **Library Management:** Track your "Want to watch", "Watching", and "Watched" lists.
- **Community Feed:** Share first impressions and full reviews.
- **Local-First Architecture:** Powered entirely by Next.js and Node's built-in SQLite (`node:sqlite`).