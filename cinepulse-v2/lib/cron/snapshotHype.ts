/**
 * CinePulse v8 — Daily Hype Snapshot Cron (Track L)
 *
 * For every upcoming title in the next 120 days, store one row per day
 * with pre-release hype signals. This builds the unique data moat described
 * in the v8 improvement prompts.
 *
 * Properties:
 * - Idempotent: unique (title_id, date) index prevents double-writes
 * - Rate-limited through the existing token buckets in fetchers/base.ts
 * - Never throws — wraps every operation in try/catch
 *
 * Called by: app/api/cron/snapshot/route.ts (protected by CRON_SECRET)
 * Also: .github/workflows/snapshot.yml (daily via GitHub Actions)
 */

import { db, now } from '../db';
import { getWikipediaPageviews } from '../fetchers/wikipedia';
import { getYouTubeTrailerStats } from '../fetchers/youtube';
import type { Title } from '../types';

interface SnapshotResult {
  titleId: string;
  titleName: string;
  snapshotDate: string;
  saved: boolean;
  skipped: boolean;
  reason?: string;
}

/**
 * Sleep helper for rate-limit compliance.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get all upcoming titles releasing in the next `daysAhead` days.
 * Only returns titles with a future release date.
 */
function getUpcomingTitles(daysAhead: number = 120): Title[] {
  try {
    const d = db();
    const cutoff = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    const rows = d.prepare(`
      SELECT id, title, media_type, release_date, genres_json, runtime, budget, revenue,
             poster, backdrop, overview, tagline, popularity, vote_average, vote_count,
             status, cast_json, trailer_key, director
      FROM titles
      WHERE release_date > ? AND release_date <= ?
      ORDER BY release_date ASC
      LIMIT 200
    `).all(today, cutoff) as Record<string, unknown>[];

    return rows.map(r => ({
      id: r.id as string,
      source: 'tmdb',
      mediaType: (r.media_type as 'movie' | 'tv') || 'movie',
      title: r.title as string,
      releaseDate: r.release_date as string,
      releaseDateSource: 'tmdb-primary-release-date',
      releaseDateRegion: null,
      genres: r.genres_json ? JSON.parse(r.genres_json as string) : [],
      runtime: r.runtime as number | null,
      budget: r.budget as number | null,
      revenue: r.revenue as number | null,
      poster: r.poster as string || '',
      backdrop: r.backdrop as string | null,
      overview: r.overview as string || '',
      tagline: r.tagline as string || '',
      popularity: r.popularity as number | null,
      voteAverage: r.vote_average as number | null,
      voteCount: (r.vote_count as number) || 0,
      status: (r.status as 'upcoming' | 'released') || 'upcoming',
      cast: r.cast_json ? JSON.parse(r.cast_json as string) : [],
      trailerKey: r.trailer_key as string | null,
      director: r.director as string | null,
      seasons: null,
    } as Title));
  } catch {
    return [];
  }
}

/**
 * Save a snapshot row. Idempotent via unique (title_id, date(taken_at)) index.
 */
