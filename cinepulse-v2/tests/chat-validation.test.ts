import test from 'node:test';
import assert from 'node:assert/strict';
import { executeTool } from '../lib/ai/chat/tools';
import { executeConfirmedAction } from '../lib/ai/chat/router';
import type { User } from '../lib/types';
import type { PendingAction } from '../lib/ai/chat/types';
import { db } from '../lib/db';

const mockUser: User = {
  id: 'test_chat_val_user',
  name: 'Film Fanatic',
  email: 'filmfan@example.com',
  createdAt: new Date().toISOString(),
};

test('Chat Tool Validation: setup mock user', () => {
  db()
    .prepare(
      'INSERT OR IGNORE INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(mockUser.id, mockUser.name, mockUser.email, 'hash', mockUser.createdAt);
});

test('Chat Tool Validation: search_titles requires valid query', async () => {
  const emptyRes = await executeTool('search_titles', { query: '' }, {});
  assert.equal(emptyRes.name, 'search_titles');
  assert.equal((emptyRes.data as any).items.length, 0);

  const validRes = await executeTool('search_titles', { query: 'Dune' }, {});
  assert.equal(validRes.name, 'search_titles');
  assert.ok(Array.isArray((validRes.data as any).items));
});

test('Chat Tool Validation: get_title_details errors on missing titleId', async () => {
  const res = await executeTool('get_title_details', {}, {});
  assert.equal(res.cardType, 'error');
  assert.ok(res.error?.includes('titleId'));
});

test('Chat Tool Validation: get_forecast returns matching numbers and required fields', async () => {
  // Use demo-dunes or first available title
  const searchRes = await executeTool('search_titles', { query: 'Dune' }, {});
  const titleId = (searchRes.data as any).items?.[0]?.id || 'demo-dunes';

  const res = await executeTool('get_forecast', { titleId }, {});
  assert.equal(res.name, 'get_forecast');
  assert.equal(res.cardType, 'forecast');
  const d = res.data as any;
  assert.ok(typeof d.hitProbability === 'number');
  assert.ok(d.hitProbability >= 0 && d.hitProbability <= 100);
  assert.ok(Array.isArray(d.topDrivers));
  assert.ok(typeof d.disclaimer === 'string');
});

test('Chat Tool Action: add_to_library only PROPOSES action without executing', async () => {
  const searchRes = await executeTool('search_titles', { query: 'Dune' }, {});
  const titleId = (searchRes.data as any).items?.[0]?.id || 'demo-dunes';

  const res = await executeTool('add_to_library', { titleId, list: 'watchlist' }, { user: mockUser });
  assert.equal(res.name, 'add_to_library');
  assert.equal(res.cardType, 'action');

  const action = (res.data as any).action as PendingAction;
  assert.ok(action);
  assert.ok(action.id.startsWith('act_'));
  assert.equal(action.toolName, 'add_to_library');
  assert.equal(action.args.titleId, titleId);
  assert.equal(action.args.list, 'watchlist');
  assert.ok(action.description.includes('watchlist'));
});

test('Chat Tool Action: make_opening_call only PROPOSES action without executing', async () => {
  const searchRes = await executeTool('search_titles', { query: 'Dune' }, {});
  const titleId = (searchRes.data as any).items?.[0]?.id || 'demo-dunes';

  const res = await executeTool('make_opening_call', { titleId, choice: 'hit' }, { user: mockUser });
  assert.equal(res.name, 'make_opening_call');
  assert.equal(res.cardType, 'action');

  const action = (res.data as any).action as PendingAction;
  assert.ok(action);
  assert.equal(action.toolName, 'make_opening_call');
  assert.equal(action.args.choice, 'hit');
  assert.ok(action.description.includes('HIT'));
});

test('Chat Tool Action: executeConfirmedAction requires confirmation and user authentication', async () => {
  const action: PendingAction = {
    id: 'act_12345',
    toolName: 'add_to_library',
    args: { titleId: 'demo-dunes', list: 'watchlist' },
    description: 'Add to watchlist',
  };

  // Reject unauthenticated
  await assert.rejects(
    async () => {
      await executeConfirmedAction(action, null as any);
    },
    /Authentication required/
  );

  // Succeed for authenticated user
  const result = await executeConfirmedAction(action, mockUser);
  assert.equal(result.success, true);
  assert.ok(result.message.includes('watchlist'));
});

test('Chat Tool Validation: compare_titles requires both idA and idB', async () => {
  const res = await executeTool('compare_titles', { idA: 'demo-dunes' }, {});
  assert.equal(res.cardType, 'error');
  assert.ok(res.error?.includes('Both idA and idB'));
});

test('Chat Tool Validation: recommend_for_me enforces authentication gate', async () => {
  const anonRes = await executeTool('recommend_for_me', {}, {});
  assert.equal((anonRes.data as any).authRequired, true);
});

test('Chat Tool Validation: find_where_to_watch returns direct streaming providers', async () => {
  const res = await executeTool('find_where_to_watch', { query: 'Dune', region: 'IN' }, {});
  assert.equal(res.name, 'find_where_to_watch');
  assert.equal(res.cardType, 'details');
  const d = res.data as any;
  assert.ok(d.titleName);
  assert.equal(d.region, 'IN');
  assert.ok(Array.isArray(d.directLinks));
});

test('Chat Tool Validation: get_critical_consensus returns Quad-Consensus metrics', async () => {
  const res = await executeTool('get_critical_consensus', { query: 'Dune' }, {});
  assert.equal(res.name, 'get_critical_consensus');
  assert.equal(res.cardType, 'details');
  const d = res.data as any;
  assert.ok(d.titleName);
  assert.ok(d.rottenTomatoes !== undefined);
  assert.ok(d.imdbRating !== undefined);
});

test('Chat Tool Validation: find_nearby_cinemas returns cinema halls around requested city', async () => {
  const res = await executeTool('find_nearby_cinemas', { city: 'Mumbai', limit: 3 }, {});
  assert.equal(res.name, 'find_nearby_cinemas');
  assert.equal(res.cardType, 'list');
  const d = res.data as any;
  assert.equal(d.city, 'Mumbai');
  assert.ok(Array.isArray(d.cinemas));
  assert.ok(d.cinemas.length > 0);
  assert.ok(d.cinemas[0].name);
});

