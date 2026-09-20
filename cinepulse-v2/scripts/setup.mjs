#!/usr/bin/env node
/**
 * CinePulse One-Command Setup Script (Track E3)
 * Runs database migrations and seeds initial demo data.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

console.log('─── CinePulse Setup ───────────────────────────────────');

try {
  console.log('1. Running database migrations...');
  execSync('npx tsx lib/db/migrate.ts', { stdio: 'inherit' });

  console.log('\n2. Seeding initial demo account and catalog data...');
  if (existsSync('scripts/seed-demo.mjs')) {
    execSync('node scripts/seed-demo.mjs', { stdio: 'inherit' });
  }

  console.log('\n✔ CinePulse setup completed successfully!');
  console.log('Run "npm run dev" to launch local server at http://127.0.0.1:3000\n');
} catch (error) {
  console.error('\n✖ Setup encountered an error:', error.message);
  process.exit(1);
}
