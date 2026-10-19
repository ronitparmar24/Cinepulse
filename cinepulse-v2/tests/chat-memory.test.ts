import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createThread,
  getThread,
  listThreads,
  deleteThread,
  addMessage,
  getThreadMessages,
  updateMessageFeedback,
  getContextWindow,
} from '../lib/ai/chat/memory';
import { db } from '../lib/db';

const userA = `user_a_${Date.now()}`;
const userB = `user_b_${Date.now()}`;

// Ensure dummy users exist in DB
test('Chat Memory: setup test users', () => {
  const d = db();
  d.prepare('INSERT OR IGNORE INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(
    userA,
    'User Alpha',
    `${userA}@test.com`,
    'hash',
    new Date().toISOString()
  );
  d.prepare('INSERT OR IGNORE INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(
    userB,
    'User Beta',
    `${userB}@test.com`,
    'hash',
    new Date().toISOString()
  );
});

test('Chat Memory: thread CRUD operations', () => {
  const thread = createThread(userA, 'Dune Analysis');
  assert.ok(thread.id.startsWith('th_'));
  assert.equal(thread.userId, userA);
  assert.equal(thread.title, 'Dune Analysis');

  const fetched = getThread(thread.id, userA);
  assert.ok(fetched);
  assert.equal(fetched.id, thread.id);

  const list = listThreads(userA);
  assert.ok(list.length > 0);
  assert.ok(list.some((t) => t.id === thread.id));

  // User B cannot access User A's thread
  const unauthorizedFetch = getThread(thread.id, userB);
  assert.equal(unauthorizedFetch, null);

  const unauthorizedDelete = deleteThread(thread.id, userB);
  assert.equal(unauthorizedDelete, false);

  // User A can delete
  const authorizedDelete = deleteThread(thread.id, userA);
  assert.equal(authorizedDelete, true);
  assert.equal(getThread(thread.id, userA), null);
});

test('Chat Memory: messages storage and feedback update', () => {
  const thread = createThread(userA, 'Box Office Talk');

  const msg1 = addMessage(thread.id, 'user', 'Will it make $1B?');
  const msg2 = addMessage(thread.id, 'assistant', 'Unlikely based on initial tracking.', { hitProbability: 45 });

  const messages = getThreadMessages(thread.id, userA);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].content, 'Will it make $1B?');
  assert.equal(messages[1].role, 'assistant');
  assert.equal((messages[1].toolJson as any)?.hitProbability, 45);

  // Update feedback
  const feedbackOk = updateMessageFeedback(msg2.id, userA, 'up');
  assert.equal(feedbackOk, true);

  const updatedMessages = getThreadMessages(thread.id, userA);
  assert.equal(updatedMessages[1].feedback, 'up');

  // User B cannot update feedback on User A's message
  const invalidFeedback = updateMessageFeedback(msg2.id, userB, 'down');
  assert.equal(invalidFeedback, false);
});

test('Chat Memory: rolling context window provides last 8 turns + summary', () => {
  const thread = createThread(userA, 'Long Conversation');

  // Add 10 turns (20 messages)
  for (let i = 1; i <= 10; i++) {
    addMessage(thread.id, 'user', `Question number ${i} about cinema`);
    addMessage(thread.id, 'assistant', `Answer number ${i} with analysis`);
  }

  const context = getContextWindow(thread.id, userA);
  // Last 8 turns = 16 messages
  assert.equal(context.messages.length, 16);
  assert.ok(context.summary, 'Should include rolling summary of older turns');
  assert.ok(context.summary?.includes('Earlier conversation summary'));
});
