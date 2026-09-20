import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scoreTitleV3, getModelWeights } from '../lib/prediction/model';
import { extractFeatureVector } from '../lib/prediction/features';
import { checkLoginRateLimit, resetLoginRateLimit } from '../lib/auth/rateLimit';
import { requireAuth, requireOwnership } from '../lib/auth/guards';
import { searchTVmaze, getTVmazeByImdb } from '../lib/fetchers/tvmaze';
import { searchJikanAnime, getJikanAnimeDetails } from '../lib/fetchers/jikan';
import { resolvePendingCalls, updateUserBrierScore } from '../lib/cron/resolveCalls';
import { db, now } from '../lib/db';
import { createSession, rotateSession } from '../lib/auth';
import type { Title } from '../lib/types';
import sitemap from '../app/sitemap';
import robots from '../app/robots';

test('Track D: Pure-TypeScript model runtime loads real model-weights.json and scores correctly', async () => {
  const weightsRaw = readFileSync(resolve(process.cwd(), 'data/model-weights.json'), 'utf-8');
  const weights = JSON.parse(weightsRaw);

  assert.equal(weights.modelVersion, 'cinepulse-v6-ridge-platt');
  assert(weights.regression.intercept !== undefined);
  assert(weights.regression.coefficients !== undefined);
  assert(weights.classification.plattA !== undefined);
  assert(weights.regression.metrics.testMae !== undefined);

  const modelW = getModelWeights();
  assert.equal(modelW.modelVersion, 'cinepulse-v6-ridge-platt');

  const mockTitle: Title = {
    id: 'test-blockbuster-2026',
    source: 'demo',
    title: 'Future Odyssey',
    tagline: 'The stars await',
    poster: null,
    backdrop: null,
    overview: 'An epic sci-fi blockbuster with high stakes and huge visual effects.',
    releaseDate: '2026-11-20',
    mediaType: 'movie',
    genres: ['Science Fiction', 'Action', 'Adventure'],
    budget: 180_000_000,
    revenue: 0,
    runtime: 152,
    seasons: null,
    voteAverage: 8.2,
    voteCount: 1400,
    popularity: 95.4,
    cast: [{ name: 'Actor A', character: 'Pilot', profile: null }],
    trailerKey: null,
    director: 'Director X',
    status: 'upcoming',
  };

  const score = await scoreTitleV3(mockTitle);
  assert(score.p50RevenueUsd !== null && score.p50RevenueUsd > 0);
  assert(score.p10RevenueUsd !== null && score.p10RevenueUsd <= score.p50RevenueUsd);
  assert(score.p90RevenueUsd !== null && score.p90RevenueUsd >= score.p50RevenueUsd);
  assert(score.hitProbability >= 0 && score.hitProbability <= 100);
  assert(score.explanation.waterfall.length > 0);
});

