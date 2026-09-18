/**
 * CinePulse Prediction Engine — Heuristic Model v1
 *
 * Computes revenue estimates and hit/flop probabilities from catalog metadata
 * (budget, genre, popularity, vote average, release season, director).
 *
 * This is a rule-based heuristic model, not a trained ML model. All outputs
 * carry a mandatory disclaimer and confidence band. No outcome is adjudicated
 * and no accuracy is claimed.
 */

import type { Title } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PredictionConfidence = 'very-low' | 'low' | 'medium' | 'high';

export type PredictionFactorImpact = 'positive' | 'neutral' | 'negative';

export interface PredictionFactor {
  label: string;
  impact: PredictionFactorImpact;
  detail?: string;
}

export interface Prediction {
  /** Median revenue estimate in USD, or null if insufficient data. */
  revenueEstimate: number | null;
  /** [low, high] 80% confidence band in USD. */
  revenueRange: [number, number] | null;
  /** 0–100 probability the film is a theatrical hit. */
  hitProbability: number;
  /** 0–100 probability the film underperforms. */
  flopProbability: number;
  confidence: PredictionConfidence;
  /** Ordered list of signal factors driving the prediction. */
  factors: PredictionFactor[];
  modelVersion: 'heuristic-v1';
  disclaimer: string;
  /** ISO timestamp when this prediction was computed. */
  computedAt: string;
}

// ─── Genre Revenue Multipliers ────────────────────────────────────────────────
// Based on aggregate industry data patterns (not licensed historical data).
// Values are relative to a "base" $100M production budget title.

const GENRE_MULTIPLIERS: Record<string, number> = {
  'Action':         3.8,
  'Adventure':      3.5,
  'Science Fiction':3.4,
  'Sci-Fi':         3.4,
  'Fantasy':        3.2,
  'Animation':      3.1,
  'Family':         2.9,
  'Superhero':      4.0,
  'Thriller':       2.4,
  'Horror':         2.2,
  'Mystery':        2.0,
  'Comedy':         2.1,
  'Crime':          2.0,
  'Romance':        1.7,
  'Drama':          1.5,
  'History':        1.4,
  'Biography':      1.4,
  'War':            1.6,
  'Western':        1.3,
  'Music':          1.5,
  'Documentary':    0.8,
};

// Genre hit-rate adjustments (0 = no change, positive = more likely hit)
const GENRE_HIT_ADJUSTMENTS: Record<string, number> = {
  'Action':         12,
  'Adventure':      10,
  'Science Fiction': 9,
  'Animation':      11,
  'Family':         10,
  'Horror':         14,   // Horror often overperforms budget
  'Thriller':        6,
  'Comedy':          4,
  'Drama':          -4,
  'Documentary':   -10,
  'Western':        -6,
};

// ─── Season Multipliers ───────────────────────────────────────────────────────

function getSeasonMultiplier(releaseDate: string | null): { multiplier: number; label: string } {
  if (!releaseDate) return { multiplier: 1.0, label: 'unknown release window' };
  const month = parseInt(releaseDate.slice(5, 7), 10);
  // Summer blockbuster season (May–Aug)
  if (month >= 5 && month <= 8) return { multiplier: 1.25, label: 'summer blockbuster window' };
  // Holiday season (Nov–Dec)
  if (month === 11 || month === 12) return { multiplier: 1.18, label: 'holiday season release' };
  // March-April spring break
  if (month === 3 || month === 4) return { multiplier: 1.08, label: 'spring release window' };
  // Slow months (Jan–Feb)
  if (month === 1 || month === 2) return { multiplier: 0.82, label: 'slow January/February window' };
  // September–October (shoulder season)
  return { multiplier: 0.95, label: 'shoulder-season release' };
}

// ─── Budget Tier Logic ────────────────────────────────────────────────────────

type BudgetTier = 'mega' | 'big' | 'mid' | 'low' | 'micro' | 'unknown';

function getBudgetTier(budget: number | null): BudgetTier {
  if (budget === null) return 'unknown';
  if (budget >= 180_000_000) return 'mega';
  if (budget >= 80_000_000) return 'big';
  if (budget >= 30_000_000) return 'mid';
  if (budget >= 10_000_000) return 'low';
  return 'micro';
}

// Average theatrical multiplier per budget tier (revenue / production budget)
const TIER_BASE_MULTIPLIER: Record<BudgetTier, number | null> = {
  mega:    2.8,
  big:     3.1,
  mid:     3.6,
  low:     4.2,
  micro:   5.0,
  unknown: null,
};

// ─── Popularity / Vote Signal ─────────────────────────────────────────────────

