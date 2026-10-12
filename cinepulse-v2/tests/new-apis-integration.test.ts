import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../lib/db';
import { PROVIDERS, PROVIDER_FALLBACKS, dailyQuotaFor, isTrackedProvider } from '../lib/providers/registry';
import { getProviderHealth } from '../lib/providers/usage';
import { getTraktStats, getMostAnticipatedTitles, type TraktStatsRecord } from '../lib/fetchers/trakt';
import { getLeavingSoonTitles, syncStreamingExpiry } from '../lib/fetchers/streaming-availability';
import { getNearestFestival } from '../lib/prediction/festivals';
import { isUsableComment, getTrailerSentiment } from '../lib/fetchers/trailer-sentiment';
import { resolveHeroArtwork } from '../lib/fetchers/fanart';
import { verifyTurnstileToken } from '../lib/auth/turnstile';
import { isUpstashConfigured, upstashRateLimit } from '../lib/providers/upstash';
import { getAniListAnime } from '../lib/fetchers/anilist';
import { extractFeatureVector } from '../lib/prediction/features';
import type { Title } from '../lib/types';

test('New APIs Integration: Provider Registry & Health Summary', () => {
  const newProviders = ['trakt', 'streaming', 'fanart', 'anilist'] as const;

  for (const name of newProviders) {
    assert.ok(isTrackedProvider(name), `Provider ${name} must be in registry`);
    assert.ok(PROVIDERS[name], `Provider ${name} must have configuration in registry`);
    assert.ok(PROVIDER_FALLBACKS[name], `Provider ${name} must have documented fallback strategy`);
    assert.ok(typeof dailyQuotaFor(name) === 'number' || dailyQuotaFor(name) === null);
  }

  assert.equal(dailyQuotaFor('trakt'), 1000);
  assert.equal(dailyQuotaFor('streaming'), 100);
  assert.equal(dailyQuotaFor('fanart'), 500);
  assert.equal(dailyQuotaFor('anilist'), 5000);

  const health = getProviderHealth();
  assert.ok(Array.isArray(health.providers));
  for (const name of newProviders) {
    const pHealth = health.providers.find((p) => p.provider === name);
    assert.ok(pHealth, `Health snapshot must contain provider ${name}`);
    assert.ok(pHealth.fallback, `Provider ${name} health must include fallback text`);
  }
});

test('Task 1: Trakt Hype Features & Anticipated Queries', () => {
  const d = db();
  const testTitleId = 'test_movie_dune_2';
  const today = new Date().toISOString().slice(0, 10);
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Insert historical trakt_stats rows for testTitleId
  d.prepare(`
    INSERT INTO trakt_stats(title_id, date, list_count, watchers, rank_anticipated)
    VALUES (?, ?, 1000, 50, 4)
    ON CONFLICT(title_id, date) DO UPDATE SET list_count=excluded.list_count
  `).run(testTitleId, twoWeeksAgo);

  d.prepare(`
    INSERT INTO trakt_stats(title_id, date, list_count, watchers, rank_anticipated)
    VALUES (?, ?, 1280, 85, 2)
    ON CONFLICT(title_id, date) DO UPDATE SET list_count=excluded.list_count
  `).run(testTitleId, today);

  const stats = getTraktStats(testTitleId);
  assert.ok(stats, 'getTraktStats must return record for existing title');
  assert.equal(stats.titleId, testTitleId);
  assert.equal(stats.rankAnticipated, 2);
  assert.equal(stats.listCount, 1280);
  assert.equal(stats.watchers, 85);
  assert.ok(typeof stats.listCountSlope14d === 'number');
  assert.ok(stats.listCountSlope14d > 0, '14-day list count slope must be positive for growing hype');

  const nonExistent = getTraktStats('non_existent_999999');
  assert.equal(nonExistent, null, 'Unseen title must return null without throwing');

  const mostAnticipated = getMostAnticipatedTitles(5);
  assert.ok(Array.isArray(mostAnticipated));
  assert.ok(mostAnticipated.length > 0);
  const found = mostAnticipated.find((m) => m.titleId === testTitleId);
  assert.ok(found, 'Inserted title must be present in most anticipated list');
});

