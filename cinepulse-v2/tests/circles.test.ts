import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCircle,
  joinCircleByInvite,
  listUserCircles,
  getCircleDetails,
  addCircleWatchlist,
  removeCircleWatchlist,
  createWeeklyVoteSession,
  castCircleVote
} from '../lib/circles';
import type { User } from '../lib/types';
import { db, now } from '../lib/db';

function createDummyUser(id: string, name: string): User {
  const d = db();
  d.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, password_hash, username, display_name, created_at)
    VALUES (?, ?, ?, 'hash', ?, ?, ?)
  `).run(id, name, `${id}@cinepulse.test`, id, name, now());

  return {
    id,
    name,
    email: `${id}@cinepulse.test`,
    createdAt: now()
  };
}

test('Watch Circles: full lifecycle - create, join, watchlist, weekly pick, and Borda voting', async () => {
  const alice = createDummyUser('u_alice_circle', 'Alice Club');
  const bob = createDummyUser('u_bob_circle', 'Bob Club');

  // 1. Create Circle
  const circle = createCircle(alice, 'Cinema Paradiso', 'A friendly weekly film collective');
  assert.ok(circle.id.startsWith('circle_'));
  assert.ok(circle.inviteCode.startsWith('CIRC-'));
  assert.equal(circle.createdBy, alice.id);

  // 2. Bob joins via invite code
  const joined = joinCircleByInvite(bob, circle.inviteCode);
  assert.equal(joined.id, circle.id);

  // 3. List Alice's and Bob's circles
  const aliceCircles = listUserCircles(alice);
  assert.ok(aliceCircles.some(c => c.id === circle.id));
  const bobCircles = listUserCircles(bob);
  assert.ok(bobCircles.some(c => c.id === circle.id));

  // 4. Circle Watchlist
  await addCircleWatchlist(alice, circle.id, 'demo-dunes');
  await addCircleWatchlist(bob, circle.id, 'demo-oppenheimer');

  let details = getCircleDetails(circle.id, alice);
  assert.equal(details.members.length, 2);
  assert.equal(details.watchlist.length, 2);

  // Remove one
  removeCircleWatchlist(alice, circle.id, 'demo-oppenheimer');
  details = getCircleDetails(circle.id, alice);
  assert.equal(details.watchlist.length, 1);
  assert.equal(details.watchlist[0].title.id, 'demo-dunes');

  // 5. Weekly Pick Voting
  const pick = await createWeeklyVoteSession(alice, circle.id, ['demo-dunes', 'demo-oppenheimer'], '2026-W38');
  assert.equal(pick.status, 'voting');
  assert.equal(pick.candidates.length, 2);

  // Alice votes dune #1, oppenheimer #2
  castCircleVote(alice, circle.id, pick.id, ['demo-dunes', 'demo-oppenheimer']);
  // Bob votes dune #1, oppenheimer #2
  const finalPick = castCircleVote(bob, circle.id, pick.id, ['demo-dunes', 'demo-oppenheimer']);

  assert.ok(finalPick.tally);
  assert.equal(finalPick.tally.winner, 'demo-dunes');
  assert.equal(finalPick.selectedTitle?.id, 'demo-dunes');
});
