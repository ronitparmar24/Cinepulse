#!/usr/bin/env node
/**
 * CinePulse v9 — AI Community Purge (Track X)
 * Removes all AI community rows cleanly in a single transaction.
 * Real users and curators (is_ai=0) are completely untouched.
 */

import { db, transaction } from '../lib/db.ts';

console.log('─── CinePulse AI Community Purge ────────────────────────');

const d = db();

const aiUsers = d.prepare("SELECT COUNT(*) as count FROM users WHERE is_ai = 1").get();
const queueRows = d.prepare("SELECT COUNT(*) as count FROM ai_content_queue").get();
const logRows = d.prepare("SELECT COUNT(*) as count FROM ai_activity_log").get();

transaction(() => {
  // 1. Delete forecasts, reviews, comments, and likes from AI accounts
  d.prepare("DELETE FROM forecasts WHERE user_id IN (SELECT id FROM users WHERE is_ai = 1)").run();
  d.prepare("DELETE FROM forecast_events WHERE user_id IN (SELECT id FROM users WHERE is_ai = 1)").run();
  d.prepare("DELETE FROM reviews WHERE user_id IN (SELECT id FROM users WHERE is_ai = 1)").run();
  d.prepare("DELETE FROM comments WHERE user_id IN (SELECT id FROM users WHERE is_ai = 1)").run();
  d.prepare("DELETE FROM likes WHERE user_id IN (SELECT id FROM users WHERE is_ai = 1)").run();
  d.prepare("DELETE FROM follows WHERE follower_id IN (SELECT id FROM users WHERE is_ai = 1) OR following_id IN (SELECT id FROM users WHERE is_ai = 1)").run();

  // 2. Clear AI community specific tables
  d.prepare("DELETE FROM ai_content_queue").run();
  d.prepare("DELETE FROM ai_activity_log").run();
  d.prepare("DELETE FROM ai_persona_memory").run();

  // 3. Delete AI users
  d.prepare("DELETE FROM users WHERE is_ai = 1").run();

  // 4. Remove pause cache key
  d.prepare("DELETE FROM api_cache WHERE cache_key = 'ai_community_paused'").run();
});

console.log('✔ AI Community data purged cleanly:');
console.log(`   - AI user accounts removed: ${aiUsers?.count || 0}`);
console.log(`   - Content queue rows wiped: ${queueRows?.count || 0}`);
console.log(`   - Activity logs cleared:    ${logRows?.count || 0}`);
console.log('Real user and curator accounts (is_ai=0) remain completely untouched.');