test('Task 2: Leaving Streaming Soon & Expiry Date Enforcement', () => {
  const d = db();
  const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const testId = 'expiring_title_inception';

  d.prepare(`
    INSERT INTO availability_expiry(title_id, service, region, expires_at, fetched_at)
    VALUES (?, 'netflix', 'us', ?, datetime('now'))
    ON CONFLICT(title_id, service, region) DO UPDATE SET expires_at=excluded.expires_at
  `).run(testId, futureDate);

  const leaving = getLeavingSoonTitles('us', 30);
  assert.ok(Array.isArray(leaving));
  const found = leaving.find((t) => t.titleId === testId);
  assert.ok(found, 'Should find expiring title in leaving soon query');
  assert.equal(found.service, 'netflix');
  assert.ok(found.daysRemaining !== undefined && found.daysRemaining >= 9);

  // Verification: Expired titles or titles with no expiry must NEVER fabricate a countdown
  const expiredDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  d.prepare(`
    INSERT INTO availability_expiry(title_id, service, region, expires_at, fetched_at)
    VALUES ('already_expired_title', 'netflix', 'us', ?, datetime('now'))
    ON CONFLICT(title_id, service, region) DO UPDATE SET expires_at=excluded.expires_at
  `).run(expiredDate);

  const leavingFresh = getLeavingSoonTitles('us', 30);
  const expiredFound = leavingFresh.find((t) => t.titleId === 'already_expired_title');
  assert.equal(expiredFound, undefined, 'Already expired titles must be omitted');
});

test('Task 3: Indian Festival Window Table & Nearest Feature Extraction', () => {
  const windowsPath = path.resolve(process.cwd(), 'data', 'release-windows.json');
  assert.ok(fs.existsSync(windowsPath), 'data/release-windows.json must exist');
  const data = JSON.parse(fs.readFileSync(windowsPath, 'utf8'));
  assert.ok(Array.isArray(data));
  assert.ok(data.length >= 100, 'Must have comprehensive 2015-2027 festival seed');

  // Test Diwali 2024 proximity (2024-11-01)
  const diwaliProximity = getNearestFestival('2024-10-31');
  assert.ok(diwaliProximity.festivalName?.includes('Diwali'));
  assert.equal(diwaliProximity.daysToNearestFestival, 1);
  assert.ok(diwaliProximity.festivalWeight >= 0.95);

  // Test Eid al-Fitr 2025 proximity (2025-03-31)
  const eidProximity = getNearestFestival('2025-04-02');
  assert.ok(eidProximity.festivalName?.includes('Eid'));
  assert.equal(eidProximity.daysToNearestFestival, 2);
  assert.ok(eidProximity.festivalWeight >= 0.85);

  // Test missing or invalid date gracefully degrades
  const nullDate = getNearestFestival(null);
  assert.equal(nullDate.daysToNearestFestival, null);
  assert.equal(nullDate.festivalWeight, 0);

  const invalidDate = getNearestFestival('not-a-valid-date');
  assert.equal(invalidDate.daysToNearestFestival, null);
  assert.equal(invalidDate.festivalWeight, 0);
});

test('Task 4: Trailer Sentiment Filtering & <30 Sample Size Gate', () => {
  // Test comment filtering rules
  assert.equal(isUsableComment('Great!'), false, 'Under 3 words must be dropped');
  assert.equal(isUsableComment(''), false, 'Empty comment must be dropped');
  assert.equal(isUsableComment('This is an incredible trailer!'), true, 'Valid English comment passes');
  assert.equal(isUsableComment('🔥🔥🔥 💯💯 😍😍😍'), false, 'Emoji-only non-Latin comment must be dropped');

  const d = db();
  const testId = 'sample_gate_test_title';
  const testWeek = '2026-10-12';

  // Test sample size < 30 gate returns positive_ratio: null
  d.prepare(`
    INSERT INTO trailer_sentiment(title_id, week, positive_ratio, sample_size, language_coverage)
    VALUES (?, ?, NULL, 15, 0.5)
    ON CONFLICT(title_id, week) DO UPDATE SET sample_size=excluded.sample_size
  `).run(testId, testWeek);

  const sent = getTrailerSentiment(testId);
  assert.ok(sent);
  assert.equal(sent.sampleSize, 15);
  assert.equal(sent.positiveRatio, null, 'Sample size < 30 MUST gate positive_ratio to null');

  // Test sample size >= 30 records positive_ratio
  d.prepare(`
    INSERT INTO trailer_sentiment(title_id, week, positive_ratio, sample_size, language_coverage)
    VALUES (?, ?, 0.88, 75, 0.92)
    ON CONFLICT(title_id, week) DO UPDATE SET positive_ratio=excluded.positive_ratio, sample_size=excluded.sample_size
  `).run(testId, testWeek);

  const sentFull = getTrailerSentiment(testId);
  assert.ok(sentFull);
  assert.equal(sentFull.positiveRatio, 0.88);
  assert.equal(sentFull.sampleSize, 75);
  assert.equal(sentFull.languageCoverage, 0.92);
});

