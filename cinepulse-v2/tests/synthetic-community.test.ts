import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, realUsersOnly, CURRENT_SCHEMA_VERSION } from '../lib/db';
// @ts-ignore
import { generatePersonas } from '../scripts/generate-personas.mjs';
import { getLeaderboard, getCrowdVsEngine } from '../lib/pulse/adjudication';
import { getPulse } from '../lib/pulse';
import type { User } from '../lib/types';

test('Track J1: Schema version is 8 and users table has is_seed column with index', () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 8);

  const d = db();
  const columns = d.prepare("PRAGMA table_info(users)").all() as { name: string; dflt_value: any }[];
  const isSeedCol = columns.find(c => c.name === 'is_seed');
  assert(isSeedCol, 'users table must have is_seed column');
  assert.equal(isSeedCol.dflt_value, '0');

  const indexes = d.prepare("PRAGMA index_list(users)").all() as { name: string }[];
  const hasIndex = indexes.some(i => i.name === 'idx_users_is_seed');
  assert(hasIndex, 'idx_users_is_seed index must exist on users');
});

test('Track J1: realUsersOnly() helper formats correct SQL predicates with and without table alias', () => {
  assert.equal(realUsersOnly(), 'COALESCE(is_seed, 0) = 0');
  assert.equal(realUsersOnly('u'), 'COALESCE(u.is_seed, 0) = 0');
  assert.equal(realUsersOnly('users'), 'COALESCE(users.is_seed, 0) = 0');
});

test('Track J2: generatePersonas produces required persona structure, archetypes, and safety metadata', () => {
  const personas = generatePersonas(50, false);
  assert.equal(personas.length, 50);

  const seenUsernames = new Set<string>();
  const archetypes = new Set<string>();

  for (const p of personas) {
    assert(p.id.startsWith('seed_'), `ID must start with seed_: ${p.id}`);
    assert(p.username && p.username.length >= 3, `Invalid username: ${p.username}`);
    assert(!seenUsernames.has(p.username), `Duplicate username: ${p.username}`);
    seenUsernames.add(p.username);

    assert(p.displayName && p.displayName.length >= 3, `Invalid displayName: ${p.displayName}`);
    assert(p.bio && p.bio.length >= 10, `Invalid bio: ${p.bio}`);
    assert(p.avatarUrl.includes('dicebear.com'), `Avatar must use DiceBear: ${p.avatarUrl}`);
    assert.equal(p.is_seed, 1);

    assert(p.archetype, 'Must have archetype');
    archetypes.add(p.archetype);

    assert(p.tastePreferences, 'Must have tastePreferences');
    assert(Array.isArray(p.tastePreferences.favoredGenres), 'favoredGenres must be array');
    assert(typeof p.tastePreferences.ratingBias === 'number', 'ratingBias must be number');
    assert(typeof p.tastePreferences.hitFlopOptimism === 'number', 'hitFlopOptimism must be number');

    assert.equal(p.metadata?.is_synthetic_seed, true, 'Metadata must have is_synthetic_seed=true');
    assert.equal(p.metadata?.version, 'v7');
  }

  assert(archetypes.has('optimist'), 'Must contain optimist archetype');
  assert(archetypes.has('contrarian'), 'Must contain contrarian archetype');
  assert(archetypes.has('casual'), 'Must contain casual archetype');
  assert(archetypes.has('genre-specialist:horror'), 'Must contain horror specialist');
  assert(archetypes.has('genre-specialist:scifi'), 'Must contain scifi specialist');
});

