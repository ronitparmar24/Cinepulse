import { unifiedFetch } from './base';
import { db } from '../db';

export async function resolveWikipediaTitle(imdbId: string, titleHint?: string): Promise<string | null> {
  if (!imdbId) return titleHint ? titleHint.replace(/\s+/g, '_') : null;

  try {
    const d = db();
    const cached = d.prepare('SELECT wikipedia_title FROM title_links WHERE imdb_id = ?').get(imdbId) as { wikipedia_title?: string } | undefined;
    if (cached?.wikipedia_title) return cached.wikipedia_title;
  } catch {}

  const sparql = `
    SELECT ?article WHERE {
      ?item wdt:P345 "${imdbId}".
      ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
    } LIMIT 1
  `.trim();

  const res = await unifiedFetch<{
    results: { bindings: Array<{ article?: { value: string } }> };
  }>({
    provider: 'wikidata',
    endpoint: 'https://query.wikidata.org/sparql',
    params: {
      query: sparql,
      format: 'json',
    },
    ttlMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  const url = res.data?.results?.bindings?.[0]?.article?.value;
  if (url) {
    const title = decodeURIComponent(url.split('/wiki/')[1] || '').replace(/\s+/g, '_');
    try {
      const d = db();
      d.prepare('INSERT INTO title_links(title_id, imdb_id, wikipedia_title) VALUES(?,?,?) ON CONFLICT(title_id) DO UPDATE SET wikipedia_title=excluded.wikipedia_title')
        .run(imdbId, imdbId, title);
    } catch {}
    return title;
  }

  return titleHint ? titleHint.replace(/\s+/g, '_') : null;
}
