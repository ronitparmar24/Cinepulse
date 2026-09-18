import test from 'node:test';
import assert from 'node:assert/strict';
import { requestEmailOtp, verifyEmailOtp, resendEmailOtp } from '../lib/auth';
import { db } from '../lib/db';
import { renderOtpEmailHtml, generateOtp, getLatestDevEmail } from '../lib/mailer';

test('generateOtp produces a 6-digit numeric string', () => {
  const code = generateOtp();
  assert.equal(typeof code, 'string');
  assert.equal(code.length, 6);
  assert.ok(/^\d{6}$/.test(code));
});

test('renderOtpEmailHtml builds responsive cinematic HTML with code and branding', () => {
  const html = renderOtpEmailHtml({ name: 'Christopher Nolan', code: '849201', email: 'nolan@cinema.com' });
  assert.ok(html.includes('CinePulse'));
  assert.ok(html.includes('Christopher Nolan'));
  assert.ok(html.includes('849 201'));
  assert.ok(html.includes('nolan@cinema.com'));
  assert.ok(html.includes('Valid for 10 minutes'));
});

test('Full OTP lifecycle: request -> resend -> reject invalid -> verify successfully', async () => {
  const testEmail = `otp.tester.${Date.now()}@cinema.com`;
  const testName = 'Film Buff';
  const testPass = 'SuperSecret123!';

  // 1. Request OTP
  const reqRes = await requestEmailOtp({
    name: testName,
    email: testEmail,
    password: testPass,
  });

  assert.equal(reqRes.email, testEmail);
  assert.equal(reqRes.name, testName);

  const initialCode = getLatestDevEmail()?.code || '';
  assert.equal(typeof initialCode, 'string');
  assert.equal(initialCode.length, 6);

  // Verify pending record in SQLite
  const d = db();
  const pendingRow = d.prepare('SELECT * FROM email_verifications WHERE email=?').get(testEmail) as any;
  assert.ok(pendingRow);
  assert.equal(pendingRow.name, testName);
  assert.equal(pendingRow.attempts, 0);

  // 2. Reject incorrect code
  await assert.rejects(
    () => verifyEmailOtp({ email: testEmail, code: '000000' }),
    /Invalid verification code/
  );

  const updatedAttempts = d.prepare('SELECT attempts FROM email_verifications WHERE email=?').get(testEmail) as any;
  assert.equal(updatedAttempts.attempts, 1);

  // 3. Resend OTP
  const resendRes = await resendEmailOtp({ email: testEmail });
  assert.equal(resendRes.ok, true);

  const newCode = getLatestDevEmail()?.code || '';
  assert.equal(typeof newCode, 'string');
  assert.equal(newCode.length, 6);
  assert.notEqual(newCode, '000000');

  // 4. Verify with the new code
  const verifyRes = await verifyEmailOtp({
    email: testEmail,
    code: newCode,
  });

  assert.ok(verifyRes.user);
  assert.equal(verifyRes.user.email, testEmail);
  assert.equal(verifyRes.user.name, testName);
  assert.ok(verifyRes.token);

  // Verification record should be cleaned up
  const cleanedRow = d.prepare('SELECT * FROM email_verifications WHERE email=?').get(testEmail);
  assert.equal(cleanedRow, undefined);

  // User should now be in users table
  const userRow = d.prepare('SELECT * FROM users WHERE email=?').get(testEmail) as any;
  assert.ok(userRow);
  assert.equal(userRow.name, testName);

  // Clean up
  d.prepare('DELETE FROM sessions WHERE user_id=?').run(verifyRes.user.id);
  d.prepare('DELETE FROM users WHERE email=?').run(testEmail);
});
