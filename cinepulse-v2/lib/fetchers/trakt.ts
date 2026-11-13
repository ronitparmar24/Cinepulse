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
import { cacheGet, cacheSet, db } from '../db';
import { catalog, titleById } from '../catalog';

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

  // Always fetch extended=full so release date (`released`) is available to filter out past movies.
  const res = await unifiedFetch<TraktAnticipatedItem[]>({
    provider: 'trakt',
    endpoint: 'https://api.trakt.tv/movies/anticipated',
    params: { limit, extended: 'full' },
    headers,
    ttlMs: 6 * 60 * 60 * 1000,
  });

  return res.data;
}

export interface EnrichedAnticipatedItem {
  titleId: string;
  rank: number;
  listCount: number;
  title: string;
  releaseDate: string | null;
  daysUntilRelease: number | null;
  poster: string | null;
  backdrop: string | null;
  genres: string[];
  hypeSharePct: number;
  source: 'trakt-live' | 'tmdb-upcoming';
}

function isoTodayUtc(): string {
  const now = new Date();
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function daysBetweenIso(fromIso: string, toIso: string | null): number | null {
  if (!toIso || !/^\d{4}-\d{2}-\d{2}$/.test(toIso)) return null;
  const fromMs = Date.parse(`${fromIso}T00:00:00Z`);
  const toMs = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.round((toMs - fromMs) / 86_400_000);
}

/**
 * Real-time Most Anticipated list: fetches live Trakt /movies/anticipated (cached 6h),
 * strictly excludes already-released past films, and enriches official artwork & release dates via TMDB.
 */
export async function getLiveMostAnticipated(limit = 12): Promise<EnrichedAnticipatedItem[]> {
  const today = isoTodayUtc();
  const safeLimit = Math.max(1, Math.min(20, limit));
  const cKey = `trakt:live-anticipated:v2:${today}:${safeLimit}`;
  const cached = cacheGet<EnrichedAnticipatedItem[]>(cKey);
  if (cached && cached.length > 0) return cached;

  const rawTrakt = await fetchTraktAnticipated(25).catch(() => null);
  const candidates: Array<{ tmdbId: number; title: string; listCount: number; released: string | null }> = [];
  const seenTmdb = new Set<number>();

  if (Array.isArray(rawTrakt)) {
    for (const entry of rawTrakt) {
      const movie = entry?.movie as (TraktMovieSummary & { released?: string | null }) | undefined;
      const tmdbId = Number(movie?.ids?.tmdb);
      if (!Number.isInteger(tmdbId) || tmdbId <= 0 || seenTmdb.has(tmdbId)) continue;
      const released = typeof movie?.released === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(movie.released)
        ? movie.released
        : null;
      // Skip films that already released before today
      if (released && released < today) continue;
      seenTmdb.add(tmdbId);
      candidates.push({
        tmdbId,
        title: String(movie?.title || `Movie #${tmdbId}`),
        listCount: Math.max(0, Number(entry?.list_count || 0)),
        released,
      });
    }
  }

  const enriched: EnrichedAnticipatedItem[] = [];
  const topCandidates = candidates.slice(0, safeLimit);

  const detailsList = await Promise.allSettled(
    topCandidates.map((c) => titleById(`movie-${c.tmdbId}`))
  );

  for (let i = 0; i < topCandidates.length; i++) {
    const base = topCandidates[i];
    const settled = detailsList[i];
    const detail = settled.status === 'fulfilled' ? settled.value : null;
    const releaseDate = detail?.releaseDate ?? base.released;
    if (releaseDate && releaseDate < today) continue;
    if (!detail?.backdrop && !detail?.poster) continue;

    enriched.push({
      titleId: `movie-${base.tmdbId}`,
      rank: enriched.length + 1,
      listCount: base.listCount,
      title: detail?.title || base.title,
      releaseDate,
      daysUntilRelease: daysBetweenIso(today, releaseDate),
      poster: detail?.poster || null,
      backdrop: detail?.backdrop || detail?.poster || null,
      genres: detail?.genres?.slice(0, 2) || [],
      hypeSharePct: 0,
      source: 'trakt-live',
    });
  }

  // Fallback supplement from live TMDB upcoming movies if Trakt was unavailable or sparse
  if (enriched.length < safeLimit) {
    try {
      const upcomingRes = await catalog({ media: 'movie', collection: 'upcoming', page: 1 });
      for (const m of upcomingRes.items) {
        if (enriched.length >= safeLimit) break;
        if (enriched.some((e) => e.titleId === m.id)) continue;
        if (!m.releaseDate || m.releaseDate < today) continue;
        if (!m.backdrop && !m.poster) continue;
        enriched.push({
          titleId: m.id,
          rank: enriched.length + 1,
          listCount: 0,
          title: m.title,
          releaseDate: m.releaseDate,
          daysUntilRelease: daysBetweenIso(today, m.releaseDate),
          poster: m.poster,
          backdrop: m.backdrop || m.poster,
          genres: m.genres.slice(0, 2),
          hypeSharePct: 0,
          source: 'tmdb-upcoming',
        });
      }
    } catch {}
  }

  const maxLists = Math.max(1, ...enriched.map((e) => e.listCount));
  for (let i = 0; i < enriched.length; i++) {
    const item = enriched[i];
    item.rank = i + 1;
    item.hypeSharePct = item.listCount > 0
      ? Math.max(15, Math.min(100, Math.round((item.listCount / maxLists) * 100)))
      : Math.max(25, 90 - i * 6);
  }

  // Persist fresh non-test snapshots to trakt_stats
  try {
    const d = db();
    const stmt = d.prepare(`
      INSERT INTO trakt_stats(title_id, date, list_count, watchers, rank_anticipated)
      VALUES(?, ?, ?, 0, ?)
      ON CONFLICT(title_id, date) DO UPDATE SET
        list_count = excluded.list_count,
        rank_anticipated = excluded.rank_anticipated
    `);
    for (const item of enriched) {
      if (item.source === 'trakt-live' && item.listCount > 0) {
        stmt.run(item.titleId, today, item.listCount, item.rank);
      }
    }
  } catch {}

  if (enriched.length > 0) {
    cacheSet(cKey, enriched, 4 * 60 * 60 * 1000);
  }
  return enriched;
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
