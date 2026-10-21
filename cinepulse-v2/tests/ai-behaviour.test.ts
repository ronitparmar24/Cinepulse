import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { circadianProbability, getLocalHour, hawkesSelfExcitingBoost } from '../lib/ai/circadian';
import { predictPersonaRating, dotProduct, buildLatentVector } from '../lib/ai/factors';
import { simulateFollowGraph, computeTasteSimilarity } from '../lib/ai/socialGraph';
import { chooseAction } from '../lib/ai/policy';
import { computePersonaForecast } from '../lib/ai/forecasting';

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n !== y.length || n === 0) return 0;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

test('Track U1: Hour-of-day histogram of actions matches circadian curve (correlation > 0.9)', () => {
  const peakHours = [19, 20, 21, 22];
  const theoreticalProbs: number[] = [];
  for (let h = 0; h < 24; h++) {
    theoreticalProbs.push(circadianProbability(h, peakHours));
  }

  // Simulate actions over 2000 days
  const hourlyCounts = new Array(24).fill(0);
  let seed = 777;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let day = 0; day < 2000; day++) {
    for (let h = 0; h < 24; h++) {
      const p = theoreticalProbs[h];
      if (rng() < p) {
        hourlyCounts[h]++;
      }
    }
  }

  const corr = pearsonCorrelation(hourlyCounts, theoreticalProbs);
  assert(corr > 0.90, `Circadian correlation must be > 0.90, got: ${corr.toFixed(4)}`);
});

test('Track U1: Inter-action gaps are over-dispersed vs Poisson (variance/mean > 1.3)', () => {
  // Simulate timestamps of actions under circadian + Hawkes self-excitation over 30 days
  const actionTimesHours: number[] = [];
  let lastActionTime: number | null = null;
  const peakHours = [19, 20, 21, 22];

  let seed = 42;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  // Step in 20-minute (1/3 hour) increments over 60 days
  for (let step = 0; step < 60 * 24 * 3; step++) {
    const currentHourTotal = step / 3;
    const hourOfDay = Math.floor(currentHourTotal) % 24;

    const baseProb = circadianProbability(hourOfDay, peakHours) * 0.15;
    const deltaMin = lastActionTime === null ? 9999 : (currentHourTotal - lastActionTime) * 60;
    const hawkes = hawkesSelfExcitingBoost(0, deltaMin, 0.45, 60);

    const prob = Math.min(0.9, baseProb + hawkes);
    if (rng() < prob) {
      actionTimesHours.push(currentHourTotal);
      lastActionTime = currentHourTotal;
    }
  }

  assert(actionTimesHours.length > 50, 'Must have sufficient action samples');

  // Compute intervals
  const intervals: number[] = [];
  for (let i = 1; i < actionTimesHours.length; i++) {
    intervals.push(actionTimesHours[i] - actionTimesHours[i - 1]);
  }

  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
  const fano = variance / mean;

  assert(fano > 1.3, `Inter-action intervals must be over-dispersed (variance/mean > 1.3), got: ${fano.toFixed(3)}`);
});

test('Track U4: Follower-degree distribution is heavy-tailed (top 10% hold > 35% of follows)', () => {
  const file = resolve(process.cwd(), 'data/ai-personas.json');
  const personas = JSON.parse(readFileSync(file, 'utf8'));

  const { inDegrees } = simulateFollowGraph(personas, 200, 101);

  const sortedDegrees = Array.from(inDegrees.values()).sort((a, b) => b - a);
  const totalFollows = sortedDegrees.reduce((a, b) => a + b, 0);

  // Top 10% of 35 personas is ~3-4 personas
  const top10Count = Math.ceil(personas.length * 0.10);
  const top10Follows = sortedDegrees.slice(0, top10Count).reduce((a, b) => a + b, 0);

  const share = top10Follows / totalFollows;
  assert(
    share > 0.35,
    `Top 10% of personas must hold > 35% of follows, got: ${(share * 100).toFixed(1)}%`
  );
});

test('Track U2: Persona ratings correlate with latent taste model (> 0.5 on held-out set)', () => {
  const file = resolve(process.cwd(), 'data/ai-personas.json');
  const personas = JSON.parse(readFileSync(file, 'utf8'));
  const testPersona = personas[0]; // Arjun Varma

  // 40 synthetic held-out titles across genre spectrum
  const trueMatchScores: number[] = [];
  const predictedRatings: number[] = [];

  for (let i = 0; i < 40; i++) {
    const factor = {
      titleId: `heldout-${i}`,
      latentVector: buildLatentVector(`heldout-${i}`, [(i % 2 === 0 ? 'Sci-Fi' : 'Comedy')], `dir-${i % 5}`)
    };

    const dot = dotProduct(testPersona.taste.latentVector, factor.latentVector);
    const pred = predictPersonaRating(testPersona, factor, 0.05 * (Math.sin(i) - 0.5));

    trueMatchScores.push(dot);
    predictedRatings.push(pred.rating);
  }

  const r = pearsonCorrelation(trueMatchScores, predictedRatings);
  assert(
    r > 0.50,
    `Persona ratings must correlate with taste model (> 0.50), got: ${r.toFixed(4)}`
  );
});

test('Track U3 & U5: Policy engine respects daily caps and deterministic reproducible seeds', () => {
  const file = resolve(process.cwd(), 'data/ai-personas.json');
  const personas = JSON.parse(readFileSync(file, 'utf8'));
  const p = personas[0];

  const now = new Date('2026-10-04T14:30:00Z');

  // Daily cap test
  const cappedAction = chooseAction(p, now, {
    tickId: 'tick-cap-test',
    personaDailyActionCount: 6
  });
  assert.equal(cappedAction.type, 'idle');
  assert.equal(cappedAction.reasonCode, 'DAILY_CAP_REACHED');

  // Reproducibility test
  const action1 = chooseAction(p, now, {
    tickId: 'tick-reproducible-1',
    upcomingTitles: [{ id: 'demo-dunes', title: 'Beyond the Dunes', modelProb: 0.72 }]
  });
  const action2 = chooseAction(p, now, {
    tickId: 'tick-reproducible-1',
    upcomingTitles: [{ id: 'demo-dunes', title: 'Beyond the Dunes', modelProb: 0.72 }]
  });

  assert.deepEqual(action1, action2, 'Seeded policy must yield identical decision');
});
