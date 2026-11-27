import test from 'node:test';
import assert from 'node:assert/strict';
import { SMART_LISTS, inSmartList, isSmartListId, smartListCounts } from '../lib/smartLists';
import type { LibraryEntry, Title } from '../lib/types';

const entry = (id: string, over: Partial<Title>, status: LibraryEntry['status'], rating: number | null = null): LibraryEntry => ({
  title: { id, title: id, mediaType: 'movie', releaseDate: '2020-01-01', runtime: 120, genres: [], seasons: null, ...over } as Title,
  status, rating, updatedAt: '2026-11-01T00:00:00.000Z',
});

const now = new Date(2026, 10, 27); // 27 Nov 2026, local time
const library: LibraryEntry[] = [
  entry('movie-1', { runtime: 92 }, 'watchlist'),
  entry('movie-2', { releaseDate: '2026-11-30' }, 'watchlist'),
  entry('movie-3', { releaseDate: '2026-11-02', runtime: 99 }, 'watched', 4.5),
  entry('movie-4', {}, 'watched'),
  entry('movie-5', {}, 'watched', 3.5),
  entry('tv-6', { mediaType: 'tv', runtime: 45 }, 'watching'),
  entry('movie-7', { runtime: null }, 'watchlist'),
];
const ctx = { matches: { 'movie-1': ['Netflix'], 'tv-6': ['Prime Video'], 'movie-4': ['Netflix'] }, now };

test('each smart list picks the right titles', () => {
  const ids = (list: Parameters<typeof inSmartList>[0]) => library.filter((e) => inSmartList(list, e, ctx)).map((e) => e.title.id);
  assert.equal(ids('all').length, library.length);
  assert.deepEqual(ids('services'), ['movie-1', 'tv-6'], 'watched titles are not "to watch on my services"');
  assert.deepEqual(ids('short'), ['movie-1', 'movie-3'], 'films only, strictly under 100 minutes, unknown runtimes left out');
  assert.deepEqual(ids('month'), ['movie-2', 'movie-3']);
  assert.deepEqual(ids('loved'), ['movie-3']);
  assert.deepEqual(ids('unrated'), ['movie-4']);
});

test('counts cover every list', () => {
  assert.deepEqual(smartListCounts(library, ctx), { all: 7, services: 2, short: 2, month: 2, loved: 1, unrated: 1 });
  assert.deepEqual(smartListCounts([], ctx), { all: 0, services: 0, short: 0, month: 0, loved: 0, unrated: 0 });
});

test('stored ids are validated and every list has an empty state', () => {
  assert.equal(isSmartListId('loved'), true);
  assert.equal(isSmartListId('nope'), false);
  assert.equal(isSmartListId(null), false);
  for (const l of SMART_LISTS) assert.ok(l.label && l.emptyTitle && l.emptyBody);
});
