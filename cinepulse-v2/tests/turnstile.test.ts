import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceTurnstile, turnstileRequired, turnstileTokenFrom } from '../lib/auth/turnstile';

const KEYS = ['TURNSTILE_SECRET_KEY', 'NEXT_PUBLIC_TURNSTILE_SITE_KEY'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;

// The suite runs with NODE_ENV=test; opt into enforcement so the "configured" cases exercise it.
process.env.NEXT_PUBLIC_TURNSTILE_IN_DEV = '1';
test.after(() => {
  delete process.env.NEXT_PUBLIC_TURNSTILE_IN_DEV;
});

function setKeys(secret?: string, site?: string) {
  const env = process.env as Record<string, string | undefined>;
  if (secret === undefined) delete env.TURNSTILE_SECRET_KEY; else env.TURNSTILE_SECRET_KEY = secret;
  if (site === undefined) delete env.NEXT_PUBLIC_TURNSTILE_SITE_KEY; else env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = site;
}

test.afterEach(() => {
  globalThis.fetch = realFetch;
});
test.after(() => {
  setKeys(saved.TURNSTILE_SECRET_KEY, saved.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
});

const envOf = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;
const req = (headers: Record<string, string> = {}) => new Request('http://127.0.0.1:3000/api/auth/login', { method: 'POST', headers });

test('required only when both secret and site key are set (prevents BUG-001)', () => {
  const prod = { NODE_ENV: 'production' };
  assert.equal(turnstileRequired(envOf({ ...prod })), false);
  assert.equal(turnstileRequired(envOf({ ...prod, TURNSTILE_SECRET_KEY: 's' })), false);
  assert.equal(turnstileRequired(envOf({ ...prod, NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'k' })), false);
  assert.equal(turnstileRequired(envOf({ ...prod, TURNSTILE_SECRET_KEY: 's', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'k' })), true);
});

test('development: not required (site keys are hostname-bound and fail on 127.0.0.1) unless opted in', () => {
  const keys = { TURNSTILE_SECRET_KEY: 's', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'k' };
  assert.equal(turnstileRequired(envOf({ NODE_ENV: 'development', ...keys })), false);
  assert.equal(turnstileRequired(envOf({ NODE_ENV: 'test', ...keys })), false);
  assert.equal(turnstileRequired(envOf({ NODE_ENV: 'development', NEXT_PUBLIC_TURNSTILE_IN_DEV: '1', ...keys })), true);
});

test('token is read from the header first, then the body', () => {
  assert.equal(turnstileTokenFrom(req({ 'x-turnstile-token': ' abc ' }), { turnstileToken: 'zzz' }), 'abc');
  assert.equal(turnstileTokenFrom(req(), { turnstileToken: 'zzz' }), 'zzz');
  assert.equal(turnstileTokenFrom(req(), { turnstileToken: 42 }), '');
});

test('configured: a request with no token is rejected (bots can no longer skip it)', async () => {
  setKeys('secret', 'site');
  await assert.rejects(() => enforceTurnstile(req(), {}, '1.2.3.4'), (e: { status?: number }) => e.status === 403);
});

test('configured: a token Cloudflare rejects is refused; an accepted one passes', async () => {
  setKeys('secret', 'site');
  globalThis.fetch = (async () => new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }))) as typeof fetch;
  await assert.rejects(() => enforceTurnstile(req(), { turnstileToken: 'bad' }, '1.2.3.4'), (e: { status?: number }) => e.status === 403);
  globalThis.fetch = (async () => new Response(JSON.stringify({ success: true }))) as typeof fetch;
  await enforceTurnstile(req(), { turnstileToken: 'good' }, '1.2.3.4');
});

test('not configured: sign-in works without a token', async () => {
  setKeys(undefined, undefined);
  await enforceTurnstile(req(), {}, '1.2.3.4');
});

test('optional mode (forecasts): no token passes, a bad token still fails', async () => {
  setKeys('secret', 'site');
  await enforceTurnstile(req(), {}, '1.2.3.4', { required: false });
  globalThis.fetch = (async () => new Response(JSON.stringify({ success: false }))) as typeof fetch;
  await assert.rejects(() => enforceTurnstile(req(), { turnstileToken: 'bad' }, '1.2.3.4', { required: false }));
});
