import test from 'node:test';
import assert from 'node:assert/strict';
import { columnsOf, indexesOf } from './helpers/schema';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, realUsersOnly, CURRENT_SCHEMA_VERSION } from '../lib/db';
import { isAi, aiCrewOnly } from '../lib/ai/isAi';
import { getPulse, putForecast } from '../lib/pulse';
import { getLeaderboard } from '../lib/pulse/adjudication';
import type { User } from '../lib/types';

test('Track S: Schema v11 contains is_ai and ai_persona_id columns with indexes', async () => {
  assert.ok(CURRENT_SCHEMA_VERSION >= 11);
  const d = db();
  const columns = await columnsOf(d, 'users');
  assert(columns.some(c => c.name === 'is_ai'), 'users table must have is_ai column');
  assert(columns.some(c => c.name === 'ai_persona_id'), 'users table must have ai_persona_id column');

  const indexes = await indexesOf(d, 'users');
  assert(indexes.some(i => i.name === 'idx_users_is_ai'), 'idx_users_is_ai index must exist on users');
  assert(indexes.some(i => i.name === 'idx_users_ai_persona'), 'idx_users_ai_persona index must exist on users');
});

test('Track S: isAi() and SQL wall helpers enforce hard disclosure boundaries', () => {
  assert.equal(isAi({ is_ai: 1 }), true);
  assert.equal(isAi({ isAi: true }), true);
  assert.equal(isAi({ is_ai: 0 }), false);
  assert.equal(isAi({ isAi: false }), false);
  assert.equal(isAi(null), false);
  assert.equal(isAi(undefined), false);

  assert.equal(aiCrewOnly(), 'COALESCE(is_ai, 0) = 1');
  assert.equal(aiCrewOnly('u'), 'COALESCE(u.is_ai, 0) = 1');
  assert.equal(realUsersOnly(), '(COALESCE(is_seed, 0) = 0 AND COALESCE(is_ai, 0) = 0)');
  assert.equal(realUsersOnly('u'), '(COALESCE(u.is_seed, 0) = 0 AND COALESCE(u.is_ai, 0) = 0)');
});

test('Track S: Public stats queries preserve realUsersOnly or explicit is_ai wall', () => {
  const adjudicationCode = readFileSync(resolve(process.cwd(), 'lib/pulse/adjudication.ts'), 'utf8');
  assert(adjudicationCode.includes('realUsersOnly'), 'adjudication.ts must enforce realUsersOnly');
  assert(adjudicationCode.includes('is_ai'), 'adjudication.ts must check is_ai');

  const receiptsCode = readFileSync(resolve(process.cwd(), 'lib/receipts.ts'), 'utf8');
  assert(receiptsCode.includes('realUsersOnly'), 'receipts.ts must enforce realUsersOnly');
});

