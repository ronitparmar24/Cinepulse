import { unifiedFetch, logMissingKeyOnce } from './base';
import { db } from '../db';

export interface YouTubeTrailerStats {
  videoId: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  viewVelocityPerDay: number;
  recordedAt: string;
}

export async function getYouTubeTrailerStats(
  titleId: string,
  youtubeVideoKey: string,
  publishedAt?: string
): Promise<YouTubeTrailerStats | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    logMissingKeyOnce('youtube', 'YOUTUBE_API_KEY');
    return null;
  }
  if (!youtubeVideoKey) return null;

  const endpoint = 'https://www.googleapis.com/youtube/v3/videos';
  const res = await unifiedFetch<{
    items?: Array<{
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
      id: youtubeVideoKey,
      key: apiKey,
    },
    ttlMs: 6 * 60 * 60 * 1000, // 6h cache
  });

  const stats = res.data?.items?.[0]?.statistics;
  if (!stats) return null;

  const viewCount = Number(stats.viewCount || 0);
  const likeCount = Number(stats.likeCount || 0);
  const commentCount = Number(stats.commentCount || 0);
  const recordedAt = new Date().toISOString();

  // Estimate velocity (views per day since release or over recorded history)
  let viewVelocityPerDay = 0;
  if (publishedAt) {
    const days = Math.max(1, (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24));
    viewVelocityPerDay = Math.round(viewCount / days);
  } else {
    viewVelocityPerDay = Math.round(viewCount / 30);
  }

  // Record into trailer_stats table
  try {
    const d = db();
    d.prepare(
      'INSERT INTO trailer_stats(title_id, youtube_video_id, view_count, like_count, comment_count, recorded_at) VALUES(?,?,?,?,?,?)'
    ).run(titleId, youtubeVideoKey, viewCount, likeCount, commentCount, recordedAt);
  } catch {}

  return {
    videoId: youtubeVideoKey,
    viewCount,
    likeCount,
    commentCount,
    viewVelocityPerDay,
    recordedAt,
  };
}