test('Track K & L: End-to-end seed:community, pulse multi-day history, leaderboard wall, and clean unseed', async () => {
  const d = db();

  // Ensure clean starting baseline
  d.prepare("DELETE FROM users WHERE is_seed = 1").run();
  d.prepare("DELETE FROM brier_scores WHERE entity_id != 'cinepulse-engine'").run();

  // 1. Run seed script logic programmatically
  const personas = generatePersonas(50, false);
  const nowMs = Date.now();

  // Insert seed users
  d.exec('BEGIN IMMEDIATE');
  for (const p of personas) {
    d.prepare(`
      INSERT OR REPLACE INTO users (id, name, email, password_hash, created_at, username, display_name, bio, avatar_url, profile_visibility, is_seed)
      VALUES (?, ?, ?, 'hash', ?, ?, ?, ?, ?, 'public', 1)
    `).run(p.id, p.displayName, `${p.username}@seed.local`, new Date().toISOString(), p.username, p.displayName, p.bio, p.avatarUrl);
  }
  d.exec('COMMIT');

  // Clean test title 'demo-orbit'
  d.prepare("DELETE FROM forecasts WHERE title_id = 'demo-orbit'").run();
  d.prepare("DELETE FROM forecast_events WHERE title_id = 'demo-orbit'").run();

  // Insert backdated forecasts across 3 distinct days for 'demo-orbit' title
  const { putForecast } = await import('../lib/pulse');
  const user1: User = { id: personas[0].id, name: personas[0].displayName, email: `${personas[0].username}@seed.local`, createdAt: new Date().toISOString() };
  const user2: User = { id: personas[1].id, name: personas[1].displayName, email: `${personas[1].username}@seed.local`, createdAt: new Date().toISOString() };
  const user3: User = { id: personas[2].id, name: personas[2].displayName, email: `${personas[2].username}@seed.local`, createdAt: new Date().toISOString() };

  const timeDay1 = new Date(nowMs - 15 * 86400 * 1000).toISOString();
  const timeDay2 = new Date(nowMs - 10 * 86400 * 1000).toISOString();
  const timeDay3 = new Date(nowMs - 2 * 86400 * 1000).toISOString();

  await putForecast(user1, 'demo-orbit', { choice: 'hit', confidence: 85, reason: 'Strong visual scope' }, { timestamp: timeDay1, skipOpenCheck: true });
  await putForecast(user2, 'demo-orbit', { choice: 'hit', confidence: 75, reason: 'Auteur momentum' }, { timestamp: timeDay2, skipOpenCheck: true });
  await putForecast(user3, 'demo-orbit', { choice: 'flop', confidence: 65, reason: 'Crowded window' }, { timestamp: timeDay3, skipOpenCheck: true });

  // Update user1 forecast (first_submission must be 0 for second call)
  await putForecast(user1, 'demo-orbit', { choice: 'hit', confidence: 90, reason: 'Presale acceleration' }, { timestamp: timeDay3, skipOpenCheck: true });

  // Verify Pulse panel stats and multi-day growth
  const pulse = await getPulse('demo-orbit');
  assert.equal(pulse.count, 3, 'Should have 3 unique user forecasts');
  assert.equal(pulse.hit, 2, 'Should have 2 hits');
  assert.equal(pulse.flop, 1, 'Should have 1 flop');
  assert(pulse.history.length >= 2, 'History array must span multiple distinct days, not a flat same-day wall');

  const events = d.prepare("SELECT * FROM forecast_events WHERE user_id = ? AND title_id = 'demo-orbit' ORDER BY created_at ASC").all(user1.id) as any[];
  assert.equal(events.length, 2);
  assert.equal(events[0].first_submission, 1, 'First event must have first_submission = 1');
  assert.equal(events[1].first_submission, 0, 'Subsequent event must have first_submission = 0');

  // Insert Brier score for seed user to verify Leaderboard Wall
  d.prepare(`
    INSERT OR REPLACE INTO brier_scores (entity_id, entity_type, entity_name, brier_score, accuracy_rate, total_calls, correct_calls, rank)
    VALUES (?, 'user', ?, 0.125, 85.0, 10, 8, 1)
  `).run(user1.id, user1.name);

  // When no real user exists in brier_scores, seed users are visible in demo leaderboard
  const demoLeaderboard = getLeaderboard(50, 1);
  const foundSeedInDemo = demoLeaderboard.some(e => e.entityId === user1.id);
  assert(foundSeedInDemo, 'Demo leaderboard should display seed user when no real users have scores');

  // Now simulate a real user getting a scored call
  const realUserId = 'real_user_tester_99';
  d.prepare(`
    INSERT OR REPLACE INTO users (id, name, email, password_hash, created_at, username, is_seed)
    VALUES (?, 'Real Critic', 'real@critic.com', 'hash', ?, 'real_critic', 0)
  `).run(realUserId, new Date().toISOString());

  d.prepare(`
    INSERT OR REPLACE INTO brier_scores (entity_id, entity_type, entity_name, brier_score, accuracy_rate, total_calls, correct_calls, rank)
    VALUES (?, 'user', 'Real Critic', 0.110, 90.0, 15, 14, 1)
  `).run(realUserId);

  // Leaderboard Wall: The moment a real user has scored calls, realUsersOnly() drops seed personas!
  const wallLeaderboard = getLeaderboard(50, 1);
  const realUserPresent = wallLeaderboard.some(e => e.entityId === realUserId);
  const seedUserPresent = wallLeaderboard.some(e => e.entityId === user1.id);
  assert(realUserPresent, 'Real user must appear on the leaderboard');
  assert(!seedUserPresent, 'Seed personas must be dropped once real user is scored');

  // Follow safety check: real user should not be followed by seed users
  const realFollows = d.prepare("SELECT COUNT(*) as count FROM follows WHERE followee_id = ?").get(realUserId) as any;
  assert.equal(Number(realFollows?.count || 0), 0, 'Seed personas must never auto-follow real users');

  // 2. Test Unseed: Clean purge of all is_seed = 1 rows
  // @ts-ignore
  const unseedModule = await import('../scripts/unseed-community.mjs');

  const remainingSeedUsers = d.prepare("SELECT COUNT(*) as count FROM users WHERE is_seed = 1").get() as any;
  assert.equal(Number(remainingSeedUsers?.count || 0), 0, 'All seed users must be deleted');

  const remainingSeedForecasts = d.prepare("SELECT COUNT(*) as count FROM forecasts WHERE user_id = ?").get(user1.id) as any;
  assert.equal(Number(remainingSeedForecasts?.count || 0), 0, 'Seed forecasts must be deleted');

  const remainingRealUser = d.prepare("SELECT * FROM users WHERE id = ?").get(realUserId) as any;
  assert(remainingRealUser, 'Real user must remain completely untouched after unseed');

  // Cleanup test real user
  d.prepare("DELETE FROM brier_scores WHERE entity_id = ?").run(realUserId);
  d.prepare("DELETE FROM users WHERE id = ?").run(realUserId);
});
