import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecommendationsForTitle } from '../lib/recommendations';

test('Recommendation Reasoning Engine', async (t) => {
  await t.test('getRecommendationsForTitle returns recommendations with typed reasoning and shared signals', async () => {
    // Test with demo catalog title
    const recs = await getRecommendationsForTitle('demo-dunes', null);
    assert.ok(Array.isArray(recs));
    for (const r of recs) {
      assert.ok(r.title);
      assert.ok(r.reason);
      assert.ok(
        ['taste_match', 'director_follow', 'genre_affinity', 'contrarian_pick', 'box_office_momentum'].includes(r.reason.reasonType),
        `reasonType must be valid enum, got: ${r.reason.reasonType}`
      );
      assert.ok(typeof r.reason.reasonText === 'string' && r.reason.reasonText.length > 0);
      assert.ok(Array.isArray(r.reason.sharedSignals));
      assert.ok(typeof r.reason.matchScore === 'number');
    }
  });
});
