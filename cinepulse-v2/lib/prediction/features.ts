import type { Title } from '../types';
import { getWikipediaPageviews } from '../fetchers/wikipedia';
import { getYouTubeTrailerStats } from '../fetchers/youtube';
import { getRedditBuzz } from '../fetchers/reddit';
import { getOmdbRatings } from '../fetchers/omdb';
import { getNewsCoverage } from '../fetchers/news';
import { getNearestFestival } from './festivals';
import { getTraktStats } from '../fetchers/trakt';
import { getTrailerSentiment } from '../fetchers/trailer-sentiment';

export interface FeatureValue<T = number | string | boolean | null> {
  value: T;
  source: 'tmdb' | 'wikipedia' | 'youtube' | 'reddit' | 'omdb' | 'gnews' | 'trakt' | 'festivals' | 'derived' | 'fallback';
  confidence: number; // 0.0 to 1.0
  fetchedAt: string;
}

export interface TitleFeatureVector {
  titleId: string;
  titleName: string;
  // Metadata features
  budgetUsd: FeatureValue<number | null>;
  logBudget: FeatureValue<number | null>;
  budgetTier: FeatureValue<'mega' | 'big' | 'mid' | 'low' | 'micro' | 'unknown'>;
  primaryGenre: FeatureValue<string>;
  genres: FeatureValue<string[]>;
  releaseMonth: FeatureValue<number | null>;
  isHolidayWindow: FeatureValue<boolean>;
  isSummerWindow: FeatureValue<boolean>;
  runtimeMinutes: FeatureValue<number | null>;
  isFranchise: FeatureValue<boolean>;
  tmdbPopularity: FeatureValue<number>;
  voteAverage: FeatureValue<number | null>;
  voteCount: FeatureValue<number>;
  // Indian festival release-window features (Track D / Task 3)
  daysToNearestFestival: FeatureValue<number | null>;
  festivalWeight: FeatureValue<number>;
  nearestFestivalName: FeatureValue<string | null>;
  // Hype features
  wikiPageviews30d: FeatureValue<number | null>;
  wikiSlope7d: FeatureValue<number | null>;
  youtubeTrailerViews: FeatureValue<number | null>;
  youtubeTrailerVelocity: FeatureValue<number | null>;
  redditMentions: FeatureValue<number | null>;
  redditAvgScore: FeatureValue<number | null>;
  pressCoverageCount: FeatureValue<number | null>;
  // Trakt hype features (Task 1)
  traktAnticipatedRank: FeatureValue<number | null>;
  traktListCountSlope: FeatureValue<number | null>;
  // Trailer sentiment features (Task 4)
  trailerPositiveRatio: FeatureValue<number | null>;
  trailerLanguageCoverage: FeatureValue<number | null>;
  // Critical review features (post-release)
  imdbRating: FeatureValue<number | null>;
  rottenTomatoesPct: FeatureValue<number | null>;
  metascore: FeatureValue<number | null>;
}


