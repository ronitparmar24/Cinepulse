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
