/**
 * CinePulse database client: one async API over two drivers.
 *
 *   DATABASE_URL=postgres://…  → Postgres (production; e.g. Supabase). Tables live in the
 *                                schema named by DATABASE_SCHEMA (default "cinepulse").
 *   otherwise                  → SQLite file at DATABASE_PATH (default ./data/cinepulse.db),
 *                                for local development and offline demos.
 *
 * SQL is written once, in a portable subset, with `?` placeholders. The Postgres driver
 * rewrites `?` to `$1…$n`. Transactions use AsyncLocalStorage, so any `db()` call made
 * inside `db().transaction(async () => …)` automatically runs on the transaction.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export type Dialect = 'sqlite' | 'postgres';
export interface RunResult {
  changes: number;
}

export interface Queryable {
  get<T = any>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  all<T = any>(sql: string, ...params: unknown[]): Promise<T[]>;
  run(sql: string, ...params: unknown[]): Promise<RunResult>;
  /** Run one or more statements without parameters (DDL, maintenance). */
  exec(sql: string): Promise<void>;
}

export interface Database extends Queryable {
  readonly dialect: Dialect;
  /** Runs fn atomically. Nested calls join the outer transaction. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Normalises values for binding: undefined → null, booleans → 0/1, Dates → ISO strings. */
export function bindValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return value;
}

/**
 * Rewrites `?` placeholders to `$1…$n`, skipping string literals, quoted identifiers
 * and comments so a literal '?' inside SQL text is left alone.
 */
export function toPostgresPlaceholders(sql: string): string {
  let out = '';
  let n = 0;
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      const end = findQuoteEnd(sql, i, c);
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '?') {
      n += 1;
      out += `$${n}`;
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function findQuoteEnd(sql: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] === quote) {
      if (sql[i + 1] === quote) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  return sql.length;
}

// ─── transaction scope ──────────────────────────────────────────────────────

export const txScope = new AsyncLocalStorage<Queryable>();

/** A simple FIFO async lock (SQLite has one connection, so writers take turns). */
export class AsyncLock {
  private tail: Promise<void> = Promise.resolve();
  async run<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    const previous = this.tail;
    this.tail = previous.then(() => next);
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

// ─── errors ─────────────────────────────────────────────────────────────────

/**
 * Recognises a unique-key violation from either driver.
 * SQLite: "UNIQUE constraint failed: users.email"; Postgres: SQLSTATE 23505 with the
 * constraint name / detail. Returns the text describing the key, or null.
 */
export function uniqueViolation(error: unknown): string | null {
  const e = error as { code?: unknown; message?: unknown; constraint_name?: unknown; detail?: unknown };
  const message = typeof e?.message === 'string' ? e.message : '';
  if (e?.code === '23505') {
    return [e.constraint_name, e.detail, message].filter((x) => typeof x === 'string').join(' ');
  }
  const m = /UNIQUE constraint failed:\s*([^\n]+)/i.exec(message);
  if (m) return m[1];
  if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE' || e?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return message;
  return null;
}

// ─── dialect helpers ────────────────────────────────────────────────────────

/** SQL expression reading a numeric field from a JSON text column, for either dialect. */
export function jsonNumber(dialect: Dialect, column: string, key: string): string {
  if (!/^[a-z_][a-z0-9_.]*$/i.test(column) || !/^[a-z_][a-z0-9_]*$/i.test(key)) throw new Error('jsonNumber: unsafe identifier');
  return dialect === 'postgres'
    ? `(${column}::jsonb ->> '${key}')::double precision`
    : `CAST(json_extract(${column}, '$.${key}') AS REAL)`;
}
