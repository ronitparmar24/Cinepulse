import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { register } from '../lib/auth';
import { db } from '../lib/db';
import { checkMilestones, getGoalStatus, milestoneText, setGoal, weekStart, weeklyStreak } from '../lib/goals';
import { AUTO_HIDE_AT, listOpenReports, reportContent, resolveReports } from '../lib/moderation';
import { community, titleReviews } from '../lib/reviews';

let n = 0;
const member = async () => (await register({ name: `Member ${++n}`, email: `gm.${Date.now()}.${n}@example.com`, password: 'goals-password-1' })).user;

test('weeks start on Monday and streaks count consecutive weeks', () => {
  assert.equal(weekStart('2026-11-25'), '2026-11-23'); // Wednesday → Monday
  assert.equal(weekStart('2026-11-23'), '2026-11-23');
  assert.equal(weekStart('2026-11-29'), '2026-11-23'); // Sunday stays in the same week
  const today = '2026-11-25';
  const s = weeklyStreak(['2026-11-24', '2026-11-17', '2026-11-10', '2026-10-20', '2026-10-13', '2026-10-06', '2026-09-29'], today);
  assert.equal(s.current, 3);
  assert.equal(s.best, 4);
  assert.equal(s.weeks.length, 12);
  assert.equal(s.weeks[11], 1);
  // Nothing yet this week: last week's streak still counts.
  assert.equal(weeklyStreak(['2026-11-17', '2026-11-10'], today).current, 2);
  assert.equal(weeklyStreak(['2026-11-03'], today).current, 0);
  assert.equal(weeklyStreak([], today).best, 0);
});

test('goals: set, validate, clear, and progress from watched titles', async () => {
  const user = await member();
  const at = new Date('2026-06-15T10:00:00Z');
  await db().run(`INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at) VALUES (?, 'movie-11', '{"title":"A"}', 'watched', NULL, '2026-06-03T00:00:00.000Z')`, user.id);
  await db().run(`INSERT INTO diary_entries (id, user_id, title_id, title_json, watched_on, rating, rewatch, liked, created_at, updated_at) VALUES (?, ?, 'movie-12', '{"title":"B"}', '2026-06-14', NULL, 0, 0, ?, ?)`, randomUUID(), user.id, at.toISOString(), at.toISOString());
  let s = await getGoalStatus(user.id, at);
  assert.equal(s.target, null);
  assert.equal(s.watched, 2);
  assert.equal(s.streak.current, 2, 'two consecutive weeks');
  s = await setGoal(user.id, { target: 10 }, at);
  assert.equal(s.target, 10);
  assert.equal(s.percent, 20);
  assert.ok((s.perWeekToFinish ?? 0) > 0);
  await assert.rejects(() => setGoal(user.id, { target: 0 }, at), /whole number/);
  await assert.rejects(() => setGoal(user.id, { target: 2.5 }, at), /whole number/);
  s = await setGoal(user.id, { target: null }, at);
  assert.equal(s.target, null);
});

test('milestones notify once, only the newest count, plus the goal', async () => {
  const user = await member();
  const at = new Date('2026-08-01T10:00:00Z');
  for (let i = 0; i < 26; i++) {
    await db().run(`INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at) VALUES (?, ?, '{"title":"x"}', 'watched', NULL, '2026-07-15T00:00:00.000Z')`, user.id, `movie-${2000 + i}`);
  }
  await setGoal(user.id, { target: 20 }, at);
  const sent = await checkMilestones(user.id, at);
  assert.deepEqual(sent, ['2026:count:25', '2026:goal:20']);
  assert.deepEqual(await checkMilestones(user.id, at), [], 'nothing twice');
  const unread = await db().all(`SELECT target_id FROM notifications WHERE user_id = ? AND type = 'milestone' AND read_at IS NULL ORDER BY target_id`, user.id) as any[];
  assert.deepEqual(unread.map((r) => r.target_id), ['2026:count:25', '2026:goal:20'], 'the 10 milestone was recorded as already read');
  assert.equal(milestoneText('2026:goal:20'), 'You hit your 2026 goal of 20 titles. Take a bow.');
  assert.match(milestoneText('2026:count:25'), /25 titles watched in 2026/);
});

