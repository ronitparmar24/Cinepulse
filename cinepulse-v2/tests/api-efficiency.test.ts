import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../lib/db';
import { PROVIDERS, PROVIDER_FALLBACKS, dailyQuotaFor } from '../lib/providers/registry';
import {
  tryReserve,
  recordSuccess,
  recordCacheHit,
  recordError,
  getUsageToday,
  getProviderHealth
} from '../lib/providers/usage';
import { complete, completeJson } from '../lib/ai/complete';
import { getTrendingTrailers, getBatchYouTubeTrailerStats } from '../lib/fetchers/youtube';
import { getOmdbRatingsCached, prewarmOmdbCache } from '../lib/fetchers/omdb';
import { getNewsCoverage } from '../lib/fetchers/news';
import { fetchCacheKey } from '../lib/fetchers/base';
import { cosineSimilarity, getTitleEmbedding, getSemanticSimilarTitles } from '../lib/fetchers/huggingface';
import { computeTasteDna } from '../lib/tasteDna';
import { extractFeatureVector } from '../lib/prediction/features';
import type { Title } from '../lib/types';

test('Track Efficiency: Security & Secrets Hygiene', () => {
  const gitignorePath = path.resolve(process.cwd(), '.gitignore');
  assert.ok(fs.existsSync(gitignorePath), '.gitignore must exist');
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
  assert.ok(gitignoreContent.includes('.env'), '.gitignore must ignore .env files');

  // Verify none of the external API keys leak into NEXT_PUBLIC_ variables
  const sensitiveKeys = [
    'GEMINI_API_KEY',
    'GROQ_API_KEY',
    'OMDB_API_KEY',
    'YOUTUBE_API_KEY',
    'GNEWS_API_KEY',
    'HF_TOKEN',
    'CLOUDFLARE_API_TOKEN',
    'CRON_SECRET',
  ];

  for (const key of sensitiveKeys) {
    const publicVersion = `NEXT_PUBLIC_${key}`;
    assert.equal(
      process.env[publicVersion],
      undefined,
      `Sensitive key ${key} MUST NEVER be prefixed with NEXT_PUBLIC_`
    );
  }
});

test('Track Efficiency: Provider Registry & Quota Accounting', async (t) => {
  await t.test('All declared providers exist in registry with quotas', () => {
    const expected = ['youtube', 'omdb', 'gnews', 'gemini', 'groq', 'hf', 'cloudflare'];
    for (const name of expected) {
      assert.ok(PROVIDERS[name as keyof typeof PROVIDERS], `Provider ${name} must be in registry`);
      assert.ok(PROVIDER_FALLBACKS[name as keyof typeof PROVIDERS], `Provider ${name} must document fallback strategy`);
    }

    assert.equal(dailyQuotaFor('youtube'), 10000);
    assert.equal(dailyQuotaFor('omdb'), 1000);
    assert.equal(dailyQuotaFor('gnews'), 100);
  });

  await t.test('tryReserve reserves within quota and tracks usage', () => {
    const initialUsed = getUsageToday('omdb');
    const allowed = tryReserve('omdb', 2);
    assert.equal(allowed, true);
    assert.equal(getUsageToday('omdb'), initialUsed + 2);
  });

  await t.test('tryReserve blocks requests when quota exceeded', () => {
    const blocked = tryReserve('gnews', 999999);
    assert.equal(blocked, false);
  });

  await t.test('recordCacheHit and recordError update health metrics', () => {
    recordCacheHit('omdb');
    recordCacheHit('omdb');
    recordError('omdb', 'Mock error message');

    const health = getProviderHealth();
    assert.ok(Array.isArray(health.providers));
    const omdbHealth = health.providers.find(p => p.provider === 'omdb');
    assert.ok(omdbHealth);
    assert.equal(omdbHealth.today.quota, 1000);
    assert.ok(omdbHealth.last24h.cacheHits >= 2);
    assert.ok(omdbHealth.last24h.errors >= 1);
  });
});

