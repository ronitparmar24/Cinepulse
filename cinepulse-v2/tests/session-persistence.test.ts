import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, currentUser, logout, tokenFromRequest } from '../lib/auth';
import { db, now } from '../lib/db';

test('Session Persistence: session token authenticates via Cookie and Bearer header', async () => {
  const d = db();
  const testUserId = `user-persist-${Date.now()}`;
  (await d.run(`
    INSERT INTO users (id, name, email, password_hash, created_at)
    VALUES (?, 'Persistent Tester', ?, 'hash123', ?)
  `, testUserId, `${testUserId}@example.test`, now()));

  const token = await createSession(testUserId);
  assert.ok(token);
  assert.ok(!token.startsWith('cps_') && !token.includes('.'), 'tokens are opaque: no embedded, self-signed user data');

  // 1. Authenticate via Cookie header
  const cookieReq = new Request('http://localhost:3000/api/auth/me', {
    headers: { Cookie: `cinepulse_session=${token}` },
  });
  const cookieUser = await currentUser(cookieReq);
  assert.ok(cookieUser);
  assert.equal(cookieUser.id, testUserId);
  assert.equal(cookieUser.email, `${testUserId}@example.test`);

  // 2. Authenticate via Bearer Authorization header
  const bearerReq = new Request('http://localhost:3000/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const bearerUser = await currentUser(bearerReq);
  assert.ok(bearerUser);
  assert.equal(bearerUser.id, testUserId);
});

test('Session Persistence: a token whose session row is gone signs nobody in and restores nothing', async () => {
  const d = db();
  const testUserId = `user-serverless-${Date.now()}`;
  (await d.run(`
    INSERT INTO users (id, name, email, password_hash, created_at)
    VALUES (?, 'Serverless Tester', ?, 'hash123', ?)
  `, testUserId, `${testUserId}@example.test`, now()));

  const token = await createSession(testUserId);

  // The session row is the only proof of sign-in: once it is deleted (logout, account deletion,
  // revocation) the token must stop working. Sessions now live in a persistent database.
  (await d.run('DELETE FROM sessions WHERE user_id=?', testUserId));

  const req = new Request('http://localhost:3000/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(await currentUser(req), null);
  assert.equal(await d.get('SELECT * FROM sessions WHERE user_id=?', testUserId), undefined, 'no session is re-created from the token');
});

test('Session Persistence: logout invalidates session cleanly', async () => {
  const d = db();
  const testUserId = `user-logout-${Date.now()}`;
  (await d.run(`
    INSERT INTO users (id, name, email, password_hash, created_at)
    VALUES (?, 'Logout Tester', ?, 'hash123', ?)
  `, testUserId, `${testUserId}@example.test`, now()));

  const token = await createSession(testUserId);

  const req = new Request('http://localhost:3000/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });

  const userBefore = await currentUser(req);
  assert.ok(userBefore);

  (await logout(req));

  // After logout, token hash is deleted from sessions and user is logged out
  // (Notice: if sessions table has deleted the token_hash, we can ensure it's unauthenticated)
  const sessionInDb = (await d.get('SELECT * FROM sessions WHERE user_id=?', testUserId));
  assert.equal(sessionInDb, undefined);
  assert.equal(await currentUser(req), null, 'the same token is signed out after logout');
});
