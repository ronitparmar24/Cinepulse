import test from 'node:test';
import assert from 'node:assert/strict';

// A released film from a mocked TMDB response, so ratings are allowed.
process.env.CATALOG_MODE = 'tmdb';
process.env.TMDB_READ_TOKEN = 'half-star-mock-only';
const original = globalThis.fetch;
globalThis.fetch = (async () => new Response(JSON.stringify({ id: 4242, title: 'Half Star Film', release_date: '2000-01-01', genres: [], credits: { cast: [], crew: [] }, videos: { results: [] } }), { status: 200 })) as typeof fetch;
test.after(() => { globalThis.fetch = original; });

const { register } = await import('../lib/auth');
const { putLibrary, listLibrary } = await import('../lib/library');
const { putReview, titleReviews } = await import('../lib/reviews');

test('library and reviews store half-star ratings and reject other values', async () => {
  const { user } = await register({ name: 'Half Star', email: `half.${Date.now()}@example.com`, password: 'half-star-password' });
  await putLibrary(user, 'movie-4242', { status: 'watched', rating: 3.5 });
  const entry = (await listLibrary(user)).find((e) => e.title.id === 'movie-4242');
  assert.equal(entry?.rating, 3.5);

  await assert.rejects(() => putLibrary(user, 'movie-4242', { status: 'watched', rating: 3.3 }), (e: { status?: number }) => e.status === 400);
  await assert.rejects(() => putLibrary(user, 'movie-4242', { status: 'watched', rating: 6 }), (e: { status?: number }) => e.status === 400);

  await putReview(user, 'movie-4242', { body: 'Half a star short of perfect.', rating: 4.5, spoiler: false });
  const mine = (await titleReviews('movie-4242')).find((r) => r.userId === user.id);
  assert.equal(mine?.rating, 4.5);
});
