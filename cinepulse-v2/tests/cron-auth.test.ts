import test from 'node:test';
import assert from 'node:assert/strict';
import { requireCron } from '../lib/auth/cron';

const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;
const req = (auth?: string, forwardedFor?: string) => {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = auth;
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;
  return new Request('https://cinepulse.example/api/cron/resolve-calls', { headers });
};
const status = (fn: () => void) => {
  try { fn(); return 200; } catch (e) { return (e as { status?: number }).status ?? 500; }
};

test('with CRON_SECRET: only the exact bearer token passes', () => {
  const e = env({ NODE_ENV: 'production', CRON_SECRET: 's3cret' });
  assert.equal(status(() => requireCron(req('Bearer s3cret'), e)), 200);
  assert.equal(status(() => requireCron(req('Bearer wrong!'), e)), 401);
  assert.equal(status(() => requireCron(req(), e)), 401);
  assert.equal(status(() => requireCron(req('s3cret'), e)), 401);
});

test('production without CRON_SECRET: refused, even with a forged loopback X-Forwarded-For', () => {
  const e = env({ NODE_ENV: 'production' });
  assert.equal(status(() => requireCron(req(undefined, '127.0.0.1'), e)), 503);
  assert.equal(status(() => requireCron(req(), env({ NODE_ENV: 'production', VERCEL: '1' }))), 503);
});

test('local development without CRON_SECRET: allowed so jobs can be run by hand', () => {
  assert.equal(status(() => requireCron(req(), env({ NODE_ENV: 'development' }))), 200);
});
