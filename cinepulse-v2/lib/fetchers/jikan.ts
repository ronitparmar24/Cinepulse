import { unifiedFetch } from './base';

export interface JikanAnime {
  mal_id: number;
  url: string;
  images?: {
    jpg?: { image_url?: string; small_image_url?: string; large_image_url?: string };
    webp?: { image_url?: string; small_image_url?: string; large_image_url?: string };
  };
  title: string;
  title_english?: string;
  title_japanese?: string;
  type?: string;
  episodes?: number;
  status?: string;
  aired?: { from?: string; to?: string; string?: string };
  duration?: string;
  rating?: string;
  score?: number;
  scored_by?: number;
  rank?: number;
  popularity?: number;
  synopsis?: string;
  genres?: Array<{ mal_id: number; name: string }>;
  studios?: Array<{ mal_id: number; name: string }>;
}

export interface JikanSearchResponse {
  data?: JikanAnime[];
  pagination?: {
    last_visible_page: number;
    has_next_page: boolean;
  };
}

export interface JikanSingleResponse {
  data?: JikanAnime;
}

/**
 * Searches anime using the keyless Jikan (MyAnimeList) API.
 */
export async function searchJikanAnime(query: string, limit = 10): Promise<JikanAnime[]> {
  if (!query || !query.trim()) return [];

  const endpoint = 'https://api.jikan.moe/v4/anime';
  const res = await unifiedFetch<JikanSearchResponse>({
    provider: 'jikan',
    endpoint,
    params: {
      q: query.trim(),
      limit: Math.min(Math.max(1, limit), 25),
      sfw: true,
    },
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  });

  return res.data?.data || [];
}

/**
 * Retrieves full details for an anime by MyAnimeList ID.
 */
export async function getJikanAnimeDetails(malId: number): Promise<JikanAnime | null> {
  if (!malId || malId <= 0) return null;

  const endpoint = `https://api.jikan.moe/v4/anime/${malId}/full`;
  const res = await unifiedFetch<JikanSingleResponse>({
    provider: 'jikan',
    endpoint,
    ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  return res.data?.data || null;
}
