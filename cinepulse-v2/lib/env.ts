/**
 * Startup configuration check. Reports problems by variable NAME only (never values).
 * Called once from instrumentation.ts; also usable in tests.
 */
import { describeDatabaseUrlProblem, isPostgresUrl } from './dbUrl';

export interface EnvProblem {
  level: 'error' | 'warning';
  message: string;
}

export function checkEnvironment(env: NodeJS.ProcessEnv = process.env): EnvProblem[] {
  const problems: EnvProblem[] = [];
  const prod = env.NODE_ENV === 'production';
  const onVercel = Boolean(env.VERCEL);
  const has = (k: string) => Boolean(env[k] && String(env[k]).trim());

  if (onVercel && !isPostgresUrl(env.DATABASE_URL)) {
    problems.push({ level: 'error', message: 'DATABASE_URL is not a postgres:// URL on Vercel: data is stored in a temporary file and lost on every cold start.' });
  }
  if (has('DATABASE_URL') && !isPostgresUrl(env.DATABASE_URL)) {
    problems.push({ level: 'error', message: `DATABASE_URL is set but is not a postgres:// URL (${describeDatabaseUrlProblem(env.DATABASE_URL)}); it is ignored and SQLite is used.` });
  }
  if (has('DATABASE_SCHEMA') && !/^[a-z_][a-z0-9_]*$/.test(env.DATABASE_SCHEMA!)) {
    problems.push({ level: 'error', message: 'DATABASE_SCHEMA must be lowercase letters, digits and underscores.' });
  }
  if (prod && !has('CRON_SECRET')) {
    problems.push({ level: 'warning', message: 'CRON_SECRET is not set: /api/cron/* will refuse every request (scheduled jobs will not run).' });
  }
  if (has('TURNSTILE_SECRET_KEY') !== has('NEXT_PUBLIC_TURNSTILE_SITE_KEY')) {
    problems.push({ level: 'warning', message: 'Only one of TURNSTILE_SECRET_KEY / NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, so the bot check is off. Set both to enable it.' });
  }
  if (has('VITE_TURNSTILE_SITE_KEY')) {
    problems.push({ level: 'warning', message: 'VITE_TURNSTILE_SITE_KEY is not read by Next.js; rename it to NEXT_PUBLIC_TURNSTILE_SITE_KEY.' });
  }
  if (onVercel && has('ALLOW_DEV_AUTH')) {
    problems.push({ level: 'warning', message: 'ALLOW_DEV_AUTH is ignored on Vercel; remove it from the project settings.' });
  }
  if (env.CATALOG_MODE === 'tmdb' && !has('TMDB_READ_TOKEN')) {
    problems.push({ level: 'error', message: 'CATALOG_MODE=tmdb but TMDB_READ_TOKEN is not set.' });
  }
  if (prod && !has('SMTP_HOST') && !has('RESEND_API_KEY')) {
    problems.push({ level: 'warning', message: 'No email provider (SMTP_* or RESEND_API_KEY): sign-in codes cannot be sent, so email sign-in will fail.' });
  }
  if (has('NEXT_PUBLIC_SUPABASE_URL') !== has('SUPABASE_SERVICE_ROLE_KEY')) {
    problems.push({ level: 'warning', message: 'Supabase sign-in needs both NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
  }
  return problems;
}
