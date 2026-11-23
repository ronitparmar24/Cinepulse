import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRating, ratingLabel, starText } from '../lib/rating';

test('parseRating accepts half-star steps from ½ to 5', () => {
  for (const ok of [0.5, 1, 2.5, 4.5, 5]) assert.equal(parseRating(ok), ok);
  assert.equal(parseRating(undefined), null);
  assert.equal(parseRating(null), null);
  for (const bad of [0, 4.3, 5.5, -1, '4', Number.NaN, Infinity]) {
    assert.throws(() => parseRating(bad), (e: { status?: number }) => e.status === 400, String(bad));
  }
});

test('starText and ratingLabel render halves', () => {
  assert.equal(starText(3.5), '★★★½');
  assert.equal(starText(5), '★★★★★');
  assert.equal(starText(0.5), '½');
  assert.equal(starText(null), '');
  assert.equal(ratingLabel(4.5), '4½ stars');
  assert.equal(ratingLabel(1), '1 star');
  assert.equal(ratingLabel(0.5), 'half a star');
});
