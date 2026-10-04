/**
 * CinePulse v9 — Track V: Writers' Room
 * Generates structured critic drafts via Gemini LLM or offline archetype templates.
 * Enforces quality gates and queues into ai_content_queue.
 */

import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { evaluateQualityGates } from './qualityGates';
import { recall } from './memory';

export interface DraftContext {
  titleId: string;
  title: string;
  director?: string;
  genres?: string[];
  cast?: string[];
  releaseDate?: string;
  status?: string;
  modelProb?: number;
  crowdProb?: number;
  targetPostText?: string;
  targetPostAuthor?: string;
}

export interface DraftResult {
  draftId: string;
  text: string;
  rating?: number;
  confidence?: number;
  spoiler: boolean;
  qualityScore: number;
  passed: boolean;
  provider: 'gemini' | 'template';
  model: string;
  reason?: string;
}

const ARCHETYPE_FALLBACKS: Record<string, string[]> = {
  'craft-purist': [
    'The camera framing and lighting choices do the heavy lifting here, elevating an otherwise conventional screenplay.',
    'Rich visual staging with precise lens selection. Worth studying on the biggest screen available.',
    'Tight technical discipline from the camera department even when the narrative rhythm stumbles in the second act.'
  ],
  'boxoffice-tracker': [
    'Advance bookings indicate strong curiosity in mass centres, though second-weekend multipliers will depend on word of mouth.',
    'Theatrical footprint and screen allocation give this release early momentum across key metropolitan circuits.',
    'A solid commercial package engineered for steady theatrical footfalls rather than frontloaded single-day spikes.'
  ],
  'indie-purist': [
    'A quiet, contemplative exercise in natural light and authentic silence. The performances carry real emotional weight.',
    'Subtle character observational drama that refuses to rush into melodramatic pyrotechnics.',
    'Patience rewarded with understated realism. The stillness between dialogue exchanges says everything.'
  ],
  'mass-spectacle': [
    'Pure theatrical celebration engineered for high-energy crowd reactions and thunderous audio momentum.',
    'The interval block and signature set-pieces deliver undeniable big-screen elevation.',
    'Unapologetic mass entertainment with grand heroic staging and infectious theatrical energy.'
  ],
  'thriller-hound': [
    'A crisp, kinetic exercise that respects runtime discipline and narrative velocity.',
    'Tight procedural tension with zero unnecessary filler. Script mechanics operating with Swiss precision.',
    'Calculated suspense that keeps dramatic momentum tightly wound until the closing frame.'
  ]
};

function pickFallbackText(persona: any, context: DraftContext): string {
  const archetype = persona.voice?.slang?.[0]?.includes('anamorphic') ? 'craft-purist' :
    persona.voice?.slang?.[0]?.includes('advance') ? 'boxoffice-tracker' :
    persona.voice?.slang?.[0]?.includes('mass') ? 'mass-spectacle' :
    persona.voice?.slang?.[0]?.includes('procedural') ? 'thriller-hound' : 'indie-purist';

  const pool = ARCHETYPE_FALLBACKS[archetype] || ARCHETYPE_FALLBACKS['craft-purist'];
  const base = pool[Math.floor(Math.random() * pool.length)];

  const dir = context.director ? ` under ${context.director}'s direction` : '';
  const gen = context.genres?.[0] ? ` ${context.genres[0].toLowerCase()}` : ' cinema';
  const sig = persona.voice?.signaturePhrases?.[0] ? ` ${persona.voice.signaturePhrases[0]}` : '';

  return `${context.title}${dir} offers a compelling take on contemporary${gen}. ${base}${sig}`;
}

/**
 * Drafts content for an AI persona. Falls back cleanly to deterministic templates if no API key is present.
 */
