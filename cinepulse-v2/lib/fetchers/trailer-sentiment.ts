/**
 * CinePulse — YouTube Trailer Sentiment Analysis
 *
 * Combines YouTube commentThreads (100 comments) with HuggingFace SST-2 sentiment.
 * Real response shape recorded from YouTube Data API v3 commentThreads.list:
 * {
 *   "items": [
 *     {
 *       "snippet": {
 *         "topLevelComment": {
 *           "snippet": {
 *             "textDisplay": "This trailer looks absolutely phenomenal!",
 *             "likeCount": 142
 *           }
 *         }
 *       }
 *     }
 *   ]
 * }
 */

import { unifiedFetch, logMissingKeyOnce } from './base';
import { getHuggingFaceSentiment } from './huggingface';
import { db } from '../db';

export interface TrailerSentimentRecord {
  titleId: string;
  week: string;
  positiveRatio: number | null;
  sampleSize: number;
  languageCoverage: number;
}

function getWeekMonday(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Filter criteria:
 * - Drop comments under 3 words
 * - Drop comments that are mostly non-Latin (< 60% Latin characters)
 */
export function isUsableComment(text: string): boolean {
  if (!text) return false;
  const clean = text.replace(/<[^>]*>/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;

  const latinChars = clean.replace(/[^a-zA-Z0-9\s.,!?'"()-]/g, '').length;
  const ratio = latinChars / Math.max(1, clean.length);
  return ratio >= 0.6;
}

/**
 * Fetch raw comments for a YouTube video.
 * Costs 1 quota unit. Gracefully catches comments-disabled errors.
 */
export async function fetchVideoComments(videoId: string, maxResults = 100): Promise<string[] | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    logMissingKeyOnce('youtube', 'YOUTUBE_API_KEY');
    return null;
  }

  try {
    const res = await unifiedFetch<{
      items?: Array<{
        snippet?: {
          topLevelComment?: {
            snippet?: {
              textDisplay?: string;
              textOriginal?: string;
            };
          };
        };
      }>;
      error?: {
        errors?: Array<{ reason?: string }>;
        message?: string;
      };
    }>({
      provider: 'youtube',
      endpoint: 'https://www.googleapis.com/youtube/v3/commentThreads',
      params: {
        part: 'snippet',
        videoId,
        maxResults,
        order: 'relevance',
        key: apiKey,
      },
      ttlMs: 7 * 24 * 60 * 60 * 1000, // 7-day cache
    });

    if (!res.data || !res.data.items) {
      // Comments disabled or API error -> return null gracefully
      return null;
    }

    const comments: string[] = [];
    for (const item of res.data.items) {
      const text = item.snippet?.topLevelComment?.snippet?.textOriginal || item.snippet?.topLevelComment?.snippet?.textDisplay;
      if (text) comments.push(text);
    }

    return comments;
  } catch {
    return null;
  }
}

/**
 * Weekly batch job: analyzes comments for a title's trailer and stores in trailer_sentiment.
 * Gate: sample_size < 30 => positive_ratio is null.
 * Never called per pageview.
 */
export async function syncTrailerSentiment(titleId: string, videoId: string): Promise<TrailerSentimentRecord | null> {
  const comments = await fetchVideoComments(videoId, 100);
  if (!comments || comments.length === 0) return null;

  const totalFetched = comments.length;
  const filtered = comments.filter(isUsableComment);
  const sampleSize = filtered.length;
  const languageCoverage = Number((sampleSize / Math.max(1, totalFetched)).toFixed(2));

  const week = getWeekMonday();

  // GATE: sample_size < 30 => null
  if (sampleSize < 30) {
    db().prepare(`
      INSERT INTO trailer_sentiment(title_id, week, positive_ratio, sample_size, language_coverage)
      VALUES(?, ?, NULL, ?, ?)
      ON CONFLICT(title_id, week) DO UPDATE SET
        positive_ratio = NULL,
        sample_size = excluded.sample_size,
        language_coverage = excluded.language_coverage
    `).run(String(titleId), week, sampleSize, languageCoverage);

    return {
      titleId: String(titleId),
      week,
      positiveRatio: null,
      sampleSize,
      languageCoverage,
    };
  }

  // Score sample using HuggingFace sentiment
  let positiveCount = 0;
  for (const comment of filtered) {
    try {
      const sentiment = await getHuggingFaceSentiment(comment);
      if (sentiment && sentiment.label === 'POSITIVE') {
        positiveCount++;
      }
    } catch {}
  }

  const positiveRatio = Number((positiveCount / sampleSize).toFixed(2));

  db().prepare(`
    INSERT INTO trailer_sentiment(title_id, week, positive_ratio, sample_size, language_coverage)
    VALUES(?, ?, ?, ?, ?)
    ON CONFLICT(title_id, week) DO UPDATE SET
      positive_ratio = excluded.positive_ratio,
      sample_size = excluded.sample_size,
      language_coverage = excluded.language_coverage
  `).run(String(titleId), week, positiveRatio, sampleSize, languageCoverage);

  return {
    titleId: String(titleId),
    week,
    positiveRatio,
    sampleSize,
    languageCoverage,
  };
}

/**
 * Reads cached trailer sentiment from local database only.
 * Zero live external calls.
 */
export function getTrailerSentiment(titleId: string): TrailerSentimentRecord | null {
  try {
    const row = db().prepare(`
      SELECT title_id, week, positive_ratio, sample_size, language_coverage
      FROM trailer_sentiment
      WHERE title_id = ?
      ORDER BY week DESC
      LIMIT 1
    `).get(String(titleId)) as {
      title_id: string;
      week: string;
      positive_ratio: number | null;
      sample_size: number;
      language_coverage: number;
    } | undefined;

    if (!row) return null;

    return {
      titleId: row.title_id,
      week: row.week,
      positiveRatio: row.positive_ratio !== null ? Number(row.positive_ratio) : null,
      sampleSize: Number(row.sample_size || 0),
      languageCoverage: Number(row.language_coverage || 0),
    };
  } catch {
    return null;
  }
}
