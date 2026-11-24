import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createSession, renewRememberedSession, sessionCookie, shortenSession } from '../lib/auth';
import { db, now } from '../lib/db';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

async function makeUser(): Promise<string> {
  const id = randomUUID();
  await db().run(
    'INSERT INTO users(id, name, email, password_hash, created_at) VALUES(?,?,?,?,?)',
    id,
    'Remember Tester',
    `remember.${id}@example.com`,
    'x',
    now(),
  );
  return id;
}
async function cleanup(id: string) {
  await db().run('DELETE FROM sessions WHERE user_id=?', id);
  await db().run('DELETE FROM users WHERE id=?', id);
}
const req = (token: string) => new Request('http://localhost:3000/api/auth/me', { headers: { cookie: `cinepulse_session=${token}` } });

test('remembered cookie persists (Max-Age) and a short one is a browser-session cookie', () => {
  assert.match(sessionCookie('abc', false, true), /Max-Age=7776000/);
  assert.doesNotMatch(sessionCookie('abc', false, false), /Max-Age/);
  assert.match(sessionCookie('abc', true, false), /HttpOnly; SameSite=Lax; Secure$/);
});

test('new sessions last ~90 days; shortened ones ~24 hours', async () => {
  const id = await makeUser();
  try {
    const long = await createSession(id);
    const short = await createSession(id);
    await shortenSession(short);
    const rowLong = (await db().get('SELECT expires_at FROM sessions WHERE token_hash=?', hash(long))) as { expires_at: string };
    const rowShort = (await db().get('SELECT expires_at FROM sessions WHERE token_hash=?', hash(short))) as { expires_at: string };
    const days = (Date.parse(rowLong.expires_at) - Date.now()) / 86400_000;
    const hours = (Date.parse(rowShort.expires_at) - Date.now()) / 3600_000;
    assert.ok(days > 89 && days <= 90, `long session days=${days}`);
    assert.ok(hours > 23 && hours <= 24, `short session hours=${hours}`);
  } finally {
    await cleanup(id);
  }
});

test('a remembered session slides forward once it is a day old, short ones never do', async () => {
  const id = await makeUser();
  try {
    const token = await createSession(id);
    // Fresh: nothing to renew yet.
    assert.equal(await renewRememberedSession(req(token)), null);

    // Pretend it was created 10 days ago (80 days left): it renews to a full window.
    const created = new Date(Date.now() - 10 * 86400_000).toISOString();
    const expires = new Date(Date.now() + 80 * 86400_000).toISOString();
    await db().run('UPDATE sessions SET created_at=?, expires_at=? WHERE token_hash=?', created, expires, hash(token));
    assert.equal(await renewRememberedSession(req(token)), token);
    const row = (await db().get('SELECT expires_at FROM sessions WHERE token_hash=?', hash(token))) as { expires_at: string };
    assert.ok((Date.parse(row.expires_at) - Date.now()) / 86400_000 > 89.9);

    const short = await createSession(id);
    await shortenSession(short);
    assert.equal(await renewRememberedSession(req(short)), null);
    assert.equal(await renewRememberedSession(req('not-a-real-token')), null);
  } finally {
    await cleanup(id);
  }
});

test('OAuth origin keeps the browser host for loopback dev, APP_ORIGIN otherwise', async () => {
  const { oauthOrigin } = await import('../lib/auth');
  const prev = process.env.APP_ORIGIN;
  const mk = (host: string) => new Request(`http://${host}/api/auth/google`, { headers: { host } });
  try {
    process.env.APP_ORIGIN = 'http://127.0.0.1:3000';
    assert.equal(oauthOrigin(mk('localhost:3000')), 'http://localhost:3000');
    assert.equal(oauthOrigin(mk('127.0.0.1:3000')), 'http://127.0.0.1:3000');
    assert.equal(oauthOrigin(mk('evil.example')), 'http://127.0.0.1:3000');
    process.env.APP_ORIGIN = 'https://cinepulse.example';
    assert.equal(oauthOrigin(mk('localhost:3000')), 'https://cinepulse.example');
  } finally {
    if (prev === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = prev;
  }
});
