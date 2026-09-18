#!/usr/bin/env node
/**
 * Credential-safe, opt-in TMDB smoke check. This file never runs as part of the
 * test suite and never prints the token or response bodies.
 *
 * Run from the project root with Node 22.13+:
 *   node --env-file-if-exists=.env.local scripts/check-tmdb.mjs
 */
const token = process.env.TMDB_READ_TOKEN;
const region = process.env.TMDB_REGION || 'IN';
if (!token || token === 'REPLACE_LOCALLY_WITH_YOUR_READ_ACCESS_TOKEN' || token === 'your_read_access_token_here') {
  console.error('TMDB_READ_TOKEN is missing. Copy .env.example to .env.local and enter the token locally; no request was made.');
  process.exitCode = 2;
  process.exit();
}

const base = 'https://api.themoviedb.org/3';
const timeoutMs = 8_000;
async function get(path, params = {}) {
  const url = new URL(`${base}/${path}`);
  for (const [key, value] of Object.entries({...params, region})) url.searchParams.set(key, String(value));
  
  const isV3Key = token.length === 32;
  if (isV3Key) url.searchParams.set('api_key', token);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { Accept: 'application/json' };
    if (!isV3Key) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, {headers, signal: controller.signal, cache: 'no-store'});
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!body || typeof body !== 'object') throw new Error('invalid JSON response');
    return body;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('timeout');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const checks = [
  ['configuration', () => get('configuration')],
  ['movie genres', () => get('genre/movie/list')],
  ['TV genres', () => get('genre/tv/list')],
  ['movie search', () => get('search/movie', {query: 'Inception', page: 1})],
  ['TV search', () => get('search/tv', {query: 'Breaking', page: 1})],
  ['trending all', () => get('trending/all/week', {page: 1})],
  ['upcoming movies', () => get('discover/movie', {page: 1, sort_by: 'primary_release_date.asc', 'primary_release_date.gte': new Date().toISOString().slice(0, 10)})],
  ['upcoming TV', () => get('discover/tv', {page: 1, sort_by: 'first_air_date.asc', 'first_air_date.gte': new Date().toISOString().slice(0, 10)})],
  ['top movies', () => get('movie/top_rated', {page: 1})],
  ['top TV', () => get('tv/top_rated', {page: 1})],
];

let failed = 0;
const successful = [];
for (const [label, fn] of checks) {
  try {
    const data = await fn();
    successful.push(label);
    const count = Array.isArray(data.results) ? ` (${data.results.length} results on page)` : '';
    console.log(`PASS ${label}${count}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${label}: ${error instanceof Error ? error.message : 'request failed'}`);
  }
}

// Use IDs returned by the live search responses for detail/credits/videos and
// season checks, avoiding assumptions about a particular catalog record.
try {
  const movieSearch = await get('search/movie', {query: 'Inception', page: 1});
  const movie = movieSearch.results?.find(item => Number.isInteger(item?.id));
  if (!movie) throw new Error('search returned no movie ID');
  await get(`movie/${movie.id}`, {append_to_response: 'credits,videos'});
  successful.push('movie details/credits/videos');
  console.log(`PASS movie details/credits/videos (id ${movie.id})`);
} catch (error) {
  failed += 1;
  console.error(`FAIL movie details/credits/videos: ${error instanceof Error ? error.message : 'request failed'}`);
}
try {
  const tvSearch = await get('search/tv', {query: 'Breaking', page: 1});
  const series = tvSearch.results?.find(item => Number.isInteger(item?.id));
  if (!series) throw new Error('search returned no TV ID');
  const details = await get(`tv/${series.id}`, {append_to_response: 'credits,videos'});
  successful.push('TV details/credits/videos');
  console.log(`PASS TV details/credits/videos (id ${series.id})`);
  const seasonNumber = Number(details.number_of_seasons) > 0 ? 1 : null;
  if (seasonNumber) {
    await get(`tv/${series.id}/season/${seasonNumber}`);
    successful.push('TV season/episodes');
    console.log(`PASS TV season/episodes (id ${series.id}, season ${seasonNumber})`);
  } else {
    console.log('SKIP TV season/episodes (selected series has no seasons)');
  }
} catch (error) {
  failed += 1;
  console.error(`FAIL TV details/credits/videos/season: ${error instanceof Error ? error.message : 'request failed'}`);
}

console.log(`\nTMDB smoke summary: ${successful.length} checks passed, ${failed} failed. Region requested: ${region}.`);
if (failed) {
  console.error('No token or response body was printed. Review the failing HTTP status and local TMDB credentials/network.');
  process.exitCode = 1;
}
