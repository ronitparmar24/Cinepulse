import { unifiedFetch, logMissingKeyOnce } from './base';

export interface AISummaryResult {
  summary: string;
  vibeTags: string[];
  provider: 'gemini' | 'heuristic-fallback';
}

export async function getGeminiReviewSummary(
  titleName: string,
  overview: string,
  sampleReviews: string[] = []
): Promise<AISummaryResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logMissingKeyOnce('gemini', 'GEMINI_API_KEY');
    return {
      summary: overview ? `${overview.slice(0, 160)}…` : 'A compelling cinematic experience crafted for audiences.',
      vibeTags: ['Cinematic', 'Must-Watch', 'Atmospheric'],
      provider: 'heuristic-fallback',
    };
  }

  const prompt = `
You are a master cinema critic and box-office analyst. Given the title "${titleName}" and the synopsis: "${overview}"
${sampleReviews.length > 0 ? `Sample audience comments:\n${sampleReviews.slice(0, 4).join('\n')}` : ''}

Provide a JSON object with:
1. "summary": A compelling 2-sentence spoiler-free critical consensus ("what audiences and critics agree on").
2. "vibeTags": Array of 3-5 concise, evocative mood/vibe tags (e.g. ["Neon Noir", "High Stakes", "Mind-Bending"]).

Output only valid JSON with no markdown formatting.
  `.trim();

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const res = await unifiedFetch<{
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  }>({
    provider: 'gemini',
    endpoint,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
    ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days cache
  });

  const rawText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (rawText) {
    try {
      const parsed = JSON.parse(rawText);
      return {
        summary: parsed.summary || overview,
        vibeTags: Array.isArray(parsed.vibeTags) ? parsed.vibeTags : ['Cinematic', 'Atmospheric'],
        provider: 'gemini',
      };
    } catch {}
  }

  return {
    summary: overview ? `${overview.slice(0, 160)}…` : 'A compelling cinematic experience crafted for audiences.',
    vibeTags: ['Cinematic', 'Engaging', 'Visual Spectacle'],
    provider: 'heuristic-fallback',
  };
}
