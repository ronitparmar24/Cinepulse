import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { IDatabase } from './types';

export function runSqlMigration(d: IDatabase | { exec: (sql: string) => void }, migrationSql: string): void {
  d.exec(migrationSql);
}

export function applyVersionedMigrations(d: any, migrationsDir: string): void {
  // Safe runner for numbered migrations if needed
  d.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
  `);
}
