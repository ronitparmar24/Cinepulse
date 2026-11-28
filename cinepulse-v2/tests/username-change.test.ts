import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CATALOG_MODE = 'demo';

const { db, CURRENT_SCHEMA_VERSION } = await import('../lib/db');
const {
  validateUsername,
  validateDisplayName,
  checkUsernameAvailability,
  updateUserProfile,
  getUserByUsername,
  getPublicProfile,
  getUsernameStatus,
  USERNAME_COOLDOWN_DAYS,
  USERNAME_HOLD_DAYS,
} = await import('../lib/social/profile');

const DAY = 86_400_000;
const T0 = Date.parse('2026-03-01T12:00:00.000Z');
let n = 0;

async function member(username: string) {
  const id = `uname-${++n}-${Date.now()}`;
  await db().run(
    "INSERT INTO users (id, name, email, password_hash, created_at, username, display_name, profile_visibility) VALUES (?, ?, ?, 'x', ?, ?, ?, 'public')",
    id, `Member ${n}`, `${id}@example.com`, new Date(T0).toISOString(), username, `Member ${n}`,
  );
  return id;
}

test('schema v25 adds username_changed_at and username_history', async () => {
  assert.ok(CURRENT_SCHEMA_VERSION >= 25);
  // Works on SQLite and Postgres alike: selecting the new columns throws if they are missing.
  await db().all('SELECT username_changed_at FROM users LIMIT 1');
  await db().all('SELECT old_username, user_id, changed_at FROM username_history LIMIT 1');
});

test('username format rules', () => {
  for (const ok of ['abc', 'film.geek', 'film_geek', 'a1b2c3', 'x.y_z', 'a'.repeat(20), 'Mixed.Case']) {
    assert.equal(validateUsername(ok).ok, true, ok);
  }
  assert.equal((validateUsername('  @Film.Geek ') as { username: string }).username, 'film.geek');
  const bad: Array<[string, RegExp]> = [
    ['ab', /at least 3/i],
    ['a'.repeat(21), /at most 20/i],
    ['film-geek', /letters, numbers/i],
    ['film geek', /letters, numbers/i],
    ['émile', /letters, numbers/i],
    ['.film', /start or end/i],
    ['film.', /start or end/i],
    ['_film', /start or end/i],
    ['film_', /start or end/i],
    ['film..geek', /two dots/i],
    ['', /pick a username/i],
  ];
  for (const [value, reason] of bad) {
    const r = validateUsername(value);
    assert.equal(r.ok, false, value);
    assert.match((r as { reason: string }).reason, reason, value);
  }
});

test('reserved usernames are blocked, including dotted/underscored spellings', () => {
  for (const word of ['admin', 'api', 'support', 'cinepulse', 'settings', 'login', 'signup', 'explore', 'film', 'tv', 'help', 'about', 'Admin', 'cine.pulse', 'sign_up']) {
    const r = validateUsername(word);
    // 'u' and 'tv' are below the 3-character minimum or reserved; either way they're refused.
    assert.equal(r.ok, false, word);
  }
  assert.match((validateUsername('cine.pulse') as { reason: string }).reason, /reserved/);
  assert.equal(validateUsername('u').ok, false);
});

test('display name: trimmed, 1–40 characters, no control characters', () => {
  assert.deepEqual(validateDisplayName('  Ada   Lovelace '), { ok: true, displayName: 'Ada Lovelace' });
  assert.equal(validateDisplayName('   ').ok, false);
  assert.equal(validateDisplayName('x'.repeat(41)).ok, false);
  assert.equal(validateDisplayName('x'.repeat(40)).ok, true);
  assert.equal(validateDisplayName('bad\u0007name').ok, false);
  assert.equal(validateDisplayName('line\nbreak').ok, false);
  assert.equal(validateDisplayName('Zoë 🎬').ok, true);
});

