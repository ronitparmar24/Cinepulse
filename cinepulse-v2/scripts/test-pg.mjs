#!/usr/bin/env node
/**
 * Runs the unit/route test suite against Postgres instead of SQLite.
 *   TEST_DATABASE_URL=postgres://user:pass@host:5432/db npm run test:pg
 * Each test process creates and drops its own schema; nothing else in the database is touched.
 */
import { spawnSync } from 'node:child_process';

if (!process.env.TEST_DATABASE_URL) {
  console.error('Set TEST_DATABASE_URL to a Postgres database you can create schemas in.');
  process.exit(2);
}
const result = spawnSync('npx', ['tsx', '--import', './tests/setup.ts', '--test', '--test-concurrency=4', 'tests/*.test.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env },
});
process.exit(result.status ?? 1);
