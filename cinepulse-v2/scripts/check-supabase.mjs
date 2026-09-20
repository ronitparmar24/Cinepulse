import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// Load .env.local
let envContent = '';
try {
  envContent = readFileSync('.env.local', 'utf8');
} catch {}

const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || anonKey;

console.log('--- CinePulse Supabase Diagnostic ---');
console.log('URL:', url || '(missing)');
console.log('Anon Key Present:', Boolean(anonKey));
console.log('Service Role Key Present:', Boolean(env.SUPABASE_SERVICE_ROLE_KEY));

if (!url || !anonKey) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing in .env.local');
  process.exit(1);
}

const client = createClient(url, serviceKey);

async function runCheck() {
  console.log('\n1. Checking Supabase Auth service reachability...');
  try {
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.log('  Auth check note:', error.message);
    } else {
      console.log('  Auth service: REACHABLE');
    }
  } catch (err) {
    console.log('  Auth check failed:', err.message);
  }

  console.log('\n2. Checking PostgreSQL database tables in public schema...');
  const tables = [
    // Step 0: Core
    'profiles', 'library', 'reviews', 'forecasts', 'forecast_events', 'api_cache',
    // Step 1: Predictions & Brier scoring
    'predictions_log', 'user_call_scores',
    // Step 2: Social
    'follows', 'privacy_settings', 'activity_events', 'likes', 'comments', 'blocks', 'notifications',
    // Step 3: Taste DNA & Badges
    'taste_dna_cache', 'user_badges',
    // Step 4: Hype & Media links
    'title_links', 'pageview_stats', 'trailer_stats',
    // Step 5: Sessions & Circles
    'movie_night_sessions', 'movie_night_participants', 'circles', 'circle_members',
    // Step 6: Analytics
    'analytics_events',
  ];
  const tableStatus = {};

  for (const table of tables) {
    try {
      const { data, error } = await client.from(table).select('*').limit(1);
      if (error) {
        tableStatus[table] = { ok: false, error: error.message, code: error.code };
      } else {
        tableStatus[table] = { ok: true };
      }
    } catch (err) {
      tableStatus[table] = { ok: false, error: err.message };
    }
  }

  let allOk = true;
  for (const [table, status] of Object.entries(tableStatus)) {
    if (status.ok) {
      console.log(`  Table [${table}]: OK (accessible)`);
    } else {
      allOk = false;
      console.log(`  Table [${table}]: MISSING OR ERROR -> ${status.error}`);
    }
  }

  if (allOk) {
    console.log('\nSUCCESS: All Supabase tables are ready and accessible!');
  } else {
    console.log('\nACTION REQUIRED: One or more tables are missing.');
    console.log('Please copy and paste supabase/schema.sql into your Supabase SQL Editor and click Run:');
    console.log(`https://supabase.com/dashboard/project/${url.replace('https://', '').split('.')[0]}/sql`);
  }
}

runCheck();
