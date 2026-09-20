import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFeatureVector } from '../lib/prediction/features';
import { scoreTitleV3 } from '../lib/prediction/model';
import { generateExplanation } from '../lib/prediction/explain';
import { computeBrierScore, getLeaderboard, getYouVsEngine, getCrowdVsEngine } from '../lib/pulse/adjudication';
import { getAccuracyMetrics } from '../lib/accuracy/backtest';
import { getExchangeRates } from '../lib/fetchers/currency';
import type { Title } from '../lib/types';

const mockMovie: Title = {
  id: 'test-blockbuster-1',
  title: 'Neon Odyssey: Part Two',
  mediaType: 'movie',
  releaseDate: '2026-07-15',
  overview: 'The sprawling sci-fi saga concludes with an interstellar battle.',
  tagline: 'The finale of a lifetime',
  poster: null,
  backdrop: null,
  genres: ['Science Fiction', 'Action', 'Adventure'],
  voteAverage: 8.2,
  voteCount: 1400,
  popularity: 180,
  runtime: 154,
  seasons: null,
  status: 'upcoming',
  cast: [{ id: 1, name: 'Tim C', character: 'Hero', profile: null }],
  trailerKey: 'dQw4w9WgXcQ',
  director: 'Denis V.',
  budget: 165_000_000,
  revenue: null,
  source: 'tmdb',
};

test('V3 Feature Extractor produces typed provenance vectors', async () => {
  const features = await extractFeatureVector(mockMovie);
  assert.equal(features.titleId, 'test-blockbuster-1');
  assert.equal(features.budgetTier.value, 'big');
  assert.equal(features.primaryGenre.value, 'Science Fiction');
  assert.equal(features.isSummerWindow.value, true);
  assert.equal(features.isFranchise.value, true);
  assert.equal(features.budgetUsd.source, 'tmdb');
  assert(features.budgetUsd.confidence > 0.8);
});

test('V3 Model computes P10/P50/P90 intervals and Platt-calibrated probabilities', async () => {
  const res = await scoreTitleV3(mockMovie);
  assert.equal(res.modelVersion, 'cinepulse-ml-v3');
  assert(res.p50RevenueUsd !== null && res.p50RevenueUsd > 0);
  assert(res.p10RevenueUsd !== null && res.p90RevenueUsd !== null);
  assert(res.p10RevenueUsd < res.p50RevenueUsd, 'P10 must be less than P50');
  assert(res.p50RevenueUsd < res.p90RevenueUsd, 'P50 must be less than P90');
  assert(res.hitProbability >= 8 && res.hitProbability <= 92, 'Hit probability must stay in calibrated bounds');
  assert.equal(res.hitProbability + res.flopProbability, 100);
});

test('V3 Waterfall Explanation provides step-by-step feature attribution', () => {
  const dummyFeatures: any = {
    budgetUsd: { value: 100_000_000 },
    budgetTier: { value: 'big' },
    primaryGenre: { value: 'Action' },
    isFranchise: { value: true },
    isSummerWindow: { value: true },
    isHolidayWindow: { value: false },
    releaseMonth: { value: 7 },
  };

  const explanation = generateExplanation(dummyFeatures, 65_000_000, 320_000_000, 1.35, 1.22, 1.45, 1.1);
  assert(explanation.waterfall.length >= 5);
  assert.equal(explanation.waterfall[0].name, 'Historical Baseline');
  assert(explanation.topDrivers.length > 0);
});

test('Brier Score calculation follows quadratic probability penalty', () => {
  // Perfect prediction: called hit at 100% and it hit -> Brier score = 0
  const perfect = computeBrierScore([{ choice: 'hit', confidence: 100, actualHit: true }]);
  assert.equal(perfect.brierScore, 0);
  assert.equal(perfect.accuracyRate, 100);

  // Complete miss: called hit at 100% and it flopped -> Brier score = 1
  const miss = computeBrierScore([{ choice: 'hit', confidence: 100, actualHit: false }]);
  assert.equal(miss.brierScore, 1);
  assert.equal(miss.accuracyRate, 0);

  // Moderate calibrated call: 70% confidence hit on actual hit -> (0.7 - 1)^2 = 0.09
  const moderate = computeBrierScore([{ choice: 'hit', confidence: 70, actualHit: true }]);
  assert.equal(moderate.brierScore, 0.09);
});

test('Accuracy Dashboard returns reliability curve and audit logs', () => {
  const metrics = getAccuracyMetrics();
  assert.equal(metrics.reliabilityCurve.length, 10, 'Must have 10 calibration bins');
  assert.equal(metrics.budgetTierErrors.length, 5);
  assert(metrics.recentLoggedPredictions.length > 0);
  assert(metrics.summary.brierScore < 0.2);
});

test('Leaderboard surfaces official Engine and calculates You vs Engine', () => {
  const board = getLeaderboard();
  assert(board.length > 0);
  const engine = board.find(b => b.entityId === 'cinepulse-engine');
  assert(engine !== undefined, 'Engine must be present on universal leaderboard');

  const yve = getYouVsEngine(null);
  assert.equal(yve.engineBrier, 0.142);

  const crowd = getCrowdVsEngine();
  assert(crowd.crowdHitPct > 0);
});

test('Currency converter provides valid USD to INR exchange rates', async () => {
  const rates = await getExchangeRates();
  assert.equal(rates.base, 'USD');
  assert(rates.rates.INR >= 70 && rates.rates.INR <= 110, 'Reasonable INR rate');
});
