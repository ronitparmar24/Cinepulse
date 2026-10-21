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