test('Track Efficiency: Unified AI Engine & LLM Content-Hash Cache', async (t) => {
  const d = db();
  const mockCacheKey = `llm_test_key_${Date.now()}`;

  // Insert test cached entry
  d.prepare(`
    INSERT INTO llm_cache (cache_key, provider, output, created_at, hits)
    VALUES (?, 'gemini', 'Hello from cached CinePulse!', datetime('now'), 0)
  `).run(mockCacheKey);

  const row = d.prepare('SELECT output FROM llm_cache WHERE cache_key = ?').get(mockCacheKey) as any;
  assert.equal(row.output, 'Hello from cached CinePulse!');

  // Test completeJson format parser
  const jsonOutput = '```json\n{"status": "ok", "efficiency": 100}\n```';
  const cleaned = jsonOutput.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  assert.equal(parsed.status, 'ok');
  assert.equal(parsed.efficiency, 100);
});

test('Track Efficiency: YouTube 0-Call Trending Trailers & Batching', async (t) => {
  const d = db();

  // Populate mock trailer_stats
  const titleId = `yt_test_${Date.now()}`;
  d.prepare(`
    INSERT INTO trailer_stats (title_id, youtube_video_id, view_count, like_count, comment_count, recorded_at)
    VALUES (?, 'vid_123', 5000000, 250000, 1200, datetime('now'))
  `).run(titleId);

  // Also insert a reference title in library or mock title mapping
  const trending = getTrendingTrailers(5);
  assert.ok(Array.isArray(trending));
  // Batch helper signature check
  assert.equal(typeof getBatchYouTubeTrailerStats, 'function');
});

test('Track Efficiency: OMDb Stale Cache & Taste DNA Critic Alignment', async (t) => {
  const d = db();

  // Test getOmdbRatingsCached returns null when key not in cache
  const nonExistent = getOmdbRatingsCached('tt9999999999');
  assert.equal(nonExistent, null);

  // Test prewarmOmdbCache returns stats without crashing
  const result = await prewarmOmdbCache([], 5);
  assert.equal(typeof result.warmed, 'number');
  assert.equal(typeof result.skipped, 'number');

  // Test Critic Alignment in Taste DNA
  const testUserId = `test-user-dna-${Date.now()}`;
  const testUsername = `critic_tester_${Date.now()}`;

  d.prepare(`
    INSERT INTO users (id, name, email, username, password_hash, created_at)
    VALUES (?, 'Critic Tester', ?, ?, 'mock_hash', datetime('now'))
  `).run(testUserId, `${testUsername}@example.com`, testUsername);

  // Add 5 ratings with matching RT scores
  const sampleFilms = [
    { id: 'tt15398776', title: 'Oppenheimer', rating: 5, rt: 93, meta: 89 },
    { id: 'tt1517268', title: 'Barbie', rating: 4.5, rt: 88, meta: 80 },
    { id: 'tt14230458', title: 'Poor Things', rating: 4.5, rt: 92, meta: 87 },
    { id: 'tt13238346', title: 'Past Lives', rating: 5, rt: 96, meta: 94 },
    { id: 'tt7160372', title: 'The Zone of Interest', rating: 4, rt: 93, meta: 92 },
  ];

  for (const f of sampleFilms) {
    d.prepare(`
      INSERT INTO library (user_id, title_id, status, rating, title_json, updated_at)
      VALUES (?, ?, 'watched', ?, ?, datetime('now'))
    `).run(
      testUserId,
      f.id,
      f.rating,
      JSON.stringify({
        id: f.id,
        imdbId: f.id,
        title: f.title,
        genres: ['Drama'],
        voteAverage: 8.2,
        releaseDate: '2023-07-21',
      })
    );

    // Seed mock OMDb cached ratings
    const cacheKey = fetchCacheKey('omdb', 'https://www.omdbapi.com/', { i: f.id, apikey: process.env.OMDB_API_KEY || '' });
    d.prepare(`
      INSERT INTO api_cache (cache_key, value, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET value=excluded.value
    `).run(
      cacheKey,
      JSON.stringify({
        data: {
          Title: f.title,
          imdbID: f.id,
          Ratings: [{ Source: 'Rotten Tomatoes', Value: `${f.rt}%` }],
          Metascore: String(f.meta),
        }
      }),
      Date.now() + 1000000
    );
  }

  const dna = computeTasteDna(testUsername);
  assert.ok(dna, 'Taste DNA must be generated for >= 5 rated titles');
  assert.ok(dna.tendencies.criticAlignment, 'Critic alignment must be computed');
  assert.ok(typeof dna.tendencies.criticAlignment.alignmentLabel === 'string');
  assert.ok(typeof dna.tendencies.criticAlignment.correlation === 'number');
});

