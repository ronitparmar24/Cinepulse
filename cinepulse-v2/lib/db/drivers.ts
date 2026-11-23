import type { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { AsyncLock, bindValue, toPostgresPlaceholders, txScope, type Database, type Queryable } from './client';

// ─── SQLite ────────────────────────────────────────────────────────────────

/**
 * Wraps a node:sqlite connection in the async API.
 *
 * node:sqlite is synchronous and there is one connection. While a transaction is open
 * (it may await between statements), queries from other requests wait on a lock so they
 * cannot land inside — and be rolled back with — someone else's transaction.
 */
export function sqliteDatabase(raw: DatabaseSync, ready: Promise<void> = Promise.resolve()): Database {
  const lock = new AsyncLock();
  let txOpen = false;

  const direct: Queryable = {
    async get(sql, ...params) {
      return raw.prepare(sql).get(...(params.map(bindValue) as never[])) as never;
    },
    async all(sql, ...params) {
      return raw.prepare(sql).all(...(params.map(bindValue) as never[])) as never;
    },
    async run(sql, ...params) {
      const r = raw.prepare(sql).run(...(params.map(bindValue) as never[]));
      return { changes: Number(r.changes ?? 0) };
    },
    async exec(sql) {
      raw.exec(sql);
    },
  };

  const guarded = <K extends keyof Queryable>(key: K) =>
    (async (sql: string, ...params: unknown[]) => {
      await ready;
      if (txScope.getStore() || !txOpen) return (direct[key] as (s: string, ...p: unknown[]) => Promise<unknown>)(sql, ...params);
      return lock.run(() => (direct[key] as (s: string, ...p: unknown[]) => Promise<unknown>)(sql, ...params));
    }) as Queryable[K];

  return {
    dialect: 'sqlite',
    get: guarded('get'),
    all: guarded('all'),
    run: guarded('run'),
    exec: guarded('exec'),
    async transaction(fn) {
      await ready;
      if (txScope.getStore()) return fn();
      return lock.run(async () => {
        txOpen = true;
        raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await txScope.run(direct, fn);
          raw.exec('COMMIT');
          return result;
        } catch (error) {
          try {
            raw.exec('ROLLBACK');
          } catch {
            /* keep the original error */
          }
          throw error;
        } finally {
          txOpen = false;
        }
      });
    },
    async close() {
      raw.close();
    },
  };
}

// ─── Postgres ──────────────────────────────────────────────────────────────

type Sql = postgres.Sql<Record<string, never>>;

/** int8 and numeric come back as strings by default; CinePulse treats them as numbers. */
const numberTypes = {
  int8: { to: 20, from: [20], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
  numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
};

function pgQueryable(sql: Sql | postgres.TransactionSql<Record<string, never>>): Queryable {
  const q = (text: string, params: unknown[]) =>
    sql.unsafe(toPostgresPlaceholders(text), params.map(bindValue) as never[], { prepare: false });
  return {
    async get(text, ...params) {
      const rows = await q(text, params);
      return rows[0] as never;
    },
    async all(text, ...params) {
      return (await q(text, params)) as unknown as never[];
    },
    async run(text, ...params) {
      const result = await q(text, params);
      return { changes: result.count ?? 0 };
    },
    async exec(text) {
      await sql.unsafe(text);
    },
  };
}

export interface PostgresOptions {
  url: string;
  schema: string;
  max?: number;
  migrationsDir?: string;
  /** Runs after migrations, on the same connection pool (seeding, backfills). */
  bootstrap?: (db: Database) => Promise<void>;
}

export function postgresDatabase(options: PostgresOptions): Database {
  const schema = options.schema;
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`DATABASE_SCHEMA "${schema}" is not a valid schema name`);
  const sql = postgres(options.url, {
    max: options.max ?? 5,
    prepare: false, // required by transaction-mode poolers (Supabase port 6543)
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
    connection: { search_path: schema },
    types: numberTypes as never,
  }) as unknown as Sql;

  const base = pgQueryable(sql);
  let readyPromise: Promise<void> | null = null;
  let database: Database;
  // What bootstrap sees: the same pool, without waiting on `ready()` (it runs inside it).
  let bootstrapView: Database;

  const ready = () => {
    if (!readyPromise) {
      readyPromise = (async () => {
        await migratePostgres(sql, schema, options.migrationsDir ?? join(process.cwd(), 'migrations', 'pg'));
        if (options.bootstrap) await options.bootstrap(bootstrapView);
      })().catch((error) => {
        readyPromise = null; // let the next request retry
        throw error;
      });
    }
    return readyPromise;
  };

  const scoped = <K extends keyof Queryable>(key: K) =>
    (async (text: string, ...params: unknown[]) => {
      const tx = txScope.getStore();
      if (tx) return (tx[key] as (s: string, ...p: unknown[]) => Promise<unknown>)(text, ...params);
      await ready();
      return (base[key] as (s: string, ...p: unknown[]) => Promise<unknown>)(text, ...params);
    }) as Queryable[K];

  database = {
    dialect: 'postgres',
    get: scoped('get'),
    all: scoped('all'),
    run: scoped('run'),
    exec: scoped('exec'),
    async transaction(fn) {
      if (txScope.getStore()) return fn();
      await ready();
      return (await sql.begin((tx) => txScope.run(pgQueryable(tx as never), fn))) as never;
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
  bootstrapView = {
    ...database,
    get: base.get,
    all: base.all,
    run: base.run,
    exec: base.exec,
    async transaction(fn) {
      if (txScope.getStore()) return fn();
      return (await sql.begin((tx) => txScope.run(pgQueryable(tx as never), fn))) as never;
    },
  };
  return database;
}

/**
 * Applies migrations/pg/*.sql in name order, once each, under an advisory lock so two
 * serverless instances starting together cannot both run them.
 */
export async function migratePostgres(sql: Sql, schema: string, dir: string): Promise<string[]> {
  const applied: string[] = [];
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
    : [];
  await sql.begin(async (tx) => {
    await tx.unsafe(`SELECT pg_advisory_xact_lock(hashtext('cinepulse-migrations:${schema}'))`);
    await tx.unsafe(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
    await tx.unsafe(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
    const done = new Set(
      (await tx.unsafe(`SELECT name FROM schema_migrations`)).map((r) => String((r as unknown as { name: string }).name)),
    );
    for (const file of files) {
      if (done.has(file)) continue;
      await tx.unsafe(readFileSync(join(dir, file), 'utf8'));
      await tx.unsafe(`INSERT INTO schema_migrations(name, applied_at) VALUES ($1, $2)`, [file, new Date().toISOString()]);
      applied.push(file);
    }
  });
  return applied;
}
