import { unifiedFetch } from './base';

export interface TVmazeShow {
  id: number;
  name: string;
  type: string;
  language: string;
  genres: string[];
  status: string;
  runtime?: number;
  premiered?: string;
  officialSite?: string;
  rating?: { average?: number };
  summary?: string;
  image?: { medium?: string; original?: string };
}

export interface TVmazeSearchResult {
  score: number;
  show: TVmazeShow;
}

/**
 * Searches TV series using the keyless TVmaze public API.
 */
export async function searchTVmaze(query: string): Promise<TVmazeShow[]> {
  if (!query || !query.trim()) return [];

  const endpoint = 'https://api.tvmaze.com/search/shows';
  const res = await unifiedFetch<TVmazeSearchResult[]>({
    provider: 'tvmaze',
    endpoint,
    params: { q: query.trim() },
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  });

  if (!res.data || !Array.isArray(res.data)) return [];
  return res.data.map((item) => item.show);
}

/**
 * Retrieves a TV show by IMDb ID using TVmaze lookup.
 */
export async function getTVmazeByImdb(imdbId: string): Promise<TVmazeShow | null> {
  if (!imdbId) return null;

  const endpoint = 'https://api.tvmaze.com/lookup/shows';
  const res = await unifiedFetch<TVmazeShow>({
    provider: 'tvmaze',
    endpoint,
    params: { imdb: imdbId },
    ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  return res.data;
}

/**
 * Retrieves a TV show by TVmaze internal ID.
 */
export async function getTVmazeShow(id: number): Promise<TVmazeShow | null> {
  if (!id || id <= 0) return null;

  const endpoint = `https://api.tvmaze.com/shows/${id}`;
  const res = await unifiedFetch<TVmazeShow>({
    provider: 'tvmaze',
    endpoint,
    ttlMs: 7 * 24 * 60 * 60 * 1000,
  });

  return res.data;
}
