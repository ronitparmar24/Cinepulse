/**
 * CinePulse v8 — Shared Feature Builder (Track K2)
 *
 * IMPORTANT: This module is the single source of truth for how raw title data
 * is converted into model features. Both the training pipeline (scripts/build-training-set.ts)
 * and the inference path (lib/prediction/model.ts) MUST use this module.
 *
 * A test in tests/migrations.test.ts verifies that both export the same FEATURE_COLS list.
 * If they diverge, the build fails.
 */

export interface ModelFeatureMap {
  log10_budget: number;
  runtime: number;
  is_franchise: number;
  sequel_index: number;
  release_month: number;
  is_holiday_window: number;
  is_summer_window: number;
  competing_release_count: number;
  cast_star_power: number;
  director_prior_median_rev: number;
  studio_tier: number;
  // Genre one-hot
  genre_action: number;
  genre_adventure: number;
  genre_animation: number;
  genre_comedy: number;
  genre_crime: number;
  genre_documentary: number;
  genre_drama: number;
  genre_family: number;
  genre_fantasy: number;
  genre_history: number;
  genre_horror: number;
  genre_music: number;
  genre_mystery: number;
  genre_romance: number;
  genre_science_fiction: number;
  genre_thriller: number;
  genre_war: number;
  genre_western: number;
  // Cert one-hot
  cert_g: number;
  cert_pg: number;
  cert_pg13: number;
  cert_r: number;
  cert_nc17: number;
}

/**
 * The canonical ordered list of features used in training and inference.
 * Order MUST match the Python FEATURE_COLS list in scripts/train_model.py.
 */
export const FEATURE_COLS: (keyof ModelFeatureMap)[] = [
  'log10_budget', 'runtime', 'is_franchise', 'sequel_index',
  'release_month', 'is_holiday_window', 'is_summer_window',
  'competing_release_count', 'cast_star_power', 'director_prior_median_rev',
  'studio_tier',
  'genre_action', 'genre_adventure', 'genre_animation', 'genre_comedy',
  'genre_crime', 'genre_documentary', 'genre_drama', 'genre_family',
  'genre_fantasy', 'genre_history', 'genre_horror', 'genre_music',
  'genre_mystery', 'genre_romance', 'genre_science_fiction', 'genre_thriller',
  'genre_war', 'genre_western',
  'cert_g', 'cert_pg', 'cert_pg13', 'cert_r', 'cert_nc17',
];

export interface FeatureInputs {
  budgetUsd: number | null;
  runtimeMinutes: number | null;
  isFranchise: boolean;
  sequelIndex: number;           // 1 for original, 2+ for sequels
  releaseMonth: number | null;   // 1-12
  primaryGenre: string;
  certRating: string;            // G, PG, PG-13, R, NC-17
  competingReleaseCount: number; // count of wide releases ±14 days
  castStarPower: number;         // 0-100 scale
  directorPriorMedianRev: number; // median revenue of director's prior films (millions)
  studioTier: number;            // 0 or 1 (major studio)
}

/**
 * Build the feature map vector from structured inputs.
 * Used by BOTH training (build-training-set.ts) and inference (model.ts).
 *
 * Returns a full ModelFeatureMap with every feature populated.
 */
export function buildFeatureMap(inputs: FeatureInputs): ModelFeatureMap {
  const budgetUsd = inputs.budgetUsd && inputs.budgetUsd > 0 ? inputs.budgetUsd : 30_000_000;
  const log10_budget = Math.log10(budgetUsd);
  const runtime = inputs.runtimeMinutes ?? 110;
  const releaseMonth = inputs.releaseMonth ?? 6;
  const isHoliday = releaseMonth === 11 || releaseMonth === 12 ? 1 : 0;
  const isSummer = releaseMonth >= 5 && releaseMonth <= 8 ? 1 : 0;
  const primaryGenre = inputs.primaryGenre || 'Drama';
  const cert = inputs.certRating || 'PG-13';

  return {
    log10_budget,
    runtime,
    is_franchise: inputs.isFranchise ? 1 : 0,
    sequel_index: inputs.sequelIndex,
    release_month: releaseMonth,
    is_holiday_window: isHoliday,
    is_summer_window: isSummer,
    competing_release_count: inputs.competingReleaseCount,
    cast_star_power: Math.min(100, Math.max(0, inputs.castStarPower)),
    director_prior_median_rev: inputs.directorPriorMedianRev,
    studio_tier: inputs.studioTier,
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
    cert_g: cert === 'G' ? 1 : 0,
    cert_pg: cert === 'PG' ? 1 : 0,
    cert_pg13: cert === 'PG-13' ? 1 : 0,
    cert_r: cert === 'R' ? 1 : 0,
    cert_nc17: cert === 'NC-17' ? 1 : 0,
  };
}

/**
 * Compute feature vector as an ordered array matching FEATURE_COLS.
 * This is what goes into the model's dot product.
 */
export function featureVector(map: ModelFeatureMap): number[] {
  return FEATURE_COLS.map(k => map[k]);
}

/**
 * Count how many "known" features are present (non-default).
 * Used for the abstain check: if coverage < 60%, return insufficient-evidence.
 */
export function featureCoverage(inputs: FeatureInputs): number {
  let known = 0;
  const total = 5; // key signals
  if (inputs.budgetUsd && inputs.budgetUsd > 0) known++;
  if (inputs.runtimeMinutes && inputs.runtimeMinutes > 0) known++;
  if (inputs.releaseMonth !== null) known++;
  if (inputs.primaryGenre && inputs.primaryGenre !== 'Unknown') known++;
  if (inputs.castStarPower > 0) known++;
  return known / total;
}