export async function extractFeatureVector(title: Title): Promise<TitleFeatureVector> {
  const now = new Date().toISOString();
  const releaseDate = title.releaseDate ? new Date(title.releaseDate) : null;
  const month = releaseDate ? releaseDate.getUTCMonth() + 1 : null;

  const isHoliday = month === 11 || month === 12;
  const isSummer = month !== null && month >= 5 && month <= 8;

  let tier: 'mega' | 'big' | 'mid' | 'low' | 'micro' | 'unknown' = 'unknown';
  if (title.budget) {
    if (title.budget >= 180_000_000) tier = 'mega';
    else if (title.budget >= 80_000_000) tier = 'big';
    else if (title.budget >= 30_000_000) tier = 'mid';
    else if (title.budget >= 10_000_000) tier = 'low';
    else tier = 'micro';
  }

  // Attempt to gather external hype & review features gracefully
  let wiki30d: number | null = null;
  let wikiSlope: number | null = null;
  let ytViews: number | null = null;
  let ytVelocity: number | null = null;
  let redditCount: number | null = null;
  let redditScore: number | null = null;
  let imdb: number | null = null;
  let rt: number | null = null;
  let meta: number | null = null;

  // Background promises for external free APIs
  const promises: Promise<void>[] = [];

  // 1. Wikipedia Pageviews
  promises.push(
    (async () => {
      try {
        const imdbId = (title as any).imdbId || (title as any).externalIds?.imdb_id || '';
        const stats = await getWikipediaPageviews(imdbId, title.title, title.releaseDate || undefined);
        if (stats) {
          wiki30d = stats.totalViews30d;
          wikiSlope = stats.slope7d;
        }
      } catch {}
    })()
  );

  // 2. YouTube Trailer Stats (if official trailer key present)
  promises.push(
    (async () => {
      try {
        const trailerKey = (title as any).trailerKey || (title as any).videos?.[0]?.key;
        if (trailerKey) {
          const stats = await getYouTubeTrailerStats(title.id, trailerKey);
          if (stats) {
            ytViews = stats.viewCount;
            ytVelocity = stats.viewVelocityPerDay;
          }
        }
      } catch {}
    })()
  );

  // 3. Reddit Public Chatter
  promises.push(
    (async () => {
      try {
        const buzz = await getRedditBuzz(title.title);
        if (buzz) {
          redditCount = buzz.postCount;
          redditScore = buzz.averageScore;
        }
      } catch {}
    })()
  );

  // 4. OMDb Ratings
  promises.push(
    (async () => {
      try {
        const imdbId = (title as any).imdbId || (title as any).externalIds?.imdb_id;
        if (imdbId) {
          const ratings = await getOmdbRatings(imdbId);
          if (ratings) {
            imdb = ratings.imdbRating;
            rt = ratings.rottenTomatoesPct;
            meta = ratings.metascore;
          }
        }
      } catch {}
    })()
  );

  // 5. GNews Press Coverage Count (pre-computed batch cache only)
  let pressCoverage: number | null = null;
  promises.push(
    (async () => {
      try {
        const stats = await getNewsCoverage(title.title, title.id, { allowLive: false });
        if (stats) {
          pressCoverage = stats.totalArticles;
        }
      } catch {}
    })()
  );

  await Promise.allSettled(promises);

  return {
    titleId: title.id,
    titleName: title.title,
    budgetUsd: {
      value: title.budget,
      source: title.source === 'tmdb' ? 'tmdb' : 'fallback',
      confidence: title.budget ? 0.95 : 0.2,
      fetchedAt: now,
    },
    logBudget: {
      value: title.budget && title.budget > 0 ? Math.log10(title.budget) : null,
      source: 'derived',
      confidence: title.budget ? 0.95 : 0.2,
      fetchedAt: now,
    },
    budgetTier: {
      value: tier,
      source: 'derived',
      confidence: tier !== 'unknown' ? 0.9 : 0.3,
      fetchedAt: now,
    },
    primaryGenre: {
      value: title.genres[0] || 'Unknown',
      source: 'tmdb',
      confidence: title.genres.length > 0 ? 0.9 : 0.1,
      fetchedAt: now,
    },
    genres: {
      value: title.genres,
      source: 'tmdb',
      confidence: title.genres.length > 0 ? 0.9 : 0.1,
      fetchedAt: now,
    },
    releaseMonth: {
      value: month,
      source: 'tmdb',
      confidence: month ? 0.9 : 0.2,
      fetchedAt: now,
    },
    isHolidayWindow: {
      value: isHoliday,
      source: 'derived',
      confidence: 0.9,
      fetchedAt: now,
    },
    isSummerWindow: {
      value: isSummer,
      source: 'derived',
      confidence: 0.9,
      fetchedAt: now,
    },
    runtimeMinutes: {
      value: title.runtime,
      source: 'tmdb',
      confidence: title.runtime ? 0.9 : 0.3,
      fetchedAt: now,
    },
    isFranchise: {
      value: Boolean(title.title.match(/:\s|\s\d+$|\sPart\s|\sChapter\s/i)),
      source: 'derived',
      confidence: 0.8,
      fetchedAt: now,
    },
    tmdbPopularity: {
      value: title.popularity || 0,
      source: 'tmdb',
      confidence: 0.9,
      fetchedAt: now,
    },
    voteAverage: {
      value: title.voteAverage,
      source: 'tmdb',
      confidence: title.voteAverage ? 0.9 : 0.2,
      fetchedAt: now,
    },
    voteCount: {
      value: (title as any).voteCount || 0,
      source: 'tmdb',
      confidence: 0.9,
      fetchedAt: now,
    },
    daysToNearestFestival: {
      value: getNearestFestival(title.releaseDate).daysToNearestFestival,
      source: 'festivals',
      confidence: title.releaseDate ? 0.95 : 0.0,
      fetchedAt: now,
    },
    festivalWeight: {
      value: getNearestFestival(title.releaseDate).festivalWeight,
      source: 'festivals',
      confidence: title.releaseDate ? 0.95 : 0.0,
      fetchedAt: now,
    },
    nearestFestivalName: {
      value: getNearestFestival(title.releaseDate).festivalName,
      source: 'festivals',
      confidence: title.releaseDate ? 0.95 : 0.0,
      fetchedAt: now,
    },
    traktAnticipatedRank: {
      value: getTraktStats(title.id)?.rankAnticipated ?? null,
      source: 'trakt',
      confidence: getTraktStats(title.id)?.rankAnticipated ? 0.9 : 0.0,
      fetchedAt: now,
    },
    traktListCountSlope: {
      value: getTraktStats(title.id)?.listCountSlope14d ?? null,
      source: 'trakt',
      confidence: getTraktStats(title.id)?.listCountSlope14d !== null ? 0.85 : 0.0,
      fetchedAt: now,
    },
    trailerPositiveRatio: {
      value: getTrailerSentiment(title.id)?.positiveRatio ?? null,
      source: 'youtube',
      confidence: getTrailerSentiment(title.id)?.positiveRatio !== null ? 0.85 : 0.0,
      fetchedAt: now,
    },
    trailerLanguageCoverage: {
      value: getTrailerSentiment(title.id)?.languageCoverage ?? null,
      source: 'youtube',
      confidence: getTrailerSentiment(title.id)?.languageCoverage !== null ? 0.85 : 0.0,
      fetchedAt: now,
    },
    wikiPageviews30d: {
      value: wiki30d,
      source: 'wikipedia',
      confidence: wiki30d !== null ? 0.85 : 0.0,
      fetchedAt: now,
    },
    wikiSlope7d: {
      value: wikiSlope,
      source: 'wikipedia',
      confidence: wikiSlope !== null ? 0.85 : 0.0,
      fetchedAt: now,
    },
    youtubeTrailerViews: {
      value: ytViews,
      source: 'youtube',
      confidence: ytViews !== null ? 0.9 : 0.0,
      fetchedAt: now,
    },
    youtubeTrailerVelocity: {
      value: ytVelocity,
      source: 'youtube',
      confidence: ytVelocity !== null ? 0.9 : 0.0,
      fetchedAt: now,
    },
    redditMentions: {
      value: redditCount,
      source: 'reddit',
      confidence: redditCount !== null ? 0.8 : 0.0,
      fetchedAt: now,
    },
    redditAvgScore: {
      value: redditScore,
      source: 'reddit',
      confidence: redditScore !== null ? 0.8 : 0.0,
      fetchedAt: now,
    },
    pressCoverageCount: {
      value: pressCoverage,
      source: 'gnews',
      confidence: pressCoverage !== null ? 0.8 : 0.0,
      fetchedAt: now,
    },
    imdbRating: {
      value: imdb,
      source: 'omdb',
      confidence: imdb !== null ? 0.95 : 0.0,
      fetchedAt: now,
    },
    rottenTomatoesPct: {
      value: rt,
      source: 'omdb',
      confidence: rt !== null ? 0.95 : 0.0,
      fetchedAt: now,
    },
    metascore: {
      value: meta,
      source: 'omdb',
      confidence: meta !== null ? 0.95 : 0.0,
      fetchedAt: now,
    },
  };
}
