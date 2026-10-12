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
import { db } from '../db';

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
  const key = process.env.STREAMING_AVAIL_KEY || process.env.WATCHMODE_KEY;
  if (!key) {
    logMissingKeyOnce('streaming', 'STREAMING_AVAIL_KEY');
    return null;
  }
  return key;
}

/**
 * Fetch expiring titles from streaming provider.
 * Nightly batch job only.
 */
export async function fetchExpiringTitles(country = 'us'): Promise<StreamingExpiringShow[] | null> {
  const key = getStreamingApiKey();
  if (!key) return null;

  const res = await unifiedFetch<StreamingExpiringShow[]>({
    provider: 'streaming',
    endpoint: 'https://streaming-availability.p.rapidapi.com/shows/expiring',
    params: { country },
    headers: {
      'x-rapidapi-key': key,
      'x-rapidapi-host': 'streaming-availability.p.rapidapi.com',
    },
    ttlMs: 24 * 60 * 60 * 1000,
  });

  return res.data;
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

    const titleId = String(tmdbId);
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
