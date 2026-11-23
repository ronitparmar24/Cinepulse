/**
 * Development-only authentication shortcuts.
 *
 * CinePulse has a few conveniences for local work: a one-click demo login,
 * an OTP preview endpoint, and returning the OTP code in the API response when
 * no email provider is configured. Each of them lets the caller sign in as an
 * arbitrary email address, so they must never be reachable on a public server.
 *
 * They are allowed only when:
 *   - NODE_ENV is not "production" (i.e. `next dev` or the test runner), or
 *   - ALLOW_DEV_AUTH=1 is set AND the process is not running on Vercel
 *     (useful for `next start` on 127.0.0.1 during local QA).
 */
export function devAuthAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VERCEL) return false;
  if (env.NODE_ENV !== 'production') return true;
  return env.ALLOW_DEV_AUTH === '1';
}
