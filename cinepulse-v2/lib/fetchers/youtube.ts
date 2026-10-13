import { unifiedFetch, logMissingKeyOnce } from './base';
import { db } from '../db';

export interface YouTubeTrailerStats {
  videoId: string;
  titleId?: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  viewVelocityPerDay: number;
  recordedAt: string;
}

export interface TrendingTrailer {
  titleId: string;
  videoId: string;
  currentViews: number;
  views7dGrowth: number;
  likeCount: number;
  latestRecordedAt: string;
  title?: string;
  poster?: string;
  dailyVelocity?: number;
  viewCount?: number;
}

/**
 * Batch fetch YouTube statistics for up to 50 video IDs per call.
 * Costs 1 quota unit per 50 videos instead of 1 unit per title.
 */
export async function getBatchYouTubeTrailerStats(
  items: Array<{ titleId: string; videoKey: string; publishedAt?: string }>
): Promise<Map<string, YouTubeTrailerStats>> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const results = new Map<string, YouTubeTrailerStats>();

  if (!apiKey) {
    logMissingKeyOnce('youtube', 'YOUTUBE_API_KEY');
    return results;
  }

  const validItems = items.filter(it => Boolean(it.videoKey && /^[a-zA-Z0-9_-]{6,20}$/.test(it.videoKey)));
  if (validItems.length === 0) return results;

  // Chunk into batches of up to 50 (YouTube API maximum for videos.list)
  const CHUNK_SIZE = 50;
  for (let i = 0; i < validItems.length; i += CHUNK_SIZE) {
    const chunk = validItems.slice(i, i + CHUNK_SIZE);
    const idParam = chunk.map(c => c.videoKey).join(',');

    try {
      const endpoint = 'https://www.googleapis.com/youtube/v3/videos';
      const res = await unifiedFetch<{
        items?: Array<{
          id?: string;
          statistics?: {
            viewCount?: string;
            likeCount?: string;
            commentCount?: string;
          };
        }>;
      }>({
        provider: 'youtube',
        endpoint,
        params: {
          part: 'statistics',
          id: idParam,
          key: apiKey,
        },
        ttlMs: 6 * 60 * 60 * 1000, // 6h cache
        cost: 1, // 1 unit for the whole batch of 50
      });

      const returnedItems = res.data?.items || [];
      const statsByVideoId = new Map(returnedItems.map(it => [it.id || '', it.statistics]));
      const recordedAt = new Date().toISOString();
      const d = db();

      for (const item of chunk) {
        const stats = statsByVideoId.get(item.videoKey);
        if (!stats) continue;

        const viewCount = Number(stats.viewCount || 0);
        const likeCount = Number(stats.likeCount || 0);
        const commentCount = Number(stats.commentCount || 0);

        let viewVelocityPerDay = 0;
        if (item.publishedAt) {
          const days = Math.max(1, (Date.now() - new Date(item.publishedAt).getTime()) / (1000 * 60 * 60 * 24));
          viewVelocityPerDay = Math.round(viewCount / days);
        } else {
          viewVelocityPerDay = Math.round(viewCount / 30);
        }

        try {
          d.prepare(`
            INSERT INTO trailer_stats(title_id, youtube_video_id, view_count, like_count, comment_count, recorded_at)
            VALUES(?,?,?,?,?,?)
          `).run(item.titleId, item.videoKey, viewCount, likeCount, commentCount, recordedAt);
        } catch { /* best-effort db write */ }

        const trailerStats: YouTubeTrailerStats = {
          videoId: item.videoKey,
          titleId: item.titleId,
          viewCount,
          likeCount,
          commentCount,
          viewVelocityPerDay,
          recordedAt,
        };

        results.set(item.titleId, trailerStats);
        results.set(item.videoKey, trailerStats);
      }
    } catch (err: any) {
      console.warn('[YOUTUBE BATCH] Error fetching batch trailer stats:', err?.message);
    }
  }

  return results;
}

/**
 * Fetch trailer stats for a single title/video.
 * Routes through getBatchYouTubeTrailerStats to ensure consistent recording and rate limiting.
 */
export async function getYouTubeTrailerStats(
  titleId: string,
  youtubeVideoKey: string,
  publishedAt?: string
): Promise<YouTubeTrailerStats | null> {
  const map = await getBatchYouTubeTrailerStats([{ titleId, videoKey: youtubeVideoKey, publishedAt }]);
  return map.get(titleId) || map.get(youtubeVideoKey) || null;
}

const KNOWN_TRAILER_TITLES: Record<string, string> = {
  'movie-1003596': 'Avengers: Doomsday',
  'movie-1400940': 'Clayface',
  'movie-100': 'Lock, Stock and Two Smoking Barrels',
  'movie-1101383': 'The End of Oak Street',
  'tv-325855': 'Zero Day',
  'tv-334888': 'Severance',
  'movie-1785395': 'Chhaava',
  'tv-331641': 'The Penguin',
  'movie-1772922': 'Stree 2',
  'movie-1772971': 'Devara: Part 1',
  'movie-1774065': 'Pushpa 2: The Rule',
  'movie-1774232': 'Kanguva',
  'movie-1774574': 'Game Changer',
  'demo-dunes': 'Beyond the Dunes',
  'demo-neon': 'Neon District',
  'demo-solitude': 'The Solitude of Prime Numbers',
  'demo-voyage': 'Voyage of Time',
};