export async function draftPersonaContent(
  persona: any,
  action: 'forecast' | 'review' | 'reply',
  context: DraftContext
): Promise<DraftResult> {
  const draftId = `draft_${randomUUID().slice(0, 12)}`;
  let text = '';
  let provider: 'gemini' | 'template' = 'template';
  let model = 'template-v9';
  let rating: number | undefined;
  let confidence: number | undefined;
  let spoiler = false;

  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      // Memory recall for grounding
      const memories = await recall(persona.id, {
        director: context.director,
        genre: context.genres?.[0]
      }, 3);

      const prompt = `
You are writing as the film critic persona "${persona.identity.displayName}".
Bio: "${persona.identity.bio}".
Voice style: ${persona.voice.disagreementStyle}, Sentence range: ${persona.voice.sentenceLengthRange.join('-')} words.
Slang allowed: ${persona.voice.slang.join(', ')}. Banned words: ${persona.voice.bannedWords.join(', ')}.
Title: "${context.title}", Director: "${context.director || 'Unknown'}", Genres: "${context.genres?.join(', ') || ''}".
Action: "${action}".
Relevant past persona memories: ${memories.map(m => m.subject + ': ' + m.content).join('; ') || 'None'}.

Instructions:
1. Write 2 to 4 concise sentences strictly in persona voice.
2. Must reference the supplied director or genre or title facts.
3. No Markdown, no hashtags, no meta commentary.
4. Output valid JSON only:
{"text": "...", "rating": 1-5, "confidence": 50-95, "spoiler": false}
      `.trim();

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });

      if (res.ok) {
        const json = await res.json();
        const rawJsonText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawJsonText) {
          const parsed = JSON.parse(rawJsonText);
          if (parsed.text && typeof parsed.text === 'string') {
            text = parsed.text.trim();
            rating = typeof parsed.rating === 'number' ? parsed.rating : undefined;
            confidence = typeof parsed.confidence === 'number' ? parsed.confidence : undefined;
            spoiler = Boolean(parsed.spoiler);
            provider = 'gemini';
            model = 'gemini-1.5-flash';
          }
        }
      }
    } catch {
      // Graceful degradation to template fallback
    }
  }

  // Fallback if LLM unavailable or failed
  if (!text) {
    text = pickFallbackText(persona, context);
    rating = action === 'review' ? Math.max(1, Math.min(5, Math.round(3.2 + (persona.taste?.ratingBias ?? 0)))) : undefined;
    confidence = action === 'forecast' ? Math.round(55 + (persona.forecasting?.skill ?? 0.6) * 35) : undefined;
    provider = 'template';
    model = 'template-v9';
  }

  // Gate evaluation
  const gate = evaluateQualityGates(text, persona, [], {
    title: context.title,
    director: context.director,
    genres: context.genres
  });

  return {
    draftId,
    text,
    rating,
    confidence,
    spoiler,
    qualityScore: gate.score,
    passed: gate.passed,
    provider,
    model,
    reason: gate.reason
  };
}

/**
 * Queues a drafted action into ai_content_queue.
 */
export async function queuePersonaAction(
  persona: any,
  action: 'forecast' | 'review' | 'reply',
  targetId: string,
  context: DraftContext,
  notBeforeDate: Date,
  tickId = 'cron-tick'
): Promise<string> {
  const d = db();
  const draft = await draftPersonaContent(persona, action, context);

  const id = `queue_${randomUUID().slice(0, 16)}`;
  const status = draft.passed ? 'ready' : 'rejected';

  const payload = {
    draftId: draft.draftId,
    titleId: context.titleId,
    titleName: context.title,
    body: draft.text,
    rating: draft.rating,
    confidence: draft.confidence,
    choice: (draft.confidence ?? 60) >= 60 ? 'hit' : 'flop',
    spoiler: draft.spoiler ? 1 : 0,
    provider: draft.provider,
    model: draft.model
  };

  d.prepare(`
    INSERT INTO ai_content_queue (
      id, persona_id, action, target_id, payload_json, not_before, status, quality_score, rejection_reason, tick_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    persona.id,
    action,
    targetId,
    JSON.stringify(payload),
    notBeforeDate.toISOString(),
    status,
    draft.qualityScore,
    draft.reason || null,
    tickId
  );

  return id;
}
