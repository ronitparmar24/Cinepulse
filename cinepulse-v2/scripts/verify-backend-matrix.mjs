// scripts/verify-backend-matrix.mjs
// Automated Phase 3 Backend Verification for CinePulse against LOCAL and DEPLOYED

import { writeFileSync } from 'node:fs';

const LOCAL_URL = process.env.LOCAL_URL || 'http://127.0.0.1:3000';
const DEPLOYED_URL = process.env.DEPLOYED_URL || 'https://cinepulse-kohl.vercel.app';

const ACCOUNT_A = {
  email: 'qa.throwaway.a@gmail.com',
  name: 'QA Account A'
};

const ACCOUNT_B = {
  email: 'qa.throwaway.b@gmail.com',
  name: 'QA Account B'
};

async function getDemoSession(baseUrl, account) {
  try {
    const res = await fetch(`${baseUrl}/api/auth/google?demo=1&email=${encodeURIComponent(account.email)}&name=${encodeURIComponent(account.name)}`, {
      method: 'GET',
      redirect: 'manual'
    });
    const cookieHeader = res.headers.get('set-cookie') || '';
    const match = cookieHeader.match(/cinepulse_session=([^;]+)/);
    const token = match ? decodeURIComponent(match[1]) : null;
    return { token, cookie: cookieHeader };
  } catch (err) {
    return { token: null, error: err.message };
  }
}

async function request(baseUrl, path, options = {}) {
  const url = `${baseUrl}${path}`;
  const start = Date.now();
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/json',
        ...(options.headers || {})
      }
    });
    const duration = Date.now() - start;
    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try { data = await res.json(); } catch { data = null; }
    } else {
      try { data = await res.text(); } catch { data = null; }
    }
    return {
      status: res.status,
      ok: res.ok,
      duration,
      headers: Object.fromEntries(res.headers.entries()),
      data
    };
  } catch (err) {
    return {
      status: 0,
      ok: false,
      duration: Date.now() - start,
      error: err.message,
      data: null
    };
  }
}

