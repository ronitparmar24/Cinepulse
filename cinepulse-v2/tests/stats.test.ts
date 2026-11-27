import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const { NextRequest } = await import('next/server');
const { register } = await import('../lib/auth');
const { db, now } = await import('../lib/db');
const { summarizeStats, longestStreak, parseStatsPeriod, getStats, toStatsWatch } = await import('../lib/stats');
const { handleLibrary } = await import('../lib/api/routes/library');

const NOW = new Date('2026-11-27T12:00:00Z');
type W = Parameters<typeof summarizeStats>[1][number];
const w = (titleId: string, watchedAt: string, over: Partial<W> = {}): W => ({
  titleId, title: titleId, poster: null, mediaType: 'movie', genres: [], releaseDate: '2020-01-01',
  runtime: null, rating: null, watchedAt, director: null, cast: [], ...over,
});

test('parseStatsPeriod: current year by default, "all", past years, and rejects junk', () => {
  assert.equal(parseStatsPeriod(null, NOW), 2026);
  assert.equal(parseStatsPeriod('', NOW), 2026);
  assert.equal(parseStatsPeriod('all', NOW), 'all');
  assert.equal(parseStatsPeriod('2019', NOW), 2019);
  for (const bad of ['2027', '1800', '20x6', '26', 'ALL', '2026.5']) {
    assert.throws(() => parseStatsPeriod(bad, NOW), (e: { status?: number }) => e.status === 400, bad);
  }
});

test('longestStreak: consecutive calendar days, duplicates and timestamps collapse', () => {
  assert.equal(longestStreak([]), null);
  assert.deepEqual(longestStreak(['2026-03-01']), { days: 1, start: '2026-03-01', end: '2026-03-01' });
  assert.deepEqual(
    longestStreak(['2026-02-27', '2026-03-01', '2026-02-28', '2026-02-28T22:00:00Z', '2026-03-05', '2026-03-06']),
    { days: 3, start: '2026-02-27', end: '2026-03-01' },
  );
  assert.deepEqual(longestStreak(['2025-12-31', '2026-01-01']), { days: 2, start: '2025-12-31', end: '2026-01-01' });
});

test('summarizeStats: a year — titles once, hours, months, genres, ratings, people', () => {
  const watches: W[] = [
    w('a', '2026-01-10', { runtime: 120, rating: 4.5, genres: ['Drama', 'Crime'], director: 'Ana Lee', cast: ['Kai', 'Mo'], rewatch: false }),
    w('a', '2026-03-02', { runtime: 120, rating: 5, genres: ['Drama', 'Crime'], director: 'Ana Lee', cast: ['Kai', 'Mo'], rewatch: true }),
    w('b', '2026-01-11', { runtime: 90, rating: 3, genres: ['Drama'], director: 'Ana Lee', cast: ['Kai'], rewatch: false }),
    w('c', '2026-01-12', { runtime: 100, rating: 0.5, genres: ['Comedy'], director: 'Bo Ray', cast: ['Zed'] }),
    w('s', '2026-07-04', { mediaType: 'tv', genres: ['Drama'], rating: 4 }),
    w('old', '2025-06-01', { runtime: 95, rating: 2, genres: ['Horror'] }),
    w('bad', '2026-05-05', { runtime: 9999 }), // absurd runtimes are ignored
  ];
  const episodes = [
    { titleId: 's', watchedAt: '2026-07-04T20:00:00Z', runtime: 30 },
    { titleId: 's', watchedAt: '2026-07-05T20:00:00Z', runtime: 30 },
    { titleId: 's', watchedAt: '2025-01-01T20:00:00Z', runtime: 30 },
  ];
  const s = summarizeStats(2026, watches, episodes, NOW);
  assert.equal(s.hasData, true);
  assert.deepEqual(s.availableYears, [2026, 2025]);
  assert.equal(s.titlesLogged, 5);
  assert.equal(s.filmsLogged, 4);
  assert.equal(s.seriesLogged, 1);
  assert.equal(s.episodesWatched, 2);
  assert.equal(s.rewatches, 1);
  assert.equal(s.diaryEntries, 3);
  // 120 + 90 + 100 film minutes (title a counted once) + 2 × 30 episode minutes = 370 min
  assert.equal(s.hoursWatched, 6.2);
  assert.equal(s.timeline.granularity, 'month');
  assert.equal(s.timeline.buckets.length, 12);
  assert.deepEqual(s.timeline.buckets.map((b) => b.count), [3, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0]);
  assert.equal(s.timeline.buckets[0].label, 'Jan');
  assert.deepEqual(s.topGenres[0], { name: 'Drama', count: 3 });
  // The latest rating is the current opinion: a = 5 (rewatch), b = 3, c = 0.5, s = 4.
  assert.equal(s.ratings.count, 4);
  assert.equal(s.ratings.average, 3.13);
  assert.equal(s.ratingHistogram.length, 10);
  assert.deepEqual(s.ratingHistogram.find((r) => r.stars === 5), { stars: 5, count: 1 });
  assert.deepEqual(s.ratingHistogram.find((r) => r.stars === 0.5), { stars: 0.5, count: 1 });
  assert.equal(s.ratingHistogram.reduce((n, r) => n + r.count, 0), 4);
  assert.deepEqual(s.longestStreak, { days: 3, start: '2026-01-10', end: '2026-01-12' });
  assert.deepEqual(s.busiestDay, { date: '2026-07-04', count: 2 });
  assert.deepEqual(s.topDirectors, [{ name: 'Ana Lee', count: 2 }]);
  assert.deepEqual(s.topActors, [{ name: 'Kai', count: 2 }]);
  assert.equal(s.topRated[0].titleId, 'a');
});

