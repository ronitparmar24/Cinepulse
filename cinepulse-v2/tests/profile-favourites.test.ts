import test from 'node:test';
import assert from 'node:assert/strict';

// Demo catalog mode (the default): ids look like demo-<slug>.
const { NextRequest } = await import('next/server');
const { register } = await import('../lib/auth');
const { db } = await import('../lib/db');
const profile = await import('../lib/social/profile');
const { handleSocial } = await import('../lib/api/routes/social');

const status = (n: number) => (e: { status?: number }) => e.status === n;
const FOUR = ['demo-dunes', 'demo-neon', 'demo-orbit', 'demo-velvet'];

function caller(token: string | null) {
  return (method: string, path: string, payload?: unknown) => {
    const request = new NextRequest(`http://localhost/api/${path}`, {
      method,
      headers: { ...(token ? { cookie: `cinepulse_session=${token}` } : {}), ...(payload !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
    });
    return handleSocial({ request, parts: path.split('/'), method, query: request.nextUrl.searchParams });
  };
}

test('parseFavouriteIds: up to four distinct catalog ids, in order', () => {
  assert.deepEqual(profile.parseFavouriteIds(FOUR), FOUR);
  assert.deepEqual(profile.parseFavouriteIds([' demo-neon ', 'demo-neon', 'demo-dunes']), ['demo-neon', 'demo-dunes']);
  assert.deepEqual(profile.parseFavouriteIds([]), []);
  assert.throws(() => profile.parseFavouriteIds([...FOUR, 'demo-hollow']), status(400));
  assert.throws(() => profile.parseFavouriteIds(['movie-603']), status(400), 'a TMDB id is not in the demo catalog');
  assert.throws(() => profile.parseFavouriteIds(['demo-x', 42]), status(400));
  assert.throws(() => profile.parseFavouriteIds('demo-dunes'), status(400));
});

test('banner URLs: TMDB artwork or the app\'s demo artwork only', () => {
  for (const ok of ['https://image.tmdb.org/t/p/w1280/abcDEF_12-x.jpg', 'https://image.tmdb.org/t/p/original/a.png', '/assets/hero.webp']) {
    assert.equal(profile.isAllowedBannerUrl(ok), true, ok);
    assert.equal(profile.parseBannerUrl(ok), ok);
  }
  for (const bad of [
    'http://image.tmdb.org/t/p/w1280/a.jpg',
    'https://image.tmdb.org.evil.example/t/p/w1280/a.jpg',
    'https://evil.example/a.jpg',
    'https://image.tmdb.org/t/p/w1280/../a.jpg',
    'https://image.tmdb.org/t/p/w1280/a.jpg?x=1',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    '/assets/../secret.webp',
    '//evil.example/a.webp',
  ]) {
    assert.equal(profile.isAllowedBannerUrl(bad), false, bad);
    assert.throws(() => profile.parseBannerUrl(bad), status(400), bad);
  }
  assert.equal(profile.parseBannerUrl(null), null);
  assert.equal(profile.parseBannerUrl(''), null);
});

test('PUT /api/profile/favourites saves the four and resolves a title banner server-side', async () => {
  const stamp = Date.now();
  const { user, token } = await register({ name: 'Fav Owner', email: `fav.${stamp}@example.com`, password: 'fav-password-1' });
  const { user: viewer, token: viewerToken } = await register({ name: 'Fav Viewer', email: `fav-viewer.${stamp}@example.com`, password: 'fav-password-2' });
  const put = caller(token);

  await assert.rejects(() => caller(null)('PUT', 'profile/favourites', { titleIds: FOUR }), status(401));
  await assert.rejects(() => put('PUT', 'profile/favourites', { titleIds: [...FOUR, 'demo-hollow'] }), status(400));
  await assert.rejects(() => put('PUT', 'profile/favourites', { titleIds: ['demo-does-not-exist'] }), status(400));
  await assert.rejects(() => put('PUT', 'profile/favourites', { banner: 'https://evil.example/x.jpg' }), status(400));
  await assert.rejects(() => put('PUT', 'profile/favourites', {}), status(400));

  let res = (await put('PUT', 'profile/favourites', { titleIds: FOUR, banner: 'demo-dunes' }))!;
  assert.equal(res.status, 200);
  let body = await res.json();
  assert.deepEqual(body.favoriteFilms.map((f: { id: string }) => f.id), FOUR);
  assert.equal(body.bannerUrl, '/assets/hero.webp', 'the banner is the title\'s backdrop, looked up on the server');
  assert.ok(body.favoriteFilms.every((f: { title: string; poster: string | null }) => f.title && f.poster));

  // Another member sees the four (in order) and the banner on the public profile.
  const seen = await profile.getPublicProfile(user.id, viewer.id);
  assert.deepEqual(seen.profile!.favoriteFilms!.map((f: { id: string }) => f.id), FOUR);
  assert.equal(seen.profile!.bannerUrl, '/assets/hero.webp');
  const viaApi = await (await caller(viewerToken)('GET', `users/${user.id}`))!.json();
  assert.equal(viaApi.bannerUrl, '/assets/hero.webp');
  assert.equal(viaApi.favoriteFilms.length, 4);

  // Reorder + a TMDB-artwork banner; then only the banner changes (favourites kept); then clear.
  res = (await put('PUT', 'profile/favourites', { titleIds: ['demo-orbit', 'demo-dunes'], banner: 'https://image.tmdb.org/t/p/w1280/abc.jpg' }))!;
  body = await res.json();
  assert.deepEqual(body.favoriteFilms.map((f: { id: string }) => f.id), ['demo-orbit', 'demo-dunes']);
  assert.equal(body.bannerUrl, 'https://image.tmdb.org/t/p/w1280/abc.jpg');
  body = await (await put('PUT', 'profile/favourites', { banner: null }))!.json();
  assert.equal(body.bannerUrl, null);
  assert.equal(body.favoriteFilms.length, 2);

  // Private profiles: strangers get neither favourites nor banner; the owner still does.
  await put('PUT', 'profile/favourites', { banner: 'demo-neon' });
  await db().run("UPDATE users SET profile_visibility = 'private' WHERE id = ?", user.id);
  const stranger = await profile.getPublicProfile(user.id, viewer.id);
  assert.deepEqual(stranger.profile!.favoriteFilms, []);
  assert.equal(stranger.profile!.bannerUrl, undefined);
  const anonymous = await profile.getPublicProfile(user.id, null);
  assert.equal(anonymous.profile!.bannerUrl, undefined);
  const owner = await profile.getPublicProfile(user.id, user.id);
  assert.equal(owner.profile!.favoriteFilms!.length, 2);
  assert.equal(owner.profile!.bannerUrl, '/assets/neon.webp');
});

test('POST /api/profile validates favourites and banner too (no arbitrary URLs)', async () => {
  const { user, token } = await register({ name: 'Legacy', email: `fav-legacy.${Date.now()}@example.com`, password: 'fav-password-3' });
  const post = caller(token);
  let res = (await post('POST', 'profile', { bannerUrl: 'https://evil.example/x.png' }))!;
  assert.equal(res.status, 400);
  res = (await post('POST', 'profile', { favoriteTitleIds: [...FOUR, 'demo-hollow'] }))!;
  assert.equal(res.status, 400);
  res = (await post('POST', 'profile', { favoriteTitleIds: ['demo-hollow'], bannerUrl: '/assets/hollow.webp', bio: 'hi' }))!;
  assert.equal(res.status, 200);
  const row = await db().get<{ favorite_title_ids: string; banner_url: string; bio: string }>('SELECT favorite_title_ids, banner_url, bio FROM users WHERE id = ?', user.id);
  assert.deepEqual(JSON.parse(row!.favorite_title_ids), ['demo-hollow']);
  assert.equal(row!.banner_url, '/assets/hollow.webp');
  assert.equal(row!.bio, 'hi');
  // A stored banner that is no longer allowed is never echoed back.
  await db().run("UPDATE users SET banner_url = 'https://evil.example/x.png' WHERE id = ?", user.id);
  assert.equal((await profile.getPublicProfile(user.id, null)).profile!.bannerUrl, null);
});
