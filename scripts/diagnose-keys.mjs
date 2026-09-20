import { readFileSync, existsSync } from 'node:fs';

const content = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of content.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq > 0) {
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
}

async function check() {
  console.log('--- Checking Groq ---');
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
    });
    console.log('Groq models HTTP:', groqRes.status, (await groqRes.text()).slice(0, 180));
  } catch (e) {
    console.log('Groq error:', e.message);
  }

  console.log('\n--- Checking Gemini ---');
  try {
    const g1 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`);
    console.log('Gemini with GEMINI_API_KEY HTTP:', g1.status, (await g1.text()).slice(0, 250));
  } catch (e) {
    console.log('Gemini error:', e.message);
  }

  try {
    const g2 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.YOUTUBE_API_KEY}`);
    console.log('Gemini with YOUTUBE_API_KEY (Google Cloud Key) HTTP:', g2.status, (await g2.text()).slice(0, 250));
  } catch (e) {
    console.log('Gemini with YT key error:', e.message);
  }

  console.log('\n--- Checking OMDb ---');
  try {
    const omdbRes = await fetch(`https://www.omdbapi.com/?t=Inception&apikey=${env.OMDB_API_KEY}`);
    console.log('OMDb HTTP:', omdbRes.status, await omdbRes.text());
  } catch (e) {
    console.log('OMDb error:', e.message);
  }

  console.log('\n--- Checking Resend ---');
  try {
    const rRes = await fetch('https://api.resend.com/emails', {
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
    });
    console.log('Resend HTTP:', rRes.status, (await rRes.text()).slice(0, 200));
  } catch (e) {
    console.log('Resend error:', e.message);
  }

  console.log('\n--- Checking Cloudflare ---');
  try {
    const cfRes = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
    });
    console.log('Cloudflare HTTP:', cfRes.status, await cfRes.text());
  } catch (e) {
    console.log('Cloudflare error:', e.message);
  }
}

check();
