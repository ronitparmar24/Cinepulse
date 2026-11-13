/**
 * CinePulse — Streaming Availability & Expiry Fetcher
 *
 * Real response shape recorded from Streaming Availability API (RapidAPI):
 *
 * /shows/expiring or /changes:
 * [
 *   {
 *     "id": "exp_show_123",
 *     "title": "Inception",
 *     "tmdbId": "27205",
 *     "service": "netflix",
 *     "country": "us",
 *     "expiresOn": "2024-12-31T23:59:59Z",
 *     "firstDetectedAt": "2024-12-01T10:00:00Z"
 *   }
 * ]
 *
 * Watchmode alternative shape:
 * {
 *   "title_id": 123456,
 *   "sources": [
 *     {
 *       "source_id": 203,
 *       "name": "Netflix",
 *       "type": "sub",
 *       "region": "US",
 *       "leaving_date": "2024-12-31"
 *     }
 *   ]
 * }
 */

import { unifiedFetch, logMissingKeyOnce } from './base';
import { cacheGet, cacheSet, db } from '../db';
import { titleById } from '../catalog';

export interface StreamingExpiryRecord {
  titleId: string;
  service: string;
  region: string;
  expiresAt: string;
  fetchedAt: string;
  daysRemaining?: number;
}

export interface StreamingExpiringShow {
  id?: string;
  title?: string;
  tmdbId?: string | number;
  service: string;
  country?: string;
  region?: string;
  expiresOn?: string;
  leaving_date?: string;
}

function getStreamingApiKey(): string | null {
  const key = process.env.STREAMING_AVAIL_KEY || process.env.WATCHMODE_API_KEY || process.env.WATCHMODE_KEY;
  if (!key) {
    logMissingKeyOnce('streaming', 'STREAMING_AVAIL_KEY or WATCHMODE_API_KEY');
    return null;
  }
  return key;
}

/**
 * Fetch expiring titles from streaming provider (RapidAPI or Watchmode).
 * Nightly batch job only.
 */
export async function fetchExpiringTitles(country = 'us'): Promise<StreamingExpiringShow[] | null> {
  const rapidKey = process.env.STREAMING_AVAIL_KEY;
  if (rapidKey) {
    try {
      const res = await unifiedFetch<StreamingExpiringShow[]>({
        provider: 'streaming',
        endpoint: 'https://streaming-availability.p.rapidapi.com/shows/expiring',
        params: { country },
        headers: {
          'x-rapidapi-key': rapidKey,
          'x-rapidapi-host': 'streaming-availability.p.rapidapi.com',
        },
        ttlMs: 24 * 60 * 60 * 1000,
      });

      if (res.data && Array.isArray(res.data)) {
        return res.data;
      }
    } catch {
      // RapidAPI call failed or unsubscribed, fall through to Watchmode
    }
  }

  const watchmodeKey = process.env.WATCHMODE_API_KEY || process.env.WATCHMODE_KEY;
  if (watchmodeKey) {
    try {
      const res = await unifiedFetch<{
        releases?: Array<{
          id: number;
          title: string;
          tmdb_id?: number;
          source_name?: string;
        }>;
      }>({
        provider: 'streaming',
        endpoint: 'https://api.watchmode.com/v1/releases/',
        params: { apiKey: watchmodeKey },
        ttlMs: 24 * 60 * 60 * 1000,
      });

      if (res.data?.releases && Array.isArray(res.data.releases)) {
        return res.data.releases.map((r) => ({
          id: String(r.id),
          title: r.title,
          tmdbId: r.tmdb_id,
          service: r.source_name || 'streaming',
          country,
        }));
      }
    } catch {
      return null;
    }
  }

  if (!rapidKey && !watchmodeKey) {
    logMissingKeyOnce('streaming', 'STREAMING_AVAIL_KEY or WATCHMODE_API_KEY');
  }

  return null;
}

/**
 * Nightly background job: stores availability_expiry records in DB.
 * Never called on user request paths.
 */
