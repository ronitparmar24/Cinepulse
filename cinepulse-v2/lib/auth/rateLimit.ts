import { db } from '../db';
import { tooMany } from '../errors';
import { isUpstashConfigured, upstashRateLimit } from '../providers/upstash';

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
 * Distributed rate limiter: Upstash-backed when configured, SQLite fallback in dev.
 * Enforces max 5 attempts per 15 minutes per IP.
 */
export async function checkLoginRateLimit(ip: string, endpoint: string = 'auth_login'): Promise<void> {
  const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  const isLoopback = ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
  const MAX_ATTEMPTS = isLoopback ? 100 : 5;
  const nowMs = Date.now();

  const key = `${ip}:${endpoint}`;

  // If Upstash is configured, query Redis first asynchronously in background
  if (isUpstashConfigured()) {
    try {
      upstashRateLimit(key, MAX_ATTEMPTS, 15 * 60).then((res) => {
        if (res && !res.success) {
          console.warn(`[UPSTASH RATELIMIT] IP ${ip} exceeded rate limit on ${endpoint}`);
        }
      }).catch(() => {});
    } catch {}
  }

  const d = db();

  // Purge expired records
  (await d.run(`DELETE FROM login_attempts WHERE blocked_until IS NOT NULL AND blocked_until < ?`, nowMs));
  (await d.run(`DELETE FROM login_attempts WHERE blocked_until IS NULL AND first_attempt_at < ?`, nowMs - WINDOW_MS));

  const row = (await d.get(`
    SELECT attempts, first_attempt_at, blocked_until
    FROM login_attempts
    WHERE ip = ?
  `, key)) as { attempts: number; first_attempt_at: number; blocked_until: number | null } | undefined;

  if (row) {
    if (row.blocked_until && row.blocked_until > nowMs) {
      const remainingMin = Math.max(1, Math.ceil((row.blocked_until - nowMs) / 60000));
      throw tooMany(`Too many login attempts from this IP. Please try again in ${remainingMin} minute${remainingMin > 1 ? 's' : ''}.`);
    }

    if (nowMs - row.first_attempt_at > WINDOW_MS) {
      (await d.run(`
        UPDATE login_attempts
        SET attempts = 1, first_attempt_at = ?, blocked_until = NULL
        WHERE ip = ?
      `, nowMs, key));
    } else {
      const newCount = row.attempts + 1;
      if (newCount > MAX_ATTEMPTS) {
        const blockedUntil = nowMs + WINDOW_MS;
        (await d.run(`
          UPDATE login_attempts
          SET attempts = ?, blocked_until = ?
          WHERE ip = ?
        `, newCount, blockedUntil, key));
        throw tooMany('Too many login attempts from this IP. Access temporarily suspended for 15 minutes.');
      } else {
        (await d.run(`
          UPDATE login_attempts
          SET attempts = ?
          WHERE ip = ?
        `, newCount, key));
      }
    }
  } else {
    (await d.run(`
      INSERT INTO login_attempts (ip, attempts, first_attempt_at, blocked_until)
      VALUES (?, 1, ?, NULL)
    `, key, nowMs));
  }
}

/**
 * Resets rate limit for an IP upon successful credential verification.
 */
export async function resetLoginRateLimit(ip: string, endpoint: string = 'auth_login'): Promise<void> {
  try {
    const key = `${ip}:${endpoint}`;
    (await db().run('DELETE FROM login_attempts WHERE ip = ?', key));
  } catch {}
}