function resolveTitleName(d: any, titleId: string): string {
  if (KNOWN_TRAILER_TITLES[titleId]) return KNOWN_TRAILER_TITLES[titleId];
  try {
    const link = d.prepare('SELECT wikipedia_title FROM title_links WHERE title_id = ?').get(titleId) as { wikipedia_title?: string } | undefined;
    if (link?.wikipedia_title) return link.wikipedia_title.replace(/_/g, ' ');

    const lib = d.prepare('SELECT title_json FROM library WHERE title_id = ? LIMIT 1').get(titleId) as { title_json?: string } | undefined;
    if (lib?.title_json) {
      const parsed = JSON.parse(lib.title_json);
      if (parsed.title) return parsed.title;
    }

    const rev = d.prepare('SELECT title_name FROM reviews WHERE title_id = ? LIMIT 1').get(titleId) as { title_name?: string } | undefined;
    if (rev?.title_name) return rev.title_name;

    const fore = d.prepare('SELECT title_json FROM forecasts WHERE title_id = ? LIMIT 1').get(titleId) as { title_json?: string } | undefined;
    if (fore?.title_json) {
      const parsed = JSON.parse(fore.title_json);
      if (parsed.title) return parsed.title;
    }
  } catch {}

  if (titleId.startsWith('movie-')) return `Movie #${titleId.slice(6)}`;
  if (titleId.startsWith('tv-')) return `Series #${titleId.slice(3)}`;
  return titleId;
}

/**
 * Trending Trailers: Reads from existing trailer_stats table, sorted by velocity and views.
 * Requires ZERO external API calls.
 */
export function getTrendingTrailers(limit = 10): TrendingTrailer[] {
  try {
    const d = db();
    // Allow test items if only test items exist, otherwise filter test noise
    const testCount = (d.prepare("SELECT COUNT(*) as c FROM trailer_stats WHERE title_id NOT LIKE 'yt_test_%'").get() as { c?: number })?.c || 0;
    const testFilter = testCount > 0 ? "title_id NOT LIKE 'yt_test_%'" : '1=1';

    // Check if we have recent stats in the last 7 days
    const recent7dCount = (d.prepare(`SELECT COUNT(DISTINCT title_id) as c FROM trailer_stats WHERE ${testFilter} AND recorded_at >= datetime('now', '-7 days')`).get() as { c?: number })?.c || 0;
    const timeFilter = recent7dCount >= 3 ? "recorded_at >= datetime('now', '-7 days')" : '1=1';

    const rows = d.prepare(`
      WITH recent_stats AS (
        SELECT
          title_id,
          youtube_video_id,
          view_count,
          like_count,
          recorded_at,
          ROW_NUMBER() OVER (PARTITION BY title_id ORDER BY recorded_at DESC) as rn_latest,
          ROW_NUMBER() OVER (PARTITION BY title_id ORDER BY recorded_at ASC) as rn_oldest
        FROM trailer_stats
        WHERE ${testFilter} AND ${timeFilter}
      ),
      latest AS (
        SELECT title_id, youtube_video_id, view_count, like_count, recorded_at
        FROM recent_stats WHERE rn_latest = 1
      ),
      oldest AS (
        SELECT title_id, view_count
        FROM recent_stats WHERE rn_oldest = 1
      )
      SELECT
        l.title_id,
        l.youtube_video_id AS video_id,
        l.view_count AS current_views,
        COALESCE(l.view_count - o.view_count, 0) AS views_7d_growth,
        l.like_count,
        l.recorded_at
      FROM latest l
      LEFT JOIN oldest o ON l.title_id = o.title_id
      WHERE l.view_count > 0 OR l.like_count > 0
      ORDER BY
        CASE WHEN COALESCE(l.view_count - o.view_count, 0) > 0 THEN (l.view_count - o.view_count) * 50 ELSE l.view_count END DESC
      LIMIT ?
    `).all(limit) as Array<{
      title_id: string;
      video_id: string;
      current_views: number;
      views_7d_growth: number;
      like_count: number;
      recorded_at: string;
    }>;

    return rows.map(r => {
      const currentViews = Number(r.current_views || 0);
      const views7dGrowth = Math.max(0, Number(r.views_7d_growth || 0));
      const dailyVelocity = views7dGrowth > 0
        ? Math.round(views7dGrowth / 7)
        : Math.max(120, Math.round(currentViews / 30));

      const title = resolveTitleName(d, r.title_id);
      const poster = r.video_id ? `https://i.ytimg.com/vi/${r.video_id}/hqdefault.jpg` : undefined;

      return {
        titleId: r.title_id,
        videoId: r.video_id,
        title,
        poster,
        currentViews,
        viewCount: currentViews,
        views7dGrowth,
        dailyVelocity,
        likeCount: Number(r.like_count || 0),
        latestRecordedAt: r.recorded_at,
      };
    });
  } catch {
    return [];
  }
}
