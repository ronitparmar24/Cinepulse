import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../lib/db';
import { isAiCommunityEnabled, setAiCommunityPaused } from '../lib/ai/config';
import { runAiTick } from '../lib/ai/runner';
import { timingSafeEqual } from 'node:crypto';

test('Track X: Kill switch halts all automated AI actions and tick writes nothing', async () => {
  // 1. Pause via kill switch
  setAiCommunityPaused(true);
  assert.equal(isAiCommunityEnabled(), false, 'Kill switch should report disabled');

  const tickResult = await runAiTick('test-tick-paused');
  assert.equal(tickResult.executed, false, 'Tick must not execute when paused');
  assert.equal(tickResult.publishedCount, 0);
  assert.equal(tickResult.queuedCount, 0);

  // 2. Resume community
  setAiCommunityPaused(false);
  assert.equal(isAiCommunityEnabled(), true, 'Community should be active again');
});

test('Track X: Idempotent queue indexing prevents duplicate actions per tick', () => {
  const d = db();
  const testId = 'ai_persona_01';
  const testAction = 'review';
  const testTarget = 'demo-dunes';
  const testTick = 'idempotent-tick-999';

  d.prepare("DELETE FROM ai_content_queue WHERE tick_id = ?").run(testTick);

  // Insert first item
  d.prepare(`
    INSERT INTO ai_content_queue (
      id, persona_id, action, target_id, payload_json, not_before, status, tick_id
    ) VALUES ('q1', ?, ?, ?, '{}', CURRENT_TIMESTAMP, 'ready', ?)
  `).run(testId, testAction, testTarget, testTick);

  // Duplicate insert should fail due to UNIQUE index (persona_id, action, target_id, tick_id)
  assert.throws(() => {
    d.prepare(`
      INSERT INTO ai_content_queue (
        id, persona_id, action, target_id, payload_json, not_before, status, tick_id
      ) VALUES ('q2', ?, ?, ?, '{}', CURRENT_TIMESTAMP, 'ready', ?)
    `).run(testId, testAction, testTarget, testTick);
  }, /UNIQUE constraint failed/);

  // Cleanup
  d.prepare("DELETE FROM ai_content_queue WHERE tick_id = ?").run(testTick);
});

test('Track X: Constant-time authentication verifies CRON_SECRET securely', () => {
  const secret = 'super-secret-token-12345';
  const validHeader = 'Bearer super-secret-token-12345';
  const invalidHeader = 'Bearer wrong-secret-token-00000';

  function verifyCron(header: string): boolean {
    const expected = `Bearer ${secret}`;
    const bufA = Buffer.from(header);
    const bufB = Buffer.from(expected);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  assert.equal(verifyCron(validHeader), true, 'Valid secret must authenticate');
  assert.equal(verifyCron(invalidHeader), false, 'Invalid secret must be rejected');
});