function popularitySignal(popularity: number | null, voteAverage: number | null): {
  hitBoost: number;
  label: string | null;
  impact: PredictionFactorImpact | null;
} {
  let hitBoost = 0;
  let label: string | null = null;
  let impact: PredictionFactorImpact | null = null;

  if (popularity !== null) {
    if (popularity >= 300) { hitBoost += 16; label = 'Exceptionally high TMDB popularity'; impact = 'positive'; }
    else if (popularity >= 100) { hitBoost += 9; label = 'High TMDB popularity score'; impact = 'positive'; }
    else if (popularity >= 40) { hitBoost += 4; }
    else if (popularity < 10) { hitBoost -= 6; label = 'Low pre-release traction'; impact = 'negative'; }
  }

  if (voteAverage !== null && voteAverage > 0) {
    if (voteAverage >= 7.5) { hitBoost += 12; label = label ?? `Strong audience score (${voteAverage.toFixed(1)}/10)`; impact = impact ?? 'positive'; }
    else if (voteAverage >= 6.5) { hitBoost += 6; }
    else if (voteAverage < 5.5) { hitBoost -= 8; label = label ?? `Weak audience score (${voteAverage.toFixed(1)}/10)`; impact = impact ?? 'negative'; }
  }

  return { hitBoost, label, impact };
}

// ─── Revenue Range Spread ─────────────────────────────────────────────────────
// Returns a ±percentage spread based on confidence level.

const CONFIDENCE_SPREAD: Record<PredictionConfidence, number> = {
  'high':     0.25,
  'medium':   0.40,
  'low':      0.55,
  'very-low': 0.70,
};

// ─── Main Predict Function ────────────────────────────────────────────────────

