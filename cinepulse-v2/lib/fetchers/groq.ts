import { unifiedFetch, logMissingKeyOnce } from './base';

export interface GroqSummaryResult {
  summary: string;
  tags: string[];
  provider: 'groq' | 'fallback';
}

export async function getGroqSummary(
  titleName: string,
  overview: string
): Promise<GroqSummaryResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    logMissingKeyOnce('groq', 'GROQ_API_KEY');
    return {
      summary: overview || 'A gripping cinema experience.',
      tags: ['Compelling', 'Cinematic'],
      provider: 'fallback',
    };
  }

  const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  const prompt = `Provide a concise 2-sentence spoiler-free overview of the film "${titleName}": ${overview}. Format as JSON with keys "summary" and "tags" (3 short vibe tags).`;

  const res = await unifiedFetch<{
    choices?: Array<{
      message?: { content?: string };
    }>;
  }>({
    provider: 'groq',
    endpoint,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 300,
    }),
    ttlMs: 7 * 24 * 60 * 60 * 1000,
  });

  const content = res.data?.choices?.[0]?.message?.content;
  if (content) {
    try {
      const parsed = JSON.parse(content);
      return {
        summary: parsed.summary || overview,
        tags: Array.isArray(parsed.tags) ? parsed.tags : ['Cinematic', 'Must-Watch'],
        provider: 'groq',
      };
    } catch {}
  }

  return {
    summary: overview || 'A gripping cinema experience.',
    tags: ['Cinematic', 'Atmospheric'],
    provider: 'fallback',
  };
}
