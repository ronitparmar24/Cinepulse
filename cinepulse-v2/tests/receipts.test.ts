import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../lib/db';
import { getPublicReceipts, getForecastReceiptById } from '../lib/receipts';
import { resolvePendingCalls } from '../lib/cron/resolveCalls';

test('Track O: getPublicReceipts returns 3 tracks, biggest misses, and audited receipts', () => {
  const data = getPublicReceipts();

  assert.ok(data.modelTrack);
  assert.equal(data.modelTrack.name, 'CinePulse Model');
  assert.ok(typeof data.modelTrack.brierScore === 'number');
  assert.ok(typeof data.modelTrack.hitRate === 'number');

  assert.ok(data.communityTrack);
  assert.equal(data.communityTrack.name, 'Community Crowd');

  assert.ok(data.topForecastersTrack);
  assert.ok(Array.isArray(data.topForecastersTrack.forecasters));

  assert.ok(Array.isArray(data.biggestMisses));
  assert.ok(Array.isArray(data.receipts));
});

test('Track O: resolvePendingCalls is idempotent and does not overwrite existing resolved receipts', async () => {
  const d = db();

  // Insert a test resolved prediction
  const testId = `test_pred_${Date.now()}`;
  d.prepare(`
    INSERT INTO predictions_log (
      id, title_id, title_name, model_version,
      predicted_revenue_p10, predicted_revenue_p50, predicted_revenue_p90,
      hit_probability, confidence, features_json, explanation_json,
      actual_revenue, actual_hit, resolved_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    testId,
    'test_title_1',
    'Test Movie Hit',
    'cinepulse-ml-v3',
    50000000, 100000000, 150000000,
    85, 'high', '{}', JSON.stringify({
      waterfall: [
        { feature: 'budget', label: 'Production Budget', contribution: 0.45, value: 50000000 }
      ]
    }),
    200000000, 1, '2026-10-01T00:00:00Z', '2026-09-01T00:00:00Z'
  );

  // Calling resolvePendingCalls
  const res1 = await resolvePendingCalls();
  assert.ok(typeof res1.titlesResolved === 'number');

  // Calling again must be idempotent
  const res2 = await resolvePendingCalls();
  assert.ok(typeof res2.titlesResolved === 'number');

  // Verify test receipt still has original resolved_at date
  const receipt = getForecastReceiptById(testId);
  assert.ok(receipt !== null);
  assert.equal(receipt.id, testId);
  assert.equal(receipt.verdict, 'called');
  assert.equal(receipt.resolvedAt, '2026-10-01T00:00:00Z');

  // Clean up test entry and restore baseline engine row
  d.prepare('DELETE FROM predictions_log WHERE id = ?').run(testId);
  d.prepare(`
    UPDATE brier_scores 
    SET brier_score = 0.142, accuracy_rate = 82.5, total_calls = 120, correct_calls = 99
    WHERE entity_id = 'cinepulse-engine'
  `).run();
});

test('Track O: getForecastReceiptById identifies missed calls with correct verdict', () => {
  const d = db();
  const missId = `test_miss_${Date.now()}`;
  d.prepare(`
    INSERT INTO predictions_log (
      id, title_id, title_name, model_version,
      predicted_revenue_p10, predicted_revenue_p50, predicted_revenue_p90,
      hit_probability, confidence, features_json, explanation_json,
      actual_revenue, actual_hit, resolved_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    missId,
    'test_title_flop',
    'Overhyped Flop',
    'cinepulse-ml-v3',
    80000000, 150000000, 220000000,
    80, 'high', '{}', JSON.stringify({
      waterfall: [
        { feature: 'budget', label: 'Production Budget', contribution: 0.6, value: 120000000 }
      ]
    }),
    40000000, 0, '2026-10-02T00:00:00Z', '2026-09-01T00:00:00Z'
  );

  const receipt = getForecastReceiptById(missId);
  assert.ok(receipt !== null);
  assert.equal(receipt.verdict, 'missed');
  assert.equal(receipt.actualHit, false);

  // Clean up
  d.prepare('DELETE FROM predictions_log WHERE id = ?').run(missId);
});
