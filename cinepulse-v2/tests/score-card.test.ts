import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBoxOfficeRange, SCORE_THRESHOLDS, isTasteMatchEligible, isCommunityPulseEligible } from '../lib/scoreThresholds';
import { calculateTitleTasteMatch } from '../lib/tasteMatch';
import type { Title } from '../lib/types';

test('Score Card - Sample-Size Discipline Gates', async (t) => {
  await t.test('Taste Match requires at least 5 ratings', () => {
    assert.equal(isTasteMatchEligible(0), false);
    assert.equal(isTasteMatchEligible(4), false);
    assert.equal(isTasteMatchEligible(5), true);
    assert.equal(isTasteMatchEligible(100), true);
    assert.equal(SCORE_THRESHOLDS.MIN_RATINGS_FOR_TASTE_MATCH, 5);
  });

  await t.test('calculateTitleTasteMatch returns available: false when user has 0 ratings or no user', () => {
    const mockTitle: Title = {
      id: 'movie-test-1',
      source: 'demo',
      mediaType: 'movie',
      title: 'Inception',
      overview: 'Dreams within dreams',
      tagline: 'Your mind is the scene of the crime',
      poster: null,
      backdrop: null,
      releaseDate: '2010-07-16',
      genres: ['Sci-Fi', 'Action'],
      runtime: 148,
      seasons: null,
      status: 'released',
      voteAverage: 8.4,
      voteCount: 30000,
      popularity: 90,
      cast: [],
      trailerKey: null,
      director: 'Christopher Nolan',
      budget: 160000000,
      revenue: 836800000,
    };

    const guestResult = calculateTitleTasteMatch(null, mockTitle);
    assert.equal(guestResult.available, false);
    assert.equal(guestResult.score, null);

    const nonExistentUserResult = calculateTitleTasteMatch('non-existent-user-id-999', mockTitle);
    assert.equal(nonExistentUserResult.available, false);
    assert.equal(nonExistentUserResult.score, null);
    assert.equal(nonExistentUserResult.ratedCount, 0);
  });

  await t.test('Community Pulse requires at least 10 calls', () => {
    assert.equal(isCommunityPulseEligible(0), false);
    assert.equal(isCommunityPulseEligible(9), false);
    assert.equal(isCommunityPulseEligible(10), true);
    assert.equal(isCommunityPulseEligible(42), true);
    assert.equal(SCORE_THRESHOLDS.MIN_COMMUNITY_CALLS_FOR_PULSE, 10);
  });

  await t.test('formatBoxOfficeRange outputs calibrated bracket string, never single point', () => {
    assert.equal(formatBoxOfficeRange(null, null), 'Range unavailable');
    assert.equal(formatBoxOfficeRange(0, 0), 'Range unavailable');

    const formattedM = formatBoxOfficeRange(185_000_000, 215_000_000);
    assert.equal(formattedM, '$185M–$215M');

    const formattedB = formatBoxOfficeRange(1_200_000_000, 1_450_000_000);
    assert.equal(formattedB, '$1.2B–$1.4B');
  });
});
