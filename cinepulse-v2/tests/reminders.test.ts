import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../lib/auth';
import { db } from '../lib/db';
import {
  addDays, addReminder, getReminderPrefs, listReminders, regionToday, reminderEligible, removeReminder,
  runReleaseReminders, setReminderPrefs,
} from '../lib/reminders';
import { getNotifications } from '../lib/social/notifications';
import type { Title } from '../lib/types';

const title = (over: Partial<Title>): Title => ({
  id: 'movie-501', title: 'Five Oh One', mediaType: 'movie', poster: 'https://image.tmdb.org/t/p/w500/x.jpg', backdrop: null,
  releaseDate: '2099-01-01', genres: [], runtime: 120, seasons: null, overview: '', cast: [], ...over,
} as unknown as Title);

let n = 0;
const newUser = async (region?: 'IN' | 'US') => {
  const { user, token } = await register({ name: `Reminder Fan ${++n}`, email: `remind.${Date.now()}.${n}@example.com`, password: 'reminder-password-1' });
  if (region) await db().run('UPDATE users SET region = ? WHERE id = ?', region, user.id);
  return { user: { ...user, region: region ?? user.region ?? 'IN' }, token };
};

test('"today" follows the member\'s region', () => {
  const at = new Date('2026-11-24T20:00:00Z'); // 01:30 on the 25th in India, 15:00 on the 24th in New York
  assert.equal(regionToday('IN', at), '2026-11-25');
  assert.equal(regionToday('US', at), '2026-11-24');
  assert.equal(regionToday(undefined, at), '2026-11-25');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(reminderEligible('2026-11-25', 'US', at), true);
  assert.equal(reminderEligible('2026-11-25', 'IN', at), false, 'already out in India');
  assert.equal(reminderEligible(null, 'IN', at), false);
  assert.equal(reminderEligible('2026-13-01', 'IN', at), false);
});

test('manual reminders: add, list, remove, and refuse released or undated titles', async () => {
  const { user } = await newUser();
  const load = async (id: string) => title({ id, title: id === 'movie-502' ? 'Old One' : 'Future One', releaseDate: id === 'movie-502' ? '2001-01-01' : id === 'movie-503' ? null as any : '2099-02-02' });
  const r = await addReminder(user, 'movie-501', load);
  assert.equal(r.source, 'manual');
  assert.equal(r.releaseDate, '2099-02-02');
  await assert.rejects(() => addReminder(user, 'movie-502', load), /already out/);
  await assert.rejects(() => addReminder(user, 'movie-503', load), /no release date/);
  assert.deepEqual((await listReminders(user.id)).map((x) => x.titleId), ['movie-501']);
  await removeReminder(user.id, 'movie-501');
  assert.equal((await listReminders(user.id)).length, 0);
  await assert.rejects(() => removeReminder(user.id, 'movie-501'), /No reminder/);
});

test('watchlisting an upcoming title adds an automatic reminder; prefs control it', async () => {
  const { putLibrary, deleteLibrary } = await import('../lib/library');
  const { catalog } = await import('../lib/catalog');
  const upcoming = (await catalog({ media: 'all', collection: 'upcoming', page: 1 })).items.find((t) => t.releaseDate && reminderEligible(t.releaseDate, 'IN'));
  assert.ok(upcoming, 'the demo catalog has an upcoming title');
  const { user } = await newUser();

  assert.deepEqual(await getReminderPrefs(user.id), { watchlist: true, email: false });
  await putLibrary(user, upcoming.id, { status: 'watchlist' });
  let list = await listReminders(user.id);
  assert.equal(list.length, 1);
  assert.equal(list[0].source, 'watchlist');

  await deleteLibrary(user, upcoming.id);
  assert.equal((await listReminders(user.id)).length, 0, 'leaving the library removes the automatic reminder');

  await putLibrary(user, upcoming.id, { status: 'watchlist' });
  await setReminderPrefs(user.id, { watchlist: false });
  assert.equal((await listReminders(user.id)).length, 0, 'turning watchlist reminders off clears pending automatic ones');
  await deleteLibrary(user, upcoming.id);
  await putLibrary(user, upcoming.id, { status: 'watchlist' });
  assert.equal((await listReminders(user.id)).length, 0, 'and stops new ones');

  // A manual reminder survives leaving the watchlist.
  await setReminderPrefs(user.id, { watchlist: true });
  await addReminder(user, upcoming.id, async () => upcoming);
  await deleteLibrary(user, upcoming.id);
  list = await listReminders(user.id);
  assert.equal(list.length, 1);
  assert.equal(list[0].source, 'manual');
});