export function saveSnapshot(
  titleId: string,
  takenAt: string,
  data: {
    wikiViews7d?: number | null;
    wikiSlope?: number | null;
    ytViews?: number | null;
    ytLikes?: number | null;
    ytComments?: number | null;
    tmdbPopularity?: number | null;
    tmdbVoteCount?: number | null;
    redditMentions?: number | null;
  },
  sourceFlags: Record<string, boolean>
): boolean {
  try {
    const d = db();
    d.prepare(`
      INSERT OR IGNORE INTO hype_snapshots (
        title_id, taken_at,
        wiki_views_7d, wiki_slope,
        yt_views, yt_likes, yt_comments,
        tmdb_popularity, tmdb_vote_count,
        reddit_mentions, source_flags, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      titleId,
      takenAt,
      data.wikiViews7d ?? null,
      data.wikiSlope ?? null,
      data.ytViews ?? null,
      data.ytLikes ?? null,
      data.ytComments ?? null,
      data.tmdbPopularity ?? null,
      data.tmdbVoteCount ?? null,
      data.redditMentions ?? null,
      JSON.stringify(sourceFlags),
      now()
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Snapshot hype signals for a single title.
 * Rate-limited: waits between API calls.
 */
async function snapshotTitle(title: Title): Promise<SnapshotResult> {
  const takenAt = new Date().toISOString();
  const snapshotDate = takenAt.slice(0, 10);
  const sourceFlags: Record<string, boolean> = {};

  // Check if already snapshotted today (idempotency shortcut)
  try {
    const d = db();
    const existing = d.prepare(
      'SELECT id FROM hype_snapshots WHERE title_id = ? AND date(taken_at) = ?'
    ).get(title.id, snapshotDate);
    if (existing) {
      return { titleId: title.id, titleName: title.title, snapshotDate, saved: false, skipped: true, reason: 'already_snapshotted_today' };
    }
  } catch {
    // Table might not exist yet; continue to let saveSnapshot fail gracefully
  }

  let wikiViews7d: number | null = null;
  let wikiSlope: number | null = null;
  let ytViews: number | null = null;
  let ytLikes: number | null = null;
  let ytComments: number | null = null;

  // 1. Wikipedia pageviews
  try {
    const wiki = await getWikipediaPageviews('', title.title, title.releaseDate || undefined);
    if (wiki) {
      const last7 = wiki.dailyViews.slice(-7).reduce((sum, d) => sum + d.views, 0);
      wikiViews7d = last7;
      wikiSlope = wiki.slope7d;
      sourceFlags.wikipedia = true;
    }
  } catch {
    sourceFlags.wikipedia = false;
  }

  // Rate-limit pause between API calls
  await sleep(300);

  // 2. YouTube trailer stats
  try {
    const trailerKey = title.trailerKey;
    if (trailerKey) {
      const yt = await getYouTubeTrailerStats(title.id, trailerKey);
      if (yt) {
        ytViews = yt.viewCount;
        ytLikes = yt.likeCount;
        ytComments = yt.commentCount;
        sourceFlags.youtube = true;
      }
    }
  } catch {
    sourceFlags.youtube = false;
  }

  const saved = saveSnapshot(title.id, takenAt, {
    wikiViews7d,
    wikiSlope,
    ytViews,
    ytLikes,
    ytComments,
    tmdbPopularity: title.popularity,
    tmdbVoteCount: (title as unknown as { voteCount?: number }).voteCount ?? 0,
  }, sourceFlags);

  return { titleId: title.id, titleName: title.title, snapshotDate, saved, skipped: false };
}

/**
 * Main entry point: snapshot all upcoming titles.
 * Called by the cron route and GitHub Action.
 */
export async function snapshotUpcomingTitles(daysAhead: number = 120): Promise<{
  processed: number;
  saved: number;
  skipped: number;
  errors: number;
}> {
  const titles = getUpcomingTitles(daysAhead);
  let saved = 0;
  let skipped = 0;
  let errors = 0;

  console.log(`[snapshotHype] Snapshotting ${titles.length} upcoming titles...`);

  // Step 2 & 3: Batch YouTube trailer calls up front (up to 50 IDs per call) instead of looping
  try {
    const { getBatchYouTubeTrailerStats } = await import('../fetchers/youtube');
    const trailerItems = titles
      .filter(t => Boolean(t.trailerKey))
      .map(t => ({ titleId: t.id, videoKey: t.trailerKey! }));
    if (trailerItems.length > 0) {
      await getBatchYouTubeTrailerStats(trailerItems);
    }
  } catch { /* best-effort pre-batch */ }

  for (const title of titles) {
    try {
      const result = await snapshotTitle(title);
      if (result.skipped) skipped++;
      else if (result.saved) {
        saved++;
        console.log(`[snapshotHype] ✓ ${title.title} (${result.snapshotDate})`);
      }
    } catch {
      errors++;
      console.warn(`[snapshotHype] ✗ ${title.title} — unexpected error`);
    }

    // Polite pause between titles to respect API rate limits
    await sleep(500);
  }

  console.log(`[snapshotHype] Done — saved: ${saved}, skipped: ${skipped}, errors: ${errors}`);
  return { processed: titles.length, saved, skipped, errors };
}

/**
 * Compute derived hype features for a title from stored snapshots.
 * Only uses snapshots taken at least 14 days before release (no leakage).
 */
export function computeHypeFeatures(titleId: string, releaseDate: string): {
  wikiSlope28d: number | null;
  ytViewVelocity7d: number | null;
  popularityDelta14d: number | null;
  snapshotCount: number;
  dataQualityWarning: string | null;
} {
  try {
    const d = db();
    // Only use snapshots at least 14 days before release (point-in-time cutoff)
    const cutoff = new Date(new Date(releaseDate).getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const snapshots = d.prepare(`
      SELECT taken_at, wiki_views_7d, wiki_slope, yt_views, tmdb_popularity
      FROM hype_snapshots
      WHERE title_id = ? AND date(taken_at) <= ?
      ORDER BY taken_at ASC
    `).all(titleId, cutoff) as Array<{
      taken_at: string;
      wiki_views_7d: number | null;
      wiki_slope: number | null;
      yt_views: number | null;
      tmdb_popularity: number | null;
    }>;

    if (snapshots.length < 3) {
      return {
        wikiSlope28d: null,
        ytViewVelocity7d: null,
        popularityDelta14d: null,
        snapshotCount: snapshots.length,
        dataQualityWarning: snapshots.length === 0
          ? 'No hype snapshots available'
          : `Only ${snapshots.length} snapshot(s) — needs ≥ 3 for reliable features`,
      };
    }

    // Wiki slope over last 28 days of snapshot history
    const recent28 = snapshots.filter(s => {
      const snapshotDate = new Date(s.taken_at);
      const latestDate = new Date(snapshots[snapshots.length - 1].taken_at);
      return (latestDate.getTime() - snapshotDate.getTime()) <= 28 * 24 * 60 * 60 * 1000;
    });

    const wikiSlopes = recent28.map(s => s.wiki_slope).filter((v): v is number => v !== null);
    const wikiSlope28d = wikiSlopes.length > 0
      ? wikiSlopes.reduce((a, b) => a + b, 0) / wikiSlopes.length
      : null;

    // YouTube view velocity over last 7 days
    const recent7 = snapshots.filter(s => {
      const snapshotDate = new Date(s.taken_at);
      const latestDate = new Date(snapshots[snapshots.length - 1].taken_at);
      return (latestDate.getTime() - snapshotDate.getTime()) <= 7 * 24 * 60 * 60 * 1000;
    });

    const ytViewsArr = recent7.map(s => s.yt_views).filter((v): v is number => v !== null);
    const ytViewVelocity7d = ytViewsArr.length >= 2
      ? (ytViewsArr[ytViewsArr.length - 1] - ytViewsArr[0]) / 7
      : null;

    // TMDB popularity delta over last 14 days
    const recent14 = snapshots.filter(s => {
      const snapshotDate = new Date(s.taken_at);
      const latestDate = new Date(snapshots[snapshots.length - 1].taken_at);
      return (latestDate.getTime() - snapshotDate.getTime()) <= 14 * 24 * 60 * 60 * 1000;
    });

    const popArr = recent14.map(s => s.tmdb_popularity).filter((v): v is number => v !== null);
    const popularityDelta14d = popArr.length >= 2
      ? popArr[popArr.length - 1] - popArr[0]
      : null;

    return {
      wikiSlope28d,
      ytViewVelocity7d: ytViewVelocity7d !== null ? Math.round(ytViewVelocity7d) : null,
      popularityDelta14d,
      snapshotCount: snapshots.length,
      dataQualityWarning: null,
    };
  } catch {
    return {
      wikiSlope28d: null,
      ytViewVelocity7d: null,
      popularityDelta14d: null,
      snapshotCount: 0,
      dataQualityWarning: 'Error reading hype snapshots',
    };
  }
}

export interface HypeRadarPoint {
  date: string;
  wikiViews: number | null;
  ytViews: number | null;
  tmdbPopularity: number | null;
}

export interface HypeRadarData {
  titleId: string;
  points: HypeRadarPoint[];
  dateRange: { start: string; end: string } | null;
  sources: string[];
  hasEnoughData: boolean;
}

/**
 * Fetch Hype Radar time-series for the UI sparkline card (Track L4).
 * Returns empty / hasEnoughData: false if fewer than 3 snapshot points exist.
 */
export function getHypeRadarData(titleId: string): HypeRadarData {
  try {
    const d = db();
    const rows = d.prepare(`
      SELECT taken_at, wiki_views_7d, yt_views, tmdb_popularity
      FROM hype_snapshots
      WHERE title_id = ?
      ORDER BY taken_at ASC
    `).all(titleId) as Array<{
      taken_at: string;
      wiki_views_7d: number | null;
      yt_views: number | null;
      tmdb_popularity: number | null;
    }>;

    const sources = ['Wikipedia Pageviews', 'YouTube Trailer Views', 'TMDB Popularity'];

    if (rows.length < 3) {
      return {
        titleId,
        points: rows.map(r => ({
          date: r.taken_at.slice(0, 10),
          wikiViews: r.wiki_views_7d,
          ytViews: r.yt_views,
          tmdbPopularity: r.tmdb_popularity,
        })),
        dateRange: rows.length > 0 ? {
          start: rows[0].taken_at.slice(0, 10),
          end: rows[rows.length - 1].taken_at.slice(0, 10),
        } : null,
        sources,
        hasEnoughData: false,
      };
    }

    const points: HypeRadarPoint[] = rows.map(r => ({
      date: r.taken_at.slice(0, 10),
      wikiViews: r.wiki_views_7d,
      ytViews: r.yt_views,
      tmdbPopularity: r.tmdb_popularity,
    }));

    return {
      titleId,
      points,
      dateRange: {
        start: points[0].date,
        end: points[points.length - 1].date,
      },
      sources,
      hasEnoughData: true,
    };
  } catch {
    return {
      titleId,
      points: [],
      dateRange: null,
      sources: ['Wikipedia Pageviews', 'YouTube Trailer Views', 'TMDB Popularity'],
      hasEnoughData: false,
    };
  }
}
