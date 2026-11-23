#!/usr/bin/env node
/**
 * CinePulse v9 — AI Community Purge (Track X)
 * Removes all AI community rows cleanly in a single transaction.
 * Real users and curators (is_ai=0) are completely untouched.
 */

import { pathToFileURL } from 'node:url';
import { db, closeDb, transaction } from '../lib/db.ts';

console.log('─── CinePulse AI Community Purge ────────────────────────');

const d = db();

const aiUsers = (await d.get("SELECT COUNT(*) as count FROM users WHERE is_ai = 1"));
const queueRows = (await d.get("SELECT COUNT(*) as count FROM ai_content_queue"));
const logRows = (await d.get("SELECT COUNT(*) as count FROM ai_activity_log"));

await transaction(async () => {
  // 1. Delete forecasts, reviews, comments, and likes from AI accounts
  (await d.run("DELETE FROM forecasts WHERE user_id IN (SELECT id FROM users WHERE is_ai = 1)"));
  (await d.run("DELETE FROM forecast_events WHERE user_id IN (SELECT id FROM users WHERE is_ai = 1)"));
  (await d.run("DELETE FROM reviews WHERE user_id IN (SELECT id FROM users WHERE is_ai = 1)"));
  (await d.run("DELETE FROM comments WHERE user_id IN (SELECT id FROM users WHERE is_ai = 1)"));
  (await d.run("DELETE FROM likes WHERE user_id IN (SELECT id FROM users WHERE is_ai = 1)"));
  (await d.run("DELETE FROM follows WHERE follower_id IN (SELECT id FROM users WHERE is_ai = 1) OR following_id IN (SELECT id FROM users WHERE is_ai = 1)"));

  // 2. Clear AI community specific tables
  (await d.run("DELETE FROM ai_content_queue"));
  (await d.run("DELETE FROM ai_activity_log"));
  (await d.run("DELETE FROM ai_persona_memory"));

  // 3. Delete AI users
  (await d.run("DELETE FROM users WHERE is_ai = 1"));

  // 4. Remove pause cache key
  (await d.run("DELETE FROM api_cache WHERE cache_key = 'ai_community_paused'"));
});

console.log('✔ AI Community data purged cleanly:');
console.log(`   - AI user accounts removed: ${aiUsers?.count || 0}`);
console.log(`   - Content queue rows wiped: ${queueRows?.count || 0}`);
console.log(`   - Activity logs cleared:    ${logRows?.count || 0}`);
console.log('Real user and curator accounts (is_ai=0) remain completely untouched.');

// Close the pool only when run as a command (tests import this module in-process).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await closeDb();
