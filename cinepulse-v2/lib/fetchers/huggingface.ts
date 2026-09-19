import { unifiedFetch, logMissingKeyOnce } from './base';

export interface HFSentimentResult {
  label: 'POSITIVE' | 'NEGATIVE';
  score: number;
}

export async function getHuggingFaceSentiment(text: string): Promise<HFSentimentResult | null> {
  const token = process.env.HF_TOKEN;
  if (!token) {
    logMissingKeyOnce('huggingface', 'HF_TOKEN');
    return null;
  }
  if (!text) return null;

  const endpoint = 'https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english';
  const res = await unifiedFetch<Array<Array<{ label: string; score: number }>>>({
    provider: 'huggingface',
    endpoint,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: text.slice(0, 500) }),
    ttlMs: 7 * 24 * 60 * 60 * 1000,
  });

  const scores = res.data?.[0];
  if (Array.isArray(scores) && scores.length > 0) {
    const top = scores.reduce((prev, curr) => (curr.score > prev.score ? curr : prev), scores[0]);
    return {
      label: top.label as 'POSITIVE' | 'NEGATIVE',
      score: Number(top.score.toFixed(3)),
    };
  }

  return null;
}
