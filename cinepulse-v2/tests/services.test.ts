import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../lib/auth';
import { db } from '../lib/db';
import { cleanServiceIds, matchServices, servicesForRegion } from '../lib/services';
import { getUserServices, parseTonightOptions, setUserServices, tonightPick, watchlistAvailability } from '../lib/userServices';
import type { WatchProviderInfo } from '../lib/types';

const providers = (...list: Array<[number, string]>): WatchProviderInfo => ({
  flatrate: list.map(([providerId, providerName]) => ({ providerId, providerName, logoPath: '' })), rent: [], buy: [], link: 'https://www.themoviedb.org/x/watch', region: 'IN',
});

test('provider matching uses ids, then names, and ignores rent/buy', () => {
  assert.deepEqual(matchServices(providers([8, 'Netflix']), ['netflix'], 'IN'), ['Netflix']);
  assert.deepEqual(matchServices(providers([9999, 'Netflix basic with Ads']), ['netflix'], 'IN'), ['Netflix'], 'new ad-tier id still matches by name');
  assert.deepEqual(matchServices(providers([2336, 'JioHotstar']), ['jiohotstar'], 'IN'), ['JioHotstar']);
  assert.deepEqual(matchServices(providers([122, 'Hotstar']), ['jiohotstar'], 'IN'), ['JioHotstar'], 'old Hotstar id maps to JioHotstar');
  assert.deepEqual(matchServices(providers([1899, 'Max']), ['max'], 'US'), ['Max']);
  assert.deepEqual(matchServices(providers([77, 'Maxdome Store']), ['max'], 'US'), [], '"Max" must not match other names that start with max');
  assert.deepEqual(matchServices({ flatrate: [] } as any, ['netflix'], 'IN'), []);
  assert.deepEqual(matchServices(providers([8, 'Netflix']), [], 'IN'), []);
  assert.deepEqual(matchServices(providers([8, 'Netflix'], [119, 'Amazon Prime Video']), ['prime', 'netflix'], 'IN'), ['Netflix', 'Prime Video']);
});

test('service ids are cleaned per region', () => {
  assert.deepEqual(cleanServiceIds(['hulu', 'netflix', 'netflix', 7, 'nope'], 'IN'), ['netflix']);
  assert.deepEqual(cleanServiceIds(['hulu', 'netflix'], 'US'), ['netflix', 'hulu']);
  assert.ok(servicesForRegion('IN').some((s) => s.id === 'jiohotstar'));
  assert.ok(servicesForRegion('US').some((s) => s.id === 'disney'));
});

test('tonight options are bounded', () => {
  assert.deepEqual(parseTonightOptions(new URLSearchParams('minutes=120&mood=Comedy&servicesOnly=1')), { minutes: 120, mood: 'Comedy', servicesOnly: true });
  assert.deepEqual(parseTonightOptions(new URLSearchParams('minutes=5&mood=' + 'x'.repeat(60))), { minutes: null, mood: null, servicesOnly: false });
});

async function memberWithWatchlist() {
  const { user, token } = await register({ name: 'Tonight Fan', email: `tonight.${Date.now()}.${Math.random()}@example.com`, password: 'tonight-password-1' });
  const add = (id: string, t: Record<string, unknown>, status = 'watchlist', at = '2026-01-01T00:00:00.000Z') =>
    db().run('INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at) VALUES (?, ?, ?, ?, NULL, ?)', user.id, id, JSON.stringify({ id, mediaType: 'movie', poster: null, genres: [], ...t }), status, at);
  await add('movie-1', { title: 'Short Comedy', runtime: 88, genres: ['Comedy'], releaseDate: '2020-01-01', voteAverage: 7 });
  await add('movie-2', { title: 'Long Drama', runtime: 170, genres: ['Drama'], releaseDate: '2021-01-01', voteAverage: 8 });
  await add('movie-3', { title: 'Not Out Yet', runtime: 100, genres: ['Comedy'], releaseDate: '2099-01-01' });
  await add('movie-4', { title: 'Already Seen', runtime: 95, genres: ['Comedy'], releaseDate: '2019-01-01' }, 'watched');
  return { user: { ...user, region: 'IN' }, token };
}

const load = async (id: string) => (id === 'movie-1' ? providers([8, 'Netflix']) : providers());

test('saving services and checking the watchlist against them', async () => {
  const { user } = await memberWithWatchlist();
  assert.deepEqual(await getUserServices(user.id, 'IN'), []);
  assert.deepEqual(await watchlistAvailability(user, load), {}, 'no services, nothing to check');
  assert.deepEqual(await setUserServices(user, { services: ['netflix', 'hulu'] }), ['netflix']);
  await assert.rejects(() => setUserServices(user, { services: 'netflix' }), /must be a list/);
  assert.deepEqual(await watchlistAvailability(user, load), { 'movie-1': ['Netflix'] });
});

test('tonight\'s pick respects time, mood, release and services', async () => {
  const { user } = await memberWithWatchlist();
  const fixed = () => 0.5;
  let r = await tonightPick(user, {}, load, fixed);
  assert.equal(r.considered, 2, 'unreleased and watched titles are left out');
  assert.deepEqual(r.moods, ['Comedy', 'Drama']);

  r = await tonightPick(user, { minutes: 120 }, load, fixed);
  assert.equal(r.pick?.title.title, 'Short Comedy');
  assert.equal(r.alternates.length, 0);

  r = await tonightPick(user, { mood: 'Drama' }, load, fixed);
  assert.equal(r.pick?.title.title, 'Long Drama');

  r = await tonightPick(user, { servicesOnly: true }, load, fixed);
  assert.equal(r.pick, null);
  assert.match(r.message ?? '', /Choose your streaming services/);

  await setUserServices(user, { services: ['netflix'] });
  r = await tonightPick(user, { servicesOnly: true }, load, fixed);
  assert.equal(r.pick?.title.title, 'Short Comedy');
  assert.deepEqual(r.pick?.services, ['Netflix']);
  assert.ok(r.pick?.reasons.some((x) => /Streaming on your Netflix/.test(x)));

  r = await tonightPick(user, { minutes: 60 }, load, fixed);
  assert.equal(r.pick, null);
  assert.match(r.message ?? '', /Nothing on your watchlist fits/);
});

test('services and tonight APIs need sign-in', async () => {
  const route = await import('../app/api/[...path]/route');
  const { NextRequest } = await import('next/server');
  const call = (method: 'GET' | 'PUT', path: string, cookie?: string, payload?: unknown) => {
    const headers: Record<string, string> = { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000', 'content-type': 'application/json' };
    if (cookie) headers.cookie = cookie;
    const [p, q] = path.split('?');
    return route[method](new NextRequest(`http://127.0.0.1:3000/api/${p}${q ? `?${q}` : ''}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) }), { params: Promise.resolve({ path: p.split('/') }) });
  };
  assert.equal((await call('GET', 'services')).status, 401);
  assert.equal((await call('GET', 'tonight')).status, 401);
  const { token } = await memberWithWatchlist();
  const cookie = `cinepulse_session=${token}`;
  const list = await (await call('GET', 'services', cookie)).json();
  assert.ok(list.available.length >= 5);
  assert.deepEqual(list.selected, []);
  assert.deepEqual((await (await call('PUT', 'services', cookie, { services: ['netflix'] })).json()).selected, ['netflix']);
  const tonight = await (await call('GET', 'tonight?minutes=120', cookie)).json();
  assert.equal(tonight.pick.title.title, 'Short Comedy');
});
