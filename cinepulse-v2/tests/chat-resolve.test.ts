import test from 'node:test';
import assert from 'node:assert/strict';
import { executeTool, titleSimilarity, TOOL_DEFINITIONS } from '../lib/ai/chat/tools';
import { systemPromptFor } from '../lib/ai/chat/systemPrompt';
import { catalog } from '../lib/catalog';

test('title similarity: exact, partial and unrelated names', () => {
  assert.equal(titleSimilarity('Dune', 'dune'), 1);
  assert.equal(titleSimilarity('Spider-Man: No Way Home', 'Spider Man No Way Home'), 1);
  assert.ok(titleSimilarity('Dune Part Two', 'Dune: Part Two') > 0.9);
  assert.ok(titleSimilarity('Oppenheimer', 'Barbie') < 0.2);
});

test('film tools resolve names on the server and never trust a guessed id', async () => {
  const items = (await catalog({ media: 'all', collection: 'trending', page: 1 })).items;
  const a = items[0];
  const b = items.find((t) => t.title !== a.title)!;

  // A name alone is resolved to the right film.
  const byName = await executeTool('get_title_details', { query: a.title }, {});
  assert.equal(byName.cardType, 'title');
  assert.equal((byName.data as any).id, a.id);

  // A real id that belongs to a different film than the name given is replaced by the name's match.
  const mismatch = await executeTool('get_title_details', { titleId: b.id, query: a.title }, {});
  assert.equal((mismatch.data as any).id, a.id, 'the name wins over a mismatched id');

  // Ids the catalogue can't open are rejected with an instruction, not a silent wrong answer.
  const bad = await executeTool('get_title_details', { titleId: 'movie-123456789' }, {});
  assert.equal(bad.cardType, 'error');
  assert.match(bad.error || '', /search_titles/);

  // Arguments that failed to parse never fall back to the page's film.
  const broken = await executeTool('get_title_details', { __parseError: true }, { titleContext: a.id });
  assert.equal(broken.cardType, 'error');

  // With nothing named, the page's film is the subject (e.g. "is this worth watching?").
  const fromPage = await executeTool('get_title_details', {}, { titleContext: a.id });
  assert.equal((fromPage.data as any).id, a.id);

  // Compare works from two names.
  const cmp = await executeTool('compare_titles', { queryA: a.title, queryB: b.title }, {});
  assert.notEqual(cmp.cardType, 'error');
});

test('tool schemas offer names instead of ids, with no example ids', () => {
  const details = TOOL_DEFINITIONS.find((t: any) => t.name === 'get_title_details') as any;
  assert.ok(details.parameters.properties.query, 'film tools accept a name');
  assert.ok(!(details.parameters.required || []).includes('titleId'), 'an id is never required');
  assert.doesNotMatch(JSON.stringify(TOOL_DEFINITIONS), /demo-dunes|movie-693134/);
});

test('the system prompt carries today\'s date and the user region', () => {
  const p = systemPromptFor('IN', new Date('2026-11-27T10:00:00Z'));
  assert.match(p, /<today>2026-11-27 \(Friday\)<\/today>/);
  assert.match(p, /<user_region>IN/);
  assert.match(p, /Never invent a title id/);
});
