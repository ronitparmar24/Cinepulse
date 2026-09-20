import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CATALOG_MODE = 'tmdb';
process.env.TMDB_READ_TOKEN = 'resilience-test-token';
process.env.TMDB_REGION = `RS${process.pid}${Math.floor(Math.random() * 10000)}`;
process.env.DATABASE_PATH = `/tmp/cinepulse-catalog-resilience-${process.pid}.db`;

const { catalog, catalogConfig, checkCatalogHealth } = await import('../lib/catalog');
const originalFetch = globalThis.fetch;
function response(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {status, headers: {'content-type': 'application/json', ...headers}});
}
function installFetch(handler: (url: URL, calls: number) => Response | Promise<Response>) {
  let calls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => handler(new URL(String(input)), ++calls)) as typeof fetch;
  return () => calls;
}
function path(url: URL): string { return url.pathname.replace('/3/', ''); }

test.afterEach(() => { globalThis.fetch = originalFetch; process.env.CATALOG_MODE = 'tmdb'; process.env.TMDB_READ_TOKEN = 'resilience-test-token'; });

test('search is all-matching and does not accidentally apply upcoming collection filters', async () => {
  let searchUrl: URL | undefined;
  const calls = installFetch((url) => {
    const p = path(url);
    if (p === 'search/movie') { searchUrl = url; return response({page: 1, total_pages: 7, total_results: 61, results: [{id: 1, title: 'Search result', release_date: '2099-01-02'}]}); }
    if (p === 'genre/movie/list') return response({genres: [{id: 28, name: 'Action'}]});
    return response({genres: []});
  });
  const result = await catalog({media: 'movie', collection: 'upcoming', search: '  search  ', page: 1});
  assert.equal(result.totalResults, 61);
  assert.equal(result.searchSemantics, 'all-matching-titles');
  assert.equal(result.totalResultsScope, 'provider-total');
  assert.equal(result.totalResultsComplete, true);
  assert.equal(searchUrl?.pathname.endsWith('/search/movie'), true);
  assert.equal(searchUrl?.searchParams.has('primary_release_date.gte'), false);
  assert.equal(searchUrl?.searchParams.has('sort_by'), false);
  assert.equal(calls(), 2);
});

test('invalid provider dates become unknown rather than normalized dates', async () => {
  installFetch((url) => {
    const p = path(url);
    if (p === 'search/tv') return response({page: 1, total_pages: 1, total_results: 2, results: [
      {id: 2, name: 'Impossible date', first_air_date: '2024-02-30'},
      {id: 3, name: 'Real future date', first_air_date: '2099-02-28'},
    ]});
    if (p === 'genre/tv/list') return response({genres: []});
    return response({});
  });
  const result = await catalog({media: 'tv', collection: 'trending', search: 'date', page: 1});
  assert.equal(result.items[0].releaseDate, null);
  assert.equal(result.items[0].status, 'unknown');
  assert.equal(result.items[1].releaseDate, '2099-02-28');
  assert.equal(result.items[1].status, 'upcoming');
  assert.equal(result.items[1].releaseDateSource, 'tmdb-first-air-date');
  assert.equal(result.items[1].releaseDateRegion, process.env.TMDB_REGION);
});

test('trending all reports retained loaded-page titles, not TMDB mixed totals', async () => {
  installFetch((url) => {
    const p = path(url);
    if (p === 'trending/all/week') return response({page: 1, total_pages: 9, total_results: 100, results: [
      {id: 4, media_type: 'person', name: 'Person'},
      {id: 5, media_type: 'movie', title: 'Film', release_date: '2020-01-01', genre_ids: [1]},
      {id: 6, media_type: 'tv', name: 'Series', first_air_date: '2020-01-01', genre_ids: [2]},
    ]});
    if (p === 'genre/movie/list') return response({genres: [{id: 1, name: 'Drama'}]});
    if (p === 'genre/tv/list') return response({genres: [{id: 2, name: 'News'}]});
    return response({});
  });
  const result = await catalog({media: 'all', collection: 'trending', page: 1});
  assert.equal(result.totalResults, 2);
  assert.equal(result.totalResultsScope, 'loaded-page-titles');
  assert.equal(result.totalResultsComplete, false);
  assert.equal(result.completeness, 'loaded-page-titles');
  assert.equal(result.ordering, 'provider-page-order');
});

test('transient provider failures retry with a bounded provider-directed delay', async () => {
  let sourceCalls = 0;
  const calls = installFetch((url) => {
    const p = path(url);
    if (p === 'search/movie') {
      sourceCalls += 1;
      if (sourceCalls === 1) return response({error: 'try later'}, 503, {'retry-after': '0'});
      return response({page: 1, total_pages: 1, total_results: 1, results: [{id: 9, title: 'Recovered', release_date: '2020-01-01'}]});
    }
    if (p === 'genre/movie/list') return response({genres: []});
    return response({});
  });
  const result = await catalog({media: 'movie', collection: 'top', search: 'recovered', page: 1});
  assert.equal(result.items[0].title, 'Recovered');
  assert.equal(sourceCalls, 2);
  assert.ok(calls() >= 2);
});

test('invalid credentials are not retried as transient errors', async () => {
  let requests = 0;
  const calls = installFetch((url) => {
    requests += 1;
    if (path(url) === 'search/movie') return response({status_code: 7}, 401);
    return response({genres: []});
  });
  await assert.rejects(() => catalog({media: 'movie', collection: 'trending', search: 'invalid-credential-test', page: 1}), /TMDB request failed/);
  assert.equal(requests, 1);
  assert.equal(calls(), 1);
});

test('health exposes configured then verified state without exposing a token', async () => {
  const calls = installFetch((url) => {
    assert.equal(path(url), 'configuration');
    return response({images: {base_url: 'https://image.tmdb.org/t/p/'}});
  });
  const before = catalogConfig();
  assert.equal(before.health.status, 'configured');
  const checked = await checkCatalogHealth(true);
  assert.equal(checked.status, 'verified');
  assert.match(checked.message, /reachable/);
  assert.equal(JSON.stringify(checked).includes('resilience-test-token'), false);
  assert.equal(calls(), 1);
});

test('health marks rejected credentials unavailable without leaking provider details', async () => {
  process.env.TMDB_READ_TOKEN = 'rejected-test-token';
  const calls = installFetch((url) => {
    assert.equal(path(url), 'configuration');
    return response({status_code: 7, message: 'invalid token details'}, 401);
  });
  const checked = await checkCatalogHealth(true);
  assert.equal(checked.status, 'unavailable');
  assert.match(checked.message, /rejected/);
  assert.equal(JSON.stringify(checked).includes('invalid token details'), false);
  assert.equal(JSON.stringify(checked).includes('rejected-test-token'), false);
  assert.equal(calls(), 1);
});
