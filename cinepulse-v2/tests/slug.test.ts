import test from 'node:test';
import assert from 'node:assert/strict';
import { idFromSlug, kebab, titlePath } from '../lib/slug';

test('titlePath builds readable URLs and idFromSlug reverses them', () => {
  const cases = [
    { id: 'movie-27205', title: 'Inception', mediaType: 'movie' as const, path: '/film/inception-27205' },
    { id: 'tv-1399', title: 'Game of Thrones', mediaType: 'tv' as const, path: '/tv/game-of-thrones-1399' },
    { id: 'demo-dunes', title: 'Beyond the Dunes', mediaType: 'movie' as const, path: '/film/beyond-the-dunes~demo-dunes' },
    { id: 'movie-12', title: 'Amélie & Co: 2!', mediaType: 'movie' as const, path: '/film/amelie-and-co-2-12' },
  ];
  for (const c of cases) {
    assert.equal(titlePath(c), c.path);
    const [, kind, slug] = c.path.split('/');
    assert.equal(idFromSlug(kind as 'film' | 'tv', slug), c.id);
  }
});

test('malformed slugs return null; titles with digits still resolve by the trailing id', () => {
  assert.equal(idFromSlug('film', 'no-id-here'), null);
  assert.equal(idFromSlug('film', 'x~../../etc'), null);
  assert.equal(idFromSlug('film', 'blade-runner-2049-335984'), 'movie-335984');
  assert.equal(kebab('   '), 'title');
});
