/**
 * CinePulse v9 — Track U1: Circadian & Hawkes Self-Exciting Process
 * Computes when personas act based on local timezone, peak hours,
 * weekend boost, self-exciting bursts, and quiet lurker intervals.
 */

export interface CircadianParams {
  timezone: string;
  peakHours: number[];
  weekendBoost: number;
  lurkerWeeksProbability?: number;
}

/**
 * Calculates local hour of day (0-23) given a date and timezone.
 */
export function getLocalHour(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone
    });
    const hourStr = formatter.format(date);
    const parsed = parseInt(hourStr, 10);
    return isNaN(parsed) ? date.getUTCHours() : (parsed === 24 ? 0 : parsed);
  } catch {
    return date.getUTCHours();
  }
}

/**
 * Evaluates smooth Gaussian-like circadian probability given local hour and peak hours.
 */
export function circadianProbability(localHour: number, peakHours: number[]): number {
  if (!peakHours || peakHours.length === 0) return 0.5;

  let minDist = 24;
  for (const peak of peakHours) {
    const direct = Math.abs(localHour - peak);
    const circular = 24 - direct;
    const dist = Math.min(direct, circular);
    if (dist < minDist) minDist = dist;
  }

  // Gaussian profile around closest peak hour: sigma = 2.8 hours
  const base = Math.exp(- (minDist * minDist) / (2 * 2.8 * 2.8));
  // Baseline activity (0.08) + peak amplitude (0.85)
  return Math.min(1.0, 0.08 + 0.85 * base);
}

/**
 * Hawkes self-exciting intensity boost.
 * One action slightly raises the probability of a follow-up action for a few hours.
 */
export function hawkesSelfExcitingBoost(
  lastActionTimestampMs: number | null,
  nowMs: number,
  alpha = 0.55,
  decayHalflifeMinutes = 75
): number {
  if (!lastActionTimestampMs || nowMs <= lastActionTimestampMs) return 0;

  const deltaMinutes = (nowMs - lastActionTimestampMs) / 60000;
  if (deltaMinutes > 360) return 0; // Negligible after 6 hours

  const lambda = Math.LN2 / decayHalflifeMinutes;
  return alpha * Math.exp(-lambda * deltaMinutes);
}

/**
 * Checks if persona is currently in a scheduled quiet/lurker period (5 to 12 days).
 */
export function isPersonaLurking(personaId: string, now: Date, lurkerProb = 0.05): boolean {
  if (lurkerProb <= 0) return false;

  // Deterministic hash based on (personaId, epoch 10-day bucket)
  const epochDays = Math.floor(now.getTime() / (86400 * 1000));
  const cycleIndex = Math.floor(epochDays / 28); // 4-week window
  let hash = 0;
  const key = `${personaId}_cycle_${cycleIndex}`;
  for (let i = 0; i < key.length; i++) {
    hash = (Math.imul(31, hash) + key.charCodeAt(i)) | 0;
  }
  const normHash = (Math.abs(hash) % 1000) / 1000;

  if (normHash < lurkerProb) {
    // Lurker period active during day 3 to 10 of this 28-day cycle
    const dayInCycle = epochDays % 28;
    return dayInCycle >= 3 && dayInCycle <= 11;
  }

  return false;
}

/**
 * Computes composite probability of persona taking an action at the given timestamp.
 */
export function computeActionProbability(
  persona: {
    id: string;
    identity: { timezone: string };
    life: { peakHours: number[]; weekendBoost: number; lurkerWeeksProbability?: number };
  },
  now: Date,
  lastActionTimestampMs: number | null = null,
  eventBoost = 1.0
): number {
  if (isPersonaLurking(persona.id, now, persona.life.lurkerWeeksProbability)) {
    return 0.01; // Dramatically reduced activity during quiet weeks
  }

  const localHour = getLocalHour(now, persona.identity.timezone);
  const baseCircadian = circadianProbability(localHour, persona.life.peakHours);

  // Weekend boost on Saturday (6) and Sunday (0)
  const day = now.getUTCDay();
  const isWeekend = (day === 0 || day === 6);
  const weekendMultiplier = isWeekend ? (persona.life.weekendBoost || 1.2) : 1.0;

  const hawkes = hawkesSelfExcitingBoost(lastActionTimestampMs, now.getTime());

  const prob = (baseCircadian * weekendMultiplier * eventBoost) + hawkes;
  return Math.min(0.95, Math.max(0.02, prob));
}
