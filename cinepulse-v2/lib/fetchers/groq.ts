import { completeJson } from '../ai/complete';

export interface GroqSummaryResult {
  summary: string;
  tags: string[];
  provider: 'groq' | 'gemini' | 'fallback';
}

export async function getGroqSummary(
  titleName: string,
  overview: string
): Promise<GroqSummaryResult> {
  const prompt = `Provide a concise 2-sentence spoiler-free overview of the film "${titleName}": ${overview}. Format as JSON with keys "summary" and "tags" (3 short vibe tags).`;

  const res = await completeJson<{ summary?: string; tags?: string[] }>(prompt, {
    json: true,
    maxTokens: 300,
    temperature: 0.3,
  });

  if (res.data?.summary && Array.isArray(res.data.tags)) {
    return {
      summary: res.data.summary,
      tags: res.data.tags.slice(0, 3),
      provider: res.provider === 'groq' || res.provider === 'gemini' ? res.provider : 'fallback',
    };
  }

  return {
    summary: overview || 'A gripping cinema experience.',
    tags: ['Cinematic', 'Atmospheric'],
    provider: 'fallback',
  };
}

