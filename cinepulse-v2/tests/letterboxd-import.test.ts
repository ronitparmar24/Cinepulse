import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CATALOG_MODE = 'tmdb';
process.env.TMDB_READ_TOKEN = 'letterboxd-mock-only';
const FILMS: Record<number, { title: string; release_date: string }> = {
  949: { title: 'Heat', release_date: '1995-12-15' },
  950: { title: 'Heat', release_date: '1986-03-14' },
  348: { title: 'Alien', release_date: '1979-05-25' },
  777: { title: 'Paris, Texas', release_date: '1984-08-23' },
  9999: { title: 'Future Film', release_date: '2099-01-01' },
};
const original = globalThis.fetch;
globalThis.fetch = (async (url: string | URL) => {
  const u = new URL(String(url));
  if (u.pathname.includes('/genre/')) return Response.json({ genres: [] });
  if (u.pathname.endsWith('/search/movie')) {
    const q = (u.searchParams.get('query') || '').toLowerCase();
    const results = Object.entries(FILMS).filter(([, f]) => f.title.toLowerCase().replace(/[^a-z ]/g, '').includes(q.replace(/[^a-z ]/g, '')))
      .map(([id, f]) => ({ id: Number(id), ...f, genre_ids: [] }));
    return Response.json({ results, total_pages: 1, total_results: results.length });
  }
  const id = Number(/\/movie\/(\d+)/.exec(u.pathname)?.[1]);
  const f = FILMS[id];
  if (!f) return Response.json({ status_message: 'not found' }, { status: 404 });
  return Response.json({ id, ...f, genres: [], credits: { cast: [], crew: [] }, videos: { results: [] } });
}) as typeof fetch;
test.after(() => { globalThis.fetch = original; });

const { register } = await import('../lib/auth');
const lb = await import('../lib/import/letterboxd');
const { parseLetterboxdExport } = await import('../lib/import/letterboxd-parse');
const { parseCsvObjects } = await import('../lib/import/csv');
const { putReview } = await import('../lib/reviews');
const { putLibrary, listLibrary } = await import('../lib/library');
const { db } = await import('../lib/db');

test('title matching: normalisation, year disambiguation, guesses and misses', async () => {
  assert.equal(lb.normaliseTitle('Amélie & The Café!'), 'amelie and the cafe');
  assert.equal(lb.normaliseTitle('The Thing'), lb.normaliseTitle('Thing'));
  const [heat95, heat86, paris, nope] = await lb.matchFilms([
    { key: 'Heat|1995', name: 'Heat', year: 1995 },
    { key: 'Heat|1986', name: 'Heat', year: 1986 },
    { key: 'Paris Texas|1984', name: 'Paris Texas', year: 1984 },
    { key: 'Nothing|2001', name: 'Nothing Like It', year: 2001 },
  ]);
  assert.equal(heat95.match?.titleId, 'movie-949');
  assert.equal(heat86.match?.titleId, 'movie-950', 'the year picks between same-name films');
  assert.equal(paris.match?.confidence, 'exact', 'punctuation differences still match exactly');
  assert.equal(nope.match, null);
  assert.throws(() => lb.parseFilmQueries([]), /films must be/);
  assert.throws(() => lb.parseFilmQueries(Array.from({ length: lb.MATCH_BATCH + 1 }, (_, i) => ({ key: String(i), name: 'x' }))), /films must be/);
});

