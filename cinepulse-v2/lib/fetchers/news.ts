import { unifiedFetch, logMissingKeyOnce } from './base';

export interface PressCoverageStats {
  query: string;
  totalArticles: number;
  sampleHeadlines: string[];
}

export async function getNewsCoverage(titleName: string): Promise<PressCoverageStats | null> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    logMissingKeyOnce('gnews', 'GNEWS_API_KEY');
    return null;
  }
  if (!titleName) return null;

  const endpoint = 'https://gnews.io/api/v4/search';
  const res = await unifiedFetch<{
    totalArticles?: number;
    articles?: Array<{ title?: string; description?: string }>;
  }>({
    provider: 'gnews',
    endpoint,
    params: {
      q: `"${titleName}" movie`,
      lang: 'en',
      max: 5,
      apikey: apiKey,
    },
    ttlMs: 24 * 60 * 60 * 1000, // 24h cache
  });

  const articles = res.data?.articles || [];
  const sampleHeadlines = articles.map(a => a.title || '').filter(Boolean).slice(0, 3);

  return {
    query: titleName,
    totalArticles: res.data?.totalArticles || articles.length,
    sampleHeadlines,
  };
}
