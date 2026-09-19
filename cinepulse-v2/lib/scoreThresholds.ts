/**
 * Central configuration of minimum sample-size gates and thresholds
 * for CinePulse trust and scoring layer.
 */

export const SCORE_THRESHOLDS = {
  // Taste match minimum sample size (ratings)
  MIN_RATINGS_FOR_TASTE_MATCH: 5,

  // Community pulse minimum call count
  MIN_COMMUNITY_CALLS_FOR_PULSE: 10,

  // Contrarian divergence threshold (difference between model & community)
  CONTRARIAN_DIVERGENCE_PERCENT: 20,

  // Hidden gems threshold (TMDB vote count)
  HIDDEN_GEM_MAX_VOTES: 50000,
  HIDDEN_GEM_MIN_RATING: 7.0,

  // High confidence threshold for model forecasts
  HIGH_CONFIDENCE_THRESHOLD: 80,
} as const;

export interface TasteMatchResult {
  available: boolean;
  score: number | null; // 0–100 integer
  ratedCount: number;
  reason?: string;
}

export interface CommunityPulseResult {
  available: boolean;
  hitPercentage: number | null; // 0–100
  totalCalls: number;
  label: string;
}

export function formatBoxOfficeRange(p10: number | null, p90: number | null): string {
  if (p10 === null || p90 === null || p10 <= 0 || p90 <= 0) {
    return 'Range unavailable';
  }

  const fmt = (n: number) => {
    if (n >= 1_000_000_000) {
      return `$${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
    }
    if (n >= 1_000_000) {
      return `$${Math.round(n / 1_000_000)}M`;
    }
    return `$${Math.round(n / 1_000)}k`;
  };

  return `${fmt(p10)}–${fmt(p90)}`;
}

export function isTasteMatchEligible(ratedCount: number): boolean {
  return ratedCount >= SCORE_THRESHOLDS.MIN_RATINGS_FOR_TASTE_MATCH;
}

export function isCommunityPulseEligible(callCount: number): boolean {
  return callCount >= SCORE_THRESHOLDS.MIN_COMMUNITY_CALLS_FOR_PULSE;
}
