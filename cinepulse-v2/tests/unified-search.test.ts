import test from 'node:test';
import assert from 'node:assert/strict';
import { searchUnified } from '../lib/unifiedSearch';
import { catalog } from '../lib/catalog';

test('command palette search: titles, matching actions, and a quick answer', async () => {
  const first = (await catalog({ media: 'all', collection: 'trending', page: 1 })).items[0];
  const word = first.title.split(/\s+/)[0];
  const t0 = Date.now();
  const res = await searchUnified(word, 8);
  assert.ok(Date.now() - t0 < 7000, 'never leaves the search box spinning');
  assert.ok(res.titles.some((t) => t.id === first.id), 'finds the title');
  assert.ok(res.titles.length <= 8);
  assert.ok(Array.isArray(res.receipts) && Array.isArray(res.actions));
  assert.equal(res.partial, undefined, 'a finished lookup is not marked unfinished');

  const region = await searchUnified('region', 8);
  assert.ok(region.actions.some((a) => a.actionType === 'toggle-region'), 'menu actions match their keywords');

  const again = await searchUnified(word, 8);
  assert.deepEqual(again, res, 'a repeat query is served from the short cache');
});

async function searchRoute(q: string) {
  const r = await import('../app/api/[...path]/route');
  const { NextRequest } = await import('next/server');
  const req = new NextRequest(`http://127.0.0.1:3000/api/search/unified?q=${encodeURIComponent(q)}&limit=8`, { headers: { host: '127.0.0.1:3000' } });
  return r.GET(req, { params: Promise.resolve({ path: ['search', 'unified'] }) });
}

test('the edge only keeps search answers that actually found titles', async () => {
  // A cached empty answer once showed "no matches" for "the bear" to everyone for minutes.
  const first = (await catalog({ media: 'all', collection: 'trending', page: 1 })).items[0];
  const found = await searchRoute(first.title.split(/\s+/)[0]);
  assert.equal(found.status, 200);
  assert.match(found.headers.get('cache-control') || '', /s-maxage=\d+/, 'a full answer can be shared from the edge');
  assert.ok(((await found.json()) as { titles: unknown[] }).titles.length > 0);

  const nothing = await searchRoute('zqxjvkwplm');
  assert.equal(nothing.status, 200);
  assert.equal(nothing.headers.get('cache-control'), 'no-store', 'an answer without titles is never cached');
  assert.deepEqual(((await nothing.json()) as { titles: unknown[] }).titles, []);
});
