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

  // Detect if this is an established DB with PRAGMA user_version
  const vRow = d.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
  const userVersion = Number(vRow?.user_version ?? 0);

  const appliedRows = d.prepare('SELECT name FROM _migrations').all() as { name: string }[];
  const appliedSet = new Set(appliedRows.map((r) => r.name));

  // If established database has user_version >= 6 but _migrations was empty, baseline migrations 1-6
  if (userVersion >= 6 && appliedSet.size === 0) {
    const baseline = [
      '0001_init.sql',
      '0002_release_date_snapshot.sql',
      '0003_indexes.sql',
      '0004_prediction_cache.sql',
      '0005_social_layer.sql',
      '0006_v3_predictions_leaderboard.sql',
    ];
    for (const b of baseline) {
      d.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(b);
      appliedSet.add(b);
    }
  }

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
      // Split statements or execute safely
      try {
        d.exec(sql);
      } catch (execErr: any) {
        // If error is duplicate column, it is idempotent
        const msg = String(execErr?.message || '');
        if (msg.includes('duplicate column name') || msg.includes('already exists')) {
          // Idempotent column already added
        } else {
          throw execErr;
        }
      }

      d.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
      d.exec('COMMIT');
      applied.push(file);
    } catch (err) {
      try { d.exec('ROLLBACK'); } catch {}
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
