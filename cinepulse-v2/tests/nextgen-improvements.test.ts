import test from 'node:test';
import assert from 'node:assert/strict';
import { searchUnified } from '../lib/unifiedSearch';

test('Unified Search: empty query returns default navigation actions', async () => {
  const result = await searchUnified('');
  assert.equal(result.query, '');
  assert.ok(Array.isArray(result.actions), 'actions should be an array');
  assert.ok(result.actions.length > 0, 'should return default actions');
  assert.ok(result.actions.some(a => a.id === 'nav-discover'), 'should include Discover action');
  assert.ok(result.actions.some(a => a.id === 'action-toggle-region'), 'should include Region toggle');
});

test('Unified Search: keyword search matches actions and titles', async () => {
  const result = await searchUnified('predict');
  assert.equal(result.query, 'predict');
  assert.ok(result.actions.some(a => a.id === 'nav-predictions'), 'should match predictions action');
});
