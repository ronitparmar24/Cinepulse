import { unifiedFetch, logMissingKeyOnce } from './base';

export interface CloudflareAIResult {
  response: string;
}

export async function runCloudflareAI(prompt: string): Promise<string | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    logMissingKeyOnce('cloudflare', 'CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN');
    return null;
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3-8b-instruct`;
  const res = await unifiedFetch<{
    result?: { response?: string };
    success?: boolean;
    errors?: any[];
  }>({
    provider: 'cloudflare',
    endpoint,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 256,
    }),
    ttlMs: 7 * 24 * 60 * 60 * 1000,
  });

  if (res.data?.result?.response) {
    return res.data.result.response;
  }

  return null;
}

/**
 * Cloudflare Workers AI sentence embedding fallback (@cf/baai/bge-small-en-v1.5).
 * Output: 384-dimensional dense vector, fully compatible with all-MiniLM-L6-v2.
 */
export async function runCloudflareEmbeddings(text: string): Promise<number[] | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) return null;
  if (!text) return null;

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/baai/bge-small-en-v1.5`;
  const res = await unifiedFetch<{
    result?: { data?: number[][] };
    success?: boolean;
  }>({
    provider: 'cloudflare',
    endpoint,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: [text.slice(0, 1000)] }),
    ttlMs: 30 * 24 * 60 * 60 * 1000, // 30 days cache
  });

  const vector = res.data?.result?.data?.[0];
  if (Array.isArray(vector) && vector.length > 0) {
    return vector;
  }

  return null;
}

/**
 * Cloudflare Workers AI sentiment classification fallback (@cf/huggingface/distilbert-sst-2-int8).
 */
export async function runCloudflareSentiment(
  text: string
): Promise<{ label: 'POSITIVE' | 'NEGATIVE'; score: number } | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) return null;
  if (!text) return null;

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/huggingface/distilbert-sst-2-int8`;
  const res = await unifiedFetch<Array<{ label: string; score: number }>>({
    provider: 'cloudflare',
    endpoint,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: text.slice(0, 500) }),
    ttlMs: 7 * 24 * 60 * 60 * 1000,
  });

  if (Array.isArray(res.data) && res.data.length > 0) {
    const top = res.data.reduce((prev, curr) => (curr.score > prev.score ? curr : prev), res.data[0]);
    return {
      label: (top.label?.toUpperCase() === 'POSITIVE' ? 'POSITIVE' : 'NEGATIVE'),
      score: Number(top.score.toFixed(3)),
    };
  }

  return null;
}
