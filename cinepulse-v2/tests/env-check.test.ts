import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEnvironment } from '../lib/env';

const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;
const messages = (v: Record<string, string>) => checkEnvironment(env(v)).map((p) => p.message).join('\n');

test('flags Vercel without Postgres, half-configured Turnstile, legacy VITE key', () => {
  const m = messages({ NODE_ENV: 'production', VERCEL: '1', TURNSTILE_SECRET_KEY: 's', VITE_TURNSTILE_SITE_KEY: 'k' });
  assert.match(m, /DATABASE_URL is not a postgres/);
  assert.match(m, /Only one of TURNSTILE/);
  assert.match(m, /VITE_TURNSTILE_SITE_KEY/);
  assert.match(m, /CRON_SECRET is not set/);
});

test('a complete production config has no problems, and values never appear in messages', () => {
  const secret = 'super-secret-value-123';
  const problems = checkEnvironment(env({
    NODE_ENV: 'production', VERCEL: '1', DATABASE_URL: `postgres://u:${secret}@h/db`, CRON_SECRET: secret,
    TURNSTILE_SECRET_KEY: secret, NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'k', RESEND_API_KEY: secret, CATALOG_MODE: 'demo',
  }));
  assert.deepEqual(problems, []);
  assert.ok(!messages({ NODE_ENV: 'production', DATABASE_URL: `mysql://${secret}` }).includes(secret));
});
