#!/usr/bin/env node
/**
 * CinePulse v7 — Synthetic Community Unseeding (Track L)
 * Transactionally purges all synthetic community personas (is_seed=1)
 * and all dependent rows (forecasts, events, reviews, comments, likes,
 * follows, notifications, activity events, and brier scores).
 * Completely safe and idempotent. Real user accounts are strictly preserved.
 */

import { pathToFileURL } from 'node:url';
import { db, closeDb, transaction } from '../lib/db.ts';

console.log('─── CinePulse Synthetic Community Unseeding ────────────');

const d = db();

const result = await transaction(async () => {
  // 1. Get seed user IDs
  const seedUsers = (await d.all('SELECT id FROM users WHERE is_seed = 1'));
  const seedIds = seedUsers.map(u => u.id);

  if (seedIds.length === 0) {
    return {
      users: 0,
      forecasts: 0,
      forecastEvents: 0,
      reviews: 0,
      comments: 0,
      likes: 0,
      follows: 0,
      notifications: 0,
      activityEvents: 0,
      brierScores: 0,
      predictionsLog: 0,
    };
  }

  // 2. Remove brier scores
  const brierRes = (await d.run(`
    DELETE FROM brier_scores
    WHERE entity_id IN (SELECT id FROM users WHERE is_seed = 1)
  `));

  // 3. Remove activity events
  const activityRes = (await d.run(`
    DELETE FROM activity_events
    WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)
  `));

  // 4. Remove comments
  const commentsRes = (await d.run(`
    DELETE FROM comments
    WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)
  `));

  // 5. Remove likes
  const likesRes = (await d.run(`
    DELETE FROM likes
    WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)
  `));

  // 6. Remove follows
  const followsRes = (await d.run(`
    DELETE FROM follows
    WHERE follower_id IN (SELECT id FROM users WHERE is_seed = 1)
       OR followee_id IN (SELECT id FROM users WHERE is_seed = 1)
  `));

  // 7. Remove notifications
  const notifRes = (await d.run(`
    DELETE FROM notifications
    WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)
       OR actor_id IN (SELECT id FROM users WHERE is_seed = 1)
  `));

  // 8. Remove reviews
  const reviewsRes = (await d.run(`
    DELETE FROM reviews
    WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)
  `));

  // 9. Remove forecast events
  const eventsRes = (await d.run(`
    DELETE FROM forecast_events
    WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)
  `));

  // 10. Remove forecasts
  const forecastsRes = (await d.run(`
    DELETE FROM forecasts
    WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)
  `));

  // 11. Remove library entries
  (await d.run(`
    DELETE FROM library
    WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)
  `));

  // 12. Remove privacy settings
  (await d.run(`
    DELETE FROM privacy_settings
    WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)
  `));

  // 13. Remove users
  const usersRes = (await d.run(`
    DELETE FROM users
    WHERE is_seed = 1
  `));

  // 14. Remove benchmark predictions_log created for seed testing
  const predLogRes = (await d.run(`
    DELETE FROM predictions_log
    WHERE id LIKE 'seed_log_%'
  `));

  return {
    users: Number(usersRes.changes || 0),
    forecasts: Number(forecastsRes.changes || 0),
    forecastEvents: Number(eventsRes.changes || 0),
    reviews: Number(reviewsRes.changes || 0),
    comments: Number(commentsRes.changes || 0),
    likes: Number(likesRes.changes || 0),
    follows: Number(followsRes.changes || 0),
    notifications: Number(notifRes.changes || 0),
    activityEvents: Number(activityRes.changes || 0),
    brierScores: Number(brierRes.changes || 0),
    predictionsLog: Number(predLogRes.changes || 0),
  };
});

console.log('\n✔ Synthetic community data removed cleanly:');
console.log(`   - Persona accounts removed:   ${result.users}`);
console.log(`   - Forecasts removed:          ${result.forecasts}`);
console.log(`   - Forecast events removed:    ${result.forecastEvents}`);
console.log(`   - Reviews removed:            ${result.reviews}`);
console.log(`   - Threaded comments removed:  ${result.comments}`);
console.log(`   - Likes removed:              ${result.likes}`);
console.log(`   - Follow relationships purged: ${result.follows}`);
console.log(`   - Notifications purged:       ${result.notifications}`);
console.log(`   - Activity events removed:    ${result.activityEvents}`);
console.log(`   - Brier score entries wiped:  ${result.brierScores}`);
console.log(`   - Benchmark prediction logs:  ${result.predictionsLog}`);
console.log('Real user and curator accounts (is_seed=0) remain completely untouched.\n');

// Close the pool only when run as a command (tests import this module in-process).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await closeDb();
