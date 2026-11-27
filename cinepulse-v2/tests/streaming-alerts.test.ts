import test from 'node:test';
import assert from 'node:assert/strict';

// TMDB-style ids are "available" only in TMDB mode; provider lookups are stubbed, so nothing hits the network.
process.env.CATALOG_MODE = 'tmdb';

const { register } = await import('../lib/auth');
const { db, CURRENT_SCHEMA_VERSION } = await import('../lib/db');
const { setUserServices } = await import('../lib/userServices');
const { setReminderPrefs } = await import('../lib/reminders');
const { getNotifications, getGroupedNotifications } = await import('../lib/social/notifications');
const { runStreamingAlerts } = await import('../lib/streamingAlerts');
import type { WatchProviderInfo } from '../lib/types';

const info = (region: string, ...list: Array<[number, string]>): WatchProviderInfo => ({
  flatrate: list.map(([providerId, providerName]) => ({ providerId, providerName, logoPath: '' })), rent: [], buy: [], link: null, region,
});

/** Mutable "TMDB": `${titleId}:${region}` → flatrate providers. Records each lookup. */
function stubProviders() {
  const table = new Map<string, Array<[number, string]>>();
  const calls: string[] = [];
  const failing = new Set<string>();
  const providersFor = async (id: string, region: string) => {
    calls.push(`${id}:${region}`);
    if (failing.has(id)) throw new Error('lookup failed');
    return info(region, ...(table.get(`${id}:${region}`) ?? []));
  };
  return { table, calls, failing, providersFor };
}

let n = 0;
async function member(region: 'IN' | 'US', services: string[]) {
  const { user } = await register({ name: `Streamer ${++n}`, email: `stream.${Date.now()}.${n}@example.com`, password: 'streaming-password-1' });
  await db().run('UPDATE users SET region = ? WHERE id = ?', region, user.id);
  const u = { ...user, region };
  await setUserServices(u, { services });
  return u;
}
const save = (userId: string, id: string, title: string, releaseDate: string, status = 'watchlist') =>
  db().run('INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at) VALUES (?, ?, ?, ?, NULL, ?)',
    userId, id, JSON.stringify({ id, title, mediaType: 'movie', poster: `https://image.tmdb.org/t/p/w500/${id}.jpg`, releaseDate, genres: [] }), status, new Date().toISOString());
const alertsFor = async (userId: string) => (await getNotifications(userId, 50)).items.filter((i) => i.type === 'now_streaming');

test('schema v24 creates streaming_alerts', async () => {
  assert.ok(CURRENT_SCHEMA_VERSION >= 24);
  await db().get('SELECT user_id, title_id, provider_id, provider_name, title_json, checked_services, baseline, notified_at FROM streaming_alerts LIMIT 1');
});

test('first check is a silent baseline; new availability afterwards notifies exactly once', async () => {
  const p = stubProviders();
  const u = await member('IN', ['netflix']);
  await save(u.id, 'movie-9001', 'Already Streaming', '2020-01-01');
  await save(u.id, 'movie-9002', 'Dune: Part Two', '2024-03-01');
  p.table.set('movie-9001:IN', [[8, 'Netflix']]);

  const first = await runStreamingAlerts({ providersFor: p.providersFor });
  assert.equal(first.notified, 0);
  assert.ok(first.baseline >= 1);
  assert.deepEqual(await alertsFor(u.id), [], 'nothing announced on the first run');

  // Dune lands on Netflix (an ad-tier id still matches by name).
  p.table.set('movie-9002:IN', [[1796, 'Netflix Standard with Ads']]);
  const second = await runStreamingAlerts({ providersFor: p.providersFor });
  assert.equal(second.notified, 1);
  const alerts = await alertsFor(u.id);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].targetId, 'movie-9002|netflix');
  assert.equal(alerts[0].title?.id, 'movie-9002');
  assert.equal(alerts[0].title?.title, 'Dune: Part Two');
  assert.equal(alerts[0].provider, 'Netflix');
  const grouped = await getGroupedNotifications(u.id);
  assert.ok(grouped.some((g) => g.type === 'now_streaming' && g.label === 'Dune: Part Two is now on Netflix'));

  // Running again, or while it stays on Netflix, never repeats it.
  const third = await runStreamingAlerts({ providersFor: p.providersFor });
  assert.equal(third.notified, 0);
  assert.equal((await alertsFor(u.id)).length, 1);
});

