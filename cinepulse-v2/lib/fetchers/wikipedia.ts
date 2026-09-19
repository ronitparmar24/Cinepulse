import { unifiedFetch } from './base';
import { resolveWikipediaTitle } from './wikidata';

export interface WikiPageviewsStats {
  article: string;
  totalViews30d: number;
  slope7d: number; // growth rate over last 7 days vs previous 7 days
  peakViews: number;
  dailyViews: Array<{ date: string; views: number }>;
}

export async function getWikipediaPageviews(
  imdbId: string,
  titleName: string,
  targetDate?: string
): Promise<WikiPageviewsStats | null> {
  const article = await resolveWikipediaTitle(imdbId, titleName);
  if (!article) return null;

  const refDate = targetDate ? new Date(targetDate) : new Date();
  const endDate = new Date(refDate.getTime() - 24 * 60 * 60 * 1000); // yesterday
  const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days back

  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const startStr = fmt(startDate);
  const endStr = fmt(endDate);

  const endpoint = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/${encodeURIComponent(article)}/daily/${startStr}/${endStr}`;

  const res = await unifiedFetch<{
    items?: Array<{ timestamp: string; views: number }>;
  }>({
    provider: 'wikipedia',
    endpoint,
    ttlMs: 24 * 60 * 60 * 1000, // 24h cache
  });

  const items = res.data?.items;
  if (!items || items.length === 0) return null;

  let totalViews30d = 0;
  let peakViews = 0;
  const dailyViews: Array<{ date: string; views: number }> = [];

  for (const item of items) {
    const v = item.views || 0;
    totalViews30d += v;
    if (v > peakViews) peakViews = v;
    const y = item.timestamp.slice(0, 4);
    const m = item.timestamp.slice(4, 6);
    const d = item.timestamp.slice(6, 8);
    dailyViews.push({ date: `${y}-${m}-${d}`, views: v });
  }

  // Calculate 7-day slope
  const last7 = dailyViews.slice(-7).reduce((acc, x) => acc + x.views, 0);
  const prev7 = dailyViews.slice(-14, -7).reduce((acc, x) => acc + x.views, 0);
  const slope7d = prev7 > 0 ? (last7 - prev7) / prev7 : (last7 > 0 ? 1.0 : 0.0);

  return {
    article,
    totalViews30d,
    slope7d: Number(slope7d.toFixed(3)),
    peakViews,
    dailyViews,
  };
}
