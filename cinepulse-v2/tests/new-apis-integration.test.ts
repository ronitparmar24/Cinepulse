import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../lib/db';
import { PROVIDERS, PROVIDER_FALLBACKS, dailyQuotaFor, isTrackedProvider } from '../lib/providers/registry';
import { getProviderHealth } from '../lib/providers/usage';
import { getTraktStats, getMostAnticipatedTitles, getLiveMostAnticipated, type TraktStatsRecord } from '../lib/fetchers/trakt';
import { getLeavingSoonTitles, getLiveStreamingRadar, syncStreamingExpiry } from '../lib/fetchers/streaming-availability';
import { getLiveTrendingTrailers } from '../lib/fetchers/youtube';
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
  const testId = `sample_gate_test_title_${Date.now()}`;
  const testWeek = '2026-10-12';

  // Test sample size < 30 gate returns positive_ratio: null
  d.prepare(`
    INSERT INTO trailer_sentiment(title_id, week, positive_ratio, sample_size, language_coverage)
    VALUES (?, ?, NULL, 15, 0.5)
    ON CONFLICT(title_id, week) DO UPDATE SET
      positive_ratio=excluded.positive_ratio,
      sample_size=excluded.sample_size,
      language_coverage=excluded.language_coverage
  `).run(testId, testWeek);

  const sent = getTrailerSentiment(testId);
  assert.ok(sent);
  assert.equal(sent.sampleSize, 15);
  assert.equal(sent.positiveRatio, null, 'Sample size < 30 MUST gate positive_ratio to null');

  // Test sample size >= 30 records positive_ratio
  d.prepare(`
    INSERT INTO trailer_sentiment(title_id, week, positive_ratio, sample_size, language_coverage)
    VALUES (?, ?, 0.88, 75, 0.92)
    ON CONFLICT(title_id, week) DO UPDATE SET
      positive_ratio=excluded.positive_ratio,
      sample_size=excluded.sample_size,
      language_coverage=excluded.language_coverage
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
    mediaType: 'movie',
    source: 'tmdb',
    cast: [],
    director: 'Denis Villeneuve',
    trailerKey: null,
    seasons: null,
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

test('Task 8: Live Radar Helpers filter past/dummy entries & resolve titles deterministically', async () => {
  const { fetchCacheKey } = await import('../lib/fetchers/base');
  const d = db();
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const futureNext = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const testKeys = [
    `trakt:live-anticipated:v2:${today}:5`,
    `streaming:live-radar:v3:${today}:us:30:8`,
    'yt:live-trending:v2:8',
    'tmdb:title:movie-999001',
    fetchCacheKey('trakt', 'https://api.trakt.tv/movies/anticipated', { limit: 25, extended: 'full' }),
    fetchCacheKey('streaming', 'https://api.watchmode.com/v1/releases/', { apiKey: 'test_wm_key' }),
  ];
  const clearKeys = () => {
    const del = d.prepare('DELETE FROM api_cache WHERE cache_key = ?');
    for (const k of testKeys) del.run(k);
    try {
      d.prepare("DELETE FROM trakt_stats WHERE title_id = 'movie-999001'").run();
    } catch {}
  };
  clearKeys();

  const origFetch = globalThis.fetch;
  const origTrakt = process.env.TRAKT_CLIENT_ID;
  const origWatchmode = process.env.WATCHMODE_API_KEY;
  const origTmdb = process.env.TMDB_READ_TOKEN;
  const origMode = process.env.CATALOG_MODE;

  try {
    process.env.CATALOG_MODE = 'tmdb';
    process.env.TRAKT_CLIENT_ID = 'test_trakt_key';
    process.env.WATCHMODE_API_KEY = 'test_wm_key';
    process.env.TMDB_READ_TOKEN = 'test_tmdb_token';

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('api.trakt.tv/movies/anticipated')) {
        return new Response(
          JSON.stringify([
            {
              list_count: 50000,
              movie: {
                title: 'Past Film',
                year: 2024,
                released: '2024-03-01',
                ids: { trakt: 1, slug: 'past', tmdb: 693134 },
              },
            },
            {
              list_count: 80000,
              movie: {
                title: 'Future Tentpole',
                year: 2027,
                released: futureNext,
                ids: { trakt: 2, slug: 'future-tentpole', tmdb: 999001 },
              },
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('api.themoviedb.org/3/movie/999001')) {
        return new Response(
          JSON.stringify({
            id: 999001,
            title: 'Future Tentpole',
            release_date: futureNext,
            poster_path: '/future_poster.jpg',
            backdrop_path: '/future_backdrop.jpg',
            genres: [{ id: 878, name: 'Science Fiction' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('api.watchmode.com/v1/releases/')) {
        return new Response(
          JSON.stringify({
            releases: [
              {
                id: 1,
                title: 'Already Expired Oct',
                type: 'movie',
                tmdb_id: 27205,
                tmdb_type: 'movie',
                poster_url: 'https://image.tmdb.org/t/p/w185/expired.jpg',
                source_release_date: '2025-10-01',
                source_name: 'Netflix',
                is_original: 0,
              },
              {
                id: 2,
                title: 'Real Premiere Tomorrow',
                type: 'tv_series',
                tmdb_id: 999002,
                tmdb_type: 'tv',
                season_number: 2,
                poster_url: 'https://image.tmdb.org/t/p/w185/real_drop.jpg',
                source_release_date: tomorrow,
                source_name: 'AppleTV+',
                is_original: 1,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ results: [] }), { status: 404 });
    }) as typeof fetch;

    const anticipated = await getLiveMostAnticipated(5);
    assert.ok(!anticipated.some((x) => x.title === 'Past Film'), 'Past released film must be excluded');
    const tentpole = anticipated.find((x) => x.titleId === 'movie-999001');
    assert.ok(tentpole, 'Upcoming Trakt film must be present');
    assert.equal(tentpole.listCount, 80000);
    assert.equal(tentpole.hypeSharePct, 100);
    assert.ok(tentpole.releaseDate && tentpole.releaseDate >= today);

    const radar = await getLiveStreamingRadar('us', 30, 8);
    assert.ok(!radar.items.some((x) => x.title === 'Already Expired Oct'), 'Past Watchmode release must be excluded');
    assert.ok(!radar.items.some((x) => x.titleId.includes('expiring_title')), 'Test fixture IDs must be excluded');
    const drop = radar.items.find((x) => x.titleId === 'tv-999002');
    assert.ok(drop, 'Future Watchmode release must be included');
    assert.equal(drop.service, 'Apple TV+');
    assert.equal(drop.seasonNumber, 2);
    assert.ok(drop.poster?.includes('/w500/'), 'Poster URL must upgrade from w185 to w500');

    const trailers = await getLiveTrendingTrailers(8);
    assert.ok(Array.isArray(trailers) && trailers.length > 0);
    for (const tr of trailers) {
      assert.ok(
        !/^(Movie|Series|Film|Title) #\d+$/.test(tr.title || ''),
        `Trending trailer must not expose raw placeholder title: ${tr.title}`
      );
    }
  } finally {
    globalThis.fetch = origFetch;
    if (origTrakt === undefined) delete process.env.TRAKT_CLIENT_ID;
    else process.env.TRAKT_CLIENT_ID = origTrakt;
    if (origWatchmode === undefined) delete process.env.WATCHMODE_API_KEY;
    else process.env.WATCHMODE_API_KEY = origWatchmode;
    if (origTmdb === undefined) delete process.env.TMDB_READ_TOKEN;
    else process.env.TMDB_READ_TOKEN = origTmdb;
    if (origMode === undefined) delete process.env.CATALOG_MODE;
    else process.env.CATALOG_MODE = origMode;
    clearKeys();
  }
});
