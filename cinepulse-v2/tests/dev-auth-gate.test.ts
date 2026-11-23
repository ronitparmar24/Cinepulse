import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const tempDir = mkdtempSync(join(tmpdir(), 'cinepulse-dev-auth-'));
process.env.DATABASE_PATH = join(tempDir, 'dev_auth.db');
process.env.CATALOG_MODE = 'demo';

const { devAuthAllowed } = await import('../lib/auth/devAuth');
const { demoGoogleLogin, requestEmailOtp, register } = await import('../lib/auth');
const { getLatestDevEmail } = await import('../lib/mailer');
const route = await import('../app/api/[...path]/route');
const { NextRequest } = await import('next/server');

type Env = NodeJS.ProcessEnv;
const originalEnv = { NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL, ALLOW_DEV_AUTH: process.env.ALLOW_DEV_AUTH };

function setEnv(values: Partial<Record<'NODE_ENV' | 'VERCEL' | 'ALLOW_DEV_AUTH', string | undefined>>) {
  const env = process.env as Record<string, string | undefined>;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
}

function restoreEnv() {
  setEnv(originalEnv);
}

function call(method: 'GET' | 'POST', path: string, body?: unknown) {
  const url = `http://127.0.0.1:3000/api/${path}`;
  const request = new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const segments = new URL(url).pathname.replace(/^\/api\//, '').split('/');
  const handler = method === 'GET' ? route.GET : route.POST;
  return handler(request, { params: Promise.resolve({ path: segments }) });
}

test.after(() => {
  restoreEnv();
  // On Windows the SQLite file is still held open by this process, so removal can fail with
  // EPERM; the OS cleans the temp dir later, and a cleanup error must not fail the suite.
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});

test('devAuthAllowed: only outside production, never on Vercel', () => {
  const cases: Array<[Env, boolean]> = [
    [{ NODE_ENV: 'development' } as Env, true],
    [{ NODE_ENV: 'test' } as Env, true],
    [{ NODE_ENV: 'production' } as Env, false],
    [{ NODE_ENV: 'production', ALLOW_DEV_AUTH: '1' } as Env, true],
    [{ NODE_ENV: 'production', ALLOW_DEV_AUTH: '1', VERCEL: '1' } as Env, false],
    [{ NODE_ENV: 'development', VERCEL: '1' } as Env, false],
  ];
  for (const [env, expected] of cases) assert.equal(devAuthAllowed(env), expected, JSON.stringify(env));
});

test('production: demo Google login is refused, even for an existing account', async () => {
  setEnv({ NODE_ENV: 'development', VERCEL: undefined, ALLOW_DEV_AUTH: undefined });
  const victim = `victim.${Date.now()}@cinema.com`;
  await register({ name: 'Victim', email: victim, password: 'CorrectHorse!42' });

  setEnv({ NODE_ENV: 'production' });
  await assert.rejects(() => demoGoogleLogin(victim), (e: { status?: number }) => e.status === 404);

  const res = await call('POST', 'auth/google/demo', { email: victim });
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('set-cookie'), null, 'no session cookie may be issued');
  restoreEnv();
});

test('production: GET /auth/google?demo=1 does not sign anyone in', async () => {
  setEnv({ NODE_ENV: 'production', VERCEL: undefined, ALLOW_DEV_AUTH: undefined });
  const res = await call('GET', 'auth/google?demo=1&email=someone@cinema.com');
  assert.ok(res.status >= 300 && res.status < 400, `expected redirect, got ${res.status}`);
  assert.ok(!(res.headers.get('set-cookie') || '').includes('cinepulse_session'), 'no session cookie may be issued');
  restoreEnv();
});

test('production: OTP preview endpoint and Google-OTP endpoints are gone', async () => {
  setEnv({ NODE_ENV: 'production', VERCEL: undefined, ALLOW_DEV_AUTH: undefined });
  assert.equal((await call('GET', 'auth/otp/preview')).status, 404);
  assert.equal((await call('POST', 'auth/google/otp/request', { email: 'a@cinema.com' })).status, 404);
  assert.equal((await call('POST', 'auth/google/otp/verify', { email: 'a@cinema.com', code: '123456' })).status, 404);
  restoreEnv();
});

test('production: an undelivered OTP is an error, and the code is never returned or stored', async () => {
  setEnv({ NODE_ENV: 'production', VERCEL: undefined, ALLOW_DEV_AUTH: undefined });
  const before = getLatestDevEmail();
  // In the test runner the mailer never sends real email, which is exactly the
  // "no provider delivered it" case a misconfigured production server hits.
  await assert.rejects(
    () => requestEmailOtp({ name: 'Prod User', email: `prod.${Date.now()}@cinema.com`, password: 'CorrectHorse!42' }),
    (e: { status?: number }) => e.status === 503,
  );
  assert.equal(getLatestDevEmail(), before, 'the code must not be kept in memory in production');
  restoreEnv();
});

test('development: OTP code is still returned so local sign-up works without email', async () => {
  setEnv({ NODE_ENV: 'development', VERCEL: undefined, ALLOW_DEV_AUTH: undefined });
  const res = await requestEmailOtp({ name: 'Dev User', email: `dev.${Date.now()}@cinema.com`, password: 'CorrectHorse!42' });
  assert.equal(res.devMode, true);
  assert.match(res.code || '', /^\d{6}$/);
  restoreEnv();
});
