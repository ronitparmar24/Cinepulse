/**
 * Public profile: the "Show prediction summary on my profile" toggle (schema v26) and the
 * shareable profile card (GET /api/share/profile/:username).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { register } from '../lib/auth';
import { db, CURRENT_SCHEMA_VERSION } from '../lib/db';
import { getPublicProfile } from '../lib/social/profile';
import { profileSubject, renderProfileCard, type ProfileShareSubject } from '../lib/shareCards';
import { isFetchableAvatar } from '../lib/ogAssets';

let n = 0;
const member = async () => register({ name: `Profile Sharer ${++n}`, email: `profile.share.${Date.now()}.${n}@example.com`, password: 'profile-password-1' });
const usernameOf = async (id: string) => String((await db().get<{ username: string }>('SELECT username FROM users WHERE id = ?', id))!.username);

/** A resolved forecast, so the member has a Brier score and a hit rate. */
async function addResolvedCall(userId: string) {
  await db().run(
    `INSERT INTO forecast_events (id, user_id, title_id, choice, confidence, reason, created_at, first_submission, release_date)
     VALUES (?, ?, 'demo-dunes', 'flop', 70, 'Too slow for crowds', ?, 1, '2020-01-10')`,
    randomUUID(), userId, new Date('2020-01-01').toISOString(),
  );
}