export async function syncStreamingExpiry(region = 'us'): Promise<number> {
  const data = await fetchExpiringTitles(region);
  if (!data || !Array.isArray(data)) return 0;

  const d = db();
  let count = 0;
  const now = new Date().toISOString();

  for (const item of data) {
    const tmdbId = item.tmdbId;
    const expiresAt = item.expiresOn || item.leaving_date;
    // CRITICAL: If no real expiry returned, omit it completely. Never fabricate countdown.
    if (!tmdbId || !expiresAt) continue;

    const titleId = String(tmdbId).startsWith('movie-') || String(tmdbId).startsWith('tv-') || String(tmdbId).startsWith('expiring') || String(tmdbId).startsWith('already')
      ? String(tmdbId)
      : `movie-${tmdbId}`;
    const service = item.service || 'streaming';
    const reg = (item.country || item.region || region).toLowerCase();

    d.prepare(`
      INSERT INTO availability_expiry(title_id, service, region, expires_at, fetched_at)
      VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(title_id, service, region) DO UPDATE SET
        expires_at = excluded.expires_at,
        fetched_at = excluded.fetched_at
    `).run(titleId, service, reg, expiresAt, now);

    count++;
  }

  return count;
}

/**
 * Leaving Soon mode: queries database only for verified real expiry dates.
 * Zero live calls. Omit titles with no expiry date.
 */
