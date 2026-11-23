import test from 'node:test';
import assert from 'node:assert/strict';
import { NAV_SECTIONS, VIEW_LABELS, sectionOf, type View } from '../lib/navigation';

const ALL: View[] = ['discover', 'predictions', 'calendar', 'community', 'feed', 'leaderboard', 'accuracy', 'library', 'contrarian', 'movie-night', 'circles', 'explore', 'receipts'];

test('five sections cover every view exactly once', () => {
  assert.equal(NAV_SECTIONS.length, 5);
  const seen = NAV_SECTIONS.flatMap((s) => s.views);
  assert.deepEqual([...seen].sort(), [...ALL].sort());
  assert.equal(new Set(seen).size, seen.length);
  for (const v of ALL) assert.ok(VIEW_LABELS[v], `label for ${v}`);
});

test('every old view highlights the right section', () => {
  assert.equal(sectionOf('leaderboard').id, 'predict');
  assert.equal(sectionOf('feed').id, 'community');
  assert.equal(sectionOf('calendar').id, 'films');
  assert.equal(sectionOf('discover').id, 'home');
});
