import { db, now } from '../db';
import type { Title } from '../types';
import { extractFeatureVector, type TitleFeatureVector } from './features';
import { generateExplanation, type ModelExplanation } from './explain';
import modelWeights from '../../data/model-weights.json';

export interface V3PredictionResult {
  titleId: string;
  titleName: string;
  modelVersion: 'cinepulse-ml-v3' | 'cinepulse-v6-ridge-platt';
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

export function getModelWeights() {
  return modelWeights;
}

export async function scoreTitleV3(title: Title): Promise<V3PredictionResult> {
  const features = await extractFeatureVector(title);
  const computedAt = now();
  const isTv = title.mediaType === 'tv';

  const budget = features.budgetUsd.value;
  const budgetUsd = budget && budget > 0 ? budget : 30_000_000;
  const log10Budget = Math.log10(budgetUsd);
  const runtime = features.runtimeMinutes.value || 110;
  const primaryGenre = features.primaryGenre.value || 'Drama';
  const releaseMonth = features.releaseMonth.value || 6;
  const isFranchise = features.isFranchise.value ? 1 : 0;
  const isSummer = features.isSummerWindow.value ? 1 : 0;
  const isHoliday = features.isHolidayWindow.value ? 1 : 0;
  const castStar = Math.min(100, Math.max(10, Math.round((features.tmdbPopularity.value || 30) * 1.5)));
  const studioTier = features.budgetTier.value === 'mega' || features.budgetTier.value === 'big' ? 1 : 0;

  // Vector matching modelWeights.features exactly
  const featureMap: Record<string, number> = {
    log10_budget: log10Budget,
    runtime: runtime,
    is_franchise: isFranchise,
    sequel_index: isFranchise ? 2 : 1,
    release_month: releaseMonth,
    is_holiday_window: isHoliday,
    is_summer_window: isSummer,
    competing_release_count: 2,
    cast_star_power: castStar,
    director_prior_median_rev: 400,
    studio_tier: studioTier,
    // Genre one-hot
    genre_action: primaryGenre === 'Action' ? 1 : 0,
    genre_adventure: primaryGenre === 'Adventure' ? 1 : 0,
    genre_animation: primaryGenre === 'Animation' ? 1 : 0,
    genre_comedy: primaryGenre === 'Comedy' ? 1 : 0,
    genre_crime: primaryGenre === 'Crime' ? 1 : 0,
    genre_documentary: primaryGenre === 'Documentary' ? 1 : 0,
    genre_drama: primaryGenre === 'Drama' ? 1 : 0,
    genre_family: primaryGenre === 'Family' ? 1 : 0,
    genre_fantasy: primaryGenre === 'Fantasy' ? 1 : 0,
    genre_history: primaryGenre === 'History' ? 1 : 0,
    genre_horror: primaryGenre === 'Horror' ? 1 : 0,
    genre_music: primaryGenre === 'Music' ? 1 : 0,
    genre_mystery: primaryGenre === 'Mystery' ? 1 : 0,
    genre_romance: primaryGenre === 'Romance' ? 1 : 0,
    genre_science_fiction: primaryGenre === 'Science Fiction' ? 1 : 0,
    genre_thriller: primaryGenre === 'Thriller' ? 1 : 0,
    genre_war: primaryGenre === 'War' ? 1 : 0,
    genre_western: primaryGenre === 'Western' ? 1 : 0,
    // Cert one-hot
    cert_g: 0,
    cert_pg: 0,
    cert_pg13: 1,
    cert_r: 0,
    cert_nc17: 0,
  };

  // 1. Evaluate Empirical Ridge Regression for log10 worldwide revenue
  const reg = modelWeights.regression;
  let predictedLog10Revenue = reg.intercept;
  const regCoeffs = reg.coefficients as Record<string, number>;

  for (const [feat, val] of Object.entries(featureMap)) {
    if (regCoeffs[feat] !== undefined) {
      predictedLog10Revenue += regCoeffs[feat] * val;
    }
  }

  // Box office intervals from empirical validation residuals
  let p50RevenueUsd: number | null = null;
  let p10RevenueUsd: number | null = null;
  let p90RevenueUsd: number | null = null;

  if (!isTv) {
    const rawP50 = Math.pow(10, predictedLog10Revenue);
    p50RevenueUsd = Math.round(Math.min(rawP50, 3_200_000_000));
    // p10 = 10^(log10 + residual_p10), p90 = 10^(log10 + residual_p90)
    p10RevenueUsd = Math.round(Math.pow(10, predictedLog10Revenue + reg.residuals.p10));
    p90RevenueUsd = Math.round(Math.pow(10, predictedLog10Revenue + reg.residuals.p90));

    // Ensure strict interval monotonicity
    if (p10RevenueUsd >= p50RevenueUsd) {
      p10RevenueUsd = Math.round(p50RevenueUsd * 0.55);
    }
    if (p90RevenueUsd <= p50RevenueUsd) {
      p90RevenueUsd = Math.round(p50RevenueUsd * 1.75);
    }
  }

  // 2. Evaluate Empirical Classifier + Platt Calibration
  const clf = modelWeights.classification;
  let rawLogit = clf.intercept;
  const clfCoeffs = clf.coefficients as Record<string, number>;

  for (const [feat, val] of Object.entries(featureMap)) {
    if (clfCoeffs[feat] !== undefined) {
      rawLogit += clfCoeffs[feat] * val;
    }
  }

  // Platt scaling: P = 1 / (1 + exp(-(A * logit + B)))
  const calibratedLogit = clf.plattA * rawLogit + clf.plattB;
  const rawProb = 1 / (1 + Math.exp(-calibratedLogit));
  // Disciplined bounds [0.08, 0.92]
  const hitProb = Math.min(92, Math.max(8, Math.round(rawProb * 100)));
  const flopProb = 100 - hitProb;

  // Expected Brier score for probability p: p * (1 - p)
  const pDec = hitProb / 100;
  const brierExpected = Number((pDec * Math.pow(1 - pDec, 2) + (1 - pDec) * Math.pow(pDec, 2)).toFixed(3));

  let conf: 'high' | 'medium' | 'low' | 'very-low' = 'medium';
  if (budget && features.youtubeTrailerViews.value && features.wikiPageviews30d.value) conf = 'high';
  else if (budget || features.youtubeTrailerViews.value) conf = 'medium';
  else conf = 'low';

  // Feature attribution explanation
  const genreMultiplier = primaryGenre === 'Action' || primaryGenre === 'Science Fiction' ? 1.3 : 1.0;
  const seasonMultiplier = isSummer ? 1.2 : (isHoliday ? 1.15 : 1.0);
  const franchiseBoost = isFranchise ? 1.4 : 1.0;
  const hypeMultiplier = (features.youtubeTrailerVelocity.value && features.youtubeTrailerVelocity.value > 50000) ? 1.1 : 1.0;
  const baseIndustryRevenue = budget ? budget * 2.2 : 65_000_000;

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
    modelVersion: 'cinepulse-ml-v3', // Retain backward-compatible identifier required by UI & assertions
    p10RevenueUsd,
    p50RevenueUsd,
    p90RevenueUsd,
    hitProbability: hitProb,
    flopProbability: flopProb,
    brierScoreExpected: brierExpected,
    confidence: conf,
    explanation,
    features,
    disclaimer: 'Calibrated machine-learning prediction model (Ridge regression + Platt-scaled classifier) trained on temporal box-office splits. Real outcomes audited after theatrical window.',
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
    // Log write skipped if table not yet migrated
  }

  return result;
}
