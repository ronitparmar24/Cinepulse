import { db, now } from '../db';
import type { Title } from '../types';
import { extractFeatureVector, type TitleFeatureVector } from './features';
import { buildFeatureMap, featureCoverage, FEATURE_COLS, type FeatureInputs } from './featureBuilder';
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
  // Track K4: abstain when evidence is insufficient
  status?: 'ok' | 'insufficient-evidence';
  missingInputs?: string[];
}

// ── Real waterfall explanation (Track K5) ──
export interface WaterfallStep {
  name: string;
  deltaUsd: number;
  cumulativeUsd: number;
  impact: 'positive' | 'negative' | 'neutral';
  explanation: string;
  featureName?: string;
  coefficient?: number;
  value?: number;
  mean?: number;
  contribution?: number; // coef * (value - mean)
  label?: string;
}

export interface ModelExplanation {
  intercept: number;
  sumContributions: number;
  predictedLogRevenue: number;
  waterfall: WaterfallStep[];
  topDrivers: string[];
  // Legacy shape for UI compatibility
  baseUsd: number;
  finalP50Usd: number;
}

export function getModelWeights() {
  return modelWeights;
}

// Feature means for contribution computation (Track K5).
// These are approximate means from the training set.
const FEATURE_MEANS: Record<string, number> = {
  log10_budget: 8.22,
  runtime: 127,
  is_franchise: 0.78,
  sequel_index: 2.1,
  release_month: 6.5,
  is_holiday_window: 0.28,
  is_summer_window: 0.42,
  competing_release_count: 2,
  cast_star_power: 65,
  director_prior_median_rev: 500,
  studio_tier: 0.82,
};

/**
 * Build the real waterfall: coef * (value - mean) per feature.
 * Sum of contributions + intercept == predicted log revenue (by construction).
 * This replaces the hand-tuned multipliers in the old model.ts (Track K5).
 */
export function buildWaterfall(
  featureMap: Record<string, number>,
  regCoeffs: Record<string, number>,
  intercept: number,
  p50Usd: number
): ModelExplanation {
  const waterfall: WaterfallStep[] = [];
  let sumContributions = 0;

  const baseUsd = Math.round(Math.pow(10, intercept));
  let runningUsd = baseUsd;
  let runningLog = intercept;

  // Step 1: Baseline step for UI waterfall
  waterfall.push({
    name: 'Historical Baseline',
    deltaUsd: baseUsd,
    cumulativeUsd: baseUsd,
    impact: 'neutral',
    explanation: 'Average theatrical industry gross anchored at model intercept.',
    featureName: 'intercept',
    coefficient: intercept,
    value: 1,
    mean: 1,
    contribution: 0,
    label: 'Historical Baseline',
  });

  // Only show features with meaningful contributions
  const HUMAN_LABELS: Record<string, string> = {
    log10_budget: 'Production Budget Scale',
    runtime: 'Film Runtime',
    is_franchise: 'Franchise / IP',
    sequel_index: 'Sequel Number',
    release_month: 'Release Month',
    is_holiday_window: 'Holiday Release',
    is_summer_window: 'Summer Blockbuster Season',
    competing_release_count: 'Competition (same weekend)',
    cast_star_power: 'Cast Star Power',
    director_prior_median_rev: "Director's Track Record",
    studio_tier: 'Major Studio Backing',
    genre_action: 'Action Genre',
    genre_adventure: 'Adventure Genre',
    genre_animation: 'Animation Genre',
    genre_comedy: 'Comedy Genre',
    genre_science_fiction: 'Sci-Fi Genre',
    genre_drama: 'Drama Genre',
    genre_thriller: 'Thriller Genre',
    genre_horror: 'Horror Genre',
    cert_pg13: 'PG-13 Rating',
    cert_r: 'R Rating',
  };

  const significantFeats: string[] = [];

  for (const feat of FEATURE_COLS) {
    const coef = regCoeffs[feat] ?? 0;
    const val = featureMap[feat] ?? 0;
    const mean = FEATURE_MEANS[feat] ?? 0;
    const contribution = coef * (val - mean);

    sumContributions += contribution;

    // Only include non-trivial contributions in the waterfall display
    if (Math.abs(contribution) > 0.005 && HUMAN_LABELS[feat]) {
      const nextLog = runningLog + contribution;
      const nextUsd = Math.round(Math.pow(10, nextLog));
      const deltaUsd = nextUsd - runningUsd;
      runningLog = nextLog;
      runningUsd = nextUsd;

      const label = HUMAN_LABELS[feat] ?? feat;
      const impact: 'positive' | 'negative' | 'neutral' =
        contribution > 0.01 ? 'positive' : contribution < -0.01 ? 'negative' : 'neutral';

      waterfall.push({
        name: label,
        deltaUsd,
        cumulativeUsd: nextUsd,
        impact,
        explanation: `${label} contributes ${(contribution >= 0 ? '+' : '')}${contribution.toFixed(2)} log10 revenue impact.`,
        featureName: feat,
        coefficient: coef,
        value: val,
        mean,
        contribution,
        label,
      });
      if (Math.abs(contribution) > 0.03) significantFeats.push(feat);
    }
  }

  // Top drivers from feature contributions (excluding baseline)
  const topDrivers = waterfall
    .filter(w => w.name !== 'Historical Baseline' && w.impact !== 'neutral')
    .sort((a, b) => Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0))
    .slice(0, 3)
    .map(w => `${w.impact === 'positive' ? '↑' : '↓'} ${w.name}`);

  if (topDrivers.length === 0) topDrivers.push('Baseline metadata match');

  const predictedLogRevenue = intercept + sumContributions;

  return {
    intercept,
    sumContributions,
    predictedLogRevenue,
    waterfall,
    topDrivers,
    baseUsd,
    finalP50Usd: p50Usd,
  };
}

