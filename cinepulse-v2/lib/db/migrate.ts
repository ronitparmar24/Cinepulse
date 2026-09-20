import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { db } from '../db';

export interface AppliedMigration {
  name: string;
  applied_at: string;
}

export function runAllMigrations(migrationsDirPath?: string): { applied: string[]; skipped: string[] } {
  const d = db();
  const dir = migrationsDirPath || resolve(process.cwd(), 'migrations');

  if (!existsSync(dir)) {
    return { applied: [], skipped: [] };
  }

  d.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
  `);

  const appliedRows = d.prepare('SELECT name FROM _migrations').all() as { name: string }[];
  const appliedSet = new Set(appliedRows.map((r) => r.name));

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (appliedSet.has(file)) {
      skipped.push(file);
      continue;
    }

    const fullPath = join(dir, file);
    const sql = readFileSync(fullPath, 'utf8');

    d.exec('BEGIN IMMEDIATE');
    try {
      d.exec(sql);
      d.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
      d.exec('COMMIT');
      applied.push(file);
    } catch (err) {
      d.exec('ROLLBACK');
      console.error(`[MIGRATIONS] Failed to apply ${file}:`, err);
      throw err;
    }
  }

  return { applied, skipped };
}

// Can be run from CLI via `tsx lib/db/migrate.ts`
if (process.argv[1] && process.argv[1].includes('migrate')) {
  try {
    const res = runAllMigrations();
    console.log(`[MIGRATIONS] Applied: ${res.applied.length}, Already up-to-date: ${res.skipped.length}`);
    if (res.applied.length > 0) {
      console.log('Applied migrations:', res.applied.join(', '));
    }
  } catch (e) {
    process.exit(1);
  }
}
