import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceOrigin, demoGoogleLogin, isGoogleConfigured, getGoogleOAuthUrl } from '../lib/auth';
import { db } from '../lib/db';

test('enforceOrigin permits matching loopback origins (127.0.0.1 and localhost)', () => {
  const req1 = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: {
      'Origin': 'http://127.0.0.1:3000',
      'Host': '127.0.0.1:3000'
    }
  });
  // Should not throw
  assert.doesNotThrow(() => enforceOrigin(req1));

  const req2 = new Request('http://127.0.0.1:3000/api/auth/login', {
    method: 'POST',
    headers: {
      'Origin': 'http://localhost:3000',
      'Host': 'localhost:3000'
    }
  });
  // Should not throw
  assert.doesNotThrow(() => enforceOrigin(req2));

  // Should block untrusted external origin
  const reqBlocked = new Request('http://127.0.0.1:3000/api/auth/login', {
    method: 'POST',
    headers: {
      'Origin': 'https://evil-hacker.com',
      'Host': '127.0.0.1:3000'
    }
  });
  assert.throws(() => enforceOrigin(reqBlocked), /Cross-origin request blocked/);
});

test('Google demo login creates user and session in sqlite', async () => {
  const testEmail = `test.google.${Date.now()}@gmail.com`;
  const result = await demoGoogleLogin(testEmail, 'Test Google User');

  assert.equal(result.user.email, testEmail);
  assert.equal(result.user.name, 'Test Google User');
  assert.equal(result.user.isGoogle, true);
  assert.ok(result.token);

  // Verify in database
  const d = db();
  const row = d.prepare('SELECT * FROM users WHERE email=?').get(testEmail) as any;
  assert.ok(row);
  assert.ok(row.password_hash.startsWith('oauth:google:'));

  // Clean up
  d.prepare('DELETE FROM users WHERE email=?').run(testEmail);
});

test('syncSupabaseUserToLocal creates user in SQLite and creates active session', async () => {
  const { syncSupabaseUserToLocal, createSession } = await import('../lib/auth');
  const d = db();
  const testId = `sb-user-${Date.now()}`;
  const testEmail = `sb.${Date.now()}@example.com`;

  await syncSupabaseUserToLocal({
    id: testId,
    email: testEmail,
    name: 'Supabase User',
    createdAt: new Date().toISOString(),
    isGoogle: true
  });

  const row = d.prepare('SELECT * FROM users WHERE id=?').get(testId) as any;
  assert.ok(row);
  assert.equal(row.email, testEmail);
  assert.equal(row.name, 'Supabase User');

  const token = await createSession(testId);
  assert.ok(token);

  const sessionRow = d.prepare('SELECT * FROM sessions WHERE user_id=?').get(testId) as any;
  assert.ok(sessionRow);

  // Clean up
  d.prepare('DELETE FROM sessions WHERE user_id=?').run(testId);
  d.prepare('DELETE FROM users WHERE id=?').run(testId);
});

