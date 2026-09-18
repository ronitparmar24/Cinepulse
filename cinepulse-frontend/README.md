# Cinepulse

A responsive, cinematic movie-discovery frontend combining frosted glass, original poster art, community first impressions, and transparent forecast previews.

## Run it

Open `index.html` in a modern browser, or serve this folder locally:

```sh
python3 -m http.server 3000
```

Then visit `http://localhost:3000`. There is no installation or build step. The Manrope font loads from jsDelivr; a system-font fallback works offline. Artwork is bundled locally.

## Files

- `index.html` — accessible app shell, navigation, dialog, and search.
- `styles.css` — responsive layout, glass effects, motion preferences, mobile navigation.
- `catalog.js` — explicitly fictional catalog and sample community content.
- `app.js` — navigation, filtering, sorting, watchlists, forecasts, votes, ratings, private takes, and export.
- `assets/` — original AI-generated concept artwork, optimized as WebP.

## Working interactions

Search by title, genre, or fictional director; filter Movies/Series and genres; change the spotlight; open title details; sort forecasts; save and export a watchlist; make a personal hit prediction; write a private first impression with an anticipation rating.

In Tasklet, user-created entries persist in three thread-scoped SQL tables: `cinepulse_watchlist`, `cinepulse_votes`, and `cinepulse_impressions`. A standalone copy uses browser local storage. This is a single preview space, not authentication or a production multi-user database.

## Before production

All titles, dates, people, forecasts, trends, and signal counts are fictional. Scores are handcrafted design fixtures, not calculated probabilities. The artwork is generated concept art, not official studio posters. Nothing posts to external platforms. There is no movie streaming or live trailer playback.

Replace fixtures with a licensed catalog, implement server-side API access, add authentication and per-user database policies, define separate film/series success targets, and validate a forecasting model on later releases. Check API licensing and derived-metric restrictions before using trailer or social data. Never expose secret API credentials in this frontend.

This folder can be served by any static hosting provider. Live API integration and public community features require additional backend work.
