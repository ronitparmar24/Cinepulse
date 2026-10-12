/**
 * CinePulse — Upstash Redis REST Integration
 *
 * Distributed rate-limiting and provider quota accounting for serverless deployments.
 * Automatically falls back to local SQLite / memory counters when Upstash env vars are absent.
 */

import { logMissingKeyOnce } from '../fetchers/base';

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

export function isUpstashConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/**
 * Execute an arbitrary command via Upstash REST API.
 */
async function upstashCommand<T = any>(command: (string | number)[]): Promise<T | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    logMissingKeyOnce('upstash', 'UPSTASH_REDIS_REST_URL');
    return null;
  }

  try {
    const res = await fetch(`${url.replace(/\/$/, '')}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    if (!res.ok) return null;
    const body = (await res.json()) as { result?: T; error?: string };
    if (body.error) return null;
    return body.result !== undefined ? body.result : null;
  } catch {
    return null;
  }
}

/**
 * Distributed rate limiter using fixed window in Redis:
 * increments key and sets TTL if key is new.
 * Returns null if Upstash is not configured or fails (to allow in-memory fallback).
 */
export async function upstashRateLimit(
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult | null> {
  if (!isUpstashConfigured()) return null;

  const key = `ratelimit:${identifier}`;

  try {
    const count = await upstashCommand<number>(['INCR', key]);
    if (count === null) return null;

    if (count === 1) {
      await upstashCommand(['EXPIRE', key, windowSeconds]);
    }

    const ttl = await upstashCommand<number>(['TTL', key]);
    const resetMs = (ttl && ttl > 0 ? ttl : windowSeconds) * 1000;

    return {
      success: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetMs,
    };
  } catch {
    return null;
  }
}

/**
 * Distributed provider usage increment.
 */
export async function upstashBumpProviderUsage(
  provider: string,
  date: string,
  cost: number
): Promise<number | null> {
  if (!isUpstashConfigured()) return null;

  const key = `provider_usage:${provider}:${date}`;
  try {
    const result = await upstashCommand<number>(['INCRBY', key, cost]);
    if (result === cost) {
      // Set 48h TTL on daily key
      await upstashCommand(['EXPIRE', key, 172800]);
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Read distributed provider usage count for today.
 */
export async function upstashGetProviderUsage(provider: string, date: string): Promise<number | null> {
  if (!isUpstashConfigured()) return null;

  const key = `provider_usage:${provider}:${date}`;
  try {
    const val = await upstashCommand<string | number>(['GET', key]);
    return val !== null ? Number(val) : 0;
  } catch {
    return null;
  }
}