test('Task 5: Fanart Artwork Fetcher & 3-Step Fallback Chain', async () => {
  // When no Fanart key and no TMDB logo, falls back to plain text
  const resText = await resolveHeroArtwork('999999', 'The Matrix', null, 'https://image.tmdb.org/backdrop.jpg');
  assert.equal(resText.source, 'text');
  assert.equal(resText.logoUrl, null);
  assert.equal(resText.fallbackText, 'The Matrix');

  // When TMDB logo provided without Fanart, uses TMDB logo
  const resTmdb = await resolveHeroArtwork('999999', 'Inception', 'https://image.tmdb.org/logo.png', null);
  assert.equal(resTmdb.source, 'tmdb');
  assert.equal(resTmdb.logoUrl, 'https://image.tmdb.org/logo.png');
  assert.equal(resTmdb.fallbackText, 'Inception');
});

test('Task 6: Cloudflare Turnstile & Upstash Redis Fail-Safe Behavior', async () => {
  // Without TURNSTILE_SECRET_KEY in dev, verification gracefully skips
  const origKey = process.env.TURNSTILE_SECRET_KEY;
  try {
    delete process.env.TURNSTILE_SECRET_KEY;
    const skipped = await verifyTurnstileToken('mock_token');
    assert.equal(skipped.success, true);
    assert.equal(skipped.skipped, true);

    // With secret configured, missing or invalid token fails closed
    process.env.TURNSTILE_SECRET_KEY = 'test_secret_key';
    const failedEmpty = await verifyTurnstileToken('');
    assert.equal(failedEmpty.success, false);
    assert.ok(failedEmpty.error);
  } finally {
    if (origKey !== undefined) {
      process.env.TURNSTILE_SECRET_KEY = origKey;
    } else {
      delete process.env.TURNSTILE_SECRET_KEY;
    }
  }

  // Upstash unconfigured in local dev returns null without throwing
  assert.equal(isUpstashConfigured(), false);
  const upstashRes = await upstashRateLimit('test_user_ip', 5, 60);
  assert.equal(upstashRes, null);
});

test('Task 7 & Feature Integration: Feature Vector contains All New Provider Features', async () => {
  const dummyTitle: Title = {
    id: 'test_movie_dune_2',
    title: 'Dune: Part Two',
    overview: 'Paul Atreides unites with Chani and the Fremen.',
    releaseDate: '2024-03-01',
    runtime: 166,
    budget: 190000000,
    revenue: 714000000,
    genres: ['Science Fiction', 'Adventure'],
    poster: '/poster.jpg',
    backdrop: '/backdrop.jpg',
    voteAverage: 8.2,
    voteCount: 4500,
    popularity: 120.5,
    tagline: 'Long live the fighters.',
    status: 'released',
    media: 'movie',
    source: 'tmdb',
  };

  const vector = await extractFeatureVector(dummyTitle);
  assert.ok(vector.titleId === 'test_movie_dune_2');
  assert.ok('daysToNearestFestival' in vector, 'daysToNearestFestival must be present in vector');
  assert.ok('festivalWeight' in vector, 'festivalWeight must be present in vector');
  assert.ok('traktAnticipatedRank' in vector, 'traktAnticipatedRank must be present in vector');
  assert.ok('traktListCountSlope' in vector, 'traktListCountSlope must be present in vector');
  assert.ok('trailerPositiveRatio' in vector, 'trailerPositiveRatio must be present in vector');
  assert.ok('trailerLanguageCoverage' in vector, 'trailerLanguageCoverage must be present in vector');

  // Verify the values populated from earlier Task 1 test insert
  assert.equal(vector.traktAnticipatedRank?.value, 2);
  assert.ok(vector.daysToNearestFestival?.value !== undefined);
});
