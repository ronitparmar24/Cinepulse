import test from 'node:test';
import assert from 'node:assert/strict';

// TMDB mode with a mocked fetch (never the network): demo series are all unreleased, so a
// released series with real season data comes from the mock.
//   tv-500: released, 2 seasons (S1: 3 episodes, S2: 2 episodes, S2E2 airs in 2099)
//   tv-501: unreleased · movie-502: a film
process.env.CATALOG_MODE = 'tmdb';
process.env.TMDB_READ_TOKEN = 'episodes-mock-only';
const original = globalThis.fetch;
const seasons: Record<string, { episode_number: number; name: string; air_date: string }[]> = {
  '1': [1, 2, 3].map((n) => ({ episode_number: n, name: `Pilot ${n}`, air_date: '2001-01-0' + n })),
  '2': [
    { episode_number: 1, name: 'Return', air_date: '2002-01-01' },
    { episode_number: 2, name: 'Someday', air_date: '2099-01-01' },
  ],
};
globalThis.fetch = (async (url: string | URL) => {
  const u = String(url);
  const s = /\/tv\/\d+\/season\/(\d+)/.exec(u);
  if (s) return new Response(JSON.stringify({ episodes: (seasons[s[1]] ?? []).map((e, i) => ({ id: Number(s[1]) * 100 + i, overview: '', still_path: null, ...e })) }), { status: 200 });
  const id = Number(/\/(?:movie|tv)\/(\d+)/.exec(u)?.[1] ?? 1);
  const date = id === 501 ? '2099-01-01' : '2000-01-01';
  return new Response(JSON.stringify({ id, title: `Film ${id}`, name: `Series ${id}`, release_date: date, first_air_date: date, number_of_seasons: 2, genres: [], credits: { cast: [], crew: [] }, videos: { results: [] } }), { status: 200 });
}) as typeof fetch;
test.after(() => { globalThis.fetch = original; });

const { NextRequest } = await import('next/server');
const { register } = await import('../lib/auth');
const { CURRENT_SCHEMA_VERSION, db } = await import('../lib/db');
const { listLibrary, putLibrary } = await import('../lib/library');
const ep = await import('../lib/episodes');
const { handleEpisodes } = await import('../lib/api/routes/episodes');

const status400 = (e: { status?: number }) => e.status === 400;

test('schema v23 creates episode_progress', async () => {
  assert.ok(CURRENT_SCHEMA_VERSION >= 23);
  await db().get('SELECT user_id, title_id, season, episode, watched_at, rating FROM episode_progress LIMIT 1');
});

test('marking episodes: progress, ratings, Next up, and the library moves to watching', async () => {
  const { user } = await register({ name: 'Bingewatcher', email: `binge.${Date.now()}@example.com`, password: 'binge-password-1' });
  let res = await ep.setEpisode(user, 'tv-500', '1', '1', { watched: true });
  assert.deepEqual(res.episodes.map((e) => [e.season, e.episode]), [[1, 1]]);
  assert.deepEqual(res.nextUp, { season: 1, episode: 2, name: 'Pilot 2', airDate: '2001-01-02' });
  assert.equal(res.libraryStatus, 'watching');
  assert.equal((await listLibrary(user)).find((e) => e.title.id === 'tv-500')?.status, 'watching');

  res = await ep.setEpisode(user, 'tv-500', 1, 2, { watched: true, rating: 4.5 });
  assert.equal(res.episodes.find((e) => e.episode === 2)?.rating, 4.5);
  // Re-marking without a rating keeps it; sending null clears it.
  res = await ep.setEpisode(user, 'tv-500', 1, 2, { watched: true });
  assert.equal(res.episodes.find((e) => e.episode === 2)?.rating, 4.5);
  res = await ep.setEpisode(user, 'tv-500', 1, 2, { watched: true, rating: null });
  assert.equal(res.episodes.find((e) => e.episode === 2)?.rating, null);

  // Finishing season 1 rolls Next up into season 2.
  res = await ep.setSeason(user, 'tv-500', '1', { watched: true, count: 3 });
  assert.equal(res.episodes.length, 3);
  assert.deepEqual(res.nextUp, { season: 2, episode: 1, name: 'Return', airDate: '2002-01-01' });
  res = await ep.setEpisode(user, 'tv-500', 2, 1, { watched: true });
  assert.equal(res.nextUp?.episode, 2, 'an unaired episode is still next up (with its air date)');
  assert.equal(res.nextUp?.airDate, '2099-01-01');

  // Unwatching an episode / a season deletes the rows.
  res = await ep.setEpisode(user, 'tv-500', 2, 1, { watched: false });
  assert.equal(res.episodes.length, 3);
  res = await ep.setSeason(user, 'tv-500', 1, { watched: false });
  assert.deepEqual(res.episodes, []);
  assert.equal(res.nextUp, null);
  assert.equal(res.libraryStatus, 'watching', 'unwatching never changes the library status');

  const series = await ep.seriesInProgress(user);
  assert.deepEqual(series, []);
});

