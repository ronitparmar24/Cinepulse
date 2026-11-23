import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CATALOG_MODE = 'tmdb';
process.env.TMDB_READ_TOKEN = 'diary-mock-only';
const original = globalThis.fetch;
globalThis.fetch = (async (url: string | URL) => {
  const id = Number(/\/(?:movie|tv)\/(\d+)/.exec(String(url))?.[1] ?? 1);
  const future = id === 9999;
  return new Response(JSON.stringify({ id, title: `Diary Film ${id}`, release_date: future ? '2099-01-01' : '2001-01-01', genres: [], credits: { cast: [], crew: [] }, videos: { results: [] } }), { status: 200 });
}) as typeof fetch;
test.after(() => { globalThis.fetch = original; });

const { register } = await import('../lib/auth');
const { logDiary, listDiary, updateDiary, deleteDiary } = await import('../lib/diary');
const { listLibrary } = await import('../lib/library');
const { db } = await import('../lib/db');

test('logging, rewatch detection, library sync, editing and deletion', async () => {
  const { user } = await register({ name: 'Diarist', email: `diary.${Date.now()}@example.com`, password: 'diary-password-1' });
  const first = await logDiary(user, 'movie-101', { watchedOn: '2026-01-05', rating: 4, tags: ['Cinema', 'with friends', 'cinema'] });
  assert.equal(first.rewatch, false);
  assert.deepEqual(first.tags, ['cinema', 'with friends']);
  const second = await logDiary(user, 'movie-101', { watchedOn: '2026-03-01', rating: 4.5, liked: true });
  assert.equal(second.rewatch, true, 'a second log of the same film is a rewatch');

  const lib = (await listLibrary(user)).find((e) => e.title.id === 'movie-101');
  assert.equal(lib?.status, 'watched');
  assert.equal(lib?.rating, 4.5, 'library keeps the latest rating');
  const liked = await db().get(`SELECT 1 AS x FROM likes WHERE user_id = ? AND target_type = 'title' AND target_id = 'movie-101'`, user.id);
  assert.ok(liked, 'liking in the diary likes the film');

  const page = await listDiary(user.id);
  assert.deepEqual(page.items.map((e) => e.watchedOn), ['2026-03-01', '2026-01-05']);

  const edited = await updateDiary(user, first.id, { rating: 3.5, note: 'Better the second time.' });
  assert.equal(edited.rating, 3.5);
  await deleteDiary(user, first.id);
  assert.equal((await listDiary(user.id)).items.length, 1);
});

test('validation: future dates, unreleased films, bad ratings and other users are refused', async () => {
  const { user } = await register({ name: 'Strict', email: `strict.${Date.now()}@example.com`, password: 'strict-password-1' });
  const { user: other } = await register({ name: 'Other', email: `other.${Date.now()}@example.com`, password: 'other-password-12' });
  await assert.rejects(() => logDiary(user, 'movie-102', { watchedOn: '2999-01-01' }), (e: { status?: number }) => e.status === 400);
  await assert.rejects(() => logDiary(user, 'movie-102', { watchedOn: 'yesterday' }), (e: { status?: number }) => e.status === 400);
  await assert.rejects(() => logDiary(user, 'movie-9999', {}), (e: { status?: number }) => e.status === 400);
  await assert.rejects(() => logDiary(user, 'movie-102', { rating: 4.2 }), (e: { status?: number }) => e.status === 400);
  const entry = await logDiary(user, 'movie-102', {});
  await assert.rejects(() => deleteDiary(other, entry.id), (e: { status?: number }) => e.status === 404, "someone else's entry is invisible");
});

test('paging walks every entry exactly once', async () => {
  const { user } = await register({ name: 'Pager', email: `pager.${Date.now()}@example.com`, password: 'pager-password-1' });
  for (let i = 1; i <= 7; i++) await logDiary(user, `movie-${200 + i}`, { watchedOn: `2026-02-0${i}` });
  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const page: Awaited<ReturnType<typeof listDiary>> = await listDiary(user.id, 3, cursor);
    seen.push(...page.items.map((e) => e.titleId));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(seen.length, 7);
  assert.equal(new Set(seen).size, 7);
});

test('profile diary lists every viewing; profile watchlist lists only the watchlist', async () => {
  const { getUserDiary, getUserWatchlist } = await import('../lib/social/subresources');
  const { putLibrary } = await import('../lib/library');
  const { user } = await register({ name: 'Profile Diarist', email: `pdiary.${Date.now()}@example.com`, password: 'diary-password-2' });
  const row = await db().get<{ username: string }>('SELECT username FROM users WHERE id = ?', user.id);
  assert.ok(row?.username);
  await logDiary(user, 'movie-301', { watchedOn: '2026-01-01', rating: 3 });
  await logDiary(user, 'movie-301', { watchedOn: '2026-02-01', rating: 4 });
  await putLibrary(user, 'movie-302', { status: 'watchlist' });

  const diary = await getUserDiary(row.username, user.id);
  assert.equal(diary.allowed, true);
  assert.deepEqual(diary.items?.map((e: any) => [e.titleId, e.watchedDate, e.rewatch]), [['movie-301', '2026-02-01', true], ['movie-301', '2026-01-01', false]]);

  const watchlist = await getUserWatchlist(row.username, user.id);
  assert.deepEqual(watchlist.items?.map((e: any) => e.titleId), ['movie-302'], 'diary entries never appear in the watchlist');
});
