import { completeJson } from '../ai/complete';

export interface AISummaryResult {
  summary: string;
  vibeTags: string[];
  provider: 'gemini' | 'groq' | 'heuristic-fallback';
}

export async function getGeminiReviewSummary(
  titleName: string,
  overview: string,
  sampleReviews: string[] = []
): Promise<AISummaryResult> {
  const prompt = `
You are a master cinema critic and box-office analyst. Given the title "${titleName}" and the synopsis: "${overview}"
${sampleReviews.length > 0 ? `Sample audience comments:\n${sampleReviews.slice(0, 4).join('\n')}` : ''}

Provide a JSON object with:
1. "summary": A compelling 2-sentence spoiler-free critical consensus ("what audiences and critics agree on").
2. "vibeTags": Array of 3-5 concise, evocative mood/vibe tags (e.g. ["Neon Noir", "High Stakes", "Mind-Bending"]).

Output only valid JSON with no markdown formatting.
  `.trim();

  const res = await completeJson<{ summary?: string; vibeTags?: string[] }>(prompt, {
    json: true,
    maxTokens: 300,
    temperature: 0.3,
  });

  if (res.data?.summary && Array.isArray(res.data.vibeTags)) {
    return {
      summary: res.data.summary,
      vibeTags: res.data.vibeTags.slice(0, 5),
      provider: res.provider === 'gemini' || res.provider === 'groq' ? res.provider : 'heuristic-fallback',
    };
  }

  return {
    summary: overview ? `${overview.slice(0, 160)}…` : 'A compelling cinematic experience crafted for audiences.',
    vibeTags: ['Cinematic', 'Engaging', 'Visual Spectacle'],
    provider: 'heuristic-fallback',
  };
}

