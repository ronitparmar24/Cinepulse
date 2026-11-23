import { timingSafeEqual } from 'node:crypto';
import { HttpError, unauthorized } from '../errors';
import { devAuthAllowed } from './devAuth';

/**
 * Guards every /api/cron/* endpoint.
 *
 * - With CRON_SECRET set, the request must carry `Authorization: Bearer <secret>`
 *   (Vercel Cron sends exactly this header automatically). Compared in constant time.
 * - Without CRON_SECRET, cron endpoints work only in local development. In
 *   production they refuse with 503 instead of trusting a client IP, because
 *   `X-Forwarded-For` can be forged by anyone outside Vercel's proxy.
 */
export function requireCron(request: Request, env: NodeJS.ProcessEnv = process.env): void {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    if (devAuthAllowed(env)) return;
    throw new HttpError(503, 'CRON_SECRET is not configured on this server');
  }
  const given = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw unauthorized('Invalid cron authorization');
  }
}
