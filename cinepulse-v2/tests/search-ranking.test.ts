import test from 'node:test';
import assert from 'node:assert/strict';
import { rankSearchResults } from '../lib/catalog';
import type { Title } from '../lib/types';

// Shapes and vote counts taken from real TMDB search results (list results carry no popularity).
const t = (title: string, mediaType: 'movie' | 'tv', year: string, voteCount: number) =>
  ({ id: `${mediaType}-${title}-${year}`, title, mediaType, releaseDate: `${year}-01-01`, voteCount, popularity: 0 } as unknown as Title);

test('a combined search ranks films and series together by match and fame', () => {
  // TMDB returns every film match first, then every series match.
  const bear = rankSearchResults([
    t('The Bear', 'movie', '1989', 650), t('The Bear', 'movie', '1984', 40), t('Jack the Bear', 'movie', '1993', 90),
    t('The Clan of the Cave Bear', 'movie', '1986', 300), t('The Bear', 'movie', '1998', 25), t('The Bear', 'movie', '1938', 2),
    t('The Bear', 'tv', '2022', 1500), t('The Bear Man', 'tv', '2019', 3),
  ], 'The bear');
  assert.deepEqual([bear[0].title, bear[0].mediaType], ['The Bear', 'tv'], 'the hit series is no longer buried after every film');

  const avatar = rankSearchResults([
    t('Avatar', 'movie', '2009', 35101), t('Avatar', 'movie', '2006', 60), t('Avatar', 'movie', '2011', 33), t('Avatar', 'movie', '1916', 18),
    t('Avatar', 'movie', '1941', 11), t('Avatar', 'movie', '1964', 0), t('Avatar: The Way of Water', 'movie', '2022', 14941),
    t('Avatar: The Last Airbender', 'tv', '2005', 5258), t('Avatar: Fire and Ash', 'movie', '2025', 4746),
  ], 'Avatar');
  const top4 = avatar.slice(0, 4).map((x) => `${x.title} ${x.releaseDate?.slice(0, 4)}`);
  assert.equal(top4[0], 'Avatar 2009', 'the famous exact match leads');
  assert.ok(top4.includes('Avatar: The Way of Water 2022'), 'a famous sequel beats obscure exact matches');
  assert.ok(top4.includes('Avatar: The Last Airbender 2005'), 'the famous series is near the top');
  assert.ok(!top4.includes('Avatar 1964'), 'an unknown exact match drops below well-known titles');
});
