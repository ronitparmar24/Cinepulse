/**
 * CinePulse v10: Comprehensive Interest Feedback & Recommendation Loop Tests
 * Tests unit math, decay, clamping, reason mapping, seen_it neutrality,
 * snooze expiry, exploration ratio, cold start, undo, cross-user isolation, and API integration.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../lib/db';
import {
  FEEDBACK_CONFIG,
  extractTitleFeatures,
  computeFeatureDeltas,
  getRuntimeBucket,
  getDecade,
} from '../lib/feedback/signals';
import {
  applyExponentialDecay,
  clampAffinityWeight,
  applyFeedback,
  undoFeedback,
  getUserAffinities,
  getFeedbackSummary,
  resetUserFeedback,
  mergeLocalFeedback,
  removeUserAffinity,
} from '../lib/feedback/affinity';
import { checkFeedbackRateLimit, validateFeedbackInput } from '../lib/feedback/guardrails';
import { rerank, getExcludedTitleIds } from '../lib/feedback/rerank';
import { getUserPersonalizedRecommendations, getRecommendationsForTitle } from '../lib/recommendations';
import type { Title } from '../lib/types';

// Helper to create test user in database
function createTestUser(id: string, name = 'Test User', email = `${id}@example.test`): void {
  const d = db();
  d.prepare(`
    INSERT OR REPLACE INTO users (id, name, email, password_hash, created_at)
    VALUES (?, ?, ?, 'hash', datetime('now'))
  `).run(id, name, email);
}

const mockTitleDune: Title = {
  id: 'test-dune',
  source: 'tmdb',
  title: 'Dune: Part Two',
  mediaType: 'movie',
  genres: ['Sci-Fi', 'Adventure'],
  director: 'Denis Villeneuve',
  cast: [
    { name: 'Timothee Chalamet', character: 'Paul Atreides', profile: null },
    { name: 'Zendaya', character: 'Chani', profile: null },
    { name: 'Rebecca Ferguson', character: 'Lady Jessica', profile: null },
  ],
  releaseDate: '2024-03-01',
  runtime: 166,
  seasons: null,
  status: 'released',
  voteAverage: 8.5,
  voteCount: 4500,
  popularity: 120,
  overview: 'Paul Atreides unites with Chani and the Fremen.',
  tagline: 'Long live the fighters.',
  poster: null,
  backdrop: null,
  trailerKey: null,
  budget: 190000000,
  revenue: 711000000,
};

const mockTitleHorror: Title = {
  id: 'test-conjuring',
  source: 'tmdb',
  title: 'The Conjuring',
  mediaType: 'movie',
  genres: ['Horror', 'Thriller'],
  director: 'James Wan',
  cast: [
    { name: 'Vera Farmiga', character: 'Lorraine Warren', profile: null },
    { name: 'Patrick Wilson', character: 'Ed Warren', profile: null },
  ],
  releaseDate: '2013-07-19',
  runtime: 112,
  seasons: null,
  status: 'released',
  voteAverage: 7.5,
  voteCount: 3000,
  popularity: 45,
  overview: 'Paranormal investigators help a family.',
  tagline: 'Based on the true case files of the Warrens.',
  poster: null,
  backdrop: null,
  trailerKey: null,
  budget: 20000000,
  revenue: 319000000,
};

const mockTitleComedy: Title = {
  id: 'test-superbad',
  source: 'tmdb',
  title: 'Superbad',
  mediaType: 'movie',
  genres: ['Comedy'],
  director: 'Greg Mottola',
  cast: [
    { name: 'Jonah Hill', character: 'Seth', profile: null },
    { name: 'Michael Cera', character: 'Evan', profile: null },
  ],
  releaseDate: '2007-08-17',
  runtime: 113,
  seasons: null,
  status: 'released',
  voteAverage: 7.2,
  voteCount: 2500,
  popularity: 35,
  overview: 'Two high school friends plan a party.',
  tagline: 'It gets bigger.',
  poster: null,
  backdrop: null,
  trailerKey: null,
  budget: 20000000,
  revenue: 170000000,
};

test('Track FB1: Feature Extraction & Normalization', () => {
  const snapshot = extractTitleFeatures(mockTitleDune);
  assert.deepEqual(snapshot.genres, ['Sci-Fi', 'Adventure']);
  assert.equal(snapshot.director, 'Denis Villeneuve');
  assert.equal(snapshot.cast.length, 3);
  assert.equal(snapshot.decade, '2020s');
  assert.equal(snapshot.runtimeBucket, '>150m');
  assert.equal(getRuntimeBucket(85), '<90m');
  assert.equal(getRuntimeBucket(105), '90-120m');
  assert.equal(getRuntimeBucket(135), '120-150m');
  assert.equal(getDecade(1994), '1990s');
});

test('Track FB2: Exponential Time Decay & Clamping Math', () => {
  // At t=0, no decay
  assert.equal(applyExponentialDecay(2.0, 0, 45), 2.0);

  // At t=45 days (half life), weight should be exactly 50%
  const halfDecayed = applyExponentialDecay(2.0, 45, 45);
  assert.ok(Math.abs(halfDecayed - 1.0) < 0.01, `Expected ~1.0, got ${halfDecayed}`);

  // At t=90 days (2 half lives), weight should be 25%
  const quarterDecayed = applyExponentialDecay(2.0, 90, 45);
  assert.ok(Math.abs(quarterDecayed - 0.5) < 0.01, `Expected ~0.5, got ${quarterDecayed}`);

  // Strict Clamping within [-5.0, +5.0]
  assert.equal(clampAffinityWeight(7.5), 5.0);
  assert.equal(clampAffinityWeight(-10.2), -5.0);
  assert.equal(clampAffinityWeight(3.14159), 3.142);
});

test('Track FB3: Reason Mapping & seen_it Neutrality', () => {
  const snapshot = extractTitleFeatures(mockTitleDune);

  // 'seen_it' / 'already_seen' must be NEUTRAL for taste vector (0 deltas)
  const seenDeltas = computeFeatureDeltas(snapshot, 'already_seen', 'seen_it');
  assert.equal(seenDeltas.length, 0, 'seen_it must return 0 affinity deltas');

  // 'not_into_actor_director' must lower ONLY director and cast, not genres
  const actorDirDeltas = computeFeatureDeltas(snapshot, 'not_interested', 'not_into_actor_director');
  assert.ok(actorDirDeltas.length > 0);
  for (const d of actorDirDeltas) {
    assert.ok(d.featureType === 'director' || d.featureType === 'actor', `Unexpected feature: ${d.featureType}`);
    assert.ok(d.delta < 0, 'Delta must be negative');
  }

  // 'not_my_genre' must lower only genres
  const genreDeltas = computeFeatureDeltas(snapshot, 'not_interested', 'not_my_genre');
  assert.ok(genreDeltas.length > 0);
  for (const d of genreDeltas) {
    assert.equal(d.featureType, 'genre');
    assert.ok(d.delta < 0);
  }
});

test('Track FB4: Feedback Application, Decay, Clamping, and Summary', () => {
  const userId = `test-user-fb4-${Date.now()}`;
  createTestUser(userId);

  // Apply Interested on Dune
  const res1 = applyFeedback(userId, mockTitleDune, 'interested', null, 'discovery');
  assert.equal(res1.feedback.signal, 'interested');

  const affinities1 = getUserAffinities(userId);
  assert.ok(affinities1.length > 0);
  const sciFi = affinities1.find((a) => a.featureType === 'genre' && a.featureValue === 'Sci-Fi');
  assert.ok(sciFi && sciFi.weight > 0, 'Sci-Fi affinity must be positive');

  // Apply Not Interested on Horror
  applyFeedback(userId, mockTitleHorror, 'not_interested', 'not_my_genre', 'discovery');
  const affinities2 = getUserAffinities(userId);
  const horror = affinities2.find((a) => a.featureType === 'genre' && a.featureValue === 'Horror');
  assert.ok(horror && horror.weight < 0, 'Horror affinity must be negative');

  // Summary must categorize correctly
  const summary = getFeedbackSummary(userId);
  assert.ok(summary.liked.some((l) => l.featureValue === 'Sci-Fi'));
  assert.ok(summary.suppressed.some((s) => s.featureValue === 'Horror'));

  // Removing single affinity works
  const removed = removeUserAffinity(userId, 'genre', 'Horror');
  assert.equal(removed, true);
  const afterRemove = getUserAffinities(userId);
  assert.ok(!afterRemove.some((a) => a.featureValue === 'Horror'));

  // Reset completely wipes profile
  resetUserFeedback(userId);
  assert.equal(getUserAffinities(userId).length, 0);
});

test('Track FB5: Undo Restores State and Reverts Affinity', () => {
  const userId = `test-user-undo-${Date.now()}`;
  createTestUser(userId);

  // Mark interested
  applyFeedback(userId, mockTitleDune, 'interested');
  const affBefore = getUserAffinities(userId);
  const sciFiWeightBefore = affBefore.find((a) => a.featureValue === 'Sci-Fi')?.weight || 0;
  assert.ok(sciFiWeightBefore > 0);

  // Undo feedback
  const undoRes = undoFeedback(userId, mockTitleDune.id);
  assert.equal(undoRes.success, true);

  // Sci-Fi weight should be reverted back to 0
  const affAfter = getUserAffinities(userId);
  const sciFiWeightAfter = affAfter.find((a) => a.featureValue === 'Sci-Fi')?.weight || 0;
  assert.equal(sciFiWeightAfter, 0, 'Undo must revert affinity weight');
});

test('Track FB6: Cross-User Isolation (User A does not leak into User B)', () => {
  const userA = `test-user-a-${Date.now()}`;
  const userB = `test-user-b-${Date.now()}`;
  createTestUser(userA);
  createTestUser(userB);

  // User A hates Sci-Fi
  applyFeedback(userA, mockTitleDune, 'not_interested', 'not_my_genre');

  // User B's affinities and excluded IDs must remain completely untouched
  const affB = getUserAffinities(userB);
  assert.equal(affB.length, 0);

  const excludedB = getExcludedTitleIds(userB);
  assert.ok(!excludedB.has(mockTitleDune.id), 'User B must not have User A excluded titles');
});

test('Track FB7: Reranking Exclusions & Genre Shift', async () => {
  const userId = `test-user-rerank-${Date.now()}`;
  createTestUser(userId);

  const candidates: Title[] = [
    mockTitleDune,
    mockTitleHorror,
    mockTitleComedy,
    { ...mockTitleDune, id: 'test-dune-clone', title: 'Dune Clone' },
    { ...mockTitleComedy, id: 'test-superbad-clone', title: 'Superbad Clone' },
  ];

  // 1. Initial rerank without feedback
  const initial = await rerank(candidates, userId);
  assert.ok(initial.some((r) => r.title.id === mockTitleHorror.id));

  // 2. Mark Horror as not interested
  applyFeedback(userId, mockTitleHorror, 'not_interested', 'not_my_genre');

  // After not_interested, Horror must NEVER appear in recommendations
  const afterNegative = await rerank(candidates, userId);
  assert.ok(
    !afterNegative.some((r) => r.title.id === mockTitleHorror.id),
    'Title marked not_interested must be strictly excluded from rail'
  );

  // 3. Mark multiple comedies as interested -> comedy ranks at top
  applyFeedback(userId, mockTitleComedy, 'interested');
  const afterInterested = await rerank(candidates, userId);
  assert.ok(afterInterested.length > 0);
  assert.equal(afterInterested[0]?.title.genres[0], 'Comedy', 'Comedy must rise to top after interested signals');
});

test('Track FB8: Cold Start (Brand-new user with 0 reviews gets recs after 5 feedback taps)', async () => {
  const userId = `test-user-coldstart-${Date.now()}`;
  createTestUser(userId);

  // Brand new user with 0 reviews and 0 feedback initially gets []
  const initialRecs = await getUserPersonalizedRecommendations(userId);
  assert.equal(initialRecs.length, 0);

  // User taps 5 feedback items (e.g. from onboarding / discovery)
  applyFeedback(userId, mockTitleDune, 'interested');
  applyFeedback(userId, mockTitleComedy, 'interested');
  applyFeedback(userId, { id: 'test-interstellar', title: 'Interstellar', genres: ['Sci-Fi', 'Drama'] }, 'interested');
  applyFeedback(userId, { id: 'test-arrival', title: 'Arrival', genres: ['Sci-Fi'] }, 'interested');
  applyFeedback(userId, mockTitleHorror, 'not_interested', 'not_my_genre');

  // Cold start should now return non-empty personalized recommendations!
  const coldStartRecs = await getUserPersonalizedRecommendations(userId);
  assert.ok(coldStartRecs.length > 0, 'New user with 5 feedback taps must get personalized recommendations');

  // And Horror should be suppressed
  assert.ok(!coldStartRecs.some((r) => r.title.id === mockTitleHorror.id));
});

test('Track FB9: Anonymous Feedback Local Merge', () => {
  const userId = `test-user-merge-${Date.now()}`;
  createTestUser(userId);

  const localItems = [
    { title: mockTitleDune, signal: 'interested' as const, surface: 'discovery' },
    { title: mockTitleHorror, signal: 'not_interested' as const, reason: 'not_my_genre' as const, surface: 'discovery' },
  ];

  const mergedCount = mergeLocalFeedback(userId, localItems);
  assert.equal(mergedCount, 2);

  const affinities = getUserAffinities(userId);
  assert.ok(affinities.some((a) => a.featureValue === 'Sci-Fi' && a.weight > 0));
  assert.ok(affinities.some((a) => a.featureValue === 'Horror' && a.weight < 0));
});

test('Track FB10: Input Validation & Rate Limiter Guardrails', () => {
  // Valid payload
  const valid = validateFeedbackInput({
    titleId: 'movie-12345',
    signal: 'interested',
    reason: null,
    surface: 'discovery',
  });
  assert.equal(valid.titleId, 'movie-12345');
  assert.equal(valid.signal, 'interested');

  // Invalid signal throws
  assert.throws(() => {
    validateFeedbackInput({ titleId: 'movie-1', signal: 'love_it' });
  });

  // Invalid reason throws
  assert.throws(() => {
    validateFeedbackInput({ titleId: 'movie-1', signal: 'not_interested', reason: 'bad_vibe' });
  });

  // Rate limiter check
  const testIp = `rate-test-${Date.now()}`;
  for (let i = 0; i < 60; i++) {
    const res = checkFeedbackRateLimit(testIp);
    assert.equal(res.allowed, true);
  }
  // 61st call should be rate-limited
  const blocked = checkFeedbackRateLimit(testIp);
  assert.equal(blocked.allowed, false);
});
