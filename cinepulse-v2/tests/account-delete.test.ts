import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../lib/auth';
import { db } from '../lib/db';
import { getLatestDevEmail } from '../lib/mailer';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const route = await import('../app/api/[...path]/route');
const { NextRequest } = await import('next/server');

function call(method: 'GET' | 'POST' | 'DELETE', path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000', 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  const req = new NextRequest(`http://127.0.0.1:3000/api/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const ctx = { params: Promise.resolve({ path: path.split('/') }) };
  return route[method](req, ctx);
}

test('deleting an account with the emailed code removes the user, sessions and data', async () => {
  const { user, token } = await register({ name: 'Leaving', email: `leaving.${Date.now()}@example.com`, password: 'leaving-password-1' });
  const cookie = `cinepulse_session=${token}`;
  await db().run(`INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at) VALUES (?, 'demo-dunes', '{}', 'watchlist', NULL, ?)`, user.id, new Date().toISOString());

  assert.equal((await call('DELETE', 'account', cookie, { otp: '000000' })).status, 400, 'no code requested yet');
  assert.equal((await call('POST', 'account/delete/otp', cookie, {})).status, 200);
  const code = getLatestDevEmail()?.code;
  assert.match(String(code), /^\d{6}$/);
  const wrong = code === '111111' ? '222222' : '111111';
  assert.equal((await call('DELETE', 'account', cookie, { otp: wrong })).status, 400);
  assert.ok(await db().get('SELECT 1 AS x FROM users WHERE id = ?', user.id), 'a wrong code deletes nothing');

  const res = await call('DELETE', 'account', cookie, { otp: code });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie') ?? '', /cinepulse_session=;/);
  assert.equal(await db().get('SELECT 1 AS x FROM users WHERE id = ?', user.id), undefined, 'user row is gone');
  assert.equal(await db().get('SELECT 1 AS x FROM sessions WHERE user_id = ?', user.id), undefined, 'sessions are gone');
  assert.equal(await db().get('SELECT 1 AS x FROM library WHERE user_id = ?', user.id), undefined, 'library is gone');
  const me = await (await call('GET', 'auth/me', cookie)).json();
  assert.equal(me.user, null, 'the old cookie no longer signs anyone in');
});

/** A token signed the way older versions did, with the default key that was published in the repo. */
function forgedToken(uid: string, eml: string) {
  const { createHmac } = require('node:crypto') as typeof import('node:crypto');
  const payload = Buffer.from(JSON.stringify({ uid, eml, nam: 'Forged', exp: Date.now() + 86400_000, rnd: 'x' })).toString('base64url');
  return `cps_${payload}.${createHmac('sha256', 'cinepulse-persistent-session-secret-key-v1').update(payload).digest('base64url')}`;
}

test('self-signed session tokens are not accepted: no forgery, no account re-creation', async () => {
  const victim = await register({ name: 'Victim', email: `victim.${Date.now()}@example.com`, password: 'victim-password-1' });
  const asVictim = await (await call('GET', 'auth/me', `cinepulse_session=${forgedToken(victim.user.id, victim.user.email)}`)).json();
  assert.equal(asVictim.user, null, 'a forged token for an existing user signs nobody in');

  const ghostId = `ghost-${Date.now()}`;
  const ghost = await (await call('GET', 'auth/me', `cinepulse_session=${forgedToken(ghostId, `${ghostId}@example.com`)}`)).json();
  assert.equal(ghost.user, null);
  assert.equal(await db().get('SELECT 1 AS x FROM users WHERE id = ?', ghostId), undefined, 'no user is created from a token');
  assert.equal(await db().get('SELECT 1 AS x FROM sessions WHERE user_id = ?', ghostId), undefined);
});

test('logout revokes the session; new tokens are opaque', async () => {
  const { token } = await register({ name: 'Out', email: `out.${Date.now()}@example.com`, password: 'logout-password-1' });
  assert.match(token, /^[A-Za-z0-9_-]{43}$/, '32 random bytes, base64url, no embedded user data');
  const cookie = `cinepulse_session=${token}`;
  assert.ok((await (await call('GET', 'auth/me', cookie)).json()).user);
  assert.equal((await call('POST', 'auth/logout', cookie, {})).status, 200);
  assert.equal((await (await call('GET', 'auth/me', cookie)).json()).user, null, 'the logged-out cookie stays logged out');
});
