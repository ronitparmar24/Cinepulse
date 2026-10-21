import { cacheGet, cacheSet } from '../db';
import { logMissingKeyOnce } from './base';

export interface WatchmodeDirectSource {
  sourceId: number;
  name: string;
  type: 'sub' | 'rent' | 'buy' | 'free';
  region: string;
  webUrl: string;
  format?: string | null;
  price?: number | null;
}

/**
 * Fetch direct watch links for a title using Watchmode API.
 * Caches 7 days in SQLite to stay well below the 2,500 req/month quota.
 */
export async function getWatchmodeDirectSources(
  numericTmdbId: number | string,
  mediaType: 'movie' | 'tv' = 'movie'
): Promise<WatchmodeDirectSource[]> {
  const apiKey = process.env.WATCHMODE_API_KEY || process.env.WATCHMODE_KEY;
  if (!apiKey) {
    logMissingKeyOnce('watchmode', 'WATCHMODE_API_KEY');
    return [];
  }

  const cacheKey = `watchmode:sources:${mediaType}:${numericTmdbId}`;
  const cached = cacheGet<WatchmodeDirectSource[]>(cacheKey);
  if (cached) return cached;

  try {
    const searchField = mediaType === 'tv' ? 'tmdb_tv_id' : 'tmdb_movie_id';
    const searchUrl = `https://api.watchmode.com/v1/search/?apiKey=${apiKey}&search_field=${searchField}&search_value=${numericTmdbId}`;

    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(6000) });
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();

    const titleResult = searchData?.title_results?.[0];
    if (!titleResult?.id) return [];

    const watchmodeId = titleResult.id;
    const sourcesUrl = `https://api.watchmode.com/v1/title/${watchmodeId}/sources/?apiKey=${apiKey}`;

    const sourcesRes = await fetch(sourcesUrl, { signal: AbortSignal.timeout(6000) });
    if (!sourcesRes.ok) return [];
    const rawSources = await sourcesRes.json();

    if (!Array.isArray(rawSources)) return [];

    // Deduplicate and filter down to verified web URLs
    const directSources: WatchmodeDirectSource[] = [];
    const seen = new Set<string>();

    for (const s of rawSources) {
      if (!s.web_url || typeof s.web_url !== 'string' || !s.web_url.startsWith('http')) continue;
      const key = `${s.name}-${s.type}`;
      if (seen.has(key)) continue;
      seen.add(key);

      directSources.push({
        sourceId: s.source_id,
        name: s.name,
        type: s.type,
        region: s.region || 'IN',
        webUrl: s.web_url,
        format: s.format || null,
        price: typeof s.price === 'number' ? s.price : null,
      });
    }

    // Cache 7 days (604,800,000 ms)
    cacheSet(cacheKey, directSources, 7 * 24 * 60 * 60 * 1000);
    return directSources;
  } catch {
    return [];
  }
}