export function predict(title: Title): Prediction {
  const factors: PredictionFactor[] = [];
  const computedAt = new Date().toISOString();
  const disclaimer = 'Rule-based estimate using genre, budget, and metadata signals. Not a financial forecast or trained ML output. No outcome has been adjudicated.';

  // Determine confidence based on data availability
  let dataPoints = 0;
  if (title.budget !== null && title.budget > 0) dataPoints++;
  if (title.voteAverage !== null && title.voteAverage > 0) dataPoints++;
  if (title.popularity !== null) dataPoints++;
  if (title.genres.length > 0) dataPoints++;
  if (title.releaseDate) dataPoints++;

  const confidence: PredictionConfidence =
    dataPoints >= 4 ? 'high' :
    dataPoints >= 3 ? 'medium' :
    dataPoints >= 2 ? 'low' : 'very-low';

  // ── Genre signals ──────────────────────────────────────────────────────────
  let genreMultiplier = 1.0;
  let totalGenreHitAdj = 0;
  const matchedGenres: string[] = [];

  for (const genre of title.genres) {
    const key = Object.keys(GENRE_MULTIPLIERS).find(k =>
      genre.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(genre.toLowerCase())
    );
    if (key) {
      genreMultiplier = Math.max(genreMultiplier, GENRE_MULTIPLIERS[key]);
      totalGenreHitAdj += GENRE_HIT_ADJUSTMENTS[key] ?? 0;
      matchedGenres.push(key);
    }
  }

  if (matchedGenres.length > 0) {
    const topGenre = matchedGenres[0];
    const mult = GENRE_MULTIPLIERS[topGenre] ?? 1.0;
    if (mult >= 3.0) {
      factors.push({ label: `${title.genres.slice(0, 2).join('/')} genre has strong box-office history`, impact: 'positive' });
    } else if (mult <= 1.5) {
      factors.push({ label: `${title.genres.slice(0, 2).join('/')} genre typically earns modestly`, impact: 'neutral' });
    }
  } else {
    factors.push({ label: 'Genre data unavailable for signal analysis', impact: 'neutral' });
  }

  // ── Budget signals ─────────────────────────────────────────────────────────
  const tier = getBudgetTier(title.budget);
  const tierMultiplier = TIER_BASE_MULTIPLIER[tier];

  if (title.budget !== null && title.budget > 0) {
    if (tier === 'mega') factors.push({ label: `Mega-budget production ($${(title.budget / 1e6).toFixed(0)}M)`, impact: 'positive', detail: 'Major studios protect big investments with marketing spend.' });
    else if (tier === 'micro' || tier === 'low') factors.push({ label: `Lean budget ($${(title.budget / 1e6).toFixed(0)}M) — higher ROI potential`, impact: 'positive', detail: 'Lower-budget films need smaller returns to succeed.' });
    else factors.push({ label: `Production budget $${(title.budget / 1e6).toFixed(0)}M (${tier}-tier)`, impact: 'neutral' });
  } else {
    factors.push({ label: 'Budget not publicly disclosed', impact: 'neutral' });
  }

  // ── Season signal ──────────────────────────────────────────────────────────
  const season = getSeasonMultiplier(title.releaseDate);
  if (season.multiplier >= 1.15) {
    factors.push({ label: `Releasing in ${season.label}`, impact: 'positive' });
  } else if (season.multiplier <= 0.85) {
    factors.push({ label: `Releasing in ${season.label}`, impact: 'negative' });
  } else if (title.releaseDate) {
    factors.push({ label: `Releasing in ${season.label}`, impact: 'neutral' });
  }

  // ── Popularity / Vote Average ──────────────────────────────────────────────
  const pop = popularitySignal(title.popularity, title.voteAverage);
  if (pop.label && pop.impact) {
    factors.push({ label: pop.label, impact: pop.impact });
  }

  // ── Media type adjustment ──────────────────────────────────────────────────
  // TV series don't have theatrical box office — we predict "audience success" differently
  const isTV = title.mediaType === 'tv';

  // ── Revenue estimate ───────────────────────────────────────────────────────
  let revenueEstimate: number | null = null;
  let revenueRange: [number, number] | null = null;

  if (!isTV && tierMultiplier !== null && title.budget !== null && title.budget > 0) {
    const baseRevenue = title.budget * tierMultiplier;
    const adjusted = baseRevenue * genreMultiplier * season.multiplier;
    // Clamp to reasonable bounds
    revenueEstimate = Math.round(Math.min(adjusted, 3_000_000_000));
    const spread = CONFIDENCE_SPREAD[confidence];
    revenueRange = [
      Math.round(revenueEstimate * (1 - spread)),
      Math.round(revenueEstimate * (1 + spread)),
    ];
  } else if (!isTV && title.budget === null) {
    // Estimate from genre + popularity alone (rough)
    if (confidence === 'low' || confidence === 'very-low') {
      revenueEstimate = null; // not enough data
    }
  }

  // ── Hit probability ────────────────────────────────────────────────────────
  // Base: 50% (coin flip for unknown). Adjust with signals.
  let hitScore = 50;

  // Genre adjustment
  hitScore += Math.min(totalGenreHitAdj, 18);

  // Budget tier adjustment
  if (tier === 'mega') hitScore += 8;
  else if (tier === 'big') hitScore += 5;
  else if (tier === 'micro') hitScore -= 4;

  // Season
  hitScore += (season.multiplier - 1.0) * 35;

  // Popularity/vote signal
  hitScore += pop.hitBoost;

  // Source: tmdb means real data
  if (title.source === 'tmdb') hitScore += 2;

  // Clamp to [8, 92] — never claim certainty
  hitScore = Math.min(92, Math.max(8, Math.round(hitScore)));
  const flopScore = 100 - hitScore;

  return {
    revenueEstimate,
    revenueRange,
    hitProbability: hitScore,
    flopProbability: flopScore,
    confidence,
    factors: factors.slice(0, 5), // max 5 factors for UI
    modelVersion: 'heuristic-v1',
    disclaimer,
    computedAt,
  };
}

// ─── Cache Helpers ────────────────────────────────────────────────────────────

import { db, now } from './db';

const PREDICTION_TTL_MS = 60 * 60 * 1000; // 1 hour

export function getCachedPrediction(titleId: string): Prediction | null {
  try {
    const d = db();
    const row = d.prepare(
      `SELECT result_json FROM prediction_cache WHERE title_id = ? AND expires_at > ?`
    ).get(titleId, Date.now()) as { result_json: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.result_json) as Prediction;
  } catch { return null; }
}

export function setCachedPrediction(titleId: string, prediction: Prediction): void {
  try {
    const d = db();
    d.prepare(
      `INSERT INTO prediction_cache(title_id, model_version, result_json, computed_at, expires_at)
       VALUES(?, ?, ?, ?, ?)
       ON CONFLICT(title_id) DO UPDATE SET
         model_version = excluded.model_version,
         result_json = excluded.result_json,
         computed_at = excluded.computed_at,
         expires_at = excluded.expires_at`
    ).run(titleId, prediction.modelVersion, JSON.stringify(prediction), now(), Date.now() + PREDICTION_TTL_MS);
  } catch { /* non-fatal: caching is best-effort */ }
}

export async function getPrediction(titleId: string, title: Title): Promise<Prediction> {
  const cached = getCachedPrediction(titleId);
  if (cached) return cached;
  const result = predict(title);
  setCachedPrediction(titleId, result);
  return result;
}