test('release-day job notifies once, reschedules moved dates, skips stale ones, and batches email', async () => {
  const at = new Date('2026-11-25T06:00:00Z'); // the 25th in India
  const today = regionToday('IN', at);
  const { user } = await newUser('IN');
  await setReminderPrefs(user.id, { email: true });
  const insert = (id: string, date: string, name: string) => db().run(
    `INSERT INTO release_reminders (user_id, title_id, title_json, release_date, source, created_at) VALUES (?, ?, ?, ?, 'manual', ?)`,
    user.id, id, JSON.stringify({ id, title: name, poster: null, mediaType: 'movie' }), date, at.toISOString(),
  );
  await insert('movie-601', today, 'Opens Today');
  await insert('movie-602', today, 'Also Today');
  await insert('movie-603', today, 'Slipped');
  await insert('movie-604', addDays(today, -10), 'Long Gone');
  await insert('movie-605', addDays(today, 30), 'Far Away');

  const sent: Array<{ to: string; titles: string[] }> = [];
  const names: Record<string, string> = { 'movie-601': 'Opens Today', 'movie-602': 'Also Today', 'movie-603': 'Slipped', 'movie-604': 'Long Gone', 'movie-605': 'Far Away' };
  const load = async (id: string) => title({ id, title: names[id], releaseDate: id === 'movie-603' ? addDays(today, 14) : undefined as any });
  const result = await runReleaseReminders({
    at,
    loadTitle: async (id) => { const t = await load(id); return id === 'movie-603' ? t : { ...t, releaseDate: null as any }; },
    sendEmail: async (to, _name, titles) => { sent.push({ to, titles: titles.map((t) => t.title) }); },
  });
  assert.equal(result.notified, 2);
  assert.equal(result.rescheduled, 1);
  assert.equal(result.skippedStale, 1);
  assert.equal(result.emailed, 1);
  assert.deepEqual(sent[0].titles.sort(), ['Also Today', 'Opens Today']);

  const pending = await listReminders(user.id);
  assert.deepEqual(pending.map((r) => [r.titleId, r.releaseDate]), [['movie-603', addDays(today, 14)], ['movie-605', addDays(today, 30)]]);

  const again = await runReleaseReminders({ at, loadTitle: async () => { throw new Error('offline'); }, sendEmail: async () => { throw new Error('should not send'); } });
  assert.equal(again.notified, 0, 'nothing is sent twice');

  const { items } = await getNotifications(user.id);
  const releases = items.filter((i) => i.type === 'release_day');
  assert.equal(releases.length, 2);
  assert.deepEqual(releases.map((i) => i.title?.title).sort(), ['Also Today', 'Opens Today']);
});

test('a US member is not told a day early', async () => {
  const at = new Date('2026-11-25T02:00:00Z'); // still the 24th in New York
  const { user } = await newUser('US');
  await db().run(`INSERT INTO release_reminders (user_id, title_id, title_json, release_date, source, created_at) VALUES (?, 'movie-701', '{"title":"US Date"}', '2026-11-25', 'manual', ?)`, user.id, at.toISOString());
  const early = await runReleaseReminders({ at });
  assert.equal((await listReminders(user.id)).length, 1, 'still pending at 9pm the night before');
  assert.ok(early.checked >= 1);
  await runReleaseReminders({ at: new Date('2026-11-25T13:00:00Z') });
  assert.equal((await listReminders(user.id)).length, 0, 'sent on the day');
});

test('reminder API needs sign-in and validates input', async () => {
  const route = await import('../app/api/[...path]/route');
  const { NextRequest } = await import('next/server');
  const call = (method: 'GET' | 'PUT' | 'DELETE', path: string, cookie?: string, payload?: unknown) => {
    const headers: Record<string, string> = { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000', 'content-type': 'application/json' };
    if (cookie) headers.cookie = cookie;
    const req = new NextRequest(`http://127.0.0.1:3000/api/${path}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
    return route[method](req, { params: Promise.resolve({ path: path.split('/') }) });
  };
  assert.equal((await call('GET', 'reminders')).status, 401);
  const { token } = await newUser();
  const cookie = `cinepulse_session=${token}`;
  const first = await (await call('GET', 'reminders', cookie)).json();
  assert.deepEqual(first, { reminders: [], prefs: { watchlist: true, email: false } });
  const prefs = await (await call('PUT', 'reminders/settings', cookie, { email: true, watchlist: 'yes' })).json();
  assert.deepEqual(prefs.prefs, { watchlist: true, email: true }, 'non-boolean values are ignored');
  assert.equal((await call('PUT', 'reminders/not-a-title', cookie)).status, 404, 'unknown title ids are rejected');
  assert.equal((await call('DELETE', 'reminders/movie-999', cookie)).status, 404);
});

test('calendar file: all-day event on the release date, escaped and folded', async () => {
  const { buildIcs, googleCalendarUrl, icsFileName, canAddToCalendar } = await import('../lib/calendar');
  const t = { id: 'movie-9', title: 'Dune; Part, Three', mediaType: 'movie', releaseDate: '2026-12-18', overview: 'A long overview line '.repeat(10) };
  const ics = buildIcs(t, 'https://cinepulse.app/film/dune-part-three-9', new Date('2026-11-25T10:00:00Z'));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261218\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20261219\r\n/);
  assert.ok(ics.includes(String.raw`SUMMARY:Dune\; Part\, Three — release day`), 'commas and semicolons are escaped');
  assert.match(ics, /UID:movie-9-20261218@cinepulse/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
  const g = new URL(googleCalendarUrl(t, 'https://cinepulse.app/x'));
  assert.equal(g.hostname, 'calendar.google.com');
  assert.equal(g.searchParams.get('dates'), '20261218/20261219');
  assert.equal(icsFileName(t), 'dune-part-three-release.ics');
  assert.equal(canAddToCalendar({ releaseDate: null }), false);
  assert.throws(() => buildIcs({ ...t, releaseDate: null }, 'x'));
});

test('GET /api/calendar/:id serves an .ics download without signing in', async () => {
  const route = await import('../app/api/[...path]/route');
  const { NextRequest } = await import('next/server');
  const { catalog } = await import('../lib/catalog');
  const any = (await catalog({ media: 'all', collection: 'upcoming', page: 1 })).items.find((t) => t.releaseDate);
  assert.ok(any);
  const res = await route.GET(new NextRequest(`http://127.0.0.1:3000/api/calendar/${any.id}`), { params: Promise.resolve({ path: ['calendar', any.id] }) });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/calendar/);
  assert.match(res.headers.get('content-disposition') ?? '', /attachment; filename=".+-release\.ics"/);
  assert.match(await res.text(), /BEGIN:VEVENT/);
});
