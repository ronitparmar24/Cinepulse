import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCachedCatalog,
  setCachedCatalog,
  getCachedGenres,
  setCachedGenres,
  clearCatalogCache,
  formatCacheAge,
  CATALOG_CACHE_TTL_MS,
} from '../components/catalogCache';
import type { CatalogResponse } from '../lib/types';

// Mock localStorage and document for Node.js test environment
class MockStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
  removeItem(key: string): void { this.store.delete(key); }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
}

const mockStorage = new MockStorage();
(globalThis as any).window = { localStorage: mockStorage, sessionStorage: mockStorage };
(globalThis as any).document = { cookie: '' };

const mockCatalog: CatalogResponse = {
  items: [
    {
      id: 'movie-1',
      source: 'tmdb',
      mediaType: 'movie',
      title: 'Inception',
      overview: 'Dream within a dream',
      tagline: 'Your mind is the scene of the crime',
      poster: null,
      backdrop: null,
      releaseDate: '2010-07-16',
      releaseDateSource: 'tmdb-primary-release-date',
      releaseDateRegion: 'IN',
      genres: ['Sci-Fi', 'Action'],
      runtime: 148,
      seasons: null,
      status: 'released',
      voteAverage: 8.8,
      voteCount: 35000,
      popularity: 90,
      cast: [],
      trailerKey: null,
      director: 'Christopher Nolan',
      budget: 160000000,
      revenue: 836800000,
    },
  ],
  page: 1,
  totalPages: 10,
  totalResults: 200,
  mode: 'tmdb',
  totalResultsScope: 'provider-total',
  totalResultsComplete: true,
  ordering: 'provider-page-order',
  completeness: 'provider-paginated',
};

test('catalog cache: empty storage returns null', () => {
  mockStorage.clear();
  const res = getCachedCatalog('media=all&collection=trending&page=1');
  assert.equal(res, null);
});

test('catalog cache: stores and retrieves catalog response with valid 1-hour TTL', () => {
  mockStorage.clear();
  const key = 'media=all&collection=trending&page=1';
  setCachedCatalog(key, mockCatalog);

  const res = getCachedCatalog(key);
  assert.ok(res !== null);
  assert.equal(res.isExpired, false);
  assert.equal(res.data.items.length, 1);
  assert.equal(res.data.items[0].title, 'Inception');
  assert.ok(document.cookie.includes('cinepulse_catalog_synced_at'));
});

test('catalog cache: marks data older than 1 hour as expired', () => {
  mockStorage.clear();
  const key = 'media=all&collection=trending&page=1';
  setCachedCatalog(key, mockCatalog);

  // Manipulate timestamp to 61 minutes ago
  const stored = JSON.parse(mockStorage.getItem(`cinepulse_cat_v3_${key}`)!);
  stored.timestamp = Date.now() - (61 * 60 * 1000);
  mockStorage.setItem(`cinepulse_cat_v3_${key}`, JSON.stringify(stored));

  const res = getCachedCatalog(key);
  assert.ok(res !== null);
  assert.equal(res.isExpired, true);
  assert.equal(res.data.items[0].title, 'Inception');
});

test('genre cache: caches and returns genre lists within 1 hour', () => {
  mockStorage.clear();
  setCachedGenres('movie', ['Action', 'Sci-Fi', 'Drama']);
  const res = getCachedGenres('movie');
  assert.ok(res !== null);
  assert.deepEqual(res.genres, ['Action', 'Sci-Fi', 'Drama']);
});

test('formatCacheAge: formats remaining minutes and age text accurately', () => {
  const now = Date.now();
  const { ageText, remainingMinutes } = formatCacheAge(now);
  assert.equal(ageText, 'just now');
  assert.equal(remainingMinutes, 60);

  const tenMinutesAgo = now - (10 * 60 * 1000);
  const formatted10 = formatCacheAge(tenMinutesAgo);
  assert.equal(formatted10.ageText, '10m ago');
  assert.equal(formatted10.remainingMinutes, 50);
});

test('clearCatalogCache: wipes all catalog entries and clears sync cookie', () => {
  setCachedCatalog('key1', mockCatalog);
  setCachedGenres('tv', ['Drama']);
  clearCatalogCache();

  assert.equal(getCachedCatalog('key1'), null);
  assert.equal(getCachedGenres('tv'), null);
});
