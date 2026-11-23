import test from 'node:test';
import assert from 'node:assert/strict';
import { extractClaims, verifyAnswer } from '../lib/ai/chat/verify';
import type { ToolResult } from '../lib/ai/chat/types';

const forecast: ToolResult = {
  name: 'get_forecast',
  cardType: 'forecast',
  data: {
    title: 'The Odyssey',
    releaseDate: '2026-07-15',
    actualRevenue: 1804589435,
    roiMultiple: 7.22,
    voteAverage: 8.0,
    runtime: 173,
    p10RevenueUsd: 1160000000,
    p90RevenueUsd: 3560000000,
    actualInrCrores: '≈ ₹16,725 cr at 20 Nov 2026 rate',
    hitShare: 0.66,
  },
};

test('list counts are not treated as claims; units, decimals and percentages are', () => {
  const raws = extractClaims('Here are the top 6 films. It grossed $1.8B (7.22×), 66% hit, rated 8.0').map((c) => c.raw);
  assert.ok(!raws.includes('6'));
  assert.ok(raws.some((r) => r.startsWith('$1.8')));
  assert.ok(raws.includes('7.22×'));
  assert.ok(raws.includes('66%'));
  assert.ok(raws.includes('8.0'));
});

test('rounded figures that come from the tool data are verified', () => {
  const v = verifyAnswer(
    'The Odyssey (2026) grossed $1.8B worldwide (≈ ₹16,725 cr), 7.22× its budget, inside the $1.16B–$3.56B range. TMDB 8.0, 173 minutes, 66% hit share.',
    [forecast],
  );
  assert.equal(v.unmatched.length, 0, `unmatched: ${v.unmatched.join(', ')}`);
  assert.equal(v.matched, v.checked);
  assert.ok(v.grounded);
});

test('labels such as P10–P90 are not mistaken for figures', () => {
  const v = verifyAnswer('It sits below the model\'s P10–P90 range of $1.16B–$3.56B.', [forecast]);
  assert.equal(v.unmatched.length, 0, `unmatched: ${v.unmatched.join(', ')}`);
});

test('invented figures are flagged', () => {
  const v = verifyAnswer('It opened to $412M and has a 94% Rotten Tomatoes score.', [forecast]);
  assert.deepEqual(v.unmatched.sort(), ['$412M', '94%'].sort());
});

test('an answer with figures but no data tools is not grounded', () => {
  const v = verifyAnswer('It made $900M.', []);
  assert.equal(v.grounded, false);
  assert.equal(v.unmatched.length, 1);
});
