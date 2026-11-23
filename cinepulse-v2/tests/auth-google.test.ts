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
  const row = (await d.get('SELECT * FROM users WHERE email=?', testEmail)) as any;
  assert.ok(row);
  assert.ok(row.password_hash.startsWith('oauth:google:'));

  // Clean up
  (await d.run('DELETE FROM users WHERE email=?', testEmail));
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

  const row = (await d.get('SELECT * FROM users WHERE id=?', testId)) as any;
  assert.ok(row);
  assert.equal(row.email, testEmail);
  assert.equal(row.name, 'Supabase User');

  const token = await createSession(testId);
  assert.ok(token);

  const sessionRow = (await d.get('SELECT * FROM sessions WHERE user_id=?', testId)) as any;
  assert.ok(sessionRow);

  // Clean up
  (await d.run('DELETE FROM sessions WHERE user_id=?', testId));
  (await d.run('DELETE FROM users WHERE id=?', testId));
});

test('Google 2-Step Verification (OTP): request -> reject invalid -> verify successfully', async () => {
  const { requestGoogleOtp, verifyGoogleOtp } = await import('../lib/auth');
  const { getLatestDevEmail } = await import('../lib/mailer');
  const testEmail = `google.otp.${Date.now()}@gmail.com`;
  const testName = 'Verified Google User';

  // 1. Request OTP
  const reqRes = await requestGoogleOtp({ email: testEmail, name: testName });
  assert.equal(reqRes.email, testEmail);
  assert.equal(reqRes.name, testName);

  const code = getLatestDevEmail()?.code || '';
  assert.equal(typeof code, 'string');
  assert.equal(code.length, 6);

  // 2. Reject incorrect code
  await assert.rejects(
    () => verifyGoogleOtp({ email: testEmail, code: '000000' }),
    /Invalid verification code/
  );

  // 3. Verify successfully with correct code
  const result = await verifyGoogleOtp({ email: testEmail, code });
  assert.equal(result.user.email, testEmail);
  assert.equal(result.user.name, testName);
  assert.equal(result.user.isGoogle, true);
  assert.ok(result.token);

  // Clean up
  const d = db();
  (await d.run('DELETE FROM sessions WHERE user_id=?', result.user.id));
  (await d.run('DELETE FROM users WHERE email=?', testEmail));
});