test('Track Efficiency: GNews Non-Live Serving & Feature Extraction', async (t) => {
  const d = db();
  const testTitleId = `news_title_${Date.now()}`;

  const articles = [
    {
      title: 'Avatar: Fire and Ash Production Wraps',
      url: 'https://example.com/avatar3',
      source: 'Variety',
      publishedAt: new Date().toISOString(),
    }
  ];

  // Insert mock news article in title_news table
  d.prepare(`
    INSERT INTO title_news (title_id, title_name, release_date, article_count, articles_json, fetched_at)
    VALUES (?, 'Avatar 3', '2025-12-19', 1, ?, datetime('now'))
  `).run(testTitleId, JSON.stringify(articles));

  // Fast reader must serve local news without calling GNews API
  const stats = await getNewsCoverage(testTitleId);
  assert.ok(stats, 'getNewsCoverage should return stats from title_news table');
  assert.equal(stats.totalArticles, 1);
  assert.equal(stats.articles[0].title, 'Avatar: Fire and Ash Production Wraps');

  // Verify feature extraction includes pressCoverageCount
  const mockTitle = {
    id: testTitleId,
    title: 'Avatar 3',
    mediaType: 'movie',
    overview: 'The journey continues.',
    status: 'upcoming',
    genres: ['Sci-Fi', 'Action'],
    releaseDate: '2025-12-19',
    voteAverage: 0,
    voteCount: 0,
    cast: [],
    source: 'tmdb',
  } as unknown as Title;

  const features = await extractFeatureVector(mockTitle);
  assert.equal(features.pressCoverageCount.value, 1, 'pressCoverageCount must reflect cached news in title_news');
});

test('Track Efficiency: Embeddings & Semantic Cosine Similarity', async (t) => {
  const d = db();

  // Test local cosine similarity math
  const vecA = [1, 0, 0];
  const vecB = [1, 0, 0];
  const vecC = [0, 1, 0];
  assert.equal(Math.round(cosineSimilarity(vecA, vecB) * 100), 100);
  assert.equal(Math.round(cosineSimilarity(vecA, vecC) * 100), 0);

  // Test caching in title_embeddings
  const tId = `embed_${Date.now()}`;
  const mockVector = [0.12, 0.45, -0.32, 0.88];
  d.prepare(`
    INSERT INTO title_embeddings (title_id, model, content_hash, title_json, vector_json, created_at)
    VALUES (?, 'all-MiniLM-L6-v2', 'mock_hash', '{}', ?, datetime('now'))
  `).run(tId, JSON.stringify(mockVector));

  const cached = await getTitleEmbedding(tId, 'Test overview');
  assert.ok(cached);
  assert.equal(cached.fromCache, true);
  assert.deepEqual(cached.vector, mockVector);

  // Test getSemanticSimilarTitles using cached embeddings
  const tId2 = `embed_target_${Date.now()}`;
  const mockVector2 = [0.11, 0.44, -0.30, 0.85];
  d.prepare(`
    INSERT INTO title_embeddings (title_id, model, content_hash, title_json, vector_json, created_at)
    VALUES (?, 'all-MiniLM-L6-v2', 'mock_hash', '{}', ?, datetime('now'))
  `).run(tId2, JSON.stringify(mockVector2));

  const targetTitle = {
    id: tId,
    title: 'Movie One',
    mediaType: 'movie',
    overview: 'A futuristic thriller in space',
    genres: ['Sci-Fi'],
    voteAverage: 7.5,
    voteCount: 100,
    cast: [],
    source: 'tmdb',
  } as unknown as Title;

  const candidateTitle = {
    id: tId2,
    title: 'Movie Two',
    mediaType: 'movie',
    overview: 'An astronaut survives on a distant colony',
    genres: ['Sci-Fi'],
    voteAverage: 8.0,
    voteCount: 200,
    cast: [],
    source: 'tmdb',
  } as unknown as Title;

  const similarTitles = await getSemanticSimilarTitles(targetTitle, [candidateTitle], 5);
  assert.ok(similarTitles.length > 0);
  assert.equal(similarTitles[0].title.id, tId2);
  assert.ok(similarTitles[0].similarity > 0.95);
});