async function runTestSuite(baseUrl, label) {
  console.log(`\n======================================================`);
  console.log(`Running Backend Verification on ${label}: ${baseUrl}`);
  console.log(`======================================================\n`);

  const results = [];
  function record(id, category, testName, expected, actual, pass, detail = '') {
    results.push({ id, category, testName, expected, actual, pass, detail });
    const mark = pass ? '✅ PASS' : '❌ FAIL';
    console.log(`[${mark}] ${id} [${category}] ${testName}: ${detail || `HTTP ${actual}`}`);
  }

  // 1. Get Tokens for Accounts A & B
  const sessionA = await getDemoSession(baseUrl, ACCOUNT_A);
  const sessionB = await getDemoSession(baseUrl, ACCOUNT_B);
  const authA = sessionA.token ? { 'Authorization': `Bearer ${sessionA.token}` } : {};
  const authB = sessionB.token ? { 'Authorization': `Bearer ${sessionB.token}` } : {};

  // --- ANGLE 1: Happy Path Public Routes ---
  {
    const res = await request(baseUrl, '/api/health');
    const pass = res.status === 200 && res.data?.mode && res.data?.providers;
    record('BE-01', 'Public', 'GET /api/health returns 200 & provider status', '200 OK', res.status, pass, `Mode: ${res.data?.mode}, Health: ${res.data?.health?.status}`);
  }
  {
    const res = await request(baseUrl, '/api/config');
    const pass = res.status === 200 && res.data?.mode;
    record('BE-02', 'Public', 'GET /api/config returns catalog mode', '200 OK', res.status, pass, `Mode: ${res.data?.mode}`);
  }
  {
    const res = await request(baseUrl, '/api/genres?media=movie');
    const pass = res.status === 200 && Array.isArray(res.data?.genres);
    record('BE-03', 'Public', 'GET /api/genres?media=movie returns genre list', '200 OK', res.status, pass, `${res.data?.genres?.length || 0} genres`);
  }
  {
    const res = await request(baseUrl, '/api/catalog?collection=trending&page=1');
    const pass = res.status === 200 && Array.isArray(res.data?.items) && res.data.items.length > 0;
    record('BE-04', 'Public', 'GET /api/catalog?collection=trending returns items', '200 OK', res.status, pass, `${res.data?.items?.length || 0} items on page 1`);
  }
  {
    const res = await request(baseUrl, '/api/title/movie-27205');
    const pass = res.status === 200 && res.data?.title?.id === 'movie-27205';
    record('BE-05', 'Public', 'GET /api/title/movie-27205 (Inception) returns details', '200 OK', res.status, pass, `Title: "${res.data?.title?.title}"`);
  }
  {
    const res = await request(baseUrl, '/api/trailers/trending?limit=5');
    const pass = res.status === 200 && Array.isArray(res.data?.trailers);
    record('BE-06', 'Public', 'GET /api/trailers/trending returns trailers array', '200 OK', res.status, pass, `${res.data?.trailers?.length || 0} trailers`);
  }
  {
    const res = await request(baseUrl, '/api/theaters/nearby');
    const pass = res.status === 200;
    record('BE-07', 'Public', 'GET /api/theaters/nearby returns theater info', '200 OK', res.status, pass);
  }
  {
    const res = await request(baseUrl, '/api/currency');
    const pass = res.status === 200 && res.data?.rates;
    record('BE-08', 'Public', 'GET /api/currency returns exchange rates', '200 OK', res.status, pass, `INR: ${res.data?.rates?.INR}`);
  }
  {
    const res = await request(baseUrl, '/api/leaderboard');
    const pass = res.status === 200;
    record('BE-09', 'Public', 'GET /api/leaderboard returns leaderboard', '200 OK', res.status, pass);
  }
  {
    const res = await request(baseUrl, '/api/receipts');
    const pass = res.status === 200;
    record('BE-10', 'Public', 'GET /api/receipts returns public receipts', '200 OK', res.status, pass);
  }
  {
    const res = await request(baseUrl, '/api/accuracy');
    const pass = res.status === 200;
    record('BE-11', 'Public', 'GET /api/accuracy returns backtest metrics', '200 OK', res.status, pass);
  }

  // --- ANGLE 2: Auth & Protected Routes (Unauthenticated Gate) ---
  {
    const res = await request(baseUrl, '/api/auth/me');
    const pass = res.status === 200 && res.data?.user === null;
    record('BE-12', 'Auth Gate', 'GET /api/auth/me without token returns null user', '200 OK (user: null)', res.status, pass);
  }
  {
    const res = await request(baseUrl, '/api/auth/me', { headers: authA });
    const pass = res.status === 200 && res.data?.user?.email === ACCOUNT_A.email;
    record('BE-13', 'Auth Session', 'GET /api/auth/me with Bearer returns Account A', '200 OK (Account A)', res.status, pass, `User: ${res.data?.user?.name}`);
  }
  {
    const res = await request(baseUrl, '/api/library');
    const pass = res.status === 401;
    record('BE-14', 'Auth Gate', 'GET /api/library unauthenticated returns 401', '401 Unauthorized', res.status, pass, `Observed status: ${res.status}`);
  }
  {
    const res = await request(baseUrl, '/api/my-forecasts');
    const pass = res.status === 401;
    record('BE-15', 'Auth Gate', 'GET /api/my-forecasts unauthenticated returns 401', '401 Unauthorized', res.status, pass, `Observed status: ${res.status}`);
  }
  {
    const res = await request(baseUrl, '/api/export');
    const pass = res.status === 401;
    record('BE-16', 'Auth Gate', 'GET /api/export unauthenticated returns 401', '401 Unauthorized', res.status, pass, `Observed status: ${res.status}`);
  }
  {
    const res = await request(baseUrl, '/api/notifications');
    const pass = res.status === 401;
    record('BE-17', 'Auth Gate', 'GET /api/notifications unauthenticated returns 401', '401 Unauthorized', res.status, pass, `Observed status: ${res.status}`);
  }

  // --- ANGLE 3: Wrong User Isolation & Supabase FK Alignment ---
  {
    // A writes to library
    const putRes = await request(baseUrl, '/api/library/movie-27205', {
      method: 'PUT',
      headers: { ...authA, 'Content-Type': 'application/json', 'Origin': baseUrl },
      body: JSON.stringify({ status: 'watchlist' })
    });
    // A reads library
    const libA = await request(baseUrl, '/api/library', { headers: authA });
    const hasItemA = Array.isArray(libA.data?.items) && libA.data.items.some(i => i.title?.id === 'movie-27205');

    // B reads library -> must NOT see A's item
    const libB = await request(baseUrl, '/api/library', { headers: authB });
    const hasItemB = Array.isArray(libB.data?.items) && libB.data.items.some(i => i.title?.id === 'movie-27205');

    const pass = putRes.status === 200 && hasItemA && !hasItemB;
    const detail = putRes.status === 400
      ? `Supabase FK Error: ${putRes.data?.error || ''}`
      : `A has item: ${hasItemA}, B has item: ${hasItemB}`;
    record('BE-18', 'Multi-tenant Isolation', 'Account B cannot read Account A library items', '200 OK & Isolated rows', putRes.status === 200 ? 'Isolated' : `Error ${putRes.status}`, pass, detail);
  }

  // --- ANGLE 4: Bad Input & Injection Resilience ---
  {
    // Oversized body (>16KB)
    const largeBody = JSON.stringify({ data: 'A'.repeat(17 * 1024) });
    const res = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': baseUrl },
      body: largeBody
    });
    const pass = res.status === 400;
    record('BE-19', 'Input Validation', 'POST with body > 16KB returns 400 Bad Request', '400 Bad Request', res.status, pass, `Error message: ${res.data?.error || ''}`);
  }
  {
    // Invalid JSON
    const res = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': baseUrl },
      body: '{ malformed json: 123 '
    });
    const pass = res.status === 400;
    record('BE-20', 'Input Validation', 'POST with malformed JSON body returns 400', '400 Bad Request', res.status, pass, `Error: ${res.data?.error || ''}`);
  }
  {
    // SQL Injection attempt in search query - must NOT crash or return 500
    const res = await request(baseUrl, `/api/catalog?collection=trending&query=${encodeURIComponent("'; DROP TABLE users; --")}`);
    const pass = res.status === 200 && Array.isArray(res.data?.items);
    record('BE-21', 'Security', 'SQL injection string in search handled safely without crash', '200 OK & safe array', res.status, pass, `Items count: ${res.data?.items?.length || 0}`);
  }
  {
    // Negative and massive page numbers
    const res1 = await request(baseUrl, '/api/catalog?page=-1');
    const res2 = await request(baseUrl, '/api/catalog?page=999999');
    const pass = res1.status === 400 && res2.status === 400;
    record('BE-22', 'Input Validation', 'Out-of-bounds page parameters return 400', '400 on page=-1 & page=999999', `${res1.status} / ${res2.status}`, pass);
  }
  {
    // Invalid title ID path
    const res = await request(baseUrl, '/api/title/invalid-id-format$$$');
    const pass = res.status === 404 || res.status === 400;
    record('BE-23', 'Input Validation', 'Malformed title ID returns 404/400 (not 500)', '404/400 Not Found', res.status, pass, `Status: ${res.status}`);
  }

  // --- ANGLE 5: Idempotency & Immortality / Anti-Gaming ---
  {
    // Double submit watchlist add
    const r1 = await request(baseUrl, '/api/library/movie-27205', {
      method: 'PUT',
      headers: { ...authA, 'Content-Type': 'application/json', 'Origin': baseUrl },
      body: JSON.stringify({ status: 'watchlist' })
    });
    const r2 = await request(baseUrl, '/api/library/movie-27205', {
      method: 'PUT',
      headers: { ...authA, 'Content-Type': 'application/json', 'Origin': baseUrl },
      body: JSON.stringify({ status: 'watchlist' })
    });
    const pass = r1.ok && r2.ok;
    record('BE-24', 'Idempotency', 'Double-submit watchlist add succeeds idempotently', '200/200 OK', `${r1.status}/${r2.status}`, pass, `R1: ${r1.status}, R2: ${r2.status}`);
  }
  {
    // Out of bounds rating rejected
    const res = await request(baseUrl, '/api/library/movie-27205', {
      method: 'PUT',
      headers: { ...authA, 'Content-Type': 'application/json', 'Origin': baseUrl },
      body: JSON.stringify({ status: 'watched', rating: 9 }) // Inception is released, but rating max is 5!
    });
    const pass = res.status === 400;
    record('BE-25', 'Business Rules', 'Rating out-of-range (9 on scale of 1-5) rejected with 400', '400 Bad Request', res.status, pass, `Error: ${res.data?.error || ''}`);
  }

  // --- ANGLE 6: Prediction Honesty & Sanity ---
  {
    const res = await request(baseUrl, '/api/prediction/movie-27205');
    const p = res.data?.prediction;
    const isSane = p &&
      p.p10RevenueUsd >= 0 &&
      p.p10RevenueUsd <= p.p50RevenueUsd &&
      p.p50RevenueUsd <= p.p90RevenueUsd &&
      p.hitProbability >= 0 && p.hitProbability <= 100;
    const pass = res.status === 200 && isSane;
    record('BE-26', 'Prediction Pipeline', 'Predictions satisfy P10 <= P50 <= P90 & hitProbability 0..100', '200 OK & Sane bounds', res.status, pass,
      p ? `P10: $${p.p10RevenueUsd.toLocaleString()}, P50: $${p.p50RevenueUsd.toLocaleString()}, P90: $${p.p90RevenueUsd.toLocaleString()}, Hit: ${p.hitProbability}%` : 'Missing prediction');
  }

  // --- ANGLE 7: Social Features & Explore ---
  {
    const res = await request(baseUrl, '/api/explore/trending-films');
    const pass = res.status === 200 && Array.isArray(res.data?.films);
    record('BE-27', 'Social', 'GET /api/explore/trending-films returns list', '200 OK', res.status, pass, `${res.data?.films?.length || 0} films`);
  }
  {
    const res = await request(baseUrl, '/api/explore/for-you', { headers: authA });
    const pass = res.status === 200;
    record('BE-28', 'Social', 'GET /api/explore/for-you returns feed for user', '200 OK', res.status, pass);
  }

  // --- ANGLE 8: Cron Protection ---
  {
    const res = await request(baseUrl, '/api/cron/resolve-calls', {
      method: 'POST',
      headers: { 'Origin': baseUrl }
    });
    const pass = res.status === 401;
    record('BE-29', 'Cron Security', 'POST /api/cron/resolve-calls unauthenticated returns 401', '401 Unauthorized', res.status, pass, `Status: ${res.status}`);
  }
  {
    const res = await request(baseUrl, '/api/cron/snapshot', {
      method: 'POST',
      headers: { 'Origin': baseUrl }
    });
    const pass = res.status === 401;
    record('BE-30', 'Cron Security', 'POST /api/cron/snapshot unauthenticated returns 401', '401 Unauthorized', res.status, pass, `Status: ${res.status}`);
  }

  // Clean up Account A watchlist item
  await request(baseUrl, '/api/library/movie-27205', {
    method: 'DELETE',
    headers: { ...authA, 'Origin': baseUrl }
  });

  return results;
}

