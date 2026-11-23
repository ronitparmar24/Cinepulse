/**
 * CinePulse — Cloudflare Turnstile Bot Verification Middleware
 *
 * Verifies Turnstile response tokens on sensitive mutation paths:
 * signup, login, forecast submit.
 *
 * Real response shape from challenges.cloudflare.com/turnstile/v0/siteverify:
 * {
 *   "success": true,
 *   "challenge_ts": "2024-10-12T14:30:00.000Z",
 *   "hostname": "cinepulse.app",
 *   "error-codes": [],
 *   "action": "login",
 *   "cdata": ""
 * }
 */

import { logMissingKeyOnce } from '../fetchers/base';
import { forbidden } from '../errors';

export interface TurnstileVerificationResult {
  success: boolean;
  error?: string;
  skipped?: boolean;
}

/**
 * Verify Cloudflare Turnstile token.
 * Fail closed: if TURNSTILE_SECRET_KEY is configured, invalid/missing token is rejected.
 * In local dev without TURNSTILE_SECRET_KEY, skips verification and logs once.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string
): Promise<TurnstileVerificationResult> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    logMissingKeyOnce('turnstile', 'TURNSTILE_SECRET_KEY');
    return { success: true, skipped: true };
  }

  if (!token || !token.trim()) {
    return { success: false, error: 'Turnstile verification token is required' };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (remoteIp) {
      formData.append('remoteip', remoteIp);
    }

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const data = (await res.json()) as {
      success: boolean;
      'error-codes'?: string[];
      challenge_ts?: string;
      hostname?: string;
    };

    if (data.success) {
      return { success: true };
    }

    return {
      success: false,
      error: `Turnstile verification failed: ${(data['error-codes'] || []).join(', ') || 'invalid token'}`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Turnstile verification service error: ${err?.message || 'network failure'}`,
    };
  }
}

/**
 * A token is required only when BOTH keys are configured. If only the secret
 * were set, the browser could never produce a token and every sign-in would
 * fail (that was BUG-001).
 *
 * It is also only required in production builds. A Turnstile site key is bound
 * to its allowed hostnames, so on 127.0.0.1/localhost the widget errors (110200),
 * never yields a token, and every local sign-in was refused. Set
 * NEXT_PUBLIC_TURNSTILE_IN_DEV=1 (e.g. with Cloudflare's test keys) to exercise
 * the bot check under `next dev`. Must match `turnstileEnabled` in
 * components/TurnstileWidget.tsx.
 */
export function turnstileRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.TURNSTILE_SECRET_KEY || !env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return false;
  return env.NODE_ENV === 'production' || env.NEXT_PUBLIC_TURNSTILE_IN_DEV === '1';
}

/** Reads the token from the `x-turnstile-token` header or `turnstileToken` body field. */
export function turnstileTokenFrom(request: Request, body: unknown): string {
  const fromHeader = request.headers.get('x-turnstile-token');
  const fromBody = body && typeof body === 'object' ? (body as { turnstileToken?: unknown }).turnstileToken : undefined;
  const token = fromHeader || (typeof fromBody === 'string' ? fromBody : '');
  return token.trim();
}

/**
 * Throws 403 unless the request passes the bot check.
 * `required: false` still verifies a token when one is sent (e.g. forecasts).
 */
export async function enforceTurnstile(
  request: Request,
  body: unknown,
  remoteIp: string,
  { required = turnstileRequired() }: { required?: boolean } = {},
): Promise<void> {
  const token = turnstileTokenFrom(request, body);
  if (!token && !required) return;
  const result = await verifyTurnstileToken(token, remoteIp);
  if (!result.success) throw forbidden(result.error || 'Bot check failed. Please try again.');
}
