/**
 * Provider usage accounting backed by the `provider_usage` table.
 *
 * Rows are bucketed per (provider, UTC date, UTC hour) so we can answer both
 * "how much of today's quota is gone?" and "what was the cache hit rate over
 * the last 24h?" from one table. Every function here is best-effort: usage
 * accounting must never be the reason a feature fails.
 */
import { db } from '../db';
import {
  PROVIDERS,
  PROVIDER_FALLBACKS,
  dailyQuotaFor,
  isProviderConfigured,
  type ProviderName,
} from './registry';

function nowParts(at: Date = new Date()): { date: string; hour: number } {
  return { date: at.toISOString().slice(0, 10), hour: at.getUTCHours() };
}

type Counter = 'count' | 'calls' | 'cache_hits' | 'errors' | 'quota_skips';

function bump(provider: string, increments: Partial<Record<Counter, number>>): void {
  try {
    const { date, hour } = nowParts();
    const c = increments.count ?? 0;
    const calls = increments.calls ?? 0;
    const hits = increments.cache_hits ?? 0;
    const errs = increments.errors ?? 0;
    const skips = increments.quota_skips ?? 0;
    db().prepare(`
      INSERT INTO provider_usage(provider, date, hour, count, calls, cache_hits, errors, quota_skips)
      VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(provider, date, hour) DO UPDATE SET
        count = count + excluded.count,
        calls = calls + excluded.calls,
        cache_hits = cache_hits + excluded.cache_hits,
        errors = errors + excluded.errors,
        quota_skips = quota_skips + excluded.quota_skips
    `).run(provider, date, hour, c, calls, hits, errs, skips);
  } catch { /* accounting is best-effort */ }
}

/** Units consumed today (UTC) for a provider. */
export function getUsageToday(provider: string): number {
  try {
    const { date } = nowParts();
    const row = db().prepare('SELECT COALESCE(SUM(count),0) AS used FROM provider_usage WHERE provider = ? AND date = ?')
      .get(provider, date) as { used: number } | undefined;
    return Number(row?.used ?? 0);
  } catch {
    return 0;
  }
}

/** True if `cost` more units fit inside today's quota (always true for uncapped providers). */
export function hasQuota(provider: string, cost = 1): boolean {
  const quota = dailyQuotaFor(provider);
  if (quota === null) return true;
  return getUsageToday(provider) + cost <= quota;
}

/**
 * Atomically (within the single-threaded event loop) check the quota and
 * record the outbound call. Returns false — and records a quota skip — when
 * the call must not go out.
 */
export function tryReserve(provider: string, cost = 1): boolean {
  if (!hasQuota(provider, cost)) {
    bump(provider, { quota_skips: 1 });
    return false;
  }
  bump(provider, { count: cost, calls: 1 });
  return true;
}

export function recordCacheHit(provider: string): void {
  bump(provider, { cache_hits: 1 });
}

export function recordError(provider: string, message: string): void {
  bump(provider, { errors: 1 });
  try {
    db().prepare(`
      INSERT INTO provider_status(provider, last_error, last_error_at) VALUES(?,?,?)
      ON CONFLICT(provider) DO UPDATE SET last_error = excluded.last_error, last_error_at = excluded.last_error_at
    `).run(provider, message.slice(0, 300), new Date().toISOString());
  } catch { /* best-effort */ }
}

export function recordSuccess(provider: string): void {
  try {
    db().prepare(`
      INSERT INTO provider_status(provider, last_success_at) VALUES(?,?)
      ON CONFLICT(provider) DO UPDATE SET last_success_at = excluded.last_success_at
    `).run(provider, new Date().toISOString());
  } catch { /* best-effort */ }
}

export interface ProviderHealth {
  provider: string;
  configured: boolean | null;
  unit: string;
  today: { used: number; quota: number | null; remaining: number | null; pctUsed: number | null; exhausted: boolean };
  last24h: { calls: number; cacheHits: number; cacheHitRate: number | null; errors: number; quotaSkips: number };
  lastError: string | null;
  lastErrorAt: string | null;
  lastSuccessAt: string | null;
  fallback: string | null;
}

function last24hWindow(): { date: string; hour: number } {
  return nowParts(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

function healthFor(provider: string): ProviderHealth {
  const tracked = provider in PROVIDERS;
  const quota = dailyQuotaFor(provider);
  const used = getUsageToday(provider);
  let calls = 0, cacheHits = 0, errors = 0, quotaSkips = 0;
  let status: { last_error: string | null; last_error_at: string | null; last_success_at: string | null } | undefined;
  try {
    const from = last24hWindow();
    const row = db().prepare(`
      SELECT COALESCE(SUM(calls),0) AS calls, COALESCE(SUM(cache_hits),0) AS hits,
             COALESCE(SUM(errors),0) AS errors, COALESCE(SUM(quota_skips),0) AS skips
      FROM provider_usage
      WHERE provider = ? AND (date > ? OR (date = ? AND hour > ?))
    `).get(provider, from.date, from.date, from.hour) as { calls: number; hits: number; errors: number; skips: number } | undefined;
    calls = Number(row?.calls ?? 0);
    cacheHits = Number(row?.hits ?? 0);
    errors = Number(row?.errors ?? 0);
    quotaSkips = Number(row?.skips ?? 0);
    status = db().prepare('SELECT last_error, last_error_at, last_success_at FROM provider_status WHERE provider = ?')
      .get(provider) as typeof status;
  } catch { /* table may be unavailable; report zeros */ }

  const lookups = calls + cacheHits;
  return {
    provider,
    configured: tracked ? isProviderConfigured(provider as ProviderName) : null,
    unit: tracked ? PROVIDERS[provider as ProviderName].unit : 'requests',
    today: {
      used,
      quota,
      remaining: quota === null ? null : Math.max(0, quota - used),
      pctUsed: quota ? Math.round((used / quota) * 1000) / 10 : null,
      exhausted: quota !== null && used >= quota,
    },
    last24h: {
      calls,
      cacheHits,
      cacheHitRate: lookups > 0 ? Math.round((cacheHits / lookups) * 1000) / 10 : null,
      errors,
      quotaSkips,
    },
    lastError: status?.last_error ?? null,
    lastErrorAt: status?.last_error_at ?? null,
    lastSuccessAt: status?.last_success_at ?? null,
    fallback: tracked ? PROVIDER_FALLBACKS[provider as ProviderName] : null,
  };
}

/**
 * Health snapshot for every registry provider plus any other provider that
 * has recorded traffic in the last 24h (wikipedia, reddit, tmdb, …).
 */
export function getProviderHealth(): { generatedAt: string; providers: ProviderHealth[]; otherProviders: ProviderHealth[] } {
  const registry = Object.keys(PROVIDERS);
  let others: string[] = [];
  try {
    const from = last24hWindow();
    others = (db().prepare(`
      SELECT DISTINCT provider FROM provider_usage WHERE date > ? OR (date = ? AND hour > ?)
    `).all(from.date, from.date, from.hour) as { provider: string }[])
      .map((r) => r.provider)
      .filter((p) => !registry.includes(p));
  } catch { /* ignore */ }
  return {
    generatedAt: new Date().toISOString(),
    providers: registry.map(healthFor),
    otherProviders: others.map(healthFor),
  };
}