test('reports: no self-reports, one per member, auto-hide at three, moderator resolution', async () => {
  const author = await member();
  const reviewId = randomUUID();
  await db().run(`INSERT INTO reviews (id, user_id, title_id, title_name, body, rating, spoiler, kind, created_at) VALUES (?, ?, 'demo-dunes', 'Beyond the Dunes', 'Rude spoiler-filled take', NULL, 0, 'first-impression', ?)`, reviewId, author.id, new Date().toISOString());
  const visible = async () => (await titleReviews('demo-dunes')).some((r) => r.id === reviewId);
  assert.equal(await visible(), true);

  await assert.rejects(() => reportContent(author.id, { targetType: 'review', targetId: reviewId, reason: 'spam' }), /your own/);
  const reporters = await Promise.all(Array.from({ length: AUTO_HIDE_AT }, () => member()));
  await assert.rejects(() => reportContent(reporters[0].id, { targetType: 'review', targetId: reviewId, reason: 'nonsense' }), /reason/);
  await assert.rejects(() => reportContent(reporters[0].id, { targetType: 'list', targetId: reviewId, reason: 'spam' }), /Only reviews and comments/);
  await assert.rejects(() => reportContent(reporters[0].id, { targetType: 'review', targetId: 'missing', reason: 'spam' }), /no longer exists/);

  let r = await reportContent(reporters[0].id, { targetType: 'review', targetId: reviewId, reason: 'spoilers', note: 'Ruins the ending' });
  assert.deepEqual([r.hidden, r.alreadyReported], [false, false]);
  r = await reportContent(reporters[0].id, { targetType: 'review', targetId: reviewId, reason: 'spoilers' });
  assert.equal(r.alreadyReported, true, 'a second report from the same member does not count');
  await reportContent(reporters[1].id, { targetType: 'review', targetId: reviewId, reason: 'harassment' });
  assert.equal(await visible(), true, 'two reports: still visible');
  r = await reportContent(reporters[2].id, { targetType: 'review', targetId: reviewId, reason: 'spoilers' });
  assert.equal(r.hidden, true);
  assert.equal(await visible(), false, 'hidden from the title page');
  assert.equal((await community()).some((x) => x.id === reviewId), false, 'and from the community feed');

  const queue = await listOpenReports();
  const g = queue.find((x) => x.targetId === reviewId)!;
  assert.equal(g.reports, 3);
  assert.equal(g.hidden, true);
  assert.deepEqual(g.reasons, { spoilers: 2, harassment: 1 });
  assert.deepEqual(g.notes, ['Ruins the ending']);

  await resolveReports('mod@example.com', { targetType: 'review', targetId: reviewId, action: 'restore' });
  assert.equal(await visible(), true, 'restored');
  assert.equal((await listOpenReports()).some((x) => x.targetId === reviewId), false, 'reports resolved');
  await assert.rejects(() => resolveReports('mod@example.com', { targetType: 'review', targetId: reviewId, action: 'delete' }), /action must be/);
});

test('goal and report APIs need sign-in; the moderation queue needs an admin', async () => {
  const route = await import('../app/api/[...path]/route');
  const { NextRequest } = await import('next/server');
  const call = (method: 'GET' | 'PUT' | 'POST', path: string, cookie?: string, payload?: unknown) => {
    const headers: Record<string, string> = { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000', 'content-type': 'application/json' };
    if (cookie) headers.cookie = cookie;
    return route[method](new NextRequest(`http://127.0.0.1:3000/api/${path}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) }), { params: Promise.resolve({ path: path.split('/') }) });
  };
  assert.equal((await call('GET', 'goals')).status, 401);
  assert.equal((await call('POST', 'reports', undefined, {})).status, 401);
  const { token } = await register({ name: 'Api Member', email: `api.${Date.now()}@example.com`, password: 'goals-password-2' });
  const cookie = `cinepulse_session=${token}`;
  assert.equal((await call('PUT', 'goals', cookie, { target: 52 })).status, 200);
  assert.equal((await (await call('GET', 'goals', cookie)).json()).target, 52);
  assert.equal((await call('GET', 'admin/reports', cookie)).status, 403);
});