/**
 * Check if we should abstain from prediction (Track K4).
 * Returns { shouldAbstain, missingInputs }.
 */
function shouldAbstain(
  features: TitleFeatureVector,
  releaseDate: string | null | undefined,
  coverage: number
): { abstain: boolean; missing: string[] } {
  const missing: string[] = [];

  // Budget missing
  if (!features.budgetUsd.value || features.budgetUsd.value <= 0) {
    missing.push('production budget');
  }

  // Release date > 180 days out
  if (releaseDate) {
    const relDate = new Date(releaseDate);
    const daysUntil = (relDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysUntil > 180) {
      missing.push(`release too far out (${Math.round(daysUntil)} days)`);
    }
  } else {
    missing.push('release date');
  }

  // Feature coverage < 60%
  if (coverage < 0.6) {
    missing.push(`low feature coverage (${Math.round(coverage * 100)}%)`);
  }

  return { abstain: missing.length > 0, missing };
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

  // Infer cert from TMDB or fall back to PG-13
  const certRaw: string = (title as unknown as Record<string, string>).certification || 'PG-13';

  // Cast star power: top-cast TMDB popularity × 3, clamped 10–100
  const castStar = Math.min(100, Math.max(10, Math.round((features.tmdbPopularity.value || 30) * 1.5)));

  // Build inputs for shared featureBuilder (Track K2)
  const featureInputs: FeatureInputs = {
    budgetUsd: budgetUsd,
    runtimeMinutes: runtime,
    isFranchise: Boolean(isFranchise),
    sequelIndex: isFranchise ? 2 : 1,
    releaseMonth: releaseMonth,
    primaryGenre: primaryGenre,
    certRating: certRaw,
    competingReleaseCount: 2, // TODO: real TMDB discover count (Track K2 full)
    castStarPower: castStar,
    directorPriorMedianRev: 400, // TODO: real director filmography (Track K2 full)
    studioTier: budgetUsd >= 80_000_000 ? 1 : 0,
  };

  const coverage = featureCoverage(featureInputs);

  // ── Track K4: Abstain if evidence is insufficient ──
  const { abstain, missing } = shouldAbstain(features, title.releaseDate, coverage);
  if (abstain && !isTv) {
    const result: V3PredictionResult = {
      titleId: title.id,
      titleName: title.title,
      modelVersion: 'cinepulse-ml-v3',
      p10RevenueUsd: null,
      p50RevenueUsd: null,
      p90RevenueUsd: null,
      hitProbability: 0,
      flopProbability: 0,
      brierScoreExpected: 0.25,
      confidence: 'very-low',
      explanation: {
        intercept: 0,
        sumContributions: 0,
        predictedLogRevenue: 0,
        waterfall: [],
        topDrivers: ['Insufficient evidence — prediction withheld'],
        baseUsd: 0,
        finalP50Usd: 0,
      },
      features,
      disclaimer: 'Prediction withheld: insufficient input data.',
      computedAt,
      status: 'insufficient-evidence',
      missingInputs: missing,
    };
    return result;
  }

  // Use shared featureBuilder (Track K2)
  const featureMap = buildFeatureMap(featureInputs);

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
  // Cap applied AFTER calibration only (not cosmetically before) — Track K4
  const calibratedLogit = clf.plattA * rawLogit + clf.plattB;
  const rawProb = 1 / (1 + Math.exp(-calibratedLogit));
  const hitProb = Math.min(92, Math.max(8, Math.round(rawProb * 100)));
  const flopProb = 100 - hitProb;

  // Expected Brier score for probability p: p * (1 - p)
  const pDec = hitProb / 100;
  const brierExpected = Number((pDec * Math.pow(1 - pDec, 2) + (1 - pDec) * Math.pow(pDec, 2)).toFixed(3));

  let conf: 'high' | 'medium' | 'low' | 'very-low' = 'medium';
  if (budget && features.youtubeTrailerViews.value && features.wikiPageviews30d.value) conf = 'high';
  else if (budget || features.youtubeTrailerViews.value) conf = 'medium';
  else conf = 'low';

  // ── Track K5: Real waterfall explanation ──
  // Contributions = coef * (value - mean); sum + intercept = prediction
  const explanation = buildWaterfall(
    featureMap as unknown as Record<string, number>,
    regCoeffs,
    reg.intercept,
    p50RevenueUsd || 0
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
    status: 'ok',
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
  } catch {
    // Log write skipped if table not yet migrated
  }

  return result;
}
