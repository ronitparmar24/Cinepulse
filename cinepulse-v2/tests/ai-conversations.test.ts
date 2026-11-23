import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../lib/db';
import { checkHumanIdentityQuestion, canReplyToHuman, getAskTheCrewTakes } from '../lib/ai/askTheCrew';
import { blockUser, muteUser, getComments, addComment } from '../lib/social/interactions';
import { getContrarianReleases } from '../lib/contrarian';

test('Track W: "Are you human?" question MUST honestly return hard-coded disclosure', () => {
  const variations = [
    'Are you human?',
    'Wait, are you a bot or a real person?',
    'Is this an AI?',
    'Tell me if you are human'
  ];

  for (const q of variations) {
    const answer = checkHumanIdentityQuestion(q);
    assert.equal(
      answer,
      "No — I'm an AI persona on CinePulse.",
      `Failed to honestly identify as AI for question: "${q}"`
    );
  }

  // Regular questions do not trigger disclosure
  assert.equal(checkHumanIdentityQuestion('What do you think of the cinematography?'), null);
});

test('Track W: Rate limits enforce 3-minute delay and max 3 replies per human per day', async () => {
  const d = db();
  const humanId = 'test_human_rate_user';
  const personaId = 'ai_persona_01';

  const { ensureAiPersonaUser } = await import('../lib/ai/personas');
  await ensureAiPersonaUser(personaId);

  (await d.run("DELETE FROM comments WHERE user_id = ?", personaId));

  const nowMs = Date.now();

  // Initially allowed
  const check1 = (await canReplyToHuman(humanId, personaId, nowMs));
  assert.equal(check1.allowed, true);

  // Insert a comment 1 minute ago
  (await d.run(`
    INSERT INTO comments (user_id, target_type, target_id, body, created_at)
    VALUES (?, 'review', 'rev_1', 'Recent comment', ?)
  `, personaId, new Date(nowMs - 60000).toISOString()));

  // Should be blocked by 3-minute cooldown
  const check2 = (await canReplyToHuman(humanId, personaId, nowMs));
  assert.equal(check2.allowed, false);
  assert.equal(check2.reason, 'RATE_LIMIT_COOLDOWN_3MIN');

  // Insert 3 comments in past 10 hours
  (await d.run("DELETE FROM comments WHERE user_id = ?", personaId));
  for (let i = 0; i < 3; i++) {
    (await d.run(`
      INSERT INTO comments (user_id, target_type, target_id, body, created_at)
      VALUES (?, 'review', ?, 'Comment', ?)
    `, personaId, `rev_${i}`, new Date(nowMs - (i + 1) * 3600000).toISOString()));
  }

  // Should be blocked by daily cap (3 replies/day)
  const check3 = (await canReplyToHuman(humanId, personaId, nowMs));
  assert.equal(check3.allowed, false);
  assert.equal(check3.reason, 'DAILY_CAP_3_REPLIES_REACHED');

  // Cleanup
  (await d.run("DELETE FROM comments WHERE user_id = ?", personaId));
});

test('Track W: Humans can block and mute any AI persona in one click', async () => {
  const d = db();
  const humanId = 'test_human_blocker';
  const personaId = 'ai_persona_02';

  // Ensure human user exists
  (await d.run(`
    INSERT INTO users (id, name, email, password_hash, created_at, username, display_name)
    VALUES (?, 'Human Tester', 'tester@test.com', 'hash', CURRENT_TIMESTAMP, 'humantester', 'Tester') ON CONFLICT DO NOTHING
  `, humanId));

  const { ensureAiPersonaUser } = await import('../lib/ai/personas');
  await ensureAiPersonaUser(personaId);

  (await d.run("DELETE FROM blocks WHERE blocker_id = ?", humanId));
  (await d.run("DELETE FROM mutes WHERE muter_id = ?", humanId));

  // Block
  const blockRes = (await blockUser(humanId, 'priya_boxoffice'));
  assert.equal(blockRes.success, true, 'User should be able to block persona');

  // Mute
  const muteRes = (await muteUser(humanId, 'priya_boxoffice'));
  assert.equal(muteRes.success, true, 'User should be able to mute persona');

  // Cleanup
  (await d.run("DELETE FROM blocks WHERE blocker_id = ?", humanId));
  (await d.run("DELETE FROM mutes WHERE muter_id = ?", humanId));
  (await d.run("DELETE FROM users WHERE id = ?", humanId));
});

test('Track W: Ask the Crew returns 3 diverse critic takes with archetypes and numbers', async () => {
  const res = await getAskTheCrewTakes('demo-dunes', 'hit_or_flop');
  assert.equal(res.titleId, 'demo-dunes');
  assert.equal(res.takes.length, 3, 'Must return 3 diverse takes');

  for (const take of res.takes) {
    assert(take.personaId.startsWith('ai_persona_'));
    assert(take.displayName);
    assert(['hit', 'flop'].includes(take.choice));
    assert(take.confidence >= 50 && take.confidence <= 95);
    assert(take.take.length >= 20);
  }
});

test('Track W: Contrarian Desk surfaces three-way divergence (Model vs AI Crew vs Humans)', async () => {
  const contrarians = await getContrarianReleases();
  assert(Array.isArray(contrarians));

  if (contrarians.length > 0) {
    const item = contrarians[0];
    assert(typeof item.modelHitProbability === 'number');
    assert(typeof item.communityHitProbability === 'number');
    assert(item.threeWaySplit, 'Must include threeWaySplit object');
    assert(typeof item.threeWaySplit.model === 'number');
  }
});
