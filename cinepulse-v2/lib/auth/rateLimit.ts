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
 * SQLite/in-memory rate limiter: enforces max 5 attempts per 15 minutes per IP.
 * Backed by login_rate_limits table (from migration 0007).
 */
export function checkLoginRateLimit(ip: string, endpoint: string = 'auth_login'): void {
  const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  const MAX_ATTEMPTS = 5;
  const nowMs = Date.now();

  const d = db();
  try {
    // Purge expired records periodically
    d.prepare(`DELETE FROM login_rate_limits WHERE blocked_until IS NOT NULL AND blocked_until < ?`).run(nowMs);
    d.prepare(`DELETE FROM login_rate_limits WHERE blocked_until IS NULL AND first_attempt_at < ?`).run(nowMs - WINDOW_MS);

    const row = d.prepare(`
      SELECT attempt_count, first_attempt_at, blocked_until
      FROM login_rate_limits
      WHERE ip = ? AND endpoint = ?
    `).get(ip, endpoint) as { attempt_count: number; first_attempt_at: number; blocked_until: number | null } | undefined;

    if (row) {
      if (row.blocked_until && row.blocked_until > nowMs) {
        const remainingMin = Math.max(1, Math.ceil((row.blocked_until - nowMs) / 60000));
        throw tooMany(`Too many login attempts from this IP. Please try again in ${remainingMin} minute${remainingMin > 1 ? 's' : ''}.`);
      }

      if (nowMs - row.first_attempt_at > WINDOW_MS) {
        // Reset window
        d.prepare(`
          UPDATE login_rate_limits
          SET attempt_count = 1, first_attempt_at = ?, blocked_until = NULL
          WHERE ip = ? AND endpoint = ?
        `).run(nowMs, ip, endpoint);
      } else {
        const newCount = row.attempt_count + 1;
        if (newCount > MAX_ATTEMPTS) {
          const blockedUntil = nowMs + WINDOW_MS;
          d.prepare(`
            UPDATE login_rate_limits
            SET attempt_count = ?, blocked_until = ?
            WHERE ip = ? AND endpoint = ?
          `).run(newCount, blockedUntil, ip, endpoint);
          throw tooMany('Too many login attempts from this IP. Access temporarily suspended for 15 minutes.');
        } else {
          d.prepare(`
            UPDATE login_rate_limits
            SET attempt_count = ?
            WHERE ip = ? AND endpoint = ?
          `).run(newCount, ip, endpoint);
        }
      }
    } else {
      d.prepare(`
        INSERT INTO login_rate_limits (ip, endpoint, attempt_count, first_attempt_at, blocked_until)
        VALUES (?, ?, 1, ?, NULL)
      `).run(ip, endpoint, nowMs);
    }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 429) {
      throw err;
    }
    // In case of non-fatal DB errors during rate checking, do not block users
  }
}

/**
 * Resets rate limit for an IP upon successful credential verification.
 */
export function resetLoginRateLimit(ip: string, endpoint: string = 'auth_login'): void {
  try {
    db().prepare('DELETE FROM login_rate_limits WHERE ip = ? AND endpoint = ?').run(ip, endpoint);
  } catch {}
}