const route = async () => import('../app/api/[...path]/route');
async function call(method: 'GET' | 'PUT', path: string, cookie?: string, payload?: unknown) {
  const r = await route();
  const { NextRequest } = await import('next/server');
  const headers: Record<string, string> = { host: '127.0.0.1:3000' };
  if (cookie) headers.cookie = cookie;
  if (method !== 'GET') { headers.origin = 'http://127.0.0.1:3000'; headers['content-type'] = 'application/json'; }
  const [p, q] = path.split('?');
  const req = new NextRequest(`http://127.0.0.1:3000/api/${p}${q ? `?${q}` : ''}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const ctx = { params: Promise.resolve({ path: p.split('/') }) };
  return method === 'GET' ? r.GET(req, ctx) : r.PUT(req, ctx);
}

const pngSize = (buf: Buffer) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

// fetch is stubbed for the whole file (offline by default: no fonts, stub art), so the tests are
// deterministic, never touch the network, and the font cache starts empty for the no-fonts run.
const FONT = readFileSync(join(process.cwd(), 'node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf'));
const PNG = readFileSync(join(process.cwd(), 'public/icons/icon-192.png'));
const realFetch = globalThis.fetch;
function stubFetch(opts: { fonts: boolean }) {
  const seen: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push(url);
    const host = new URL(url).hostname;
    if (host === 'fonts.googleapis.com') {
      if (!opts.fonts) throw new Error('offline');
      return new Response('@font-face { font-weight: 500; src: url(https://fonts.gstatic.com/m500.ttf) } @font-face { font-weight: 800; src: url(https://fonts.gstatic.com/m800.ttf) }');
    }
    if (host === 'fonts.gstatic.com') return new Response(FONT, { headers: { 'content-type': 'font/ttf' } });
    if (host === 'image.tmdb.org' || host === 'lh3.googleusercontent.com') return new Response(PNG, { headers: { 'content-type': 'image/png' } });
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return seen;
}
stubFetch({ fonts: false });
test.after(() => { globalThis.fetch = realFetch; });

test('schema v26 adds the prediction summary toggle, on by default', async () => {
  assert.equal(CURRENT_SCHEMA_VERSION >= 26, true);
  const { user } = await member();
  const row = await db().get<{ show_prediction_summary: number }>('SELECT show_prediction_summary FROM users WHERE id = ?', user.id);
  assert.equal(Number(row?.show_prediction_summary), 1);
});

test('toggle off hides the prediction summary from others (profile and predictions), never from the owner', async () => {
  const { user: owner, token: ownerToken } = await member();
  const { user: other, token: otherToken } = await member();
  await addResolvedCall(owner.id);
  const handle = await usernameOf(owner.id);

  // On by default: everyone gets the numbers.
  let seen = (await getPublicProfile(handle, other.id)).profile!;
  assert.equal(seen.showPredictionSummary, true);
  assert.equal(seen.stats.hitRate, 100);
  assert.notEqual(seen.stats.brierScore, null);

  // Turn it off through the API (owner only).
  assert.equal((await call('PUT', 'profile/prediction-summary', undefined, { show: false })).status, 401);
  assert.equal((await call('PUT', 'profile/prediction-summary', `cinepulse_session=${ownerToken}`, { show: 'no' })).status, 400);
  const put = await call('PUT', 'profile/prediction-summary', `cinepulse_session=${ownerToken}`, { show: false });
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { show: false });
  assert.deepEqual(await (await call('GET', 'profile/prediction-summary', `cinepulse_session=${ownerToken}`)).json(), { show: false });

  // Others (signed in or not): no summary numbers at all.
  for (const viewer of [other.id, null]) {
    seen = (await getPublicProfile(handle, viewer)).profile!;
    assert.equal(seen.showPredictionSummary, false);
    assert.equal(seen.stats.brierScore, null);
    assert.equal(seen.stats.hitRate, null);
    assert.equal(seen.stats.accuracyRate, null);
    assert.equal(seen.stats.totalPredictions, undefined);
    assert.equal(seen.stats.totalFilmsWatched, 0, 'other stats are untouched');
  }
  const viaApi = await (await call('GET', `users/${handle}`, `cinepulse_session=${otherToken}`)).json();
  assert.equal(viaApi.stats.hitRate, null);
  assert.equal(viaApi.stats.brierScore, null);
  assert.equal('totalPredictions' in viaApi.stats, false);
  const preds = await (await call('GET', `users/${handle}/predictions`, `cinepulse_session=${otherToken}`)).json();
  assert.equal(preds.summaryHidden, true);
  assert.equal('hitRate' in preds, false);
  assert.equal('brierScore' in preds, false);
  assert.equal(preds.calls.length, 1, 'the calls themselves still follow predictions visibility');

  // The owner still sees everything.
  const mine = (await getPublicProfile(handle, owner.id)).profile!;
  assert.equal(mine.showPredictionSummary, false);
  assert.equal(mine.stats.hitRate, 100);
  assert.notEqual(mine.stats.brierScore, null);
  const myPreds = await (await call('GET', `users/${handle}/predictions`, `cinepulse_session=${ownerToken}`)).json();
  assert.equal(myPreds.hitRate, 100);
  assert.equal(myPreds.summaryHidden, undefined);

  // The share card leaves the hit rate off too.
  assert.equal((await profileSubject(handle, null)).hitRate, null);
  await call('PUT', 'profile/prediction-summary', `cinepulse_session=${ownerToken}`, { show: true });
  assert.equal((await profileSubject(handle, null)).hitRate, 100);
});

test('profile card subject follows profile privacy; private profiles 404 for others', async () => {
  const { user: owner, token: ownerToken } = await member();
  const { user: stranger, token: strangerToken } = await member();
  const handle = await usernameOf(owner.id);

  const pub = await call('GET', `share/profile/${handle}?format=og&v=1`);
  assert.equal(pub.status, 200);
  assert.equal(pub.headers.get('content-type'), 'image/png');
  assert.match(pub.headers.get('cache-control') ?? '', /public, max-age=3600, s-maxage=86400/);
  assert.deepEqual(pngSize(Buffer.from(await pub.arrayBuffer())), [1200, 630]);

  await db().run("UPDATE users SET profile_visibility = 'private' WHERE id = ?", owner.id);
  assert.equal((await call('GET', `share/profile/${handle}?format=story`)).status, 404, 'anonymous');
  assert.equal((await call('GET', `share/profile/${handle}?format=story`, `cinepulse_session=${strangerToken}`)).status, 404, 'signed-in stranger');
  await assert.rejects(() => profileSubject(handle, stranger.id), /not found/i);
  const own = await call('GET', `share/profile/${handle}?format=square`, `cinepulse_session=${ownerToken}`);
  assert.equal(own.status, 200, 'the owner can still make a card');
  assert.equal(own.headers.get('cache-control'), 'private, max-age=300', 'but it is never cached publicly');
  assert.equal((await call('GET', 'share/profile/no-such-member-here')).status, 404);
});

test('link previews: public profiles unfurl into the card, private ones show nothing', async () => {
  const layout = await import('../app/u/[username]/layout');
  const { user } = await member();
  const handle = await usernameOf(user.id);
  const meta = await layout.generateMetadata({ params: Promise.resolve({ username: handle }) });
  const og = (meta.openGraph as any).images[0];
  assert.ok(og.url.includes(`/api/share/profile/${handle}?format=og&v=`), og.url);
  assert.equal(og.width, 1200);
  assert.equal((meta.twitter as any).card, 'summary_large_image');
  await db().run("UPDATE users SET profile_visibility = 'private' WHERE id = ?", user.id);
  const hidden = await layout.generateMetadata({ params: Promise.resolve({ username: handle }) });
  assert.equal(hidden.openGraph, undefined);
  assert.deepEqual(hidden.robots, { index: false });
});

test('avatars are only fetched from known https hosts', () => {
  assert.equal(isFetchableAvatar('https://lh3.googleusercontent.com/a/abc=s96-c'), true);
  assert.equal(isFetchableAvatar('http://lh3.googleusercontent.com/a/abc'), false);
  assert.equal(isFetchableAvatar('https://evil.example.com/a.png'), false);
  assert.equal(isFetchableAvatar('https://lh3.googleusercontent.com.evil.com/a.png'), false);
  assert.equal(isFetchableAvatar('https://lh3.googleusercontent.com:8443/a.png'), false);
  assert.equal(isFetchableAvatar(null), false);
});

// ── Rendering ────────────────────────────────────────────────────────────────────
const base: ProfileShareSubject = {
  username: 'reel.rey', name: 'Rey Cinephile', avatarUrl: null, bannerUrl: null, favourites: [],
  films: 1284, reviews: 96, followers: 12500, topGenres: [], hitRate: null, joined: '2024-03-02T10:00:00Z', isPublic: true,
};
const full: ProfileShareSubject = {
  ...base,
  avatarUrl: 'https://lh3.googleusercontent.com/a/test=s96-c',
  bannerUrl: 'https://image.tmdb.org/t/p/w1280/banner.jpg',
  favourites: [
    { title: 'Beyond the Dunes', poster: 'https://image.tmdb.org/t/p/w500/a.jpg' },
    { title: 'A Very Long Film Title That Has No Poster At All', poster: null },
    { title: 'Night Harbour', poster: 'https://image.tmdb.org/t/p/w500/c.jpg' },
    { title: 'Paper Moons', poster: 'https://image.tmdb.org/t/p/w500/d.jpg' },
  ],
  topGenres: ['Science Fiction', 'Drama', 'Thriller'],
  hitRate: 72,
};

test('profile card renders a PNG of the right size for every format, with and without avatar, favourites and fonts', async () => {
  for (const fonts of [false, true]) {
    const seen = stubFetch({ fonts });
    for (const subject of [base, full, { ...full, favourites: full.favourites.slice(0, 2), avatarUrl: 'https://evil.example.com/me.png' }]) {
      for (const [format, w, h] of [['story', 1080, 1920], ['square', 1080, 1350], ['og', 1200, 630]] as const) {
        const res = await renderProfileCard(subject, format, 'https://cinepulse.app');
        assert.equal(res.headers.get('content-type'), 'image/png');
        const buf = Buffer.from(await res.arrayBuffer());
        assert.deepEqual(pngSize(buf), [w, h], `${format} fonts=${fonts} favs=${subject.favourites.length}`);
      }
    }
    assert.equal(seen.some((u) => u.includes('evil.example.com')), false, 'unknown avatar hosts are never fetched');
  }
  const priv = await renderProfileCard({ ...base, isPublic: false }, 'story', 'https://cinepulse.app');
  assert.equal(priv.headers.get('cache-control'), 'private, max-age=300');
});
