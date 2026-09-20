import { cacheGet, cacheSet } from '../db';

export interface FetcherOptions {
  provider: string;
  endpoint: string;
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
  timeoutMs?: number;
  maxRetries?: number;
  ttlMs?: number;
  skipCache?: boolean;
}

export interface FetcherResponse<T> {
  data: T | null;
  fromCache: boolean;
  status: number;
  error?: string;
}

// Token bucket rate limiter state per provider
interface Bucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRatePerSec: number;
}

const BUCKETS: Record<string, Bucket> = {
  wikipedia: { tokens: 10, lastRefill: Date.now(), capacity: 10, refillRatePerSec: 5 },
  wikidata: { tokens: 5, lastRefill: Date.now(), capacity: 5, refillRatePerSec: 2 },
  youtube: { tokens: 30, lastRefill: Date.now(), capacity: 30, refillRatePerSec: 10 },
  reddit: { tokens: 10, lastRefill: Date.now(), capacity: 10, refillRatePerSec: 1 },
  omdb: { tokens: 10, lastRefill: Date.now(), capacity: 10, refillRatePerSec: 2 },
  tvmaze: { tokens: 10, lastRefill: Date.now(), capacity: 10, refillRatePerSec: 2 },
  jikan: { tokens: 3, lastRefill: Date.now(), capacity: 3, refillRatePerSec: 1 },
  frankfurter: { tokens: 10, lastRefill: Date.now(), capacity: 10, refillRatePerSec: 2 },
  gemini: { tokens: 10, lastRefill: Date.now(), capacity: 10, refillRatePerSec: 1 },
  groq: { tokens: 10, lastRefill: Date.now(), capacity: 10, refillRatePerSec: 2 },
  default: { tokens: 20, lastRefill: Date.now(), capacity: 20, refillRatePerSec: 5 },
};

const loggedMissingKeys = new Set<string>();

export function logMissingKeyOnce(provider: string, envVar: string): void {
  const key = `${provider}:${envVar}`;
  if (!loggedMissingKeys.has(key)) {
    loggedMissingKeys.add(key);
    console.warn(`[CINEPULSE FETCHERS] ${envVar} is not configured. ${provider} features will degrade gracefully to null.`);
  }
}

async function acquireToken(provider: string): Promise<void> {
  const bucket = BUCKETS[provider] || BUCKETS.default;
  const now = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.refillRatePerSec);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    const waitMs = Math.ceil(((1 - bucket.tokens) / bucket.refillRatePerSec) * 1000);
    await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 2000)));
    bucket.tokens = Math.max(0, bucket.tokens - 1);
  } else {
    bucket.tokens -= 1;
  }
}

function hashParams(params?: Record<string, unknown>): string {
  if (!params) return 'none';
  const keys = Object.keys(params).sort();
  return keys.map(k => `${k}=${String(params[k])}`).join('&');
}

export async function unifiedFetch<T>(options: FetcherOptions): Promise<FetcherResponse<T>> {
  const {
    provider,
    endpoint,
    params,
    headers = {},
    method = 'GET',
    body,
    timeoutMs = 8000,
    maxRetries = 3,
    ttlMs = 12 * 60 * 60 * 1000, // default 12h
    skipCache = false,
  } = options;

  const cacheKey = `fetch:${provider}:${endpoint}:${hashParams(params)}`;

  if (!skipCache && method === 'GET') {
    const cached = cacheGet<{ data: T; etag?: string }>(cacheKey);
    if (cached && cached.data) {
      return { data: cached.data, fromCache: true, status: 200 };
    }
  }

  await acquireToken(provider);

  let url = endpoint;
  if (params && Object.keys(params).length > 0) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) query.append(k, String(v));
    }
    const qStr = query.toString();
    if (qStr) url += (url.includes('?') ? '&' : '?') + qStr;
  }

  let attempt = 0;
  let delay = 300;

  const defaultHeaders: Record<string, string> = {
    'User-Agent': 'CinePulse/3.0 (Cinema analytics and box-office engine; contact: github.com/ronitparmar24/Cinepulse)',
    'Accept': 'application/json',
    ...headers,
  };

  while (attempt <= maxRetries) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: defaultHeaders,
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 304 && method === 'GET') {
        const cached = cacheGet<{ data: T }>(cacheKey);
        if (cached) return { data: cached.data, fromCache: true, status: 200 };
      }

      if (!res.ok) {
        if ((res.status >= 500 || res.status === 429) && attempt <= maxRetries) {
          const jitter = Math.random() * 200;
          await new Promise((r) => setTimeout(r, delay + jitter));
          delay *= 2;
          continue;
        }
        return { data: null, fromCache: false, status: res.status, error: `HTTP ${res.status}` };
      }

      const json = (await res.json()) as T;
      const etag = res.headers.get('etag') || undefined;

      if (method === 'GET') {
        cacheSet(cacheKey, { data: json, etag }, ttlMs);
      }

      return { data: json, fromCache: false, status: res.status };
    } catch (err: any) {
      clearTimeout(timer);
      if (attempt <= maxRetries && err.name !== 'AbortError') {
        const jitter = Math.random() * 200;
        await new Promise((r) => setTimeout(r, delay + jitter));
        delay *= 2;
        continue;
      }
      return {
        data: null,
        fromCache: false,
        status: err.name === 'AbortError' ? 408 : 500,
        error: err.message || 'Network error',
      };
    }
  }

  return { data: null, fromCache: false, status: 504, error: 'Max retries exceeded' };
}
