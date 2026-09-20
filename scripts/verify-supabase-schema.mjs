#!/usr/bin/env node
/**
 * Verification script for Supabase Schema & RLS Policies (cinepulse-supabase-schema-and-rls.md)
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const REQUIRED_TABLES = [
  // Step 0: Core
  'profiles', 'library', 'reviews', 'forecasts', 'forecast_events', 'api_cache',
  // Step 1: Community Scoring & Predictions Log
  'predictions_log', 'user_call_scores',
  // Step 2: Social Layer
  'follows', 'privacy_settings', 'activity_events', 'likes', 'comments', 'blocks', 'notifications',
  // Step 3: Taste DNA & Badges
  'taste_dna_cache', 'user_badges',
  // Step 4: Hype Signal Storage
  'title_links', 'pageview_stats', 'trailer_stats',
  // Step 5: Movie Night & Circles
  'movie_night_sessions', 'movie_night_participants', 'circles', 'circle_members',
  // Step 6: Analytics
  'analytics_events',
];

console.log('=== CinePulse Supabase Schema & RLS Verification ===\n');

// 1. Static DDL Verification of supabase/schema.sql
const sqlPath = resolve('supabase/schema.sql');
if (!existsSync(sqlPath)) {
  console.error('FAIL: supabase/schema.sql not found at', sqlPath);
  process.exit(1);
}

const sql = readFileSync(sqlPath, 'utf8');
console.log('1. Verifying DDL specifications in supabase/schema.sql:');

let staticFailures = 0;

for (const table of REQUIRED_TABLES) {
  const tableRegex = new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`, 'i');
  const rlsRegex = new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i');

  const hasTable = tableRegex.test(sql);
  const hasRls = rlsRegex.test(sql);

  if (hasTable && hasRls) {
    console.log(`  ✔ public.${table.padEnd(26)} [Table Defined + RLS Enabled]`);
  } else {
    staticFailures++;
    console.error(`  ✖ public.${table.padEnd(26)} [Missing: ${!hasTable ? 'Table' : ''} ${!hasRls ? 'RLS' : ''}]`);
  }
}

// Check key security constraints
const checks = [
  { name: 'Auth Trigger handle_new_user', test: /CREATE OR REPLACE FUNCTION public\.handle_new_user/i.test(sql) },
  { name: 'forecasts immutability (no client update policy)', test: !/CREATE POLICY.*ON public\.forecasts FOR UPDATE/i.test(sql) },
  { name: 'api_cache zero-client access policy', test: /CREATE POLICY "api_cache no client access"[\s\S]*?FOR SELECT[\s\S]*?USING \(false\)/i.test(sql) },
  { name: 'analytics_events write-only client policy', test: /CREATE POLICY "analytics_events no client read"[\s\S]*?FOR SELECT[\s\S]*?USING \(false\)/i.test(sql) },
  { name: 'followers_only activity check', test: /visibility = 'followers_only'[\s\S]*?EXISTS\s*\([\s\S]*?FROM public\.follows/i.test(sql) },
];

console.log('\n2. Verifying RLS Policy & Trigger Rules:');
for (const check of checks) {
  if (check.test) {
    console.log(`  ✔ ${check.name}`);
  } else {
    staticFailures++;
    console.error(`  ✖ Failed check: ${check.name}`);
  }
}

if (staticFailures > 0) {
  console.error(`\n✖ Static verification failed with ${staticFailures} error(s).`);
  process.exit(1);
}

console.log('\n✔ Static SQL verification passed: All 25 tables, RLS policies, and triggers are complete.');

// 2. Online Verification (if .env.local or process.env has credentials)
let envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let envKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if ((!envUrl || !envKey) && existsSync('.env.local')) {
  const content = readFileSync('.env.local', 'utf8');
  content.split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      const k = m[1].trim();
      const v = m[2].trim();
      if (k === 'NEXT_PUBLIC_SUPABASE_URL') envUrl = v;
      if (k === 'SUPABASE_SERVICE_ROLE_KEY' || (!envKey && k === 'NEXT_PUBLIC_SUPABASE_ANON_KEY')) envKey = v;
    }
  });
}

if (envUrl && envKey) {
  console.log('\n3. Verifying Live Supabase Instance Connectivity:');
  console.log(`  Endpoint: ${envUrl}`);

  try {
    const client = createClient(envUrl, envKey);
    let onlineErrors = 0;

    for (const table of REQUIRED_TABLES) {
      const { error } = await client.from(table).select('*').limit(1);
      if (error) {
        onlineErrors++;
        console.log(`  ✖ Table [${table}]: ${error.message}`);
      } else {
        console.log(`  ✔ Table [${table}]: Verified`);
      }
    }

    if (onlineErrors === 0) {
      console.log('\n✔ All 25 tables are deployed and operational in Supabase!');
    } else {
      console.log(`\nNote: ${onlineErrors} table(s) not yet created in live database.`);
      console.log('Paste supabase/schema.sql into your Supabase SQL Editor and click "Run":');
      console.log(`https://supabase.com/dashboard/project/${envUrl.replace('https://', '').split('.')[0]}/sql`);
    }
  } catch (err) {
    console.log('  Live check skipped/error:', err.message);
  }
} else {
  console.log('\n3. Live instance check skipped (credentials not present in environment).');
  console.log('  To check live database, configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
}

console.log('\n=== Supabase Schema & RLS Verification Finished ===\n');
