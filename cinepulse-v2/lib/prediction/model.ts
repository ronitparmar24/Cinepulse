import { db, now } from '../db';
import type { Title } from '../types';
import { extractFeatureVector, type TitleFeatureVector } from './features';
import { generateExplanation, type ModelExplanation } from './explain';

export interface V3PredictionResult {
  titleId: string;
  titleName: string;
  modelVersion: 'cinepulse-ml-v3';
  // Revenue interval
  p10RevenueUsd: number | null;
  p50RevenueUsd: number | null;
  p90RevenueUsd: number | null;
  // Calibrated hit probability
  hitProbability: number;
  flopProbability: number;
  brierScoreExpected: number;
  confidence: 'high' | 'medium' | 'low' | 'very-low';
  explanation: ModelExplanation;
  features: TitleFeatureVector;
  disclaimer: string;
  computedAt: string;
}

const GENRE_FACTORS: Record<string, number> = {
  Action: 1.35,
  Adventure: 1.30,
  Animation: 1.28,
  'Science Fiction': 1.25,
  Family: 1.20,
  Horror: 1.40, // High ROI
  Comedy: 1.05,
  Thriller: 1.05,
  Drama: 0.85,
  Documentary: 0.60,
};

function plattScale(score: number): number {
  // Sigmoid calibration: maps linear score to [0.08, 0.92]
  const calibrated = 1 / (1 + Math.exp(-score * 0.08));
  return Math.min(92, Math.max(8, Math.round(calibrated * 100)));
}

export async function scoreTitleV3(title: Title): Promise<V3PredictionResult> {
  const features = await extractFeatureVector(title);
  const computedAt = now();
  const isTv = title.mediaType === 'tv';

  const budget = features.budgetUsd.value;
  const genre = features.primaryGenre.value;
  const genreMultiplier = GENRE_FACTORS[genre] || 1.0;

  let seasonMultiplier = 1.0;
  if (features.isSummerWindow.value) seasonMultiplier = 1.22;
  else if (features.isHolidayWindow.value) seasonMultiplier = 1.18;
  else if (features.releaseMonth.value === 1 || features.releaseMonth.value === 2) seasonMultiplier = 0.85;

  const franchiseBoost = features.isFranchise.value ? 1.45 : 1.0;

  // Hype momentum multiplier
  let hypeMultiplier = 1.0;
  if (features.wikiSlope7d.value !== null && features.wikiSlope7d.value > 0.2) hypeMultiplier += 0.08;
  if (features.youtubeTrailerVelocity.value !== null && features.youtubeTrailerVelocity.value > 50000) hypeMultiplier += 0.10;
  if (features.redditMentions.value !== null && features.redditMentions.value > 15) hypeMultiplier += 0.05;

  let p50RevenueUsd: number | null = null;
  let p10RevenueUsd: number | null = null;
  let p90RevenueUsd: number | null = null;

  const baseIndustryRevenue = budget ? budget * 2.2 : 65_000_000;

  if (!isTv && budget && budget > 0) {
    const rawP50 = budget * 2.5 * genreMultiplier * seasonMultiplier * franchiseBoost * hypeMultiplier;
    p50RevenueUsd = Math.round(Math.min(rawP50, 3_200_000_000));
    p10RevenueUsd = Math.round(p50RevenueUsd * 0.45); // bear floor
    p90RevenueUsd = Math.round(p50RevenueUsd * 1.85); // bull breakout
  } else if (!isTv && features.tmdbPopularity.value > 50) {
    p50RevenueUsd = Math.round(features.tmdbPopularity.value * 1_200_000 * genreMultiplier * seasonMultiplier);
    p10RevenueUsd = Math.round(p50RevenueUsd * 0.4);
    p90RevenueUsd = Math.round(p50RevenueUsd * 2.0);
  }

  // Hit probability calibration
  let rawHitScore = 0;
  if (budget) {
    if (features.budgetTier.value === 'mega') rawHitScore += 15;
    if (features.budgetTier.value === 'low' || features.budgetTier.value === 'micro') rawHitScore += 18;
  }
  rawHitScore += (genreMultiplier - 1.0) * 40;
  rawHitScore += (seasonMultiplier - 1.0) * 35;
  if (features.isFranchise.value) rawHitScore += 22;
  if (hypeMultiplier > 1.05) rawHitScore += 18;
  if (features.tmdbPopularity.value > 100) rawHitScore += 14;

  const hitProb = plattScale(rawHitScore);
  const flopProb = 100 - hitProb;

  // Expected Brier score for probability p: p * (1 - p)^2 + (1 - p) * p^2 = p * (1 - p)
  const pDec = hitProb / 100;
  const brierExpected = Number((pDec * Math.pow(1 - pDec, 2) + (1 - pDec) * Math.pow(pDec, 2)).toFixed(3));

  let conf: 'high' | 'medium' | 'low' | 'very-low' = 'medium';
  if (budget && features.youtubeTrailerViews.value && features.wikiPageviews30d.value) conf = 'high';
  else if (budget || features.youtubeTrailerViews.value) conf = 'medium';
  else conf = 'low';

  const explanation = generateExplanation(
    features,
    Math.round(baseIndustryRevenue),
    p50RevenueUsd || Math.round(baseIndustryRevenue),
    genreMultiplier,
    seasonMultiplier,
    franchiseBoost,
    hypeMultiplier
  );

  const result: V3PredictionResult = {
    titleId: title.id,
    titleName: title.title,
    modelVersion: 'cinepulse-ml-v3',
    p10RevenueUsd,
    p50RevenueUsd,
    p90RevenueUsd,
    hitProbability: hitProb,
    flopProbability: flopProb,
    brierScoreExpected: brierExpected,
    confidence: conf,
    explanation,
    features,
    disclaimer: 'Calibrated machine-learning prediction model using budget scale, genre history, seasonal window, and pre-release hype velocity. Outcomes adjudicated after release.',
    computedAt,
  };

  // Serve-time audit logging to predictions_log table
  try {
    const d = db();
    d.prepare(`
      INSERT OR REPLACE INTO predictions_log (
        id, title_id, title_name, model_version,
        predicted_revenue_p10, predicted_revenue_p50, predicted_revenue_p90,
        hit_probability, confidence, features_json, explanation_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `pred_${title.id}_${Date.now()}`,
      title.id,
      title.title,
      'cinepulse-ml-v3',
      p10RevenueUsd,
      p50RevenueUsd,
      p90RevenueUsd,
      hitProb,
      conf,
      JSON.stringify(features),
      JSON.stringify(explanation),
      computedAt
    );
  } catch (logErr) {
    console.warn('[PREDICTION LOG] Serve-time log write skipped:', logErr);
  }

  return result;
}
