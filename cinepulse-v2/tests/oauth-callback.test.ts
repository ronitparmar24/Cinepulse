import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { register } from '../lib/auth';

/** Loads public/sw.js in a sandbox and returns its fetch handler. */
function loadServiceWorker() {
  const listeners: Record<string, (e: any) => void> = {};
  const fetchCalls: string[] = [];
  const sandbox: any = {
    self: { addEventListener: (type: string, fn: (e: any) => void) => { listeners[type] = fn; }, location: { origin: 'https://cinepulse.test' }, registration: {}, clients: { claim: async () => {} }, skipWaiting: async () => {} },
    caches: { open: async () => ({ addAll: async () => {}, put: async () => {}, keys: async () => [], delete: async () => {} }), match: async () => undefined, keys: async () => [] },
    fetch: async (req: any) => { fetchCalls.push(typeof req === 'string' ? req : req.url); return new Response('network'); },
    URL, Response, Promise, console,
  };
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), sandbox);
  return { onFetch: listeners.fetch, fetchCalls };
}

const navEvent = (url: string, preload?: Response, mode = 'navigate') => {
  let responded: Promise<Response> | null = null;
  return {
    event: { request: { url, method: 'GET', mode }, preloadResponse: Promise.resolve(preload), respondWith: (p: Promise<Response>) => { responded = p; } },
    get responded() { return responded; },
  };
};

test('service worker: an /api/ navigation is answered with the preload, never sent twice', async () => {
  const { onFetch, fetchCalls } = loadServiceWorker();
  const preload = new Response('from-preload');
  const nav = navEvent('https://cinepulse.test/api/auth/google/callback?code=abc&state=xyz', preload);
  onFetch(nav.event);
  assert.ok(nav.responded, 'the worker answers the navigation itself');
  assert.equal(await (await nav.responded!).text(), 'from-preload');
  assert.deepEqual(fetchCalls, [], 'no second request for the one-time sign-in code');

  // Without a preload it fetches exactly once.
  const nav2 = navEvent('https://cinepulse.test/api/auth/google/callback?code=def', undefined);
  onFetch(nav2.event);
  await nav2.responded;
  assert.equal(fetchCalls.length, 1);

  // Plain API calls (fetch/XHR) are left alone and never cached.
  const xhr = navEvent('https://cinepulse.test/api/library', undefined, 'cors');
  onFetch(xhr.event);
  assert.equal(xhr.responded, null);
  assert.doesNotMatch(readFileSync('public/sw.js', 'utf8'), /cache\.put\(event\.request/);
});

test('Google callback: a repeated (already-used) code is not shown as an error to someone signed in', async () => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Bad Request' }), { status: 400, headers: { 'content-type': 'application/json' } });
    return realFetch(input, init);
  }) as typeof fetch;
  try {
    const route = await import('../app/api/[...path]/route');
    const { NextRequest } = await import('next/server');
    const get = (path: string, cookie = '') => route.GET(new NextRequest(`http://127.0.0.1:3000/api/${path}`, { headers: { host: '127.0.0.1:3000', ...(cookie ? { cookie } : {}) } }), { params: Promise.resolve({ path: path.split('?')[0].split('/') }) });

    const start = await get('auth/google');
    const google = new URL(start.headers.get('location')!);
    const state = google.searchParams.get('state')!;
    const stateCookie = (start.headers.get('set-cookie') || '').split(';')[0];
    assert.match(stateCookie, /^cinepulse_oauth_state=/);

    // Not signed in: a clear message instead of "Google authorization failed (400)".
    const failed = await get(`auth/google/callback?code=used-code&state=${state}`, stateCookie);
    const failedTo = new URL(failed.headers.get('location') || '', 'http://x').searchParams.toString().replace(/\+/g, ' ');
    const failedMsg = new URL(failed.headers.get('location') || '', 'http://x').searchParams.get('auth_error') || '';
    assert.match(failedTo, /auth_error/);
    assert.match(failedMsg, /already used or expired/);
    assert.doesNotMatch(failedMsg, /\(400\)/);

    // Already signed in (the first copy of the callback worked): carry on as signed in.
    const { token } = await register({ name: 'Google Repeat', email: `grepeat.${Date.now()}@member-mail.org`, password: 'google-repeat-pass-1' });
    const ok = await get(`auth/google/callback?code=used-code&state=${state}`, `${stateCookie}; cinepulse_session=${token}`);
    const okTo = decodeURIComponent(ok.headers.get('location') || '');
    assert.match(okTo, /auth_success/);
    assert.doesNotMatch(okTo, /auth_error/);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  }
});
