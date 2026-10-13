import { titleById } from '../lib/catalog.ts';

const ids = ['movie-1003596', 'movie-1400940', 'movie-100', 'tv-325855', 'movie-1101383'];
for (const id of ids) {
  try {
    const t = await titleById(id);
    console.log(id, '=>', t.title, 'poster:', t.poster);
  } catch (e) {
    console.log(id, 'error:', e.message);
  }
}
