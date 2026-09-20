import { db } from '../db';
import { tooMany } from '../errors';

export interface RateLimitStatus {
  allowed: boolean;
  remainingAttempts: number;
  blockedUntil?: number;
}

/**
 * Extracts client IP safely from common proxy and connection headers.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return '127.0.0.1';
}

/**
 * SQLite rate limiter: enforces max 5 attempts per 15 minutes per IP.
 * Backed by login_attempts table with automatic TTL eviction.
 */
export function checkLoginRateLimit(ip: string, endpoint: string = 'auth_login'): void {
  const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  const MAX_ATTEMPTS = 5;
  const nowMs = Date.now();

  const d = db();
  d.exec(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      ip TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 1,
      first_attempt_at INTEGER NOT NULL,
      blocked_until INTEGER
    );
  `);

  // Purge expired records
  d.prepare(`DELETE FROM login_attempts WHERE blocked_until IS NOT NULL AND blocked_until < ?`).run(nowMs);
  d.prepare(`DELETE FROM login_attempts WHERE blocked_until IS NULL AND first_attempt_at < ?`).run(nowMs - WINDOW_MS);

  const key = `${ip}:${endpoint}`;
  const row = d.prepare(`
    SELECT attempts, first_attempt_at, blocked_until
    FROM login_attempts
    WHERE ip = ?
  `).get(key) as { attempts: number; first_attempt_at: number; blocked_until: number | null } | undefined;

  if (row) {
    if (row.blocked_until && row.blocked_until > nowMs) {
      const remainingMin = Math.max(1, Math.ceil((row.blocked_until - nowMs) / 60000));
      throw tooMany(`Too many login attempts from this IP. Please try again in ${remainingMin} minute${remainingMin > 1 ? 's' : ''}.`);
    }

    if (nowMs - row.first_attempt_at > WINDOW_MS) {
      d.prepare(`
        UPDATE login_attempts
        SET attempts = 1, first_attempt_at = ?, blocked_until = NULL
        WHERE ip = ?
      `).run(nowMs, key);
    } else {
      const newCount = row.attempts + 1;
      if (newCount > MAX_ATTEMPTS) {
        const blockedUntil = nowMs + WINDOW_MS;
        d.prepare(`
          UPDATE login_attempts
          SET attempts = ?, blocked_until = ?
          WHERE ip = ?
        `).run(newCount, blockedUntil, key);
        throw tooMany('Too many login attempts from this IP. Access temporarily suspended for 15 minutes.');
      } else {
        d.prepare(`
          UPDATE login_attempts
          SET attempts = ?
          WHERE ip = ?
        `).run(newCount, key);
      }
    }
  } else {
    d.prepare(`
      INSERT INTO login_attempts (ip, attempts, first_attempt_at, blocked_until)
      VALUES (?, 1, ?, NULL)
    `).run(key, nowMs);
  }
}

/**
 * Resets rate limit for an IP upon successful credential verification.
 */
export function resetLoginRateLimit(ip: string, endpoint: string = 'auth_login'): void {
  try {
    const key = `${ip}:${endpoint}`;
    db().prepare('DELETE FROM login_attempts WHERE ip = ?').run(key);
  } catch {}
}
