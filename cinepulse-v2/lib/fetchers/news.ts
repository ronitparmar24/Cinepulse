import { unifiedFetch, logMissingKeyOnce } from './base';
import { db } from '../db';
import { dailyQuotaFor } from '../providers/registry';
import { getUsageToday } from '../providers/usage';

export interface NewsArticle {
  title: string;
  url: string;
  sourceName?: string;
  publishedAt?: string;
}

export interface PressCoverageStats {
  query: string;
  titleId?: string;
  totalArticles: number;
  sampleHeadlines: string[];
  articles: NewsArticle[];
  stale?: boolean;
}

/**
 * Reads news coverage from the pre-computed `title_news` table.
 * By default, this NEVER calls GNews live per-request, preserving the 100 requests/day quota.
 */
export async function getNewsCoverage(
  titleName: string,
  titleId?: string,
  opts?: { allowLive?: boolean }
): Promise<PressCoverageStats | null> {
  if (!titleName) return null;

  // 1. Check title_news table (populated by nightly batch job)
  try {
    const d = db();
    const row = (titleId
      ? d.prepare('SELECT title_id, title_name, article_count, articles_json, fetched_at FROM title_news WHERE title_id = ? OR title_name = ? COLLATE NOCASE').get(titleId, titleName)
      : d.prepare('SELECT title_id, title_name, article_count, articles_json, fetched_at FROM title_news WHERE title_id = ? OR title_name = ? COLLATE NOCASE').get(titleName, titleName)
    ) as { title_id: string; title_name: string; article_count: number; articles_json: string; fetched_at: string } | undefined;

    if (row) {
      const articles: NewsArticle[] = JSON.parse(row.articles_json || '[]');
      const ageHours = (Date.now() - new Date(row.fetched_at).getTime()) / (1000 * 60 * 60);
      return {
        query: row.title_name,
        titleId: row.title_id,
        totalArticles: row.article_count,
        sampleHeadlines: articles.map(a => a.title).slice(0, 3),
        articles: articles.slice(0, 5),
        stale: ageHours > 24,
      };
    }
  } catch { /* best-effort db read */ }

  // 2. Strict efficiency: NEVER call GNews live on user pageviews unless explicitly requested
  if (!opts?.allowLive) {
    return null;
  }

  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    logMissingKeyOnce('gnews', 'GNEWS_API_KEY');
    return null;
  }

  const endpoint = 'https://gnews.io/api/v4/search';
  const res = await unifiedFetch<{
    totalArticles?: number;
    articles?: Array<{ title?: string; url?: string; source?: { name?: string }; publishedAt?: string }>;
  }>({
    provider: 'gnews',
    endpoint,
    params: {
      q: `"${titleName}" movie`,
      lang: 'en',
      max: 5,
      apikey: apiKey,
    },
    ttlMs: 12 * 60 * 60 * 1000, // 12h cache
  });

  const rawArticles = res.data?.articles || [];
  const articles: NewsArticle[] = rawArticles
    .filter(a => Boolean(a.title && a.url))
    .slice(0, 5)
    .map(a => ({
      title: a.title || '',
      url: a.url || '',
      sourceName: a.source?.name,
      publishedAt: a.publishedAt,
    }));

  const stats: PressCoverageStats = {
    query: titleName,
    titleId,
    totalArticles: res.data?.totalArticles ?? articles.length,
    sampleHeadlines: articles.map(a => a.title).slice(0, 3),
    articles,
    stale: res.stale,
  };

  // Persist to title_news table for subsequent readers
  if (titleId && articles.length > 0) {
    try {
      db().prepare(`
        INSERT INTO title_news(title_id, title_name, article_count, articles_json, fetched_at)
        VALUES(?,?,?,?,?)
        ON CONFLICT(title_id) DO UPDATE SET
          article_count = excluded.article_count,
          articles_json = excluded.articles_json,
          fetched_at = excluded.fetched_at
      `).run(titleId, titleName, stats.totalArticles, JSON.stringify(articles), new Date().toISOString());
    } catch { /* best-effort write */ }
  }

  return stats;
}

/**
 * Nightly batch job pulling news for titles releasing in the next 30 days.
 * Precomputes and caches 12h. Respects daily quota and never exceeds safe budget.
 */
export async function batchFetchUpcomingNews(
  upcomingTitles: Array<{ id: string; title: string; releaseDate?: string | null }>,
  maxTitlesToFetch = 15
): Promise<{ fetched: number; skipped: number }> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return { fetched: 0, skipped: 0 };

  const quota = dailyQuotaFor('gnews') ?? 100;
  const usedToday = getUsageToday('gnews');
  const availableBudget = Math.max(0, quota - usedToday - 10); // keep a safety buffer of 10

  const now = Date.now();
  const next30Days = now + 30 * 24 * 60 * 60 * 1000;

  // Filter to upcoming titles releasing in next 30 days
  const eligible = upcomingTitles.filter(t => {
    if (!t.releaseDate) return false;
    const relTime = new Date(t.releaseDate).getTime();
    return relTime >= now && relTime <= next30Days;
  });

  const candidates = eligible.slice(0, Math.min(maxTitlesToFetch, availableBudget));
  let fetched = 0;
  let skipped = 0;

  for (const item of candidates) {
    // Check if already fetched in last 12 hours
    try {
      const existing = db().prepare('SELECT fetched_at FROM title_news WHERE title_id = ?').get(item.id) as { fetched_at: string } | undefined;
      if (existing) {
        const hoursAgo = (now - new Date(existing.fetched_at).getTime()) / (1000 * 60 * 60);
        if (hoursAgo < 12) {
          skipped++;
          continue;
        }
      }
    } catch { /* continue */ }

    // Fetch via allowLive
    const stats = await getNewsCoverage(item.title, item.id, { allowLive: true });
    if (stats) fetched++;
  }

  return { fetched, skipped };
}
