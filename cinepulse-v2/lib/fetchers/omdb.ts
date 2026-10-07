import { unifiedFetch, logMissingKeyOnce, fetchCacheKey } from './base';
import { cacheGet, cacheGetStale, db } from '../db';
import { dailyQuotaFor } from '../providers/registry';
import { getUsageToday } from '../providers/usage';

export interface OmdbRatings {
  imdbId: string;
  imdbRating: number | null;
  rottenTomatoesPct: number | null;
  metascore: number | null;
  boxOffice: string | null;
  rated: string | null;
  awards: string | null;
  stale?: boolean;
}

function parseOmdbPayload(imdbId: string, data: any, stale?: boolean): OmdbRatings | null {
  if (data?.Response === 'False' || !data) return null;

  let rtPct: number | null = null;
  if (Array.isArray(data.Ratings)) {
    const rt = data.Ratings.find((r: any) => r.Source === 'Rotten Tomatoes');
    if (rt?.Value) {
      const parsed = parseInt(rt.Value.replace('%', ''), 10);
      if (!isNaN(parsed)) rtPct = parsed;
    }
  }

  const imdbNum = parseFloat(data.imdbRating || '');
  const metaNum = parseInt(data.Metascore || '', 10);

  return {
    imdbId: data.imdbID || imdbId,
    imdbRating: isNaN(imdbNum) ? null : imdbNum,
    rottenTomatoesPct: rtPct,
    metascore: isNaN(metaNum) ? null : metaNum,
    boxOffice: data.BoxOffice && data.BoxOffice !== 'N/A' ? data.BoxOffice : null,
    rated: data.Rated && data.Rated !== 'N/A' ? data.Rated : null,
    awards: data.Awards && data.Awards !== 'N/A' ? data.Awards : null,
    stale,
  };
}

/**
 * Fetch OMDb ratings by IMDb ID.
 * Caches 7 days (168h) for released titles, 24h for upcoming titles.
 * Gracefully serves stale cache when over daily quota (1,000 requests/day).
 */
export async function getOmdbRatings(
  imdbId: string,
  opts?: { isReleased?: boolean; skipCache?: boolean }
): Promise<OmdbRatings | null> {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) {
    logMissingKeyOnce('omdb', 'OMDB_API_KEY');
    return null;
  }
  if (!imdbId) return null;

  const isReleased = opts?.isReleased !== false;
  const ttlMs = isReleased ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  const endpoint = 'https://www.omdbapi.com/';
  const res = await unifiedFetch<{
    Response?: string;
    imdbID?: string;
    imdbRating?: string;
    Metascore?: string;
    BoxOffice?: string;
    Rated?: string;
    Awards?: string;
    Ratings?: Array<{ Source: string; Value: string }>;
  }>({
    provider: 'omdb',
    endpoint,
    params: {
      i: imdbId,
      apikey: apiKey,
    },
    ttlMs,
    skipCache: opts?.skipCache,
  });

  return parseOmdbPayload(imdbId, res.data, res.stale);
}

/**
 * Fetch OMDb ratings by title and optional year when IMDb ID is not available.
 */
export async function getOmdbRatingsByTitle(
  title: string,
  year?: number,
  opts?: { isReleased?: boolean }
): Promise<OmdbRatings | null> {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey || !title) return null;

  const isReleased = opts?.isReleased !== false;
  const ttlMs = isReleased ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  const endpoint = 'https://www.omdbapi.com/';
  const params: Record<string, string | number> = {
    t: title,
    apikey: apiKey,
  };
  if (year) params.y = year;

  const res = await unifiedFetch<{
    Response?: string;
    imdbID?: string;
    imdbRating?: string;
    Metascore?: string;
    BoxOffice?: string;
    Rated?: string;
    Awards?: string;
    Ratings?: Array<{ Source: string; Value: string }>;
  }>({
    provider: 'omdb',
    endpoint,
    params,
    ttlMs,
  });

  return parseOmdbPayload(res.data?.imdbID || title, res.data, res.stale);
}

/**
 * Fast cache-only reader: returns cached or stale OMDb ratings without making network calls.
 * Used for Taste DNA calculations and real-time page rendering.
 */
export function getOmdbRatingsCached(imdbId: string): OmdbRatings | null {
  const apiKey = process.env.OMDB_API_KEY || '';
  const key = fetchCacheKey('omdb', 'https://www.omdbapi.com/', { i: imdbId, apikey: apiKey });
  const fresh = cacheGet<{ data: any }>(key);
  if (fresh?.data) {
    return parseOmdbPayload(imdbId, fresh.data, false);
  }
  const stale = cacheGetStale<{ data: any }>(key);
  if (stale?.value?.data) {
    return parseOmdbPayload(imdbId, stale.value.data, true);
  }
  return null;
}

/**
 * Nightly pre-warm job: Pre-computes and caches OMDb ratings for top titles.
 * Ensures the user is never the trigger for external OMDb calls.
 */
export async function prewarmOmdbCache(
  titles?: Array<{ imdbId?: string; title: string; year?: number; isReleased?: boolean }>,
  maxToWarm = 100
): Promise<{ warmed: number; skipped: number }> {
  let targetTitles = titles;
  if (!targetTitles || targetTitles.length === 0) {
    const { catalog } = await import('../catalog');
    const upcoming = await catalog({ media: 'movie', collection: 'upcoming', page: 1 }).catch(() => ({ items: [] }));
    targetTitles = upcoming.items.map(t => ({
      title: t.title,
      year: t.releaseDate ? parseInt(t.releaseDate.slice(0, 4), 10) : undefined,
      isReleased: false,
    }));
  }

  let warmed = 0;
  let skipped = 0;
  const quota = dailyQuotaFor('omdb') ?? 1000;
  const currentUsed = getUsageToday('omdb');
  const budget = Math.max(0, quota - currentUsed - 50); // keep a safety buffer of 50

  const candidates = targetTitles.slice(0, Math.min(maxToWarm, budget));

  for (const t of candidates) {
    if (t.imdbId) {
      const existing = getOmdbRatingsCached(t.imdbId);
      if (existing && !existing.stale) {
        skipped++;
        continue;
      }
      await getOmdbRatings(t.imdbId, { isReleased: t.isReleased });
      warmed++;
    } else if (t.title) {
      await getOmdbRatingsByTitle(t.title, t.year, { isReleased: t.isReleased });
      warmed++;
    }
  }

  return { warmed, skipped };
}
