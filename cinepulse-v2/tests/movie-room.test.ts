import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../lib/auth';
import { db } from '../lib/db';
import { createRoom, getRoom, joinRoom, partyClock, roomAction, scoreRoom, type RoomDeps } from '../lib/movieRoom';
import type { Title } from '../lib/types';

const t = (id: string, over: Partial<Title> = {}): Title => ({
  id, title: `Film ${id}`, mediaType: 'movie', poster: null, backdrop: null, releaseDate: '2024-01-01', genres: ['Drama'], runtime: 110,
  overview: '', tagline: '', source: 'tmdb', seasons: null, status: 'released', voteAverage: 7, voteCount: 10, popularity: 1, cast: [], trailerKey: null, director: null, budget: null, revenue: null, ...over,
} as Title);

const trending = [t('movie-1'), t('movie-2'), t('movie-3', { runtime: 200 }), t('movie-4', { releaseDate: '2099-01-01' }), t('movie-5'), t('movie-6'), t('movie-7'), t('movie-8')];
const deps: RoomDeps = {
  loadTitle: async (id) => (id === 'movie-90' ? t(id, { releaseDate: '2099-05-05', title: 'Future Film' }) : t(id, { title: `Pitched ${id}` })),
  trending: async () => trending,
  watchlist: async () => [t('movie-50', { title: 'From My List' })],
  services: async () => ['netflix'],
  providers: async () => ({ flatrate: [{ providerId: 8, providerName: 'Netflix', logoPath: '' }], rent: [], buy: [], link: 'https://www.themoviedb.org/movie/1/watch', region: 'IN' }),
};

test('scoring: yes=2, maybe=1, vetoes drop out, ties broken by yes then no', () => {
  const votes = { a: { x: 'yes', y: 'maybe', z: 'yes' }, b: { x: 'maybe', y: 'yes', z: 'yes' } } as const;
  let r = scoreRoom(['x', 'y', 'z'], votes as any, {}, 'ROOM');
  assert.equal(r[0].titleId, 'z');
  assert.deepEqual(r.map((x) => x.score), [4, 3, 3]);
  r = scoreRoom(['x', 'y', 'z'], votes as any, { a: 'z' }, 'ROOM');
  assert.equal(r[0].titleId, 'x', 'vetoed film drops below the rest');
  assert.equal(r[2].vetoed, true);
  r = scoreRoom(['x', 'y'], votes as any, { a: 'x', b: 'y' }, 'ROOM');
  assert.equal(r[0].titleId, 'x', 'if everything is vetoed, scores decide');
});

test('party clock: scheduled, playing, paused and resuming', () => {
  const start = Date.parse('2026-11-26T20:00:00Z');
  const party = { titleId: 'x', startAt: new Date(start).toISOString(), runningSince: new Date(start).toISOString(), state: 'scheduled' as const, elapsedMs: 0, pausedBy: null };
  assert.deepEqual(partyClock(party, start - 30_000), { state: 'scheduled', elapsedMs: 0, startsInMs: 30_000 });
  assert.equal(partyClock(party, start + 90_000)!.state, 'playing');
  assert.equal(partyClock(party, start + 90_000)!.elapsedMs, 90_000);
  assert.deepEqual(partyClock({ ...party, state: 'paused', elapsedMs: 600_000 }, start + 999_999), { state: 'paused', elapsedMs: 600_000, startsInMs: 0 });
  const resuming = { ...party, state: 'playing' as const, elapsedMs: 600_000, runningSince: new Date(start + 700_000).toISOString() };
  assert.equal(partyClock(resuming, start + 697_000)!.state, 'paused', 'in the 5-second resume countdown');
  assert.equal(partyClock(resuming, start + 710_000)!.elapsedMs, 610_000);
});

