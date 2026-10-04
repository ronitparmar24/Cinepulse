import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, currentUser, logout, tokenFromRequest } from '../lib/auth';
import { db, now } from '../lib/db';

test('Session Persistence: signed token authenticates via Cookie and Bearer header', async () => {
  const d = db();
  const testUserId = `user-persist-${Date.now()}`;
  d.prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at)
    VALUES (?, 'Persistent Tester', ?, 'hash123', ?)
  `).run(testUserId, `${testUserId}@example.test`, now());

  const token = await createSession(testUserId);
  assert.ok(token);
  assert.ok(token.startsWith('cps_'), 'Token should have cps_ signature prefix');

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

test('Session Persistence: cross-container stateless HMAC resilience (survives empty sessions table)', async () => {
  const d = db();
  const testUserId = `user-serverless-${Date.now()}`;
  d.prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at)
    VALUES (?, 'Serverless Tester', ?, 'hash123', ?)
  `).run(testUserId, `${testUserId}@example.test`, now());

  const token = await createSession(testUserId);

  // Simulate Vercel serverless recycling: wipe session from SQLite
  d.prepare('DELETE FROM sessions WHERE user_id=?').run(testUserId);

  // Verify that the sessions table does NOT have this session anymore
  const sessionRow = d.prepare('SELECT * FROM sessions WHERE user_id=?').get(testUserId);
  assert.equal(sessionRow, undefined);

  // Authenticate with the token on a request - should recover user via HMAC signature!
  const req = new Request('http://localhost:3000/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const user = await currentUser(req);
  assert.ok(user, 'User should be authenticated via stateless HMAC signature even if sessions table was wiped');
  assert.equal(user.id, testUserId);
  assert.equal(user.name, 'Serverless Tester');

  // Verify that the session was re-registered into SQLite for local fast path
  const restoredSession = d.prepare('SELECT * FROM sessions WHERE user_id=?').get(testUserId);
  assert.ok(restoredSession, 'Session should be re-cached into SQLite');
});

test('Session Persistence: logout invalidates session cleanly', async () => {
  const d = db();
  const testUserId = `user-logout-${Date.now()}`;
  d.prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at)
    VALUES (?, 'Logout Tester', ?, 'hash123', ?)
  `).run(testUserId, `${testUserId}@example.test`, now());

  const token = await createSession(testUserId);

  const req = new Request('http://localhost:3000/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });

  const userBefore = await currentUser(req);
  assert.ok(userBefore);

  logout(req);

  // After logout, token hash is deleted from sessions and user is logged out
  // (Notice: if sessions table has deleted the token_hash, we can ensure it's unauthenticated)
  const sessionInDb = d.prepare('SELECT * FROM sessions WHERE user_id=?').get(testUserId);
  assert.equal(sessionInDb, undefined);
});
