/**
 * Unified Database Interfaces for CinePulse
 * Provides a driver-agnostic layer supporting local node:sqlite and cloud LibSQL (Turso).
 */

export interface RunResult {
  changes: number;
  lastInsertRowid?: number | bigint;
}

export interface IPreparedStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): RunResult;
}

export interface IDatabase {
  prepare(sql: string): IPreparedStatement;
  exec(sql: string): void;
  close(): void;
}

export interface Migration {
  id: number;
  name: string;
  sql: string;
}
