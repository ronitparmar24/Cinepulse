import test from 'node:test';
import assert from 'node:assert/strict';
import { ratingStyle, summarizeYear, wrappedYearAllowed, type CallRecord, type WatchRecord } from '../lib/wrapped';
import { wrappedSeason, wrappedYear } from '../lib/wrappedClient';

const w = (over: Partial<WatchRecord>): WatchRecord => ({
  titleId: 'movie-1', title: 'One', poster: null, mediaType: 'movie', genres: [], releaseDate: '2024-05-01',
  runtime: 120, rating: null, watchedAt: '2026-03-10', ...over,
});

test('empty year has no data and safe defaults', () => {
  const s = summarizeYear(2026, [], []);
  assert.equal(s.hasData, false);
  assert.equal(s.filmsWatched, 0);
  assert.equal(s.busiestMonth, null);
  assert.equal(s.predictions.accuracy, null);
  assert.deepEqual(s.topFilms, []);
});

test('counts each title once per year, keeps the earliest date and any rating', () => {
  const s = summarizeYear(2026, [
    w({ titleId: 'movie-1', watchedAt: '2026-05-02', rating: null }),
    w({ titleId: 'movie-1', watchedAt: '2026-02-01', rating: 4.5 }),
    w({ titleId: 'movie-2', watchedAt: '2025-12-31' }), // other year
    w({ titleId: 'movie-3', watchedAt: '2026-12-31T22:10:00.000Z' }), // late on 31 December still counts
  ], []);
  assert.equal(s.filmsWatched, 2);
  assert.equal(s.firstWatch?.date, '2026-02-01');
  assert.equal(s.ratings.count, 1);
  assert.equal(s.months[1], 1);
  assert.equal(s.months[11], 1);
});

test('hours count films only, and genres, decades and busiest month rank correctly', () => {
  const s = summarizeYear(2026, [
    w({ titleId: 'a', runtime: 150, genres: ['Drama', 'Crime'], releaseDate: '1994-01-01', watchedAt: '2026-07-01' }),
    w({ titleId: 'b', runtime: 90, genres: ['Drama'], releaseDate: '1999-01-01', watchedAt: '2026-07-20' }),
    w({ titleId: 'c', mediaType: 'tv', runtime: 45, genres: ['Comedy'], releaseDate: '2021-01-01', watchedAt: '2026-01-05' }),
  ], []);
  assert.equal(s.moviesWatched, 2);
  assert.equal(s.seriesWatched, 1);
  assert.equal(s.hoursWatched, 4); // 240 minutes of film; the series is left out
  assert.deepEqual(s.topGenres[0], { name: 'Drama', count: 2 });
  assert.equal(s.favoriteDecade, '1990s');
  assert.equal(s.busiestMonth?.label, 'July');
  assert.equal(s.busiestMonth?.count, 2);
});

test('top films prefer ratings, then fill with recent watches', () => {
  const s = summarizeYear(2026, [
    w({ titleId: 'a', rating: 3, watchedAt: '2026-01-01' }),
    w({ titleId: 'b', rating: 5, watchedAt: '2026-02-01' }),
    w({ titleId: 'c', rating: null, watchedAt: '2026-03-01' }),
  ], []);
  assert.deepEqual(s.topFilms.map((f) => f.titleId), ['b', 'a', 'c']);
  assert.equal(s.ratings.fiveStars, 1);
});

test('prediction record counts only this year and only resolved calls for accuracy', () => {
  const calls: CallRecord[] = [
    { choice: 'hit', createdAt: '2026-04-01T00:00:00Z', actualHit: true },
    { choice: 'flop', createdAt: '2026-05-01T00:00:00Z', actualHit: true },
    { choice: 'flop', createdAt: '2026-06-01T00:00:00Z', actualHit: false },
    { choice: 'hit', createdAt: '2026-07-01T00:00:00Z', actualHit: null },
    { choice: 'hit', createdAt: '2025-07-01T00:00:00Z', actualHit: true },
  ];
  const s = summarizeYear(2026, [], calls);
  assert.equal(s.hasData, true);
  assert.deepEqual(s.predictions, { calls: 4, resolved: 3, correct: 2, accuracy: 67 });
});

