#!/usr/bin/env node
/**
 * CinePulse Deployment Verification Suite
 * 
 * Usage:
 *   node scripts/verify-deploy.mjs [TARGET_URL]
 * 
 * Example:
 *   node scripts/verify-deploy.mjs https://cinepulse-kohl.vercel.app
 *   node scripts/verify-deploy.mjs http://127.0.0.1:3000
 */
import { createHmac } from 'node:crypto';

const targetUrl = (process.argv[2] || process.env.DEPLOYED_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

console.log(`\n======================================================`);
console.log(`CinePulse Automated Deployment Smoke Suite`);
console.log(`Target: ${targetUrl}`);
console.log(`Date:   ${new Date().toISOString()}`);
console.log(`======================================================\n`);

let passed = 0;
let failed = 0;

async function check(name, testFn) {
  process.stdout.write(`  [Smoke] ${name.padEnd(50)} `);
  try {
    const result = await testFn();
    console.log(`✅ PASS (${result || 'OK'})`);
    passed++;
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    failed++;
  }
}

async function run() {
  // 1. Health check
  await check('GET /api/health (Provider & Catalog status)', async () => {
    const res = await fetch(`${targetUrl}/api/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return `Mode: ${data.mode}, Health: ${data.health?.status || 'ok'}`;
  });

  // 2. Config check
  await check('GET /api/config (Public catalog configuration)', async () => {
    const res = await fetch(`${targetUrl}/api/config`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return `Mode: ${data.mode}`;
  });

  // 3. Trending catalog check
  await check('GET /api/catalog (Trending page 1)', async () => {
    const res = await fetch(`${targetUrl}/api/catalog?collection=trending&page=1`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.items) || data.items.length === 0) throw new Error('Empty items array');
    return `${data.items.length} titles returned`;
  });

  // 4. Inception title detail
  await check('GET /api/title/movie-27205 (Inception lookup)', async () => {
    const res = await fetch(`${targetUrl}/api/title/movie-27205`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.title?.title) throw new Error('Missing title field');
    return `Found "${data.title.title}"`;
  });

  // 5. HEAD method validation
  await check('HEAD /api/health (Headers preserved, 0 body)', async () => {
    const res = await fetch(`${targetUrl}/api/health`, { method: 'HEAD' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    if (body.length > 0) throw new Error(`Expected empty body, got ${body.length} bytes`);
    return `Status ${res.status}, 0 body bytes`;
  });

  // 6. SQL injection resilience
  await check('GET /api/catalog?query=injection (Sanitized)', async () => {
    const res = await fetch(`${targetUrl}/api/catalog?query=${encodeURIComponent("'; DROP TABLE users; --")}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return `HTTP 200 without DB error`;
  });

  // 7. Unauthenticated Library Gate
  await check('GET /api/library (Unauthorized 401 gate)', async () => {
    const res = await fetch(`${targetUrl}/api/library`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    return `HTTP 401 verified`;
  });

  // 8. Unauthenticated Cron Gate
  await check('POST /api/cron/resolve-calls (Protected gate)', async () => {
    const res = await fetch(`${targetUrl}/api/cron/resolve-calls`, {
      method: 'POST',
      headers: { 'Origin': targetUrl }
    });
    if (![401, 403, 503].includes(res.status)) throw new Error(`Expected 401/403/503, got ${res.status}`);
    return `HTTP ${res.status} gate verified`;
  });

  // 9. Demo login must be closed on a public deployment (account-takeover guard)
  await check('POST /api/auth/google/demo (must be 404 in production)', async () => {
    const res = await fetch(`${targetUrl}/api/auth/google/demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': targetUrl },
      body: JSON.stringify({ email: 'nobody@example.com' })
    });
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status} — demo login is reachable!`);
    return 'Closed (404)';
  });
  await check('GET /api/auth/otp/preview (must be 404 in production)', async () => {
    const res = await fetch(`${targetUrl}/api/auth/otp/preview`);
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status} — OTP codes are exposed!`);
    return 'Closed (404)';
  });

  await check('GET /api/auth/me with a forged session token (must be signed out)', async () => {
    // Versions before 2.4.0 accepted tokens signed with a default key published in the repository.
    const payload = Buffer.from(JSON.stringify({ uid: `verify-forged-${Date.now()}`, eml: 'forged@example.invalid', nam: 'Forged', exp: Date.now() + 3600_000, rnd: 'verify' })).toString('base64url');
    const token = `cps_${payload}.${createHmac('sha256', 'cinepulse-persistent-session-secret-key-v1').update(payload).digest('base64url')}`;
    const res = await fetch(`${targetUrl}/api/auth/me`, { headers: { Cookie: `cinepulse_session=${token}` } });
    const data = await res.json().catch(() => ({}));
    if (data?.user) throw new Error('A forged token signed someone in — deploy the session fix immediately!');
    return 'Forged tokens rejected';
  });

  // 10. Real account registration (password sign-up; Turnstile must be off or a token supplied)
  let authCookie = null;
  await check('POST /api/auth/register (Session initialization)', async () => {
    const res = await fetch(`${targetUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': targetUrl },
      body: JSON.stringify({ email: `smoke.tester.${Date.now()}@example.com`, name: 'Smoke Tester', password: `smoke-${Date.now()}-Passw0rd!` })
    });
    if (res.status === 403) return 'Skipped: Turnstile is enforced on this deployment';
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) authCookie = setCookie.split(';')[0];
    const data = await res.json();
    if (!data.user?.id) throw new Error('Missing user id in session');
    return `Session established for ${data.user.email}`;
  });

  // 11. Authenticated Library Mutation
  if (authCookie) {
    await check('PUT /api/library/movie-27205 (Watchlist mutation)', async () => {
      const res = await fetch(`${targetUrl}/api/library/movie-27205`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': authCookie,
          'Origin': targetUrl
        },
        body: JSON.stringify({ status: 'watchlist' })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      return `Watchlist item saved`;
    });
  }

  console.log(`\n------------------------------------------------------`);
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log(`------------------------------------------------------\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal suite failure:', err);
  process.exit(1);
});