test('Track S: Pulse with AI personas and 0 humans yields count=0 humans and labelled AI Crew notice', async () => {
  const d = db();
  const testTitle = 'demo-orbit';

  // Backup and clean test title records
  const existingForecasts = (await d.all("SELECT * FROM forecasts WHERE title_id = ?", testTitle));
  const existingEvents = (await d.all("SELECT * FROM forecast_events WHERE title_id = ?", testTitle));
  (await d.run("DELETE FROM forecasts WHERE title_id = ?", testTitle));
  (await d.run("DELETE FROM forecast_events WHERE title_id = ?", testTitle));
  (await d.run("DELETE FROM users WHERE id LIKE 'ai_test_persona_%'"));

  // Create 3 AI personas with is_ai = 1 and is_seed = 1
  const aiUsers: User[] = [
    { id: 'ai_test_persona_1', name: 'Auteur Persona', email: 'ai1@test.local', createdAt: new Date().toISOString(), isAi: true, isSeed: true },
    { id: 'ai_test_persona_2', name: 'Hype Persona', email: 'ai2@test.local', createdAt: new Date().toISOString(), isAi: true, isSeed: true },
    { id: 'ai_test_persona_3', name: 'Skeptic Persona', email: 'ai3@test.local', createdAt: new Date().toISOString(), isAi: true, isSeed: true },
  ];

  for (const u of aiUsers) {
    (await d.run(`
      INSERT INTO users (id, name, email, password_hash, created_at, username, display_name, is_seed, is_ai, ai_persona_id)
      VALUES (?, ?, ?, 'hash', ?, ?, ?, 1, 1, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, password_hash = excluded.password_hash, created_at = excluded.created_at, username = excluded.username, display_name = excluded.display_name, is_seed = excluded.is_seed, is_ai = excluded.is_ai, ai_persona_id = excluded.ai_persona_id
    `, u.id, u.name, u.email, u.createdAt, u.id, u.name, u.id));
  }

  // Put forecasts from AI personas: 2 hits, 1 flop
  await putForecast(aiUsers[0], testTitle, { choice: 'hit', confidence: 80, reason: 'Visual style' }, { skipOpenCheck: true });
  await putForecast(aiUsers[1], testTitle, { choice: 'hit', confidence: 75, reason: 'Star power' }, { skipOpenCheck: true });
  await putForecast(aiUsers[2], testTitle, { choice: 'flop', confidence: 70, reason: 'Overstuffed' }, { skipOpenCheck: true });

  // 1. Default (human) view: With 0 humans, count MUST be 0 and crewNotice MUST be populated
  const humanPulse = await getPulse(testTitle);
  assert.equal(humanPulse.count, 0, 'Human count must be 0 when no humans have voted');
  assert.equal(humanPulse.hit, 0);
  assert.equal(humanPulse.flop, 0);
  assert.equal(humanPulse.humanCount, 0);
  assert.equal(humanPulse.aiCount, 3);
  assert.equal(humanPulse.aiHit, 2);
  assert.equal(humanPulse.aiFlop, 1);
  assert.equal(humanPulse.crewNotice, 'No human votes yet — AI Crew leans 2 hit / 1 flop');

  // 2. Combined / Crew toggle view: Shows the 3 AI calls
  const crewPulse = await getPulse(testTitle, null, { crew: true });
  assert.equal(crewPulse.count, 3, 'Crew view should display 3 votes');
  assert.equal(crewPulse.hit, 2);
  assert.equal(crewPulse.flop, 1);

  // 3. Leaderboard isolation: AI personas must not leak into human leaderboard
  (await d.run("DELETE FROM brier_scores WHERE entity_id LIKE 'ai_test_persona_%'"));
  (await d.run(`
    INSERT INTO brier_scores (entity_id, entity_type, entity_name, brier_score, accuracy_rate, total_calls, correct_calls, rank)
    VALUES ('ai_test_persona_1', 'user', 'Auteur Persona', 0.110, 90.0, 10, 9, 1) ON CONFLICT(entity_id) DO UPDATE SET entity_type = excluded.entity_type, entity_name = excluded.entity_name, brier_score = excluded.brier_score, accuracy_rate = excluded.accuracy_rate, total_calls = excluded.total_calls, correct_calls = excluded.correct_calls, rank = excluded.rank
  `));

  // Query human leaderboard (with realOnly or when real users exist)
  const humanBoard = (await getLeaderboard(50, 1, { realOnly: true }));
  assert(!humanBoard.some(e => e.entityId === 'ai_test_persona_1'), 'AI persona must not be in human leaderboard');

  // Query crew leaderboard
  const crewBoard = (await getLeaderboard(50, 1, { crewOnly: true }));
  assert(crewBoard.some(e => e.entityId === 'ai_test_persona_1'), 'AI persona must be in AI Crew leaderboard');
  const personaEntry = crewBoard.find(e => e.entityId === 'ai_test_persona_1');
  assert.equal(personaEntry?.isAi, true);

  // Cleanup
  (await d.run("DELETE FROM forecasts WHERE title_id = ?", testTitle));
  (await d.run("DELETE FROM forecast_events WHERE title_id = ?", testTitle));
  (await d.run("DELETE FROM users WHERE id LIKE 'ai_test_persona_%'"));
  (await d.run("DELETE FROM brier_scores WHERE entity_id LIKE 'ai_test_persona_%'"));

  for (const f of existingForecasts as any[]) {
    (await d.run("INSERT INTO forecasts (user_id, title_id, choice, confidence, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, title_id) DO UPDATE SET choice = excluded.choice, confidence = excluded.confidence, reason = excluded.reason, created_at = excluded.created_at, updated_at = excluded.updated_at", f.user_id, f.title_id, f.choice, f.confidence, f.reason, f.created_at, f.updated_at));
  }
  for (const e of existingEvents as any[]) {
    (await d.run("INSERT INTO forecast_events (id, user_id, title_id, choice, confidence, reason, created_at, first_submission) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, title_id = excluded.title_id, choice = excluded.choice, confidence = excluded.confidence, reason = excluded.reason, created_at = excluded.created_at, first_submission = excluded.first_submission", e.id, e.user_id, e.title_id, e.choice, e.confidence, e.reason, e.created_at, e.first_submission));
  }
});
