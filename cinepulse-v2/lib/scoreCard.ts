import { titleById, watchProviders } from './catalog';
import { getPulse } from './pulse';
import { getPrediction } from './prediction';
import { calculateTitleTasteMatch } from './tasteMatch';
import { formatBoxOfficeRange, SCORE_THRESHOLDS } from './scoreThresholds';
import { getOmdbRatings, getOmdbRatingsByTitle } from './fetchers/omdb';
import { cacheGet, cacheSet } from './db';
import type { User, Title, WatchProvider } from './types';

export interface ScoreCardData {
  titleId: string;
  title: Title;
  tasteMatch: {
    available: boolean;
    matchScore: number | null;
    reason?: string;
    sampleSize?: number;
    requiredSampleSize: number;
  };
  communityPulse: {
    available: boolean;
    totalCalls: number;
    hitPercentage: number | null;
    flopPercentage: number | null;
    statusText: string;
  };
  criticsTmdb: {
    voteAverage: number;
    voteCount: number;
    formattedScore: string;
  };
  omdb?: {
    available: boolean;
    imdbRating: number | null;
    imdbId?: string | null;
    rottenTomatoesPct: number | null;
    metascore: number | null;
    rated?: string | null;
    awards?: string | null;
    boxOffice?: string | null;
  } | null;
  boxOfficeForecast: {
    available: boolean;
    predictedGrossRange: string;
    pointEstimate: number;
    confidenceLevel: string;
    category: string;
  };
  streaming: {
    flatrate: WatchProvider[];
    rent: WatchProvider[];
    buy: WatchProvider[];
    link?: string | null;
  };
}

interface CachedScoreCardEntry {
  data: ScoreCardData;
  expiresAt: number;
}

const scoreCardMemoryCache = new Map<string, CachedScoreCardEntry>();
const SCORE_CARD_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes in-memory / persistent cache

export function clearScoreCardCache(titleId?: string): void {
  if (titleId) {
    for (const key of scoreCardMemoryCache.keys()) {
      if (key.startsWith(`score_card:${titleId}`)) {
        scoreCardMemoryCache.delete(key);
      }
    }
  } else {
    scoreCardMemoryCache.clear();
  }
}

export async function getUnifiedScoreCard(
  titleId: string,
  viewer?: User | null
): Promise<ScoreCardData> {
  const cacheKey = `score_card:${titleId}:${viewer?.id || 'guest'}`;
  const now = Date.now();

  // Tier 1: Check fast in-memory cache
  const inMem = scoreCardMemoryCache.get(cacheKey);
  if (inMem && inMem.expiresAt > now) {
    return inMem.data;
  }

  // Tier 2: Check SQLite api_cache table
  try {
    const dbCached = cacheGet<ScoreCardData>(cacheKey);
    if (dbCached) {
      scoreCardMemoryCache.set(cacheKey, { data: dbCached, expiresAt: now + SCORE_CARD_CACHE_TTL_MS });
      return dbCached;
    }
  } catch {
    // continue to fetch if cache read encounters issue
  }

  const title = await titleById(titleId);
  const providers = await watchProviders(titleId);
  const pulse = await getPulse(titleId, viewer || null);
  const prediction = await getPrediction(titleId, title);

  // 1. Taste Match gate (< 5 ratings -> hidden / not available)
  const taste = calculateTitleTasteMatch(viewer?.id || null, title);

  // 2. Community Pulse gate (< 10 calls -> "Not enough calls yet")
  const totalCalls = pulse.count || 0;
  const pulseAvailable = totalCalls >= SCORE_THRESHOLDS.MIN_COMMUNITY_CALLS_FOR_PULSE;
  const hitRatio = pulse.hitShare ?? (totalCalls > 0 ? Math.round((pulse.hit / totalCalls) * 100) : null);
  const flopRatio = hitRatio !== null ? 100 - hitRatio : null;

  // 3. Box Office Forecast (range representation, e.g. $185M–$215M)
  const p10 = prediction.p10RevenueUsd ?? (prediction.revenueRange ? prediction.revenueRange[0] : null);
  const p90 = prediction.p90RevenueUsd ?? (prediction.revenueRange ? prediction.revenueRange[1] : null);
  const boRange = formatBoxOfficeRange(p10, p90);

  const category = prediction.hitProbability >= 65
    ? 'Hit'
    : prediction.hitProbability <= 35
    ? 'Flop'
    : 'Moderate';

  // 4. Critical Consensus from OMDb (Rotten Tomatoes, IMDb, Metascore)
  let omdb: ScoreCardData['omdb'] = null;
  try {
    const rawOmdb = title.imdbId
      ? await getOmdbRatings(title.imdbId, { isReleased: title.status === 'released' })
      : await getOmdbRatingsByTitle(title.title, title.releaseDate ? parseInt(title.releaseDate.slice(0, 4), 10) : undefined, { isReleased: title.status === 'released' });
    if (rawOmdb && (rawOmdb.imdbRating !== null || rawOmdb.rottenTomatoesPct !== null || rawOmdb.metascore !== null || rawOmdb.rated || rawOmdb.awards)) {
      omdb = {
        available: true,
        imdbRating: rawOmdb.imdbRating,
        imdbId: rawOmdb.imdbId,
        rottenTomatoesPct: rawOmdb.rottenTomatoesPct,
        metascore: rawOmdb.metascore,
        rated: rawOmdb.rated,
        awards: rawOmdb.awards,
        boxOffice: rawOmdb.boxOffice,
      };
    }
  } catch {
    omdb = null;
  }

  const result: ScoreCardData = {
    titleId,
    title,
    tasteMatch: {
      available: taste.available,
      matchScore: taste.score,
      reason: taste.reason,
      sampleSize: taste.ratedCount,
      requiredSampleSize: SCORE_THRESHOLDS.MIN_RATINGS_FOR_TASTE_MATCH,
    },
    communityPulse: {
      available: pulseAvailable,
      totalCalls,
      hitPercentage: pulseAvailable ? hitRatio : null,
      flopPercentage: pulseAvailable ? flopRatio : null,
      statusText: pulseAvailable && hitRatio !== null ? `${hitRatio}% Call Hit` : 'Not enough calls yet',
    },
    criticsTmdb: {
      voteAverage: title.voteAverage ?? 0,
      voteCount: title.voteCount,
      formattedScore: title.voteAverage !== null && title.voteAverage !== undefined
        ? `${title.voteAverage.toFixed(1)} / 10`
        : 'Unrated',
    },
    omdb,
    boxOfficeForecast: {
      available: true,
      predictedGrossRange: boRange,
      pointEstimate: prediction.p50RevenueUsd ?? prediction.revenueEstimate ?? 0,
      confidenceLevel: prediction.confidence,
      category,
    },
    streaming: {
      flatrate: providers.flatrate || [],
      rent: providers.rent || [],
      buy: providers.buy || [],
      link: providers.link,
    },
  };

  // Cache in server memory and database
  scoreCardMemoryCache.set(cacheKey, { data: result, expiresAt: Date.now() + SCORE_CARD_CACHE_TTL_MS });
  try {
    cacheSet(cacheKey, result, SCORE_CARD_CACHE_TTL_MS);
  } catch {
    // continue
  }

  return result;
}