test('rating style needs at least three ratings', () => {
  assert.equal(ratingStyle(4.5, 2), null);
  assert.equal(ratingStyle(4.2, 3), 'generous');
  assert.equal(ratingStyle(3.4, 5), 'balanced');
  assert.equal(ratingStyle(2.5, 5), 'tough');
});

test('allowed years and the season window', () => {
  const now = new Date('2026-11-25T10:00:00Z');
  assert.equal(wrappedYearAllowed(2026, now), true);
  assert.equal(wrappedYearAllowed(2027, now), false);
  assert.equal(wrappedYearAllowed(2019, now), false);
  assert.equal(wrappedYear(new Date(2027, 0, 10)), 2026);
  assert.equal(wrappedYear(new Date(2026, 10, 25)), 2026);
  assert.equal(wrappedSeason(new Date(2026, 10, 14)), false);
  assert.equal(wrappedSeason(new Date(2026, 10, 15)), true);
  assert.equal(wrappedSeason(new Date(2027, 0, 31)), true);
  assert.equal(wrappedSeason(new Date(2027, 1, 1)), false);
});

test('GET /api/wrapped needs sign-in and returns only your own year', async () => {
  const { register } = await import('../lib/auth');
  const { db } = await import('../lib/db');
  const route = await import('../app/api/[...path]/route');
  const { NextRequest } = await import('next/server');
  const call = (path: string, cookie?: string) => {
    const headers: Record<string, string> = { host: '127.0.0.1:3000' };
    if (cookie) headers.cookie = cookie;
    const p = path.split('?')[0];
    return route.GET(new NextRequest(`http://127.0.0.1:3000/api/${path}`, { headers }), { params: Promise.resolve({ path: p.split('/') }) });
  };
  assert.equal((await call('wrapped?year=2026')).status, 401);

  const me = await register({ name: 'Wrap Fan', email: `wrap.${Date.now()}@example.com`, password: 'wrapped-password-1' });
  const other = await register({ name: 'Someone Else', email: `else.${Date.now()}@example.com`, password: 'wrapped-password-2' });
  const title = JSON.stringify({ id: 'movie-77', title: 'Seventy Seven', mediaType: 'movie', genres: ['Drama'], releaseDate: '2025-01-01', runtime: 130, poster: null });
  await db().run(`INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at) VALUES (?, 'movie-77', ?, 'watched', 4, '2026-08-03T10:00:00.000Z')`, me.user.id, title);
  await db().run(`INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at) VALUES (?, 'movie-77', ?, 'watched', 2, '2026-08-03T10:00:00.000Z')`, other.user.id, title);

  const res = await call('wrapped?year=2026', `cinepulse_session=${me.token}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control') ?? '', /no-store/);
  const { wrapped } = await res.json();
  assert.equal(wrapped.filmsWatched, 1);
  assert.equal(wrapped.hoursWatched, 2);
  assert.equal(wrapped.ratings.average, 4, 'only my rating, not the other member\'s');
  assert.equal((await call('wrapped?year=2099', `cinepulse_session=${me.token}`)).status, 400);
});

test('the share card renders a 1080x1920 PNG without any posters', async () => {
  const { renderWrappedCard } = await import('../lib/wrappedCard');
  const s = summarizeYear(2026, [w({ titleId: 'a', title: 'A Film', rating: 4, poster: '/assets/local.webp' })], []);
  const res = await renderWrappedCard(s, 'Asha');
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.match(res.headers.get('cache-control') ?? '', /no-store/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.deepEqual([...buf.subarray(1, 4)], [0x50, 0x4e, 0x47]); // "PNG"
  assert.equal(buf.readUInt32BE(16), 1080);
  assert.equal(buf.readUInt32BE(20), 1920);
});
