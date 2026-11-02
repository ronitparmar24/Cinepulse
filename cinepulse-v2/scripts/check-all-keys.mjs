#!/usr/bin/env node
/**
 * check-all-keys.mjs
 * Run before committing: node scripts/check-all-keys.mjs
 * Checks for accidentally committed secrets.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const SECRET_KEY_NAMES = [
  'GEMINI_API_KEY', 'GROQ_API_KEY', 'TMDB_READ_TOKEN', 'OMDB_API_KEY',
  'YOUTUBE_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'GOOGLE_CLIENT_SECRET', 'RESEND_API_KEY', 'STREAMING_AVAIL_KEY',
  'FANART_API_KEY', 'TURNSTILE_SECRET_KEY', 'UPSTASH_REDIS_REST_TOKEN',
  'CRON_SECRET', 'HF_TOKEN', 'CLOUDFLARE_API_TOKEN', 'GNEWS_API_KEY',
  'TRAKT_CLIENT_ID', 'SMTP_PASS',
];

// Patterns that look like real keys (non-empty values)
const KEY_VALUE_PATTERN = /^([A-Z_]+)=(.+)$/;
// Known safe example values
const SAFE_PLACEHOLDERS = ['your_key_here', 'demo', 'true', 'false', '10', '40', 'US', 'IN', 'gemini-2.5-flash'];

let exitCode = 0;

function warn(msg) {
  console.warn(`\x1b[33m⚠ ${msg}\x1b[0m`);
  exitCode = 1;
}

function ok(msg) {
  console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
}

// ─── Check .env.example for real values ──────────────────────────────────────
function checkEnvExample() {
  const envPath = path.join(ROOT, '.env.example');
  if (!fs.existsSync(envPath)) {
    warn('.env.example not found');
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  let foundIssues = false;

  for (const line of lines) {
    const m = KEY_VALUE_PATTERN.exec(line.trim());
    if (!m) continue;
    const [, keyName, value] = m;

    if (!SECRET_KEY_NAMES.includes(keyName)) continue;
    if (!value || value.trim() === '') continue;
    if (SAFE_PLACEHOLDERS.some(p => value.toLowerCase().includes(p.toLowerCase()))) continue;
    // Non-empty value for a secret key
    warn(`.env.example contains what looks like a real value for ${keyName}. Blank it out!`);
    foundIssues = true;
  }

  if (!foundIssues) ok('.env.example — no real key values found');
}

// ─── Check .gitignore completeness ───────────────────────────────────────────
function checkGitignore() {
  const gitPath = path.join(ROOT, '.gitignore');
  if (!fs.existsSync(gitPath)) {
    warn('.gitignore not found');
    return;
  }

  const content = fs.readFileSync(gitPath, 'utf8');
  const required = ['.env.local', '.env', '*.db', 'node_modules/'];
  for (const entry of required) {
    if (!content.includes(entry)) {
      warn(`.gitignore missing entry: ${entry}`);
    }
  }
  ok('.gitignore checked');
}

// ─── Scan staged files for secret patterns ───────────────────────────────────
function checkGitStaged() {
  let stagedFiles = [];
  try {
    const out = execSync('git diff --cached --name-only', { cwd: ROOT, encoding: 'utf8' });
    stagedFiles = out.trim().split('\n').filter(Boolean);
  } catch {
    console.log('  (git not available or no staged files — skipping staged check)');
    return;
  }

  if (stagedFiles.length === 0) {
    ok('No staged files to check');
    return;
  }

  const secretPatterns = [
    /AIza[0-9A-Za-z-_]{35}/,           // Google API key
    /gsk_[0-9A-Za-z]{40,}/,            // Groq API key
    /AQ\.[0-9A-Za-z-_]{30,}/,          // Gemini key variant
    /sk-[0-9A-Za-z]{40,}/,             // OpenAI key
    /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/,  // JWT
    /SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+/,
  ];

  let found = false;
  for (const file of stagedFiles) {
    // Skip binary / large / ignored paths
    if (file.startsWith('node_modules/') || file.startsWith('.next/')) continue;
    if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.db')) continue;

    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) continue;

    let content = '';
    try { content = fs.readFileSync(fullPath, 'utf8'); } catch { continue; }

    for (const pattern of secretPatterns) {
      if (pattern.test(content)) {
        warn(`Possible secret in staged file: ${file} (matched ${pattern})`);
        found = true;
      }
    }
  }

  if (!found) ok(`Staged files checked (${stagedFiles.length} files) — no secrets found`);
}

// ─── Check that data/*.db is not tracked ─────────────────────────────────────
function checkDbNotTracked() {
  try {
    const out = execSync('git ls-files data/', { cwd: ROOT, encoding: 'utf8' });
    const dbFiles = out.trim().split('\n').filter((f) => f.endsWith('.db'));
    if (dbFiles.length > 0) {
      warn(`DB files are tracked by git: ${dbFiles.join(', ')} — remove from tracking!`);
    } else {
      ok('No .db files tracked by git');
    }
  } catch {
    ok('(git ls-files not available — skipping DB check)');
  }
}

// ─── Run all checks ───────────────────────────────────────────────────────────
console.log('\n🔐 CinePulse Security Key Check\n');
checkEnvExample();
checkGitignore();
checkGitStaged();
checkDbNotTracked();

console.log('');
if (exitCode !== 0) {
  console.error('\x1b[31m✗ Security checks failed. Fix the above issues before committing.\x1b[0m\n');
  process.exit(exitCode);
} else {
  console.log('\x1b[32m✓ All security checks passed.\x1b[0m\n');
}