async function main() {
  const localResults = await runTestSuite(LOCAL_URL, 'LOCAL');
  const deployedResults = await runTestSuite(DEPLOYED_URL, 'DEPLOYED');

  // Build Markdown Document
  let md = `# CinePulse QA Audit — Phase 3: Backend Verification Matrix\n\n`;
  md += `**Execution Timestamp**: ${new Date().toISOString()}\n`;
  md += `**Local Base URL**: \`${LOCAL_URL}\`\n`;
  md += `**Deployed Base URL**: \`${DEPLOYED_URL}\`\n\n`;
  md += `## Pass / Fail Summary\n\n`;

  const localPass = localResults.filter(r => r.pass).length;
  const localTotal = localResults.length;
  const depPass = deployedResults.filter(r => r.pass).length;
  const depTotal = deployedResults.length;

  md += `- **Local Results**: ${localPass} / ${localTotal} Passed (${Math.round(localPass/localTotal*100)}%)\n`;
  md += `- **Deployed Results**: ${depPass} / ${depTotal} Passed (${Math.round(depPass/depTotal*100)}%)\n\n`;

  md += `## Comprehensive Verification Matrix\n\n`;
  md += `| ID | Category | Test Case | Expected | Local Status | Deployed Status | Verdict | Details |\n`;
  md += `|---|---|---|---|---|---|---|---|\n`;

  for (let i = 0; i < localResults.length; i++) {
    const lr = localResults[i];
    const dr = deployedResults[i] || { pass: false, actual: 'NOT RUN', detail: '' };
    const verdict = lr.pass && dr.pass ? '✅ BOTH PASS' : (!lr.pass && !dr.pass ? '❌ BOTH FAIL' : (lr.pass ? '⚠️ LOCAL ONLY' : '⚠️ DEPLOYED ONLY'));
    md += `| **${lr.id}** | ${lr.category} | ${lr.testName} | ${lr.expected} | ${lr.pass ? '✅ ' : '❌ '}${lr.actual} | ${dr.pass ? '✅ ' : '❌ '}${dr.actual} | **${verdict}** | Local: ${lr.detail || '-'}<br>Deployed: ${dr.detail || '-'} |\n`;
  }

  writeFileSync('docs/qa/02-backend.md', md, 'utf8');
  console.log(`\nVerification Matrix written to docs/qa/02-backend.md`);
}

main().catch(err => {
  console.error('Fatal error during test execution:', err);
  process.exit(1);
});
