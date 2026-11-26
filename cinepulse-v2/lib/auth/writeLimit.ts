/**
 * Rate limit for every state-changing API request (POST/PUT/DELETE).
 *
 * Fixed one-minute windows stored in the application database, so on Postgres the limit is
 * shared by every serverless instance (the old in-memory limiter reset per instance).
 * The actor is the signed-in session if there is one, otherwise the client IP.
 */
import { createHash } from 'node:crypto';
import { db } from '../db';
import { tooMany } from '../errors';
import { tokenFromRequest } from '../auth';
import { getClientIp } from './rateLimit';

export const WRITE_LIMIT_PER_MINUTE = Number(process.env.WRITE_LIMIT_PER_MINUTE || 60);

/** Paths with their own, stricter limiter, or that must never be throttled here. */
const EXEMPT = /^(auth|cron|import)$/;

export function writeActor(request: Request): string {
  const token = tokenFromRequest(request);
  if (token) return 's:' + createHash('sha256').update(token).digest('hex').slice(0, 24);
  return 'ip:' + getClientIp(request);
}

/**
 * `bucket` separates counters: the dispatcher uses 'write' for all changes; endpoints that spend
 * paid API quota (LLM calls) add their own, stricter 'llm' bucket.
 */
export async function enforceWriteLimit(request: Request, firstSegment: string, limit = WRITE_LIMIT_PER_MINUTE, bucket = 'write'): Promise<void> {
  if (bucket === 'write' && EXEMPT.test(firstSegment)) return;
  const nowMs = Date.now();
  const windowStart = Math.floor(nowMs / 60_000) * 60_000;
  const key = `${bucket}:${writeActor(request)}`;
  const d = db();
  const row = await d.get<{ count: number }>(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
       window_start = excluded.window_start
     RETURNING count`,
    key,
    windowStart,
  );
  if (Math.random() < 0.01) await d.run('DELETE FROM rate_limits WHERE window_start < ?', windowStart - 60 * 60_000);
  if ((row?.count ?? 0) > limit) {
    const retry = Math.ceil((windowStart + 60_000 - nowMs) / 1000);
    throw tooMany(`Too many changes in a short time. Please wait ${retry} seconds and try again.`);
  }
}

/** Letterboxd import: one request per batch of films (IMPORT_LIMIT_PER_MINUTE, default 120). */
export const IMPORT_LIMIT_PER_MINUTE = Number(process.env.IMPORT_LIMIT_PER_MINUTE || 120);
export function enforceImportLimit(request: Request): Promise<void> {
  return enforceWriteLimit(request, 'import', IMPORT_LIMIT_PER_MINUTE, 'import');
}

/** LLM-backed endpoints: calls per actor per minute (LLM_LIMIT_PER_MINUTE, default 10). */
export const LLM_LIMIT_PER_MINUTE = Number(process.env.LLM_LIMIT_PER_MINUTE || 10);
export function enforceLlmLimit(request: Request): Promise<void> {
  return enforceWriteLimit(request, 'ai', LLM_LIMIT_PER_MINUTE, 'llm');
}

/** Server-rendered share images (CPU-heavy): renders per actor per minute (IMAGE_LIMIT_PER_MINUTE, default 30). */
export const IMAGE_LIMIT_PER_MINUTE = Number(process.env.IMAGE_LIMIT_PER_MINUTE || 30);
export function enforceImageLimit(request: Request): Promise<void> {
  return enforceWriteLimit(request, 'share', IMAGE_LIMIT_PER_MINUTE, 'image');
}
