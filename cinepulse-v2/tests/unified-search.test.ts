import test from 'node:test';
import assert from 'node:assert/strict';
import { searchUnified } from '../lib/unifiedSearch';
import { catalog } from '../lib/catalog';

test('command palette search: titles, matching actions, and a quick answer', async () => {
  const first = (await catalog({ media: 'all', collection: 'trending', page: 1 })).items[0];
  const word = first.title.split(/\s+/)[0];
  const t0 = Date.now();
  const res = await searchUnified(word, 8);
  assert.ok(Date.now() - t0 < 5000, 'never leaves the search box spinning');
  assert.ok(res.titles.some((t) => t.id === first.id), 'finds the title');
  assert.ok(res.titles.length <= 8);
  assert.ok(Array.isArray(res.receipts) && Array.isArray(res.actions));

  const region = await searchUnified('region', 8);
  assert.ok(region.actions.some((a) => a.actionType === 'toggle-region'), 'menu actions match their keywords');

  const again = await searchUnified(word, 8);
  assert.deepEqual(again, res, 'a repeat query is served from the short cache');
});
