# Cinepulse data sources and boundaries

This local application keeps fictional demo records separate from provider records. Demo titles and artwork are bundled under `public/assets/`, carry `source: "demo"`, and are never mixed with TMDB IDs or presented as real movie/TV data.

## TMDB

TMDB is the live catalog provider when `CATALOG_MODE=tmdb` and a locally stored `TMDB_READ_TOKEN` is present. Requests are made only by the Next.js server; the token is never sent to the browser, placed in a `NEXT_PUBLIC_` variable, printed by the smoke script, or included in responses.

TMDB supplies title metadata, posters/backdrops, cast, video/trailer references, ratings, release metadata, and season/episode metadata where available. Data is requested on demand and cached briefly server-side. Missing revenue, budget, images, dates, cast, trailers, or episodes remain missing; Cinepulse does not convert missing values to zero or invent replacements.

Read Access Token setup and current terms: [TMDB getting started](https://developer.themoviedb.org/docs/getting-started), [API access](https://www.themoviedb.org/settings/api), [FAQ/licensing](https://developer.themoviedb.org/docs/faq), and [image basics](https://developer.themoviedb.org/docs/image-basics). Check current TMDB attribution, noncommercial eligibility, image, and redistribution terms before publishing or monetizing. Catalog access does not transfer poster/backdrop copyrights.

### Dates, regions, and completeness

- Movie list/detail records use TMDB's `release_date` / primary release date field. A requested `TMDB_REGION` is sent where supported, but this field is not asserted to be the local theatrical date for every title.
- TV records use `first_air_date`, not a territory-specific broadcast or streaming availability date.
- Invalid calendar dates are discarded as unknown. A future/unknown date is not treated as released.
- Upcoming is a paginated loaded release list, not an exhaustive month calendar.
- `trending/all` includes people. Its reported `totalResults` intentionally counts only retained movie/TV records on the loaded page, not TMDB's mixed person/title total.
- `media=all` merges separate movie and TV provider pages. Counts are qualified in additive response metadata and the result is not claimed to be one globally ranked list.
- Text search means all provider matches in the selected media type. It is not silently constrained by the selected trending/top/upcoming collection. Search and genre are separate modes.

## Demo content

Demo data is clearly fictional concept content for offline exploration. It includes no seeded accounts, reviews, ratings, votes, social engagement, forecasts, trailer analytics, or AI/model outputs. Community and forecast records come only from accounts created in the current local installation.

## Optional/future sources not connected

The following are intentionally not collected or used by this version:

- YouTube view/like/comment analytics. A trailer URL is metadata; analytics require separate quota, policy, refresh, and derived-metric review. See [YouTube policies](https://developers.google.com/youtube/terms/developer-policies).
- Social-platform posts or sentiment from X, Reddit, Instagram, or similar services. No scraping or bulk collection is performed. Public visibility or an API key does not itself grant reuse, redistribution, or model-training rights.
- TVmaze or OMDb enrichment. These require separate attribution, licensing, quota, ID-mapping, and current-terms review. See [TVmaze API](https://www.tvmaze.com/api) and [OMDb](https://www.omdbapi.com/).
- Financial outcomes, studio profit, audience measurement, or a trained hit/flop model. TMDB popularity, ratings, and a community poll are not financial probabilities. No provider outcome is silently inferred when evidence is missing.

## Local verification

After entering a token locally, run the opt-in, credential-safe smoke test from the project root:

```sh
node --env-file-if-exists=.env.local scripts/check-tmdb.mjs
```

It checks configuration, genres, movie/TV search, trending, upcoming, top-rated, details with credits/videos, and a season/episode endpoint when available. It prints only endpoint labels, statuses, counts, selected IDs, and a summary—not the token or response bodies. Without a token it makes no request.
