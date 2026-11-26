import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { register } from '../lib/auth';
import { db } from '../lib/db';
import { parseFormat, renderShareCard, reviewSubject, watchedSubject } from '../lib/shareCards';
import { applyCachePolicy } from '../lib/api/cachePolicy';

let n = 0;
const member = async () => (await register({ name: `Sharer ${++n}`, email: `share.${Date.now()}.${n}@example.com`, password: 'share-password-1' }));
const addReview = async (userId: string, over: { spoiler?: boolean; hidden?: boolean } = {}) => {
  const id = randomUUID();
  await db().run(`INSERT INTO reviews (id, user_id, title_id, title_name, body, rating, spoiler, kind, created_at, hidden_at) VALUES (?, ?, 'demo-dunes', 'Beyond the Dunes', 'A gorgeous, patient desert epic.', 4.5, ?, 'review', ?, ?)`,
    id, userId, over.spoiler ? 1 : 0, new Date().toISOString(), over.hidden ? new Date().toISOString() : null);
  return id;
};

test('formats', () => {
  assert.equal(parseFormat('square'), 'square');
  assert.equal(parseFormat('og'), 'og');
  assert.equal(parseFormat('<script>'), 'story');
  assert.equal(parseFormat(null), 'story');
});

test('review cards follow privacy and moderation', async () => {
  const { user: author } = await member();
  const { user: stranger } = await member();
  const id = await addReview(author.id);
  const pub = await reviewSubject(id, null);
  assert.equal(pub.isPublic, true);
  assert.equal(pub.rating, 4.5);

  await db().run(`INSERT INTO privacy_settings (user_id, reviews_visibility) VALUES (?, 'private') ON CONFLICT(user_id) DO UPDATE SET reviews_visibility = 'private'`, author.id);
  await assert.rejects(() => reviewSubject(id, null), /not found/i, 'private reviews have no public card');
  await assert.rejects(() => reviewSubject(id, stranger.id), /not found/i);
  const own = await reviewSubject(id, author.id);
  assert.equal(own.isPublic, false, 'the author can still make a card, but it is never cached publicly');

  const hidden = await addReview(stranger.id, { hidden: true });
  await assert.rejects(() => reviewSubject(hidden, null), /not found/i, 'moderator-hidden reviews cannot be shared');
  await assert.rejects(() => reviewSubject('nope', null), /not found/i);
});

test('cards render as PNG with the right size and cache headers; spoilers stay off the image', async () => {
  const { user } = await member();
  const id = await addReview(user.id, { spoiler: true });
  const s = await reviewSubject(id, null);
  assert.equal(s.spoiler, true);
  for (const [format, w, h] of [['story', 1080, 1920], ['square', 1080, 1350], ['og', 1200, 630]] as const) {
    const res = await renderShareCard({ ...s, poster: null, backdrop: null }, format, 'https://cinepulse.app');
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.match(res.headers.get('cache-control') ?? '', /public, max-age=3600, s-maxage=86400/);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.readUInt32BE(16), w);
    assert.equal(buf.readUInt32BE(20), h);
  }
  const priv = await renderShareCard({ ...s, poster: null, backdrop: null, isPublic: false }, 'story', 'https://cinepulse.app');
  assert.equal(priv.headers.get('cache-control'), 'private, no-store');
});

test('watched cards are only for your own watched titles', async () => {
  const { user } = await member();
  await assert.rejects(() => watchedSubject(user.id, 'demo-dunes'), /Mark this title as watched/);
  await db().run(`INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at) VALUES (?, 'demo-dunes', '{"title":"Beyond the Dunes","releaseDate":"2027-11-19"}', 'watched', 4, ?)`, user.id, new Date().toISOString());
  const s = await watchedSubject(user.id, 'demo-dunes');
  assert.equal(s.kind, 'watched');
  assert.equal(s.isPublic, false);
  assert.equal(s.year, '2027');
});

test('share API: public card, private 404, watched needs sign-in, rate limited', async () => {
  const route = await import('../app/api/[...path]/route');
  const { NextRequest } = await import('next/server');
  const call = (path: string, cookie?: string) => {
    const headers: Record<string, string> = { host: '127.0.0.1:3000' };
    if (cookie) headers.cookie = cookie;
    const [p, q] = path.split('?');
    return route.GET(new NextRequest(`http://127.0.0.1:3000/api/${p}${q ? `?${q}` : ''}`, { headers }), { params: Promise.resolve({ path: p.split('/') }) });
  };
  const { user, token } = await member();
  const id = await addReview(user.id);
  const res = await call(`share/review/${id}?format=og`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal((await call('share/watched/demo-dunes')).status, 401);
  assert.equal((await call('share/watched/demo-dunes', `cinepulse_session=${token}`)).status, 404);
  assert.equal((await call('share/review/missing-id')).status, 404);
});

test('cache policy: catalog is cached at the edge, personal responses never are', () => {
  const mk = (headers: Record<string, string> = {}) => new Response('{}', { status: 200, headers });
  let r = mk(); applyCachePolicy(r, 'GET', 'catalog');
  assert.match(r.headers.get('cache-control')!, /^public, .*s-maxage=600/);
  r = mk(); applyCachePolicy(r, 'GET', 'library');
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
  assert.equal(r.headers.get('vary'), 'Cookie');
  r = mk(); applyCachePolicy(r, 'POST', 'catalog');
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
  r = mk({ 'set-cookie': 'a=b' }); applyCachePolicy(r, 'GET', 'catalog');
  assert.equal(r.headers.get('cache-control'), 'private, no-store', 'never cache a response that sets a cookie');
  r = mk({ 'cache-control': 'public, max-age=5' }); applyCachePolicy(r, 'GET', 'library');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=5', 'handler choices are kept');
  const err = new Response('{}', { status: 500 }); applyCachePolicy(err, 'GET', 'catalog');
  assert.equal(err.headers.get('cache-control'), 'private, no-store', 'errors are never cached');
});

test('public review page: rich link preview for public reviews, nothing for private ones', async () => {
  const page = await import('../app/r/[id]/page');
  const { user } = await member();
  const id = await addReview(user.id);
  const meta = await page.generateMetadata({ params: Promise.resolve({ id }) });
  assert.match(String(meta.title), /review of Beyond the Dunes/);
  const og = (meta.openGraph as any).images[0];
  assert.ok(og.url.includes(`/api/share/review/${id}?format=og&v=`), og.url);
  assert.equal(og.width, 1200);
  assert.equal((meta.twitter as any).card, 'summary_large_image');
  const missing = await page.generateMetadata({ params: Promise.resolve({ id: '../../etc' }) });
  assert.match(String(missing.title), /not found/i);
  assert.deepEqual(missing.robots, { index: false });
});