test('summarizeStats: all time groups by year; an empty period has no data', () => {
  const watches = [w('x', '2019-02-01'), w('y', '2024-05-01'), w('z', '2024-06-01'), w('x', '2026-01-01')];
  const all = summarizeStats('all', watches, [], NOW);
  assert.equal(all.timeline.granularity, 'year');
  assert.equal(all.titlesLogged, 3, 'a title counts once across all time');
  assert.deepEqual(all.timeline.buckets.map((b) => [b.label, b.count]), [['2019', 1], ['2020', 0], ['2021', 0], ['2022', 0], ['2023', 0], ['2024', 2]]);

  const empty = summarizeStats(2022, watches, [], NOW);
  assert.equal(empty.hasData, false);
  assert.equal(empty.titlesLogged, 0);
  assert.equal(empty.ratings.average, null);
  assert.equal(empty.longestStreak, null);
  assert.deepEqual(empty.availableYears, [2026, 2024, 2019]);
});

test('toStatsWatch reads title snapshots defensively', () => {
  const ok = toStatsWatch('movie-1', JSON.stringify({ title: 'Heat', mediaType: 'movie', genres: ['Crime', 3], runtime: 170, director: ' Michael Mann ', cast: [{ name: 'Al' }, {}, { name: 'Bob' }] }), '4.5', '2026-01-02');
  assert.equal(ok.title, 'Heat');
  assert.deepEqual(ok.genres, ['Crime']);
  assert.equal(ok.rating, 4.5);
  assert.equal(ok.director, 'Michael Mann');
  assert.deepEqual(ok.cast, ['Al', 'Bob']);
  const broken = toStatsWatch('movie-2', '{not json', null, '2026-01-02');
  assert.equal(broken.title, 'movie-2');
  assert.equal(broken.rating, null);
  assert.deepEqual(broken.cast, []);
});

