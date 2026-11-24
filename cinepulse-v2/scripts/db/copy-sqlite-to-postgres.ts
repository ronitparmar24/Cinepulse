/**
 * Copies every table from a local SQLite database into the Postgres schema.
 *
 *   DATABASE_URL=postgres://… npm run db:copy-sqlite -- ./data/cinepulse.db
 *
 * - Safe to re-run: rows that already exist (same primary key) are skipped, never overwritten.
 * - Runs in one transaction: if any table fails, nothing is copied.
 * - Prints a per-table count so you can compare source and destination.
 */
import { isPostgresUrl, normalizeDatabaseUrl } from '../../lib/dbUrl';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import postgres from 'postgres';
import { migratePostgres } from '../../lib/db/drivers';

const BATCH = 500;

async function main() {
  const source = resolve(process.argv[2] || './data/cinepulse.db');
  const url = normalizeDatabaseUrl(process.env.DATABASE_URL);
  const schema = process.env.DATABASE_SCHEMA || 'cinepulse';
  if (!url || !isPostgresUrl(url)) throw new Error('Set DATABASE_URL to the target Postgres database.');
  if (!existsSync(source)) throw new Error(`SQLite file not found: ${source}`);

  const lite = new DatabaseSync(source, { readOnly: true });
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await migratePostgres(sql as never, schema, resolve(process.cwd(), 'migrations', 'pg'));

    const pgTables = new Map<string, string[]>();
    const cols = await sql.unsafe(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1 ORDER BY ordinal_position`,
      [schema],
    );
    for (const r of cols) {
      const t = String(r.table_name);
      if (!pgTables.has(t)) pgTables.set(t, []);
      pgTables.get(t)!.push(String(r.column_name));
    }

    // Parents before children, from the foreign keys in Postgres.
    const fks = await sql.unsafe(
      `SELECT tc.table_name AS child, ccu.table_name AS parent
         FROM information_schema.table_constraints tc
         JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1`,
      [schema],
    );
    const deps = new Map<string, Set<string>>();
    for (const t of pgTables.keys()) deps.set(t, new Set());
    for (const r of fks) if (String(r.child) !== String(r.parent)) deps.get(String(r.child))?.add(String(r.parent));
    const order: string[] = [];
    const seen = new Set<string>();
    const visit = (t: string) => {
      if (seen.has(t)) return;
      seen.add(t);
      for (const p of deps.get(t) ?? []) visit(p);
      order.push(t);
    };
    [...pgTables.keys()].sort().forEach(visit);

    const liteTables = new Set(
      (lite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map((r) => r.name),
    );

    const report: { table: string; source: number; copied: number }[] = [];
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
      for (const table of order) {
        if (table === 'schema_migrations' || !liteTables.has(table)) continue;
        const liteCols = new Set((lite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
        const columns = pgTables.get(table)!.filter((c) => liteCols.has(c));
        const rows = lite.prepare(`SELECT ${columns.map((c) => `"${c}"`).join(', ')} FROM ${table}`).all() as Record<string, unknown>[];
        let copied = 0;
        for (let i = 0; i < rows.length; i += BATCH) {
          const chunk = rows.slice(i, i + BATCH);
          const values: unknown[] = [];
          const tuples = chunk.map((row) => {
            const ph = columns.map((c) => {
              values.push(row[c] ?? null);
              return `$${values.length}`;
            });
            return `(${ph.join(', ')})`;
          });
          const res = await tx.unsafe(
            `INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(', ')}) VALUES ${tuples.join(', ')} ON CONFLICT DO NOTHING`,
            values as never[],
          );
          copied += res.count ?? 0;
        }
        report.push({ table, source: rows.length, copied });
      }
      // Identity columns: continue numbering after the copied ids.
      const identities = await tx.unsafe(
        `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1 AND is_identity = 'YES'`,
        [schema],
      );
      for (const r of identities) {
        await tx.unsafe(
          `SELECT setval(pg_get_serial_sequence('${schema}.${r.table_name}', '${r.column_name}'), COALESCE((SELECT MAX("${r.column_name}") FROM ${r.table_name}), 0) + 1, false)`,
        );
      }
    });

    const width = Math.max(...report.map((r) => r.table.length));
    for (const r of report) {
      if (r.source || r.copied)
        console.log(`${r.table.padEnd(width)}  source ${String(r.source).padStart(6)}  copied ${String(r.copied).padStart(6)}`);
    }
    console.log(`\nCopied ${report.reduce((a, r) => a + r.copied, 0)} rows into schema "${schema}". Rows already present were skipped.`);
  } finally {
    lite.close();
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error('Copy failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
