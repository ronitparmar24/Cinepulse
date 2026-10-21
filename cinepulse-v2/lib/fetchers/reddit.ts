import { unifiedFetch } from './base';
import { getHuggingFaceSentiment } from './huggingface';

export interface RedditBuzzStats {
  query: string;
  postCount: number;
  totalComments: number;
  averageScore: number;
  sampleTitles: string[];
  sentimentScore?: number | null;
  sentimentLabel?: 'POSITIVE' | 'NEGATIVE' | null;
}

export async function getRedditBuzz(titleName: string): Promise<RedditBuzzStats | null> {
  if (!titleName) return null;

  const endpoint = 'https://www.reddit.com/r/movies/search.json';
  const res = await unifiedFetch<{
    data?: {
      children?: Array<{
        data?: {
          title?: string;
          score?: number;
          num_comments?: number;
        };
      }>;
    };
  }>({
    provider: 'reddit',
    endpoint,
    params: {
      q: titleName,
      restrict_sr: '1',
      sort: 'new',
      t: 'month',
    },
    ttlMs: 6 * 60 * 60 * 1000, // 6h cache
  });

  const children = res.data?.data?.children;
  if (!children || children.length === 0) {
    return {
      query: titleName,
      postCount: 0,
      totalComments: 0,
      averageScore: 0,
      sampleTitles: [],
    };
  }

  let totalScore = 0;
  let totalComments = 0;
  const sampleTitles: string[] = [];

  for (const item of children) {
    if (item.data) {
      totalScore += item.data.score || 0;
      totalComments += item.data.num_comments || 0;
      if (item.data.title && sampleTitles.length < 3) {
        sampleTitles.push(item.data.title);
      }
    }
  }

  let sentimentScore: number | null = null;
  let sentimentLabel: 'POSITIVE' | 'NEGATIVE' | null = null;
  if (sampleTitles.length > 0) {
    try {
      const sent = await getHuggingFaceSentiment(sampleTitles.join('. '));
      if (sent) {
        sentimentScore = sent.score;
        sentimentLabel = sent.label;
      }
    } catch { /* sentiment is non-blocking */ }
  }

  return {
    query: titleName,
    postCount: children.length,
    totalComments,
    averageScore: Math.round(totalScore / children.length),
    sampleTitles,
    sentimentScore,
    sentimentLabel,
  };
}