test('availability is case-insensitive and suggests free alternatives when taken', async () => {
  const owner = await member('marlow');
  const other = await member('someone_else');
  const taken = await checkUsernameAvailability('MARLOW', other, T0);
  assert.equal(taken.available, false);
  assert.match(taken.reason || '', /taken/i);
  assert.ok(taken.suggestions.length >= 2 && taken.suggestions.length <= 3);
  for (const s of taken.suggestions) {
    assert.equal(validateUsername(s).ok, true, s);
    assert.equal((await checkUsernameAvailability(s, other, T0)).available, true, s);
  }
  // Your own handle reads as available (it's yours), in any case.
  const mine = await checkUsernameAvailability('Marlow', owner, T0);
  assert.equal(mine.available, true);
  // Invalid input reports the rule, not "taken".
  const invalid = await checkUsernameAvailability('ad', other, T0);
  assert.equal(invalid.available, false);
  assert.deepEqual(invalid.suggestions, []);
  // Saving a taken handle with different casing is refused with 409.
  const res = await updateUserProfile(other, { username: 'Marlow' }, { nowMs: T0 });
  assert.equal(res.success, false);
  assert.equal(res.status, 409);
});

test('changing a username records history, sets the cooldown and redirects old links', async () => {
  const id = await member('oldhandle');
  const res = await updateUserProfile(id, { username: 'New.Handle', displayName: '  New  Name ' }, { nowMs: T0 });
  assert.equal(res.success, true, res.error);
  assert.equal(res.username, 'new.handle');
  assert.equal(res.nextChangeAt, new Date(T0 + USERNAME_COOLDOWN_DAYS * DAY).toISOString());

  const row = await db().get<{ username: string; display_name: string; username_changed_at: string }>('SELECT username, display_name, username_changed_at FROM users WHERE id = ?', id);
  assert.equal(row?.username, 'new.handle');
  assert.equal(row?.display_name, 'New Name');
  assert.equal(row?.username_changed_at, new Date(T0).toISOString());
  const hist = await db().all<{ old_username: string }>('SELECT old_username FROM username_history WHERE user_id = ?', id);
  assert.deepEqual(hist.map((h) => h.old_username), ['oldhandle']);

  // /u/oldhandle still finds the member, and the profile says where they moved.
  const viaOld = await getUserByUsername('OldHandle');
  assert.equal(viaOld?.id, id);
  const profile = await getPublicProfile('oldhandle', null);
  assert.equal(profile.profile?.movedTo, 'new.handle');
  assert.equal(profile.profile?.username, 'new.handle');
  const direct = await getPublicProfile('new.handle', null);
  assert.equal(direct.profile?.movedTo, undefined);
  const byId = await getPublicProfile(id, null);
  assert.equal(byId.profile?.movedTo, undefined);
});

test('username changes are limited to one per 14 days; display name has no cooldown', async () => {
  const id = await member('cooler');
  assert.equal((await updateUserProfile(id, { username: 'cooler.two' }, { nowMs: T0 })).success, true);

  const tooSoon = await updateUserProfile(id, { username: 'cooler.three' }, { nowMs: T0 + 3 * DAY });
  assert.equal(tooSoon.success, false);
  assert.equal(tooSoon.status, 429);
  assert.equal(tooSoon.code, 'username_cooldown');
  assert.equal(tooSoon.nextChangeAt, new Date(T0 + 14 * DAY).toISOString());
  assert.match(tooSoon.error || '', /change your username again on/i);

  const status = await getUsernameStatus(id, T0 + 3 * DAY);
  assert.equal(status.nextChangeAt, new Date(T0 + 14 * DAY).toISOString());

  // Display name (and other fields) still save during the cooldown, as does re-sending the same handle.
  const nameOnly = await updateUserProfile(id, { username: 'COOLER.TWO', displayName: 'Still Me', bio: 'hi' }, { nowMs: T0 + 3 * DAY });
  assert.equal(nameOnly.success, true, nameOnly.error);
  assert.equal((await db().get<{ display_name: string }>('SELECT display_name FROM users WHERE id = ?', id))?.display_name, 'Still Me');
  assert.equal((await updateUserProfile(id, { displayName: '   ' }, { nowMs: T0 + 3 * DAY })).success, false);

  const later = await updateUserProfile(id, { username: 'cooler.three' }, { nowMs: T0 + 14 * DAY + 1000 });
  assert.equal(later.success, true, later.error);
  assert.equal((await getUsernameStatus(id, T0 + 14 * DAY + 2000)).nextChangeAt, new Date(T0 + 28 * DAY + 1000).toISOString());
});