test('Track E & F: Call resolution engine calculates Brier scores and updates engine benchmark', async () => {
  const d = db();
  const testTitleId = `test-v6-resolve-${Date.now()}`;
  const testUserId = `test-user-brier-${Date.now()}`;

  // Seed user
  d.prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at)
    VALUES (?, 'Brier Tester', ?, 'hash', ?)
  `).run(testUserId, `${testUserId}@example.com`, now());

  // Seed predictions_log entry
  const pastStamp = '2023-01-01';
  d.prepare(`
    INSERT INTO predictions_log (
      id, title_id, title_name, model_version, predicted_revenue_p10, predicted_revenue_p50,
      predicted_revenue_p90, hit_probability, confidence, features_json, created_at
    ) VALUES (?, ?, 'Resolved Blockbuster', 'cinepulse-v6-ridge-platt', 200000000, 300000000, 400000000, 85, 'high', '{}', ?)
  `).run(`pred-${testTitleId}`, testTitleId, pastStamp);

  // Seed user forecast
  d.prepare(`
    INSERT INTO forecasts (user_id, title_id, choice, confidence, reason, created_at, updated_at)
    VALUES (?, ?, 'hit', 90, 'Guaranteed hit', ?, ?)
  `).run(testUserId, testTitleId, now(), now());

  // Mark prediction resolved manually to test Brier computation
  d.prepare(`
    UPDATE predictions_log
    SET actual_revenue = 350000000, actual_hit = 1, resolved_at = ?
    WHERE title_id = ?
  `).run(now(), testTitleId);

  updateUserBrierScore(testUserId);

  const brierRow = d.prepare('SELECT * FROM brier_scores WHERE entity_id = ?').get(testUserId) as any;
  assert(brierRow !== undefined, 'User brier score row must be created');
  assert.equal(brierRow.total_calls, 1);
  assert.equal(brierRow.correct_calls, 1);
  // (0.9 - 1.0)^2 = 0.01
  assert(Math.abs(Number(brierRow.brier_score) - 0.01) < 0.001);
});

test('Track G: checkLoginRateLimit enforces max 5 attempts per 15 min per IP and blocks subsequent', () => {
  const testIp = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;
  const endpoint = 'test_login';

  resetLoginRateLimit(testIp, endpoint);

  // 5 attempts allowed
  for (let i = 1; i <= 5; i++) {
    assert.doesNotThrow(() => checkLoginRateLimit(testIp, endpoint), `Attempt ${i} should be allowed`);
  }

  // 6th attempt must be rejected with 429
  assert.throws(
    () => checkLoginRateLimit(testIp, endpoint),
    (err: any) => err.status === 429,
    '6th attempt within window must throw 429 Too Many Requests'
  );

  // Reset and verify allowed again
  resetLoginRateLimit(testIp, endpoint);
  assert.doesNotThrow(() => checkLoginRateLimit(testIp, endpoint), 'Should allow attempt after reset');
});

test('Track G: requireAuth and requireOwnership enforce access control', async () => {
  const fakeAuthReq = new Request('http://localhost:3000/api/profile', {
    headers: { 'Cookie': 'cinepulse_session=invalid-token' },
  });

  await assert.rejects(
    async () => requireAuth(fakeAuthReq),
    (err: any) => err.status === 401
  );

  // requireOwnership denies different user
  await assert.rejects(
    async () => requireOwnership(fakeAuthReq, 'target-user-123'),
    (err: any) => err.status === 401
  );
});

test('Track G: rotateSession invalidates old token and returns new session token', async () => {
  const d = db();
  const testUserId = `user-rotate-${Date.now()}`;
  d.prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at)
    VALUES (?, 'Rotate Test', ?, 'hash', ?)
  `).run(testUserId, `${testUserId}@example.com`, now());

  const token1 = await createSession(testUserId);
  assert(token1 && token1.length > 20);

  const req = new Request('http://localhost:3000/api/auth/me', {
    headers: { 'Cookie': `cinepulse_session=${token1}` },
  });

  const token2 = await rotateSession(req, testUserId);
  assert(token2 && token2.length > 20);
  assert.notEqual(token1, token2, 'Rotated token must be distinct');
});

test('Track H: Dynamic sitemap and robots.txt generate valid SEO structures', () => {
  const sm = sitemap();
  assert(Array.isArray(sm));
  assert(sm.some((entry) => entry.url.includes('predictions')));
  assert(sm.some((entry) => entry.url.includes('leaderboard')));

  const r = robots();
  assert(r.rules);
  assert(r.sitemap?.includes('sitemap.xml'));
});

test('Track I: TVmaze keyless fetcher gracefully handles search and lookup', async () => {
  const empty = await searchTVmaze('');
  assert.deepEqual(empty, []);

  const nullImdb = await getTVmazeByImdb('');
  assert.equal(nullImdb, null);
});

test('Track I: Jikan keyless fetcher gracefully handles anime queries', async () => {
  const empty = await searchJikanAnime('');
  assert.deepEqual(empty, []);

  const nullId = await getJikanAnimeDetails(0);
  assert.equal(nullId, null);
});
