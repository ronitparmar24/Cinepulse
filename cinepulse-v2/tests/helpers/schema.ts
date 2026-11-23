/** Schema introspection that works on both drivers (SQLite catalog vs information_schema). */
import type { Database } from '../../lib/db';

export async function columnsOf(d: Database, table: string): Promise<{ name: string; dflt_value: unknown }[]> {
  if (d.dialect === 'sqlite') return d.all(`PRAGMA table_info(${table})`);
  return d.all(
    `SELECT column_name AS name, column_default AS dflt_value FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = ?`,
    table,
  );
}

export async function indexesOf(d: Database, table: string): Promise<{ name: string }[]> {
  if (d.dialect === 'sqlite') return d.all(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?`, table);
  return d.all(`SELECT indexname AS name FROM pg_indexes WHERE schemaname = current_schema() AND tablename = ?`, table);
}

export async function tableExists(d: Database, table: string): Promise<boolean> {
  if (d.dialect === 'sqlite') return Boolean(await d.get(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`, table));
  return Boolean(await d.get(`SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?`, table));
}