test('getStats + GET /api/stats: own data only, diary beats library dates, private no-store', async () => {
  const stamp = Date.now();
  const { user, token } = await register({ name: 'Stats Fan', email: `stats.${stamp}@example.com`, password: 'stats-password-1' });
  const { user: other } = await register({ name: 'Other', email: `stats-other.${stamp}@example.com`, password: 'stats-password-2' });
  const d = db();
  const snap = (id: string, extra: object = {}) => JSON.stringify({ id, title: `T ${id}`, mediaType: 'movie', genres: ['Drama'], runtime: 100, director: 'Dee', cast: [{ name: 'Cee' }], poster: null, ...extra });
  const diary = (uid: string, id: string, on: string, rating: number | null, rewatch = 0) =>
    d.run('INSERT INTO diary_entries (id, user_id, title_id, title_json, watched_on, rating, rewatch, liked, tags, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)',
      randomUUID(), uid, id, snap(id), on, rating, rewatch, now(), now());
  const lib = (uid: string, id: string, status: string, updated: string, rating: number | null, extra: object = {}) =>
    d.run('INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at) VALUES (?, ?, ?, ?, ?, ?)', uid, id, snap(id, extra), status, rating, updated);

  // movie-1: logged in 2025 in the diary, library row touched in 2026 → counts in 2025 only.
  await diary(user.id, 'movie-1', '2025-12-30', 4);
  await diary(user.id, 'movie-1', '2026-02-01', null, 1);
  await lib(user.id, 'movie-1', 'watched', '2026-02-01T10:00:00.000Z', 4);
  // movie-2: only marked watched in the library (2026).
  await lib(user.id, 'movie-2', 'watched', '2026-03-03T10:00:00.000Z', 3.5);
  // tv-3: episodes only (watching) — episodes count, the series is not "logged".
  await lib(user.id, 'tv-3', 'watching', '2026-04-04T10:00:00.000Z', null, { mediaType: 'tv', runtime: 45 });
  await d.run('INSERT INTO episode_progress (user_id, title_id, season, episode, watched_at, rating) VALUES (?, ?, 1, 1, ?, NULL), (?, ?, 1, 2, ?, NULL)',
    user.id, 'tv-3', '2026-04-04T10:00:00.000Z', user.id, 'tv-3', '2026-04-05T10:00:00.000Z');
  // movie-4: on the watchlist — never counted. Someone else's viewing — never counted.
  await lib(user.id, 'movie-4', 'watchlist', '2026-05-05T10:00:00.000Z', null);
  await diary(other.id, 'movie-9', '2026-01-01', 5);

  const y2026 = await getStats(user.id, 2026, NOW);
  // movie-1's rewatch in 2026 counts as a 2026 viewing too (it was logged that day).
  assert.deepEqual([y2026.titlesLogged, y2026.filmsLogged, y2026.seriesLogged, y2026.episodesWatched, y2026.rewatches], [2, 2, 0, 2, 1]);
  assert.equal(y2026.hoursWatched, Math.round(((100 + 100 + 90) / 60) * 10) / 10);
  assert.equal(y2026.ratings.count, 2, 'the diary rewatch without a rating falls back to the library rating');
  assert.ok(y2026.availableYears.includes(2025));

  const y2025 = await getStats(user.id, 2025, NOW);
  assert.equal(y2025.titlesLogged, 1);
  assert.equal(y2025.ratings.average, 4);

  const all = await getStats(user.id, 'all', NOW);
  assert.equal(all.titlesLogged, 2);
  assert.equal(all.topDirectors.length, 1);

  const call = (path: string, cookie = true) => {
    const request = new NextRequest(`http://localhost/api/${path}`, { headers: cookie ? { cookie: `cinepulse_session=${token}` } : {} });
    return handleLibrary({ request, parts: request.nextUrl.pathname.replace('/api/', '').split('/'), method: 'GET', query: request.nextUrl.searchParams });
  };
  await assert.rejects(() => call('stats?year=all', false), (e: { status?: number }) => e.status === 401);
  await assert.rejects(() => call('stats?year=nope'), (e: { status?: number }) => e.status === 400);
  const res = (await call('stats?year=all'))!;
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  const body = await res.json();
  assert.equal(body.stats.period, 'all');
  assert.equal(body.stats.titlesLogged, 2);
});
