import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateMultiverseTrajectory, MULTIVERSE_PRESETS } from '../lib/multiverse';
import type { Title } from '../lib/types';

const mockTitle: Title = {
  id: 'mock-101',
  source: 'demo',
  mediaType: 'movie',
  title: 'Cosmic Velocity',
  overview: 'Sci-fi blockbuster testing multiverse simulations.',
  tagline: 'Beyond every timeline.',
  poster: null,
  backdrop: null,
  releaseDate: '2026-11-20',
  genres: ['Sci-Fi', 'Action'],
  runtime: 145,
  seasons: null,
  status: 'upcoming',
  voteAverage: 7.8,
  voteCount: 1200,
  popularity: 88.5,
  cast: [{ name: 'Elena Vance', character: 'Commander', profile: null }],
  trailerKey: null,
  director: 'Denis Villeneuve',
  budget: 100_000_000,
  revenue: null,
};

test('Multiverse: simulates trajectory for Prime Timeline preset', () => {
  const primePreset = MULTIVERSE_PRESETS.find(p => p.id === 'prime')!;
  assert.ok(primePreset);

  const params = primePreset.params(mockTitle.budget || 50_000_000);
  const result = simulateMultiverseTrajectory(mockTitle, params, 'prime');

  assert.equal(result.timelineId, 'prime');
  assert.equal(result.trajectory.length, 10);
  assert.ok(result.worldwideGross > 0);
  assert.ok(result.p10 < result.p50);
  assert.ok(result.p50 < result.p90);
  assert.equal(result.breakEvenThreshold, 250_000_000); // 2.5 * 100M
  assert.ok(result.hitProbability >= 0 && result.hitProbability <= 100);
  assert.ok(['phenomenon', 'profitable_hit', 'marginal_survivor', 'write_down_casualty'].includes(result.verdict));
  assert.ok(result.executiveBrief.headline.length > 5);
  assert.equal(result.executiveBrief.tactics.length, 3);
});

test('Multiverse: Viral Shockwave produces higher gross than Summer Bloodbath', () => {
  const viralPreset = MULTIVERSE_PRESETS.find(p => p.id === 'viral_shockwave')!;
  const bloodbathPreset = MULTIVERSE_PRESETS.find(p => p.id === 'summer_bloodbath')!;

  const viralResult = simulateMultiverseTrajectory(mockTitle, viralPreset.params(100_000_000), 'viral_shockwave');
  const bloodbathResult = simulateMultiverseTrajectory(mockTitle, bloodbathPreset.params(100_000_000), 'summer_bloodbath');

  assert.ok(viralResult.worldwideGross > bloodbathResult.worldwideGross);
  assert.ok(viralResult.hitProbability > bloodbathResult.hitProbability);
});

test('Multiverse: tracks weekly drops and cumulative gross monotonically', () => {
  const params = {
    budget: 60_000_000,
    releaseCorridor: 'holiday' as const,
    criticalScore: 88,
    marketingVelocity: 1.5,
    theatricalWindow: 45 as const,
    screenSaturation: 'imax_solo' as const,
  };
  const result = simulateMultiverseTrajectory(mockTitle, params, 'custom');

  let prevGross = 0;
  for (const pt of result.trajectory) {
    assert.ok(pt.cumulativeGross >= prevGross, `Week ${pt.week} cumulative gross should not decrease`);
    assert.ok(pt.weekendGross >= 0);
    assert.ok(pt.dropPercent >= 0 && pt.dropPercent <= 100);
    prevGross = pt.cumulativeGross;
  }
});
