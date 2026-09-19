#!/usr/bin/env node
/**
 * Comprehensive Live API Keys & Free Services Verification Script for CinePulse
 * Tests all keys configured in .env.local with real requests and reports status.
 */
import { readFileSync, existsSync } from 'node:fs';
import nodemailer from 'nodemailer';

// Load .env.local manually
if (existsSync('.env.local')) {
  const content = readFileSync('.env.local', 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const results = [];

async function testService(name, envKey, testFn) {
  const keyVal = process.env[envKey];
  const configured = Boolean(keyVal && keyVal.trim() && !keyVal.includes('REPLACE_'));

  if (!configured) {
    results.push({
      service: name,
      envKey,
      status: 'MISSING',
      details: 'Key not set in .env.local',
    });
    return;
  }

  try {
    const detail = await testFn(keyVal);
    results.push({
      service: name,
      envKey,
      status: 'WORKING',
      details: detail,
    });
  } catch (err) {
    results.push({
      service: name,
      envKey,
      status: 'FAILED',
      details: err.message || String(err),
    });
  }
}

console.log('Testing live API connections with credentials from .env.local...\n');

// 1. TMDB
await testService('TMDB API', 'TMDB_READ_TOKEN', async (token) => {
  const isV3 = token.length === 32;
  const url = isV3
    ? `https://api.themoviedb.org/3/configuration?api_key=${token}`
    : 'https://api.themoviedb.org/3/configuration';
  const headers = isV3 ? {} : { Authorization: `Bearer ${token}` };
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return `Connected (image base: ${json?.images?.secure_base_url})`;
});

// 2. Supabase
await testService('Supabase DB/Auth', 'SUPABASE_SERVICE_ROLE_KEY', async (key) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing');
  const res = await fetch(`${url}/auth/v1/settings`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return `Connected to ${new URL(url).hostname}`;
});

// 3. Gmail SMTP
await testService('Gmail Live SMTP', 'SMTP_PASS', async (pass) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: pass,
    },
    connectionTimeout: 8000,
  });
  await transporter.verify();
  return `Verified connection to ${process.env.SMTP_USER} via smtp.gmail.com:465`;
});

// 4. YouTube Data API v3
await testService('YouTube Data API v3', 'YOUTUBE_API_KEY', async (key) => {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=YoHD9XEInc0&key=${key}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const title = json.items?.[0]?.snippet?.title;
  const views = json.items?.[0]?.statistics?.viewCount;
  return `Retrieved stats (${title?.slice(0, 30)}… : ${views} views)`;
});

// 5. Google Gemini AI
await testService('Google Gemini AI', 'GEMINI_API_KEY', async (key) => {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Respond with exactly: OK' }] }],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const reply = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return `Inference working via Gemini 3.6 Flash (Reply: "${reply}")`;
});

// 6. Groq Llama/GPT API
await testService('Groq Llama/GPT API', 'GROQ_API_KEY', async (key) => {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: 'Say OK in one word' }],
      max_tokens: 10,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const reply = json.choices?.[0]?.message?.content?.trim();
  return `Inference working (Model reply: "${reply || 'OK'}")`;
});

// 7. Hugging Face
await testService('Hugging Face API', 'HF_TOKEN', async (token) => {
  const res = await fetch('https://huggingface.co/api/whoami-v2', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return `Authenticated as user: ${json.name || json.fullname || 'HF User'}`;
});

// 8. Cloudflare Workers AI
await testService('Cloudflare Workers AI', 'CLOUDFLARE_API_TOKEN', async (token) => {
  const res = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return `API Token verified active: id ${json.result?.id?.slice(0, 8)}…`;
});

// 9. GNews API
await testService('GNews API', 'GNEWS_API_KEY', async (key) => {
  const res = await fetch(`https://gnews.io/api/v4/search?q=cinema&max=1&apikey=${key}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return `Active (${json.totalArticles || 0} cinema articles indexed)`;
});

// 10. Resend API
await testService('Resend API (Email)', 'RESEND_API_KEY', async (key) => {
  // Resend keys with sending permissions return restricted_api_key on admin endpoints, confirming the key is active
  const res = await fetch('https://api.resend.com/emails', {
    headers: { Authorization: `Bearer ${key}` },
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && json.name === 'restricted_api_key') {
    return 'Active & restricted to sending emails (Safe for production send)';
  }
  if (res.ok) return 'Authenticated';
  throw new Error(`HTTP ${res.status}`);
});

// 11. OMDb API
await testService('OMDb API', 'OMDB_API_KEY', async (key) => {
  const res = await fetch(`https://www.omdbapi.com/?t=Inception&apikey=${key}`);
  const json = await res.json();
  if (json.Response === 'False') {
    throw new Error(`${json.Error} (Current key appears to be activation ID: ${key.slice(0, 8)}…)`);
  }
  return `Retrieved Inception (IMDb: ${json.imdbRating}/10, RT: ${json.Ratings?.find(r => r.Source === 'Rotten Tomatoes')?.Value || 'N/A'})`;
});

// 12. Keyless Free APIs
try {
  const wikiRes = await fetch('https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/Dune_(2021_film)/daily/20240101/20240105', {
    headers: { 'User-Agent': 'CinePulse/3.0 (github.com/ronitparmar24/Cinepulse)' },
  });
  results.push({
    service: 'Wikipedia Pageviews (Keyless)',
    envKey: 'Free / Keyless',
    status: wikiRes.ok ? 'WORKING' : 'FAILED',
    details: wikiRes.ok ? 'Retrieved daily pageview time-series' : `HTTP ${wikiRes.status}`,
  });
} catch (e) {
  results.push({ service: 'Wikipedia Pageviews (Keyless)', envKey: 'None', status: 'FAILED', details: e.message });
}

try {
  const fxRes = await fetch('https://api.frankfurter.app/latest?from=USD&to=INR');
  const fxJson = await fxRes.json();
  results.push({
    service: 'Frankfurter Currency (Keyless)',
    envKey: 'Free / Keyless',
    status: fxRes.ok ? 'WORKING' : 'FAILED',
    details: fxRes.ok ? `1 USD = ₹${fxJson.rates?.INR} INR` : `HTTP ${fxRes.status}`,
  });
} catch (e) {
  results.push({ service: 'Frankfurter Currency (Keyless)', envKey: 'None', status: 'FAILED', details: e.message });
}

console.log('\n============================= API VERIFICATION RESULTS =============================\n');
console.table(results.map(r => ({
  'Service': r.service,
  'Key Variable': r.envKey,
  'Status': r.status === 'WORKING' ? '✅ WORKING' : r.status === 'MISSING' ? '⚪ MISSING' : '❌ FAILED',
  'Verification Detail': r.details,
})));

const workingCount = results.filter(r => r.status === 'WORKING').length;
console.log(`\nSummary: ${workingCount} of ${results.length} services verified working.\n`);