test('an existing watched status and rating are never downgraded or wiped', async () => {
  const { user } = await register({ name: 'Rated', email: `rated.${Date.now()}@example.com`, password: 'rated-password-1' });
  await putLibrary(user, 'tv-500', { status: 'watched', rating: 3.5 });
  const res = await ep.setEpisode(user, 'tv-500', 1, 1, { watched: true });
  assert.equal(res.libraryStatus, 'watched');
  const entry = (await listLibrary(user)).find((e) => e.title.id === 'tv-500');
  assert.equal(entry?.status, 'watched');
  assert.equal(entry?.rating, 3.5);
  const series = await ep.seriesInProgress(user);
  assert.equal(series.length, 1);
  assert.equal(series[0].titleId, 'tv-500');
  assert.equal(series[0].watchedCount, 1);
  assert.equal(series[0].nextUp?.episode, 2);
});

test('validation: ids, integers, booleans, ratings, films and unreleased series', async () => {
  const { user } = await register({ name: 'Strict', email: `strict-ep.${Date.now()}@example.com`, password: 'strict-password-1' });
  await assert.rejects(() => ep.setEpisode(user, 'tv-500', 'one', '1', { watched: true }), status400);
  await assert.rejects(() => ep.setEpisode(user, 'tv-500', '1', '0', { watched: true }), status400);
  await assert.rejects(() => ep.setEpisode(user, 'tv-500', '1.5', '1', { watched: true }), status400);
  await assert.rejects(() => ep.setEpisode(user, 'tv-500', '101', '1', { watched: true }), status400);
  await assert.rejects(() => ep.setEpisode(user, 'tv-500', '1', '1', { watched: 'yes' }), status400);
  await assert.rejects(() => ep.setEpisode(user, 'tv-500', '1', '1', { watched: true, rating: 4.2 }), status400);
  await assert.rejects(() => ep.setEpisode(user, 'tv-500', '1', '1', { watched: true, rating: 6 }), status400);
  await assert.rejects(() => ep.setSeason(user, 'tv-500', '1', { watched: true, count: 0 }), status400);
  await assert.rejects(() => ep.setSeason(user, 'tv-500', '1', { watched: true, count: 2.5 }), status400);
  await assert.rejects(() => ep.setEpisode(user, 'movie-502', '1', '1', { watched: true }), status400);
  await assert.rejects(() => ep.setEpisode(user, 'tv-501', '1', '1', { watched: true }), status400);
  await assert.rejects(() => ep.setEpisode(user, 'demo-neon', '1', '1', { watched: true }), (e: { status?: number }) => e.status === 404);
  await assert.rejects(() => ep.episodeProgress(user, 'not a title'), (e: { status?: number }) => e.status === 404);
  assert.deepEqual((await ep.episodeProgress(user, 'tv-500')).episodes, []);
});

test('Next up falls back to "last + 1" without episode lists and is null when caught up', async () => {
  const w = (season: number, episode: number) => ({ season, episode, watchedAt: '', rating: null });
  assert.deepEqual(await ep.computeNextUp([w(2, 4)], null, async () => []), { season: 2, episode: 5, name: null, airDate: null });
  assert.equal(await ep.computeNextUp([], 3, async () => []), null);
  const list = [{ episodeNumber: 1 }, { episodeNumber: 2 }];
  assert.equal(await ep.computeNextUp([w(1, 1), w(1, 2)], 1, async () => list), null);
  // A gap before the latest watched episode is skipped (Trakt-style "after the last one").
  assert.equal((await ep.computeNextUp([w(1, 2)], 1, async () => [...list, { episodeNumber: 3 }]))?.episode, 3);
});

test('API: auth required, routes dispatch, and responses are private', async () => {
  const { token } = await register({ name: 'Api', email: `api-ep.${Date.now()}@example.com`, password: 'api-password-12' });
  const call = (method: string, path: string, payload?: unknown, cookie = true) => {
    const request = new NextRequest(`http://localhost/api/${path}`, {
      method,
      headers: { ...(cookie ? { cookie: `cinepulse_session=${token}` } : {}), ...(payload ? { 'content-type': 'application/json' } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    return handleEpisodes({ request, parts: path.split('/'), method, query: request.nextUrl.searchParams });
  };
  await assert.rejects(() => call('GET', 'episodes/tv-500', undefined, false), (e: { status?: number }) => e.status === 401);
  let res = (await call('PUT', 'episodes/tv-500/1/1', { watched: true, rating: 5 }))!;
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await res.json()).episodes[0].rating, 5);
  res = (await call('PUT', 'episodes/tv-500/season/1', { watched: true, count: 3 }))!;
  assert.equal((await res.json()).episodes.length, 3);
  res = (await call('GET', 'episodes/tv-500'))!;
  const progress = await res.json();
  assert.equal(progress.nextUp.season, 2);
  res = (await call('GET', 'episodes'))!;
  assert.equal((await res.json()).series[0].titleId, 'tv-500');
  assert.equal(await call('DELETE', 'episodes/tv-500'), null);
});