test('a full movie night: lobby, pitches, private votes, reveal, synced party', async () => {
  const { room, token: host } = await createRoom(null, { name: 'Friday', yourName: 'Asha', maxRuntime: 150 }, deps);
  assert.match(room.code, /^[A-Z2-9]{6}$/);
  assert.equal(room.phase, 'lobby');
  assert.equal(room.you?.isHost, true);
  const ids = room.candidates.map((c) => c.id);
  assert.ok(!ids.includes('movie-3'), 'too long for the runtime limit');
  assert.ok(!ids.includes('movie-4'), 'unreleased films are never offered');
  assert.equal(ids.length, 6);

  const g1 = await joinRoom(room.code, null, { name: 'Ravi' }, deps);
  const g2 = await joinRoom(room.code.toLowerCase(), null, { name: '' }, deps);
  assert.equal(g2.room.members.length, 3);
  assert.equal(g2.room.members[2].name, 'Guest 3');

  // Only members can act, and only the host can run the night.
  await assert.rejects(() => roomAction(room.code, null, 'start-voting', {}, deps), /Join this room first/);
  await assert.rejects(() => roomAction(room.code, 'not-a-token', 'start-voting', {}, deps), /Join this room first/);
  await assert.rejects(() => roomAction(room.code, g1.token, 'start-voting', {}, deps), /Only the host/);

  await assert.rejects(() => roomAction(room.code, g1.token, 'pitch', { titleId: 'movie-90' }, deps), /isn’t out yet/);
  let r = await roomAction(room.code, g1.token, 'pitch', { titleId: 'movie-77' }, deps);
  assert.ok(r.candidates.some((c) => c.id === 'movie-77' && c.source === 'pitch' && c.addedBy === 'Ravi'));
  await assert.rejects(() => roomAction(room.code, g2.token, 'pitch', { titleId: 'movie-77' }, deps), /already on the shortlist/);
  await roomAction(room.code, g1.token, 'pitch', { titleId: 'movie-78' }, deps);
  await assert.rejects(() => roomAction(room.code, g1.token, 'pitch', { titleId: 'movie-79' }, deps), /up to 2/);
  await assert.rejects(() => roomAction(room.code, g2.token, 'remove', { titleId: 'movie-77' }, deps), /Only the host or whoever added it/);
  r = await roomAction(room.code, host, 'remove', { titleId: 'movie-78' }, deps);
  assert.equal(r.candidates.length, 7);

  await assert.rejects(() => roomAction(room.code, g1.token, 'vote', { titleId: 'movie-1', choice: 'yes' }, deps), /isn’t possible at this stage/);
  await roomAction(room.code, host, 'start-voting', {}, deps);

  // Three phones vote at the same time: nothing is lost.
  const all = r.candidates.map((c) => c.id);
  const voteAll = (tok: string, pick: string) => Promise.all(all.map((id) => roomAction(room.code, tok, 'vote', { titleId: id, choice: id === pick ? 'yes' : 'no' }, deps)));
  await Promise.all([voteAll(host, 'movie-77'), voteAll(g1.token, 'movie-77'), voteAll(g2.token, 'movie-2')]);
  await roomAction(room.code, g2.token, 'veto', { titleId: 'movie-1' }, deps);

  const asGuest = await getRoom(room.code, g1.token) as any;
  assert.ok(asGuest.members.every((m: any) => m.voted), 'everyone finished');
  assert.equal(asGuest.result, null, 'no totals before the reveal');
  assert.equal(JSON.stringify(asGuest).includes('tokenHash'), false, 'token hashes never leave the server');
  assert.deepEqual(Object.keys(asGuest.you.votes).length, all.length, 'you see your own votes');
  assert.equal('votes' in asGuest, false, 'nobody sees anyone else’s ballot');

  await assert.rejects(() => roomAction(room.code, g1.token, 'reveal', {}, deps), /Only the host/);
  r = await roomAction(room.code, host, 'reveal', {}, deps);
  assert.equal(r.phase, 'reveal');
  assert.equal(r.result!.winnerId, 'movie-77');
  assert.deepEqual(r.result!.watch!.groupServices, [], 'guests have no saved services');
  assert.equal(r.result!.watch!.providers[0].name, 'Netflix');

  await assert.rejects(() => roomAction(room.code, host, 'party', { startInSeconds: 1 }, deps), /between 5 seconds and 12 hours/);
  r = await roomAction(room.code, host, 'party', { startInSeconds: 60 }, deps);
  assert.equal(r.phase, 'party');
  assert.equal(r.party!.clock!.state, 'scheduled');
  await assert.rejects(() => roomAction(room.code, g1.token, 'pause', {}, deps), /isn’t playing yet/);

  // Move the start into the past to simulate the film playing.
  const row = await db().get('SELECT data FROM movie_rooms WHERE code = ?', room.code) as { data: string };
  const data = JSON.parse(row.data);
  data.party.startAt = data.party.runningSince = new Date(Date.now() - 120_000).toISOString();
  await db().run('UPDATE movie_rooms SET data = ? WHERE code = ?', JSON.stringify(data), room.code);

  r = await roomAction(room.code, g2.token, 'pause', {}, deps);
  assert.equal(r.party!.state, 'paused');
  assert.equal(r.party!.pausedBy, 'Guest 3');
  assert.ok(r.party!.elapsedMs >= 119_000 && r.party!.elapsedMs < 125_000);
  r = await roomAction(room.code, g1.token, 'resume', {}, deps);
  assert.ok(Date.parse(r.party!.runningSince) > Date.now() + 3_000, 'everyone gets a 5-second countdown');

  r = await roomAction(room.code, g1.token, 'react', { emoji: '🍿' }, deps);
  assert.equal(r.feed.at(-1)!.emoji, '🍿');
  await assert.rejects(() => roomAction(room.code, g1.token, 'react', { emoji: '🍿' }, deps), /one reaction at a time/);
  await assert.rejects(() => roomAction(room.code, g2.token, 'react', { emoji: '<script>' }, deps), /Unknown reaction/);

  await assert.rejects(() => roomAction(room.code, g1.token, 'end', {}, deps), /Only the host/);
  r = await roomAction(room.code, host, 'end', {}, deps);
  assert.equal(r.phase, 'ended');
  await assert.rejects(() => joinRoom(room.code, null, { name: 'Late' }, deps), /has ended/);
});