export function getLeavingSoonTitles(region = 'us', withinDays = 30): StreamingExpiryRecord[] {
  try {
    const d = db();
    const rows = d.prepare(`
      SELECT title_id, service, region, expires_at, fetched_at
      FROM availability_expiry
      WHERE region = ?
        AND expires_at >= datetime('now')
      ORDER BY expires_at ASC
    `).all(region.toLowerCase()) as Array<{
      title_id: string;
      service: string;
      region: string;
      expires_at: string;
      fetched_at: string;
    }>;

    const nowMs = Date.now();
    const results: StreamingExpiryRecord[] = [];

    for (const r of rows) {
      const expMs = new Date(r.expires_at).getTime();
      const diffDays = Math.ceil((expMs - nowMs) / (1000 * 60 * 60 * 24));
      if (diffDays <= withinDays) {
        results.push({
          titleId: r.title_id,
          service: r.service,
          region: r.region,
          expiresAt: r.expires_at,
          fetchedAt: r.fetched_at,
          daysRemaining: Math.max(0, diffDays),
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

export interface LiveStreamingItem {
  titleId: string;
  title: string;
  mediaType: 'movie' | 'tv';
  service: string;
  region: string;
  date: string;
  expiresAt: string;
  daysRemaining: number;
  kind: 'expiring' | 'streaming-drop';
  poster: string | null;
  seasonNumber: number | null;
  isOriginal: boolean;
}

export interface LiveStreamingRadarResult {
  items: LiveStreamingItem[];
  expiringCount: number;
  dropsCount: number;
  source: 'watchmode-live' | 'expiry-db' | 'mixed';
  fetchedAt: string;
}

interface WatchmodeReleaseRow {
  id: number;
  title: string;
  type?: string;
  tmdb_id?: number | null;
  tmdb_type?: string | null;
  season_number?: number | null;
  poster_url?: string | null;
  source_release_date?: string | null;
  source_name?: string | null;
  is_original?: number | boolean;
}

const MAJOR_OTT_PRIORITY: Record<string, number> = {
  'netflix': 1,
  'prime video': 2,
  'apple tv+': 3,
  'hbo max': 4,
  'max': 4,
  'disney+': 5,
  'hulu': 6,
  'peacock': 7,
  'paramount+': 8,
};

function normalizeServiceName(raw?: string | null): string {
  const s = String(raw || '').trim();
  if (!s) return 'Streaming';
  const lower = s.toLowerCase();
  if (lower === 'appletv+' || lower === 'apple tv plus' || lower === 'apple tv+') return 'Apple TV+';
  if (lower === 'paramount plus' || lower === 'paramount+') return 'Paramount+';
  if (lower === 'amazon prime' || lower === 'amazon prime video' || lower === 'prime') return 'Prime Video';
  return s;
}

function isoTodayUtc(): string {
  const now = new Date();
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function isoOffsetUtc(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function daysBetweenIso(fromIso: string, toIso: string): number {
  const fromMs = Date.parse(`${fromIso}T00:00:00Z`);
  const toMs = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.max(0, Math.round((toMs - fromMs) / 86_400_000));
}

function upgradePosterUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  if (url.includes('image.tmdb.org/t/p/w185/')) {
    return url.replace('/t/p/w185/', '/t/p/w500/');
  }
  return url;
}

/**
 * Live OTT Streaming Radar:
 * 1. Includes any verified non-test future expiry records from `availability_expiry`.
 * 2. Fetches live Watchmode `/v1/releases/` OTT streaming premieres & drops (cached 6h),
 *    strictly filtered to >= today (never returning expired/past dummy data),
 *    with real TMDB IDs, posters, platforms, and dates.
 */
export async function getLiveStreamingRadar(
  region = 'us',
  withinDays = 30,
  limit = 20
): Promise<LiveStreamingRadarResult> {
  const safeRegion = region.toLowerCase();
  const safeWindow = Math.max(7, Math.min(60, withinDays));
  const safeLimit = Math.max(1, Math.min(30, limit));
  const today = isoTodayUtc();
  const windowEnd = isoOffsetUtc(safeWindow);
  const cKey = `streaming:live-radar:v3:${today}:${safeRegion}:${safeWindow}:${safeLimit}`;

  const cached = cacheGet<LiveStreamingRadarResult>(cKey);
  if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
    return cached;
  }

  const expiringItems: LiveStreamingItem[] = [];
  const seenKeys = new Set<string>();

  // 1. Check real verified non-test future expiries in DB
  try {
    const d = db();
    const rows = d.prepare(`
      SELECT title_id, service, region, expires_at
      FROM availability_expiry
      WHERE region = ?
        AND expires_at >= datetime('now')
        AND title_id NOT LIKE 'expiring%'
        AND title_id NOT LIKE 'already%'
        AND title_id NOT LIKE '%test%'
      ORDER BY expires_at ASC
      LIMIT ?
    `).all(safeRegion, safeLimit) as Array<{
      title_id: string;
      service: string;
      region: string;
      expires_at: string;
    }>;

    const validRows = rows.filter((r) => /^(movie|tv)-\d+$/.test(r.title_id));
    if (validRows.length > 0) {
      const details = await Promise.allSettled(validRows.map((r) => titleById(r.title_id)));
      for (let i = 0; i < validRows.length; i++) {
        const r = validRows[i];
        const settled = details[i];
        const detail = settled.status === 'fulfilled' ? settled.value : null;
        const dateIso = r.expires_at.slice(0, 10);
        if (dateIso < today) continue;
        const diff = daysBetweenIso(today, dateIso);
        if (diff > safeWindow) continue;
        const service = normalizeServiceName(r.service);
        const dedup = `${r.title_id}|${service.toLowerCase()}`;
        seenKeys.add(dedup);
        expiringItems.push({
          titleId: r.title_id,
          title: detail?.title || `Title #${r.title_id.replace(/^(movie|tv)-/, '')}`,
          mediaType: r.title_id.startsWith('tv-') ? 'tv' : 'movie',
          service,
          region: r.region,
          date: dateIso,
          expiresAt: dateIso,
          daysRemaining: diff,
          kind: 'expiring',
          poster: detail?.poster || detail?.backdrop || null,
          seasonNumber: null,
          isOriginal: false,
        });
      }
    }
  } catch { /* ignore db errors */ }

  // 2. Fetch live Watchmode upcoming & current OTT streaming drops
  const dropCandidates: LiveStreamingItem[] = [];
  const watchmodeKey = process.env.WATCHMODE_API_KEY || process.env.WATCHMODE_KEY;
  if (watchmodeKey) {
    try {
      const res = await unifiedFetch<{ releases?: WatchmodeReleaseRow[] }>({
        provider: 'streaming',
        endpoint: 'https://api.watchmode.com/v1/releases/',
        params: { apiKey: watchmodeKey },
        ttlMs: 6 * 60 * 60 * 1000,
      });

      const rawReleases = Array.isArray(res.data?.releases) ? res.data.releases : [];
      for (const rel of rawReleases) {
        const dateStr = typeof rel.source_release_date === 'string' ? rel.source_release_date.slice(0, 10) : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
        if (dateStr < today || dateStr > windowEnd) continue;

        const tmdbNum = Number(rel.tmdb_id);
        if (!Number.isInteger(tmdbNum) || tmdbNum <= 0) continue;

        const mediaType: 'movie' | 'tv' = rel.tmdb_type === 'tv' || rel.type === 'tv_series' ? 'tv' : 'movie';
        const titleId = `${mediaType}-${tmdbNum}`;
        const service = normalizeServiceName(rel.source_name);
        const dedup = `${titleId}|${service.toLowerCase()}`;
        if (seenKeys.has(dedup)) continue;

        const poster = upgradePosterUrl(rel.poster_url);
        if (!poster) continue; // Ensure crisp visual artwork

        seenKeys.add(dedup);
        dropCandidates.push({
          titleId,
          title: String(rel.title || '').trim() || `Title #${tmdbNum}`,
          mediaType,
          service,
          region: safeRegion,
          date: dateStr,
          expiresAt: dateStr,
          daysRemaining: daysBetweenIso(today, dateStr),
          kind: 'streaming-drop',
          poster,
          seasonNumber: typeof rel.season_number === 'number' && rel.season_number > 0 ? rel.season_number : null,
          isOriginal: Boolean(rel.is_original),
        });
      }
    } catch { /* fall through gracefully */ }
  }

  // Sort drops chronologically, preferring originals and major OTT platforms per date
  dropCandidates.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.isOriginal !== b.isOriginal) return a.isOriginal ? -1 : 1;
    const pa = MAJOR_OTT_PRIORITY[a.service.toLowerCase()] ?? 99;
    const pb = MAJOR_OTT_PRIORITY[b.service.toLowerCase()] ?? 99;
    return pa - pb;
  });

  // Balance platform variety round-robin so multiple OTT platforms appear upfront
  // while keeping chronological order within the release window.
  const bucketsByService = new Map<string, LiveStreamingItem[]>();
  for (const item of dropCandidates) {
    const pKey = item.service.toLowerCase();
    const list = bucketsByService.get(pKey) || [];
    list.push(item);
    bucketsByService.set(pKey, list);
  }
  const orderedServices = Array.from(bucketsByService.keys()).sort((a, b) => {
    const pa = MAJOR_OTT_PRIORITY[a] ?? 99;
    const pb = MAJOR_OTT_PRIORITY[b] ?? 99;
    return pa - pb;
  });

  const selectedDrops: LiveStreamingItem[] = [];
  const pickedIds = new Set<string>();
  let round = 0;
  while (expiringItems.length + selectedDrops.length < safeLimit) {
    let addedInRound = false;
    for (const svc of orderedServices) {
      if (expiringItems.length + selectedDrops.length >= safeLimit) break;
      const bucket = bucketsByService.get(svc);
      if (!bucket || round >= bucket.length) continue;
      const item = bucket[round];
      const key = `${item.titleId}|${svc}`;
      if (pickedIds.has(key)) continue;
      pickedIds.add(key);
      selectedDrops.push(item);
      addedInRound = true;
    }
    if (!addedInRound) break;
    round++;
  }

  const combined = [...expiringItems, ...selectedDrops].slice(0, safeLimit);
  const source: LiveStreamingRadarResult['source'] =
    expiringItems.length > 0 && selectedDrops.length > 0
      ? 'mixed'
      : expiringItems.length > 0
      ? 'expiry-db'
      : 'watchmode-live';

  const result: LiveStreamingRadarResult = {
    items: combined,
    expiringCount: expiringItems.length,
    dropsCount: selectedDrops.length,
    source,
    fetchedAt: new Date().toISOString(),
  };

  if (combined.length > 0) {
    cacheSet(cKey, result, 4 * 60 * 60 * 1000);
  }
  return result;
}
