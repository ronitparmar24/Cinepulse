import test from 'node:test';
import assert from 'node:assert/strict';
import { logEvent, getRecentEvents } from '../lib/analytics';
import { db } from '../lib/db';

test('analytics records events into analytics_events table', () => {
  const d = db();
  const testTitle = 'analytics-movie-test';

  logEvent('search_submitted', { query: 'Sci-Fi hits' }, 'user-telemetry-1');
  logEvent('movie_opened', { titleId: testTitle, tab: 'overview' });
  logEvent('recommendation_clicked', { fromTitleId: testTitle, toTitleId: 'movie-next', mode: 'taste_match' });

  const events = getRecentEvents(10);
  assert.ok(events.length >= 3);

  const searchEvt = events.find((e) => e.eventType === 'search_submitted');
  assert.ok(searchEvt);
  assert.equal(searchEvt.metadata.query, 'Sci-Fi hits');
  assert.equal(searchEvt.userId, 'user-telemetry-1');

  const movieEvt = events.find((e) => e.eventType === 'movie_opened');
  assert.ok(movieEvt);
  assert.equal(movieEvt.metadata.titleId, testTitle);

  const recEvt = events.find((e) => e.eventType === 'recommendation_clicked');
  assert.ok(recEvt);
  assert.equal(recEvt.metadata.mode, 'taste_match');
});