test('old usernames are held for the original owner for 30 days, then free for anyone', async () => {
  const first = await member('heldname');
  const second = await member('claimer');
  assert.equal((await updateUserProfile(first, { username: 'heldname.new' }, { nowMs: T0 })).success, true);

  // Within the hold: nobody else can take it…
  const during = await checkUsernameAvailability('heldname', second, T0 + 10 * DAY);
  assert.equal(during.available, false);
  assert.match(during.reason || '', /hold/i);
  const blocked = await updateUserProfile(second, { username: 'heldname' }, { nowMs: T0 + 10 * DAY });
  assert.equal(blocked.success, false);
  assert.equal(blocked.status, 409);
  // …but the original owner may reclaim it (once their cooldown allows).
  assert.equal((await checkUsernameAvailability('heldname', first, T0 + 20 * DAY)).available, true);

  // After 30 days anyone can claim it; the old link then belongs to the new owner.
  const after = T0 + (USERNAME_HOLD_DAYS + 1) * DAY;
  assert.equal((await checkUsernameAvailability('heldname', second, after)).available, true);
  const claimed = await updateUserProfile(second, { username: 'heldname' }, { nowMs: after });
  assert.equal(claimed.success, true, claimed.error);
  assert.equal((await getUserByUsername('heldname'))?.id, second);
  assert.equal((await getPublicProfile('heldname', null)).profile?.movedTo, undefined);
  // The first member's redirect for that handle is gone, their current handle still works.
  assert.equal((await getUserByUsername('heldname.new'))?.id, first);
});

test('reclaiming your own old username clears its history row', async () => {
  const id = await member('boomerang');
  assert.equal((await updateUserProfile(id, { username: 'boomerang.away' }, { nowMs: T0 })).success, true);
  assert.equal((await updateUserProfile(id, { username: 'boomerang' }, { nowMs: T0 + 15 * DAY })).success, true);
  const hist = await db().all<{ old_username: string }>('SELECT old_username FROM username_history WHERE user_id = ? ORDER BY old_username', id);
  assert.deepEqual(hist.map((h) => h.old_username), ['boomerang.away']);
  assert.equal((await getPublicProfile('boomerang.away', null)).profile?.movedTo, 'boomerang');
});

test('invalid and reserved usernames are refused on save', async () => {
  const id = await member('saver');
  for (const bad of ['support', 'no..dots', '_lead', 'way_too_long_username_here']) {
    const res = await updateUserProfile(id, { username: bad }, { nowMs: T0 });
    assert.equal(res.success, false, bad);
    assert.equal(res.status, 400, bad);
  }
  assert.equal((await db().get<{ username: string }>('SELECT username FROM users WHERE id = ?', id))?.username, 'saver');
});

test('deleting an account removes its username history', async () => {
  const id = await member('leaver');
  assert.equal((await updateUserProfile(id, { username: 'leaver.gone' }, { nowMs: T0 })).success, true);
  await db().run('DELETE FROM users WHERE id = ?', id);
  const rows = await db().all('SELECT 1 FROM username_history WHERE user_id = ?', id);
  assert.equal(rows.length, 0);
  assert.equal(await getUserByUsername('leaver'), null);
});

test('new sign-ups never get a username that is taken (any case) or on its 30-day hold', async () => {
  const { register } = await import('../lib/auth');
  const stamp = Date.now();
  const previousOwner = (await register({ name: 'Previous Owner', email: `prev.${stamp}@example.com`, password: 'held-name-pass-1' })).user;
  await db().run(`INSERT INTO username_history (old_username, user_id, changed_at) VALUES ('heldname', ?, ?)`, previousOwner.id, new Date().toISOString());
  const { user } = await register({ name: 'Held Name', email: `held.${stamp}@example.com`, password: 'held-name-pass-1' });
  const row = (await db().get('SELECT username FROM users WHERE id = ?', user.id)) as { username: string };
  assert.notEqual(row.username.toLowerCase(), 'heldname', 'the held name is skipped');
  assert.match(row.username, /^heldname_\d+$/);
});