test('unreleased, demo, other-region and other-service titles never notify', async () => {
  const p = stubProviders();
  const u = await member('IN', ['netflix']);
  await save(u.id, 'movie-9101', 'Not Out Yet', '2099-01-01');
  await save(u.id, 'demo-dunes', 'Demo Title', '2020-01-01');
  await save(u.id, 'movie-9102', 'Prime Only', '2020-01-01');
  await save(u.id, 'movie-9103', 'US Only', '2020-01-01');
  await save(u.id, 'movie-9104', 'Rent Only', '2020-01-01');
  await runStreamingAlerts({ providersFor: p.providersFor }); // baseline: nothing streaming anywhere yet

  p.table.set('movie-9101:IN', [[8, 'Netflix']]);
  p.table.set('demo-dunes:IN', [[8, 'Netflix']]);
  p.table.set('movie-9102:IN', [[119, 'Amazon Prime Video']]);
  p.table.set('movie-9103:US', [[8, 'Netflix']]);
  const result = await runStreamingAlerts({ providersFor: p.providersFor });
  assert.equal((await alertsFor(u.id)).length, 0);
  assert.ok(result.skipped >= 2);
  assert.ok(!p.calls.includes('movie-9101:IN'), 'unreleased titles are not looked up');
  assert.ok(!p.calls.some((c) => c.startsWith('demo-')), 'demo ids are not looked up');
  assert.ok(!p.calls.includes('movie-9103:US'), 'lookups use the member\'s region');
});

test('a newly added service is a baseline too, and members who turned reminders off are not alerted', async () => {
  const p = stubProviders();
  const u = await member('IN', ['netflix']);
  await save(u.id, 'movie-9201', 'On Prime For Ages', '2020-01-01');
  p.table.set('movie-9201:IN', [[119, 'Amazon Prime Video']]);
  await runStreamingAlerts({ providersFor: p.providersFor });
  await setUserServices(u, { services: ['netflix', 'prime'] });
  await runStreamingAlerts({ providersFor: p.providersFor });
  assert.equal((await alertsFor(u.id)).length, 0, 'adding Prime does not announce what was already on it');

  const quiet = await member('IN', ['netflix']);
  await setReminderPrefs(quiet.id, { watchlist: false });
  await save(quiet.id, 'movie-9202', 'Quiet Title', '2020-01-01');
  await runStreamingAlerts({ providersFor: p.providersFor });
  p.table.set('movie-9202:IN', [[8, 'Netflix']]);
  await runStreamingAlerts({ providersFor: p.providersFor });
  assert.equal((await alertsFor(quiet.id)).length, 0);
  const row = await db().get<{ baseline: number }>("SELECT baseline FROM streaming_alerts WHERE user_id = ? AND title_id = 'movie-9202' AND provider_id = 'netflix'", quiet.id);
  assert.equal(Number(row?.baseline), 1, 'recorded silently so turning reminders back on does not replay it');
});

test('a failed first lookup is not a baseline, and title lookups are shared and capped', async () => {
  const p = stubProviders();
  const a = await member('US', ['hulu']);
  const b = await member('US', ['hulu']);
  await save(a.id, 'movie-9301', 'Shared Title', '2020-01-01');
  await save(b.id, 'movie-9301', 'Shared Title', '2020-01-01');
  p.table.set('movie-9301:US', [[15, 'Hulu']]);
  p.failing.add('movie-9301');
  const failed = await runStreamingAlerts({ providersFor: p.providersFor });
  assert.ok(failed.lookupsFailed >= 1);
  p.failing.clear();
  p.calls.length = 0;
  await runStreamingAlerts({ providersFor: p.providersFor });
  assert.equal(p.calls.filter((c) => c === 'movie-9301:US').length, 1, 'one lookup for both members');
  assert.equal((await alertsFor(a.id)).length + (await alertsFor(b.id)).length, 0, 'after a failure the first real answer is the baseline');

  p.calls.length = 0;
  const capped = await runStreamingAlerts({ providersFor: p.providersFor, maxTitles: 2 });
  assert.ok(capped.titlesChecked <= 2);
  assert.ok(new Set(p.calls).size <= 2);
});