test('signed-in members bring their watchlist and services; rejoining keeps the same seat', async () => {
  const { user } = await register({ name: 'Mira Kapoor', email: `mira.${Date.now()}@example.com`, password: 'room-password-1' });
  const { room, token } = await createRoom(user, { name: 'Mira’s night' }, deps);
  assert.equal(room.candidates[0].id, 'movie-50');
  assert.equal(room.candidates[0].source, 'watchlist');
  assert.equal(room.members[0].name, 'Mira Kapoor');
  const again = await joinRoom(room.code, user, {}, deps);
  assert.equal(again.room.members.length, 1, 'same account, same seat');
  assert.notEqual(again.token, token);
  await assert.rejects(() => roomAction(room.code, token, 'start-voting', {}, deps), /Join this room first/, 'the old device token is replaced');
  await roomAction(room.code, again.token, 'start-voting', {}, deps);
  await roomAction(room.code, again.token, 'vote', { titleId: 'movie-50', choice: 'yes' }, deps);
  const revealed = await roomAction(room.code, again.token, 'reveal', {}, deps);
  assert.deepEqual(revealed.result!.watch!.groupServices, ['Netflix'], 'matched against members’ saved services');
});

test('room API: create, join by link, cheap polling, and unknown rooms', async () => {
  const route = await import('../app/api/[...path]/route');
  const { NextRequest } = await import('next/server');
  const call = async (method: 'GET' | 'POST', path: string, token?: string, payload?: unknown) => {
    const headers: Record<string, string> = { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000', 'content-type': 'application/json' };
    if (token) headers['x-room-token'] = token;
    const [p, q] = path.split('?');
    const res = await route[method](new NextRequest(`http://127.0.0.1:3000/api/${p}${q ? `?${q}` : ''}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) }), { params: Promise.resolve({ path: p.split('/') }) });
    return { status: res.status, body: await res.json() };
  };
  const created = await call('POST', 'movie-night/rooms', undefined, { name: 'API night', yourName: 'Host' });
  assert.equal(created.status, 200);
  const code = created.body.room.code;
  const viewer = await call('GET', `movie-night/rooms/${code}`);
  assert.equal(viewer.body.you, null, 'a visitor with the link sees the room but is not a member');
  const unchanged = await call('GET', `movie-night/rooms/${code}?v=${viewer.body.version}`);
  assert.equal(unchanged.body.unchanged, true);
  const joined = await call('POST', `movie-night/rooms/${code}/join`, undefined, { name: 'Friend' });
  assert.equal(joined.body.room.you.isHost, false);
  const after = await call('GET', `movie-night/rooms/${code}?v=${viewer.body.version}`);
  assert.equal(after.body.members.length, 2, 'a change returns the full room');
  assert.equal((await call('GET', 'movie-night/rooms/ZZZZZZ')).status, 404);
  assert.equal((await call('POST', `movie-night/rooms/${code}/start-voting`, joined.body.token, {})).status, 403);
});

test('fictional demo titles count as watchable so demo mode works', async () => {
  const demoDeps: RoomDeps = { ...deps, trending: async () => [t('demo-a', { source: 'demo', releaseDate: '2099-01-01' }), t('demo-b', { source: 'demo', releaseDate: '2099-02-01' })] };
  const { room } = await createRoom(null, { name: 'Demo' }, demoDeps);
  assert.deepEqual(room.candidates.map((c) => c.id), ['demo-a', 'demo-b']);
});
