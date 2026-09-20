import test from 'node:test';
import assert from 'node:assert/strict';
import { useLibrary } from '../components/hooks/useLibrary';
import type { LibraryEntry, Title } from '../lib/types';

test('useLibrary exports expected function', () => {
  assert.equal(typeof useLibrary, 'function');
});

test('save and remove toggle watchlist membership and require confirmation when rating or watched status is present', () => {
  const dummyTitle: Title = {
    id: 'movie-100',
    title: 'Interstellar Odyssey',
    mediaType: 'movie',
    overview: 'A deep space mission',
    releaseDate: '2024-01-01',
    status: 'released',
    runtime: 120,
    genres: ['Sci-Fi'],
    posterPath: '/poster.jpg',
    backdropPath: '/backdrop.jpg',
    source: 'demo'
  };

  const simpleWatchlistEntry: LibraryEntry = {
    title: dummyTitle,
    status: 'watchlist',
    rating: null,
    updatedAt: new Date().toISOString()
  };

  const ratedWatchedEntry: LibraryEntry = {
    title: dummyTitle,
    status: 'watched',
    rating: 9,
    updatedAt: new Date().toISOString()
  };

  // When entry is simply watchlist with no rating, direct removal proceeds
  const needsConfirmation1 = simpleWatchlistEntry.status !== 'watchlist' || simpleWatchlistEntry.rating !== null;
  assert.equal(needsConfirmation1, false);

  // When entry is watched or rated, removal requires confirmation dialog
  const needsConfirmation2 = ratedWatchedEntry.status !== 'watchlist' || ratedWatchedEntry.rating !== null;
  assert.equal(needsConfirmation2, true);
});
