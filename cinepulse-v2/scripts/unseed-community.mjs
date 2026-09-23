#!/usr/bin/env node
/**
 * CinePulse v7 — Synthetic Community Unseeding (Track L)
 * Transactionally purges all synthetic community personas (is_seed=1)
 * and all dependent rows (forecasts, events, reviews, comments, likes,
 * follows, notifications, activity events, and brier scores).
 * Completely safe and idempotent. Real user accounts are strictly preserved.
 */

import { db, transaction } from '../lib/db.ts';

console.log('─── CinePulse Synthetic Community Unseeding ────────────');

const d = db();

const result = transaction(() => {
  // 1. Get seed user IDs
  const seedUsers = d.prepare('SELECT id FROM users WHERE is_seed = 1').all();
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
  const brierRes = d.prepare(`
    DELETE FROM brier_scores
    WHERE entity_id IN (SELECT id FROM users WHERE is_seed = 1)
  `).run();

  // 3. Remove activity events
  const activityRes = d.prepare(`
    DELETE FROM activity_events
    WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)
  `).run();

  // 4. Remove comments
  const commentsRes = d.prepare(`
    DELETE FROM comments
    WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)
  `).run();

  // 5. Remove likes
  const likesRes = d.prepare(`
    DELETE FROM likes
    WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)
  `).run();

  // 6. Remove follows
  const followsRes = d.prepare(`
    DELETE FROM follows
    WHERE follower_id IN (SELECT id FROM users WHERE is_seed = 1)
       OR followee_id IN (SELECT id FROM users WHERE is_seed = 1)
  `).run();

  // 7. Remove notifications
  const notifRes = d.prepare(`
    DELETE FROM notifications
    WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)
       OR actor_id IN (SELECT id FROM users WHERE is_seed = 1)
  `).run();

  // 8. Remove reviews
  const reviewsRes = d.prepare(`
    DELETE FROM reviews
    WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)
  `).run();

  // 9. Remove forecast events
  const eventsRes = d.prepare(`
    DELETE FROM forecast_events
    WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)
  `).run();

  // 10. Remove forecasts
  const forecastsRes = d.prepare(`
    DELETE FROM forecasts
    WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)
  `).run();

  // 11. Remove library entries
  d.prepare(`
    DELETE FROM library
    WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)
  `).run();

  // 12. Remove privacy settings
  d.prepare(`
    DELETE FROM privacy_settings
    WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)
  `).run();

  // 13. Remove users
  const usersRes = d.prepare(`
    DELETE FROM users
    WHERE is_seed = 1
  `).run();

  // 14. Remove benchmark predictions_log created for seed testing
  const predLogRes = d.prepare(`
    DELETE FROM predictions_log
    WHERE id LIKE 'seed_log_%'
  `).run();

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
