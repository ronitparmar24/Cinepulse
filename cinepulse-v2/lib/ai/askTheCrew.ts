/**
 * CinePulse v9 — Track W: "Ask the Crew" & Human Conversation Engine
 * On-demand archetypal panel takes with viewer taste match,
 * plus strict rate limits and mandatory "No — I'm an AI persona on CinePulse" disclosure.
 */

import { loadAllAiPersonas, getAiPersonaById } from './personas';
import { titleById } from '../catalog';
import { getItemFactor, predictPersonaRating, dotProduct } from './factors';
import { computePersonaForecast } from './forecasting';
import { cacheGet, cacheSet, db } from '../db';

export const CREW_QUESTIONS = [
  { key: 'hit_or_flop', label: 'Hit or Flop outlook?' },
  { key: 'theatre_worth', label: 'Worth seeing on the big screen?' },
  { key: 'best_comparison', label: 'What is this most comparable to?' }
];

export interface CrewTake {
  personaId: string;
  handle: string;
  displayName: string;
  avatarUrl: string;
  archetype: string;
  choice: 'hit' | 'flop';
  confidence: number;
  tasteMatchPercent?: number | null;
  take: string;
}

export interface AskTheCrewResponse {
  titleId: string;
  questionKey: string;
  questionText: string;
  takes: CrewTake[];
  cached: boolean;
}

/**
 * Mandatory Hard-Coded Identity Guard (Track W)
 * Personas MUST honestly answer "are you human?"
 */
export function checkHumanIdentityQuestion(text: string): string | null {
  const norm = text.toLowerCase();
  const pattern = /\b(?:are you|is this|are u|u)\s+(?:a\s+)?(?:human|bot|real person|ai|robot|person)\b/i;
  if (pattern.test(norm) || norm.includes('are you human') || norm.includes('are you real')) {
    return "No — I'm an AI persona on CinePulse.";
  }
  return null;
}

/**
 * Enforces Track W limits: max 3 replies per human per day, min 3-minute delay.
 */
export function canReplyToHuman(humanUserId: string, personaId: string, nowMs = Date.now()): {
  allowed: boolean;
  reason?: string;
} {
  const d = db();
  const dayStartIso = new Date(nowMs - 86400 * 1000).toISOString();
  const threeMinAgoIso = new Date(nowMs - 3 * 60 * 1000).toISOString();

  // Check 3-minute delay
  const recent = d.prepare(`
    SELECT created_at
    FROM comments
    WHERE user_id = ? AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(personaId, threeMinAgoIso) as { created_at: string } | undefined;

  if (recent) {
    return { allowed: false, reason: 'RATE_LIMIT_COOLDOWN_3MIN' };
  }

  // Check max 3 replies per day to this human
  const dailyCount = d.prepare(`
    SELECT COUNT(*) as count
    FROM comments
    WHERE user_id = ? AND created_at >= ?
  `).get(personaId, dayStartIso) as { count: number } | undefined;

  if ((dailyCount?.count || 0) >= 3) {
    return { allowed: false, reason: 'DAILY_CAP_3_REPLIES_REACHED' };
  }

  return { allowed: true };
}

/**
 * Generates or retrieves cached "Ask the Crew" takes on a title.
 */
export async function getAskTheCrewTakes(
  titleId: string,
  questionKey = 'hit_or_flop',
  viewerLatentVector?: number[] | null
): Promise<AskTheCrewResponse> {
  const qObj = CREW_QUESTIONS.find(q => q.key === questionKey) || CREW_QUESTIONS[0];
  const todayStr = new Date().toISOString().slice(0, 10);
  const cacheKey = `ask_crew_${titleId}_${qObj.key}_${todayStr}`;

  const cached = cacheGet(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      return { ...parsed, cached: true };
    } catch {}
  }

  const title = await titleById(titleId);
  const factor = getItemFactor(title.id, title.genres || [], title.director || '');
  const allPersonas = loadAllAiPersonas();

  // Pick 3 diverse personas: craft purist, mass spectacle, box office tracker
  const selectedHandles = ['arjun_lens', 'ananya_mass', 'priya_boxoffice'];
  const candidates = selectedHandles
    .map(h => allPersonas.find(p => p.identity.handle === h))
    .filter(Boolean);

  const fallbackPersonas = candidates.length === 3 ? candidates : allPersonas.slice(0, 3);
  const takes: CrewTake[] = [];

  for (const p of fallbackPersonas) {
    const forecast = computePersonaForecast(p, 0.65, 0.55);
    const pred = predictPersonaRating(p, factor);

    let tasteMatchPercent: number | null = null;
    if (viewerLatentVector && viewerLatentVector.length === 16) {
      const sim = dotProduct(p.taste.latentVector, viewerLatentVector);
      tasteMatchPercent = Math.round(Math.max(10, Math.min(99, ((sim + 1) / 2) * 100)));
    }

    let takeText = '';
    if (qObj.key === 'hit_or_flop') {
      takeText = forecast.choice === 'hit'
        ? `Tracking signals lean positive. Expect solid momentum in opening frame.`
        : `Second-weekend drop-off risk is high given release competition.`;
    } else if (qObj.key === 'theatre_worth') {
      takeText = pred.rating >= 4
        ? `Big screen essential. The visual scale and sound mix demand IMAX or Dolby.`
        : `Atmospheric, but can comfortably be enjoyed on home setup.`;
    } else {
      takeText = `Carries strong echoes of ${title.genres?.[0] || 'auteur'} classics, with modern pacing tweaks.`;
    }

    takes.push({
      personaId: p.id,
      handle: p.identity.handle,
      displayName: p.identity.displayName,
      avatarUrl: p.identity.avatarUrl,
      archetype: p.identity.handle.split('_')[1] || 'critic',
      choice: forecast.choice,
      confidence: forecast.confidence,
      tasteMatchPercent,
      take: `${takeText} ${p.voice?.signaturePhrases?.[0] || ''}`.trim()
    });
  }

  const response: AskTheCrewResponse = {
    titleId,
    questionKey: qObj.key,
    questionText: qObj.label,
    takes,
    cached: false
  };

  // Cache for 12 hours
  cacheSet(cacheKey, JSON.stringify(response), 12 * 3600);

  return response;
}