test('commit writes diary, library, likes and reviews; a second run changes nothing', async () => {
  const { user } = await register({ name: 'Importer', email: `lb.${Date.now()}@example.com`, password: 'import-password-1' });
  // Already on CinePulse: a rating for Alien and a review of Heat — the import must not overwrite either.
  await putLibrary(user, 'movie-348', { status: 'watched', rating: 2 });
  await putReview(user, 'movie-949', { body: 'My own CinePulse review.', spoiler: false, rating: 3 });

  const items = [
    { titleId: 'movie-949', actions: [
      { kind: 'diary', watchedOn: '2026-01-02', rating: 4.5, rewatch: true, tags: ['cinema', '35mm'], review: 'The bank scene, still.' },
      { kind: 'diary', watchedOn: '2020-06-01', rating: 4 },
      { kind: 'rating', rating: 4.5 },
      { kind: 'like' },
    ] },
    { titleId: 'movie-348', actions: [{ kind: 'diary', watchedOn: '2026-02-01', rating: 5 }] },
    { titleId: 'movie-777', actions: [{ kind: 'review', review: 'Quiet devastation.' }, { kind: 'rating', rating: 5 }] },
    { titleId: 'movie-950', actions: [{ kind: 'watchlist' }] },
    { titleId: 'movie-9999', actions: [{ kind: 'watched' }, { kind: 'watchlist' }] },
  ];
  const first = await lb.commitImport(user, lb.parseCommitItems(items));
  assert.equal(first.diaryAdded, 3);
  assert.equal(first.diarySkipped, 0);
  assert.equal(first.watched, 2, 'Heat and Paris, Texas become watched (Alien already was)');
  assert.equal(first.rated, 2, 'Heat and Paris, Texas get ratings; Alien keeps its 2');
  assert.equal(first.liked, 1);
  assert.equal(first.reviews, 1, 'Paris, Texas gets a review; Heat keeps the existing one');
  assert.equal(first.watchlisted, 2, 'Heat (1986) and the unreleased film go on the watchlist');
  assert.deepEqual(first.skippedTitles.map((s) => s.titleId), ['movie-9999']);

  const lib = new Map((await listLibrary(user)).map((e) => [e.title.id, e]));
  assert.equal(lib.get('movie-949')?.rating, 4.5);
  assert.equal(lib.get('movie-348')?.rating, 2, 'existing rating kept');
  assert.equal(lib.get('movie-777')?.status, 'watched');
  assert.equal(lib.get('movie-950')?.status, 'watchlist');
  assert.equal(lib.get('movie-9999')?.status, 'watchlist');
  const heatReview = await db().get<{ body: string }>(`SELECT body FROM reviews WHERE user_id = ? AND title_id = 'movie-949'`, user.id);
  assert.equal(heatReview?.body, 'My own CinePulse review.');
  const heatEntry = await db().get<{ tags: string; rewatch: number; note: string }>(`SELECT tags, rewatch, note FROM diary_entries WHERE user_id = ? AND title_id = 'movie-949' AND watched_on = '2026-01-02'`, user.id);
  assert.equal(heatEntry?.tags, 'cinema,35mm');
  assert.equal(Number(heatEntry?.rewatch), 1);
  assert.equal(heatEntry?.note, 'The bank scene, still.');

  const again = await lb.commitImport(user, lb.parseCommitItems(items));
  assert.deepEqual({ ...again, skippedTitles: again.skippedTitles.length },
    { diaryAdded: 0, diarySkipped: 3, watched: 0, watchlisted: 0, rated: 0, liked: 0, reviews: 0, skippedTitles: 1 });
  const count = await db().get<{ n: number }>('SELECT COUNT(*) AS n FROM diary_entries WHERE user_id = ?', user.id);
  assert.equal(Number(count?.n), 3);

  // Export → parse round-trip in Letterboxd's import format.
  const csv = await lb.exportLetterboxdCsv(user);
  const rows = parseCsvObjects(csv);
  assert.deepEqual(Object.keys(rows[0]), ['Title', 'Year', 'tmdbID', 'WatchedDate', 'Rating', 'Tags', 'Review', 'Rewatch']);
  const heat = rows.filter((r) => r.tmdbID === '949');
  assert.deepEqual(heat.map((r) => r.WatchedDate), ['2020-06-01', '2026-01-02']);
  assert.equal(heat[1].Review, 'My own CinePulse review.', 'the title review goes on the latest viewing');
  assert.equal(heat[1].Rewatch, 'Yes');
  assert.equal(heat[1].Tags, 'cinema, 35mm');
  const paris = rows.find((r) => r.tmdbID === '777');
  assert.equal(paris?.WatchedDate, '', 'watched-but-never-logged titles export without a date');
  assert.equal(paris?.Review, 'Quiet devastation.');
  assert.ok(!rows.some((r) => r.tmdbID === '950'), 'watchlist titles are not exported as watched');
  const reparsed = parseLetterboxdExport({ 'diary.csv': csv.replace('WatchedDate', 'Watched Date').replace(/^Title/, 'Name') });
  assert.equal(reparsed.counts.diary, 4, 'diary rows with dates parse back');
});

test('commit validation rejects bad payloads', () => {
  assert.throws(() => lb.parseCommitItems([]), /items must be/);
  assert.throws(() => lb.parseCommitItems([{ titleId: 'movie-1', actions: [{ kind: 'delete-everything' }] }]), /Unknown import action/);
  assert.throws(() => lb.parseCommitItems([{ titleId: 'movie-1', actions: [{ kind: 'diary', watchedOn: '2999-01-01' }] }]), /watched date/);
  const [item] = lb.parseCommitItems([{ titleId: 'movie-1', actions: [{ kind: 'rating', rating: 7 }, { kind: 'review', review: 'x'.repeat(9000) }] }]);
  assert.equal(item.actions[0].rating, null, 'out-of-range ratings are dropped, not rejected');
  assert.equal(item.actions[1].review?.length, 5000);
});
