import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { IDatabase, IPreparedStatement, RunResult } from '../types';

class SQLitePreparedStatement implements IPreparedStatement {
  constructor(private stmt: ReturnType<DatabaseSync['prepare']>) {}

  get(...params: unknown[]): unknown {
    return this.stmt.get(...(params as any[]));
  }

  all(...params: unknown[]): unknown[] {
    return this.stmt.all(...(params as any[]));
  }

  run(...params: unknown[]): RunResult {
    const res = this.stmt.run(...(params as any[]));
    return {
      changes: Number(res.changes ?? 0),
      lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : undefined,
    };
  }
}

export class SQLiteAdapter implements IDatabase {
  public raw: DatabaseSync;

  constructor(filePath: string) {
    const fullPath = resolve(filePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    this.raw = new DatabaseSync(fullPath);
    this.raw.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  }

  prepare(sql: string): IPreparedStatement {
    return new SQLitePreparedStatement(this.raw.prepare(sql));
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  close(): void {
    this.raw.close();
  }
}
