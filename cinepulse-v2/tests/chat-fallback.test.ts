import test from 'node:test';
import assert from 'node:assert/strict';
import { streamRuleBased } from '../lib/ai/chat/providers';
import type { SSEEvent } from '../lib/ai/chat/types';

test('Chat Fallback / Lite Mode: works 100% offline with NO API keys', async () => {
  const events: SSEEvent[] = [];
  const generator = streamRuleBased(
    [{ role: 'user', content: 'What movies are trending?' }],
    { user: null, ip: '127.0.0.1' }
  );

  for await (const event of generator) {
    events.push(event);
  }

  const types = events.map((e) => e.type);
  assert.ok(types.includes('tool_start'), 'Should trigger tool_start');
  assert.ok(types.includes('tool_result'), 'Should emit tool_result');
  assert.ok(types.includes('token'), 'Should stream tokens');
  assert.ok(types.includes('done'), 'Should end with done event');

  const doneEvent = events.find((e) => e.type === 'done');
  assert.equal((doneEvent?.data as any)?.provider, 'rule-based');
  assert.equal((doneEvent?.data as any)?.liteMode, true);
});

test('Chat Fallback / Lite Mode: politely redirects off-topic requests', async () => {
  const events: SSEEvent[] = [];
  const generator = streamRuleBased(
    [{ role: 'user', content: 'How do I write a Python function for sorting?' }],
    { user: null, ip: '127.0.0.1' }
  );

  for await (const event of generator) {
    events.push(event);
  }

  const text = events
    .filter((e) => e.type === 'token')
    .map((e) => (e.data as any).text)
    .join('');

  assert.ok(text.toLowerCase().includes('cinema'));
  assert.ok(!events.some((e) => e.type === 'tool_result'));
});

test('Chat Fallback / Lite Mode: answers hit/flop questions with forecast numbers', async () => {
  const events: SSEEvent[] = [];
  const generator = streamRuleBased(
    [{ role: 'user', content: 'Will Dune 2 be a hit?' }],
    { user: null, ip: '127.0.0.1' }
  );

  for await (const event of generator) {
    events.push(event);
  }

  const forecastResult = events.find(
    (e) => e.type === 'tool_result' && (e.data as any).cardType === 'forecast'
  );
  assert.ok(forecastResult, 'Should emit forecast card');

  const fData = (forecastResult.data as any).data;
  assert.ok(typeof fData.hitProbability === 'number');

  const text = events
    .filter((e) => e.type === 'token')
    .map((e) => (e.data as any).text)
    .join('');

  assert.ok(text.includes(String(fData.hitProbability)), 'Text must state the exact hit probability');
});

test('Chat Fallback / Lite Mode: proposes action when asked to add to watchlist', async () => {
  const events: SSEEvent[] = [];
  const generator = streamRuleBased(
    [{ role: 'user', content: 'Add Dune to my watchlist' }],
    { user: null, ip: '127.0.0.1' }
  );

  for await (const event of generator) {
    events.push(event);
  }

  const actionResult = events.find(
    (e) => e.type === 'tool_result' && (e.data as any).cardType === 'action'
  );
  assert.ok(actionResult, 'Should emit pending action card');
  assert.ok((actionResult.data as any).data.action);
});
