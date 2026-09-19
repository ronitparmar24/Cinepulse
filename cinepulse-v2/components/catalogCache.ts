'use client';
import type { CatalogResponse } from '@/lib/types';

const CATALOG_CACHE_PREFIX = 'cinepulse_cat_v3_';
const GENRES_CACHE_PREFIX = 'cinepulse_genres_v3_';
export const CATALOG_CACHE_TTL_MS = 60 * 60 * 1000; // 1 Hour (3,600,000 ms)
const COOKIE_NAME = 'cinepulse_catalog_synced_at';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

function safeGetStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }
}

function updateSyncCookie(timestamp: number): void {
  if (typeof document === 'undefined') return;
  try {
    const maxAgeSeconds = Math.floor(CATALOG_CACHE_TTL_MS / 1000);
    document.cookie = `${COOKIE_NAME}=${timestamp}; max-age=${maxAgeSeconds}; path=/; SameSite=Lax`;
  } catch {}
}

export function getCachedCatalog(cacheKey: string): { data: CatalogResponse; cachedAt: number; isExpired: boolean } | null {
  const storage = safeGetStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(`${CATALOG_CACHE_PREFIX}${cacheKey}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<CatalogResponse>;
    if (!entry || typeof entry.timestamp !== 'number' || !entry.data || !Array.isArray(entry.data.items)) {
      storage.removeItem(`${CATALOG_CACHE_PREFIX}${cacheKey}`);
      return null;
    }
    const age = Date.now() - entry.timestamp;
    const isExpired = age >= CATALOG_CACHE_TTL_MS;
    return {
      data: entry.data,
      cachedAt: entry.timestamp,
      isExpired,
    };
  } catch {
    return null;
  }
}

export function setCachedCatalog(cacheKey: string, data: CatalogResponse): void {
  const storage = safeGetStorage();
  if (!storage) return;
  const now = Date.now();
  try {
    pruneStaleEntries(storage);
    const entry: CacheEntry<CatalogResponse> = {
      data,
      timestamp: now,
    };
    storage.setItem(`${CATALOG_CACHE_PREFIX}${cacheKey}`, JSON.stringify(entry));
    updateSyncCookie(now);
  } catch {
    // If quota exceeded, clear older catalog entries and try once more
    try {
      clearCatalogStorage(storage);
      storage.setItem(`${CATALOG_CACHE_PREFIX}${cacheKey}`, JSON.stringify({ data, timestamp: now }));
      updateSyncCookie(now);
    } catch {}
  }
}

export function getCachedGenres(media: string): { genres: string[]; cachedAt: number } | null {
  const storage = safeGetStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(`${GENRES_CACHE_PREFIX}${media}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<string[]>;
    if (!entry || typeof entry.timestamp !== 'number' || !Array.isArray(entry.data)) {
      return null;
    }
    if (Date.now() - entry.timestamp >= CATALOG_CACHE_TTL_MS) {
      return null;
    }
    return { genres: entry.data, cachedAt: entry.timestamp };
  } catch {
    return null;
  }
}

export function setCachedGenres(media: string, genres: string[]): void {
  const storage = safeGetStorage();
  if (!storage) return;
  try {
    const entry: CacheEntry<string[]> = {
      data: genres,
      timestamp: Date.now(),
    };
    storage.setItem(`${GENRES_CACHE_PREFIX}${media}`, JSON.stringify(entry));
  } catch {}
}

export function clearCatalogCache(): void {
  const storage = safeGetStorage();
  if (!storage) return;
  clearCatalogStorage(storage);
  if (typeof document !== 'undefined') {
    try {
      document.cookie = `${COOKIE_NAME}=; max-age=0; path=/; SameSite=Lax`;
    } catch {}
  }
}

function clearCatalogStorage(storage: Storage): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && (k.startsWith(CATALOG_CACHE_PREFIX) || k.startsWith(GENRES_CACHE_PREFIX))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => storage.removeItem(k));
  } catch {}
}

function pruneStaleEntries(storage: Storage): void {
  try {
    const now = Date.now();
    const maxRetentionMs = 24 * 60 * 60 * 1000; // 24 hours max
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(CATALOG_CACHE_PREFIX)) {
        try {
          const raw = storage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw) as { timestamp?: number };
            if (!parsed.timestamp || now - parsed.timestamp > maxRetentionMs) {
              keysToRemove.push(k);
            }
          }
        } catch {
          keysToRemove.push(k);
        }
      }
    }
    keysToRemove.forEach(k => storage.removeItem(k));
  } catch {}
}

export function formatCacheAge(cachedAt: number): { ageText: string; remainingMinutes: number } {
  const elapsedMs = Math.max(0, Date.now() - cachedAt);
  const remainingMs = Math.max(0, CATALOG_CACHE_TTL_MS - elapsedMs);
  const remainingMinutes = Math.max(1, Math.round(remainingMs / (60 * 1000)));

  const elapsedMinutes = Math.floor(elapsedMs / (60 * 1000));
  let ageText = 'just now';
  if (elapsedMinutes === 1) ageText = '1m ago';
  else if (elapsedMinutes > 1) ageText = `${elapsedMinutes}m ago`;

  return { ageText, remainingMinutes };
}
