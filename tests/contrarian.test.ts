import test from 'node:test';
import assert from 'node:assert/strict';
import { getContrarianReleases } from '../lib/contrarian';
import { SCORE_THRESHOLDS } from '../lib/scoreThresholds';

test('Contrarian Desk Engine', async (t) => {
  await t.test('Score threshold divergence is strictly 20%', () => {
    assert.equal(SCORE_THRESHOLDS.CONTRARIAN_DIVERGENCE_PERCENT, 20);
  });

  await t.test('getContrarianReleases returns array of items with model vs community delta >= 20%', async () => {
    const items = await getContrarianReleases();
    assert.ok(Array.isArray(items));
    for (const item of items) {
      assert.ok(item.divergence >= 20, 'Divergence must be at least 20%');
      assert.ok(
        item.contrarianSide === 'model_bull_community_bear' || 
        item.contrarianSide === 'model_bear_community_bull'
      );
      assert.ok(item.reasoning.modelDrivers.length >= 1);
      assert.ok(typeof item.reasoning.divergenceReason === 'string');
    }
  });
});
