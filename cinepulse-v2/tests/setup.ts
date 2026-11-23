/**
 * Loaded before every test file (see the `test` scripts in package.json).
 *
 * - Default: each test process gets its own throwaway SQLite file, so `npm test`
 *   never writes into your real data/cinepulse.db.
 * - With TEST_DATABASE_URL (see `npm run test:pg`): each test process gets its own
 *   Postgres schema, dropped again when the process finishes.
 */
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

if (process.env.TEST_DATABASE_URL) {
  const schema = `test_${process.pid}_${randomBytes(3).toString('hex')}`;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DATABASE_SCHEMA = schema;
  process.env.DATABASE_POOL_MAX = '3';
  let dropped = false;
  process.on('beforeExit', async () => {
    if (dropped) return;
    dropped = true;
    const { closeDb } = await import('../lib/db');
    await closeDb().catch(() => {});
    const postgres = (await import('postgres')).default;
    const sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
    // The parent's schema plus any per-child schemas (named `${schema}_c<n>`).
    const schemas = await sql.unsafe(`SELECT nspname FROM pg_namespace WHERE nspname = $1 OR nspname LIKE $2`, [schema, `${schema}\\_c%`]);
    for (const row of schemas) await sql.unsafe(`DROP SCHEMA IF EXISTS "${String(row.nspname)}" CASCADE`).catch(() => {});
    await sql.end({ timeout: 2 });
  });
} else if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'cinepulse-test-')), 'test.db');
}
