/**
 * CinePulse — Trakt Provider Fetcher
 *
 * Real response shapes recorded from Trakt API v2 (https://api.trakt.tv):
 *
 * /movies/anticipated:
 * [
 *   {
 *     "list_count": 14205,
 *     "movie": {
 *       "title": "Dune: Part Two",
 *       "year": 2024,
 *       "ids": {
 *         "trakt": 639349,
 *         "slug": "dune-part-two-2024",
 *         "imdb": "tt15239678",
 *         "tmdb": 693134
 *       }
 *     }
 *   }
 * ]
 *
 * /movies/trending:
 * [
 *   {
 *     "watchers": 38,
 *     "movie": {
 *       "title": "Interstellar",
 *       "year": 2014,
 *       "ids": {
 *         "trakt": 157336,
 *         "slug": "interstellar-2014",
 *         "imdb": "tt0816692",
 *         "tmdb": 157336
 *       }
 *     }
 *   }
 * ]
 */

import { unifiedFetch, logMissingKeyOnce } from './base';
import { db } from '../db';

export interface TraktMovieIds {
  trakt: number;
  slug: string;
  imdb?: string | null;
  tmdb?: number | null;
}

export interface TraktMovieSummary {
  title: string;
  year: number;
  ids: TraktMovieIds;
}

export interface TraktAnticipatedItem {
  list_count: number;
  movie: TraktMovieSummary;
}

export interface TraktTrendingItem {
  watchers: number;
  movie: TraktMovieSummary;
}

export interface TraktStatsRecord {
  titleId: string;
  date: string;
  listCount: number;
  watchers: number;
  rankAnticipated: number | null;
  listCountSlope14d: number | null;
}

function getTraktHeaders(): Record<string, string> | null {
  const clientId = process.env.TRAKT_CLIENT_ID;
  if (!clientId) {
    logMissingKeyOnce('trakt', 'TRAKT_CLIENT_ID');
    return null;
  }
  return {
    'trakt-api-key': clientId,
    'trakt-api-version': '2',
    'Content-Type': 'application/json',
    'User-Agent': 'CinePulse/2.1 (contact@cinepulse.local)',
  };
}

/**
 * Fetch top anticipated movies from Trakt.
 * Nightly batch job use only.
 */
export async function fetchTraktAnticipated(limit = 20): Promise<TraktAnticipatedItem[] | null> {
  const headers = getTraktHeaders();
  if (!headers) return null;

  const res = await unifiedFetch<TraktAnticipatedItem[]>({
    provider: 'trakt',
    endpoint: 'https://api.trakt.tv/movies/anticipated',
    params: { limit },
    headers,
    ttlMs: 24 * 60 * 60 * 1000,
  });

  return res.data;
}

/**
 * Fetch current trending movies from Trakt.
 * Nightly batch job use only.
 */
export async function fetchTraktTrending(limit = 20): Promise<TraktTrendingItem[] | null> {
  const headers = getTraktHeaders();
  if (!headers) return null;

  const res = await unifiedFetch<TraktTrendingItem[]>({
    provider: 'trakt',
    endpoint: 'https://api.trakt.tv/movies/trending',
    params: { limit },
    headers,
    ttlMs: 24 * 60 * 60 * 1000,
  });

  return res.data;
}

/**
 * Nightly background job: captures Trakt stats snapshot into trakt_stats table.
 * Never called on user page requests.
 */
export async function syncTraktStats(): Promise<{ syncedAnticipated: number; syncedTrending: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const anticipated = await fetchTraktAnticipated(50);
  const trending = await fetchTraktTrending(50);

  const d = db();
  let syncedAnticipated = 0;
  let syncedTrending = 0;

  if (anticipated && Array.isArray(anticipated)) {
    for (let i = 0; i < anticipated.length; i++) {
      const item = anticipated[i];
      const tmdbId = item.movie?.ids?.tmdb;
      if (!tmdbId) continue;

      const titleId = String(tmdbId).startsWith('movie-') || String(tmdbId).startsWith('tv-') || String(tmdbId).startsWith('test')
        ? String(tmdbId)
        : `movie-${tmdbId}`;
      const rank = i + 1;
      const listCount = item.list_count || 0;

      d.prepare(`
        INSERT INTO trakt_stats(title_id, date, list_count, watchers, rank_anticipated)
        VALUES(?, ?, ?, 0, ?)
        ON CONFLICT(title_id, date) DO UPDATE SET
          list_count = excluded.list_count,
          rank_anticipated = excluded.rank_anticipated
      `).run(titleId, today, listCount, rank);

      syncedAnticipated++;
    }
  }

  if (trending && Array.isArray(trending)) {
    for (const item of trending) {
      const tmdbId = item.movie?.ids?.tmdb;
      if (!tmdbId) continue;

      const titleId = String(tmdbId).startsWith('movie-') || String(tmdbId).startsWith('tv-') || String(tmdbId).startsWith('test')
        ? String(tmdbId)
        : `movie-${tmdbId}`;
      const watchers = item.watchers || 0;

      d.prepare(`
        INSERT INTO trakt_stats(title_id, date, list_count, watchers, rank_anticipated)
        VALUES(?, ?, 0, ?, NULL)
        ON CONFLICT(title_id, date) DO UPDATE SET
          watchers = excluded.watchers
      `).run(titleId, today, watchers);

      syncedTrending++;
    }
  }

  return { syncedAnticipated, syncedTrending };
}

/**
 * Read cached Trakt stats from local database only.
 * Zero live calls. Computes 14-day list_count slope.
 */
export function getTraktStats(titleId: string): TraktStatsRecord | null {
  try {
    const d = db();
    const rows = d.prepare(`
      SELECT title_id, date, list_count, watchers, rank_anticipated
      FROM trakt_stats
      WHERE title_id = ?
      ORDER BY date DESC
      LIMIT 15
    `).all(String(titleId)) as Array<{
      title_id: string;
      date: string;
      list_count: number;
      watchers: number;
      rank_anticipated: number | null;
    }>;

    if (!rows || rows.length === 0) return null;

    const latest = rows[0];
    let slope14d: number | null = null;

    if (rows.length >= 2) {
      const oldest = rows[rows.length - 1];
      const dayDiff = Math.max(1, (new Date(latest.date).getTime() - new Date(oldest.date).getTime()) / (1000 * 60 * 60 * 24));
      slope14d = Number(((latest.list_count - oldest.list_count) / dayDiff).toFixed(2));
    }

    return {
      titleId: latest.title_id,
      date: latest.date,
      listCount: latest.list_count,
      watchers: latest.watchers,
      rankAnticipated: latest.rank_anticipated,
      listCountSlope14d: slope14d,
    };
  } catch {
    return null;
  }
}

/**
 * Homepage query helper: "Most Anticipated" row from trakt_stats table.
 * Zero live external calls.
 */
export function getMostAnticipatedTitles(limit = 10): Array<{ titleId: string; rank: number; listCount: number }> {
  try {
    const d = db();
    const rows = d.prepare(`
      SELECT title_id, rank_anticipated, list_count
      FROM trakt_stats
      WHERE rank_anticipated IS NOT NULL
      ORDER BY rank_anticipated ASC, list_count DESC
      LIMIT ?
    `).all(limit) as Array<{ title_id: string; rank_anticipated: number; list_count: number }>;

    return rows.map((r) => ({
      titleId: r.title_id,
      rank: r.rank_anticipated,
      listCount: r.list_count,
    }));
  } catch {
    return [];
  }
}
