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
    if (res.status !== 401 && res.status !== 403) throw new Error(`Expected 401/403, got ${res.status}`);
    return `HTTP ${res.status} gate verified`;
  });

  // 9. Auth registration or demo session
  let authCookie = null;
  await check('POST /api/auth/google/demo (Session initialization)', async () => {
    const res = await fetch(`${targetUrl}/api/auth/google/demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': targetUrl },
      body: JSON.stringify({ email: `smoke.tester.${Date.now()}@example.com`, name: 'Smoke Tester' })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      authCookie = setCookie.split(';')[0];
    }
    const data = await res.json();
    if (!data.user?.id) throw new Error('Missing user id in session');
    return `Session established for ${data.user.email}`;
  });

  // 10. Authenticated Library Mutation
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
