/**
 * "Now on your services" alerts, like JustWatch: when a title on a member's watchlist starts
 * streaming (flatrate, not rent/buy) on one of the services they picked, in their region, they get
 * one in-app notification — "Dune: Part Two is now on Netflix" — once per title and service.
 *
 * No spam on the first run: the first time a title is checked successfully for a member, whatever
 * it is already on is recorded silently (the baseline). The same goes for a service the member adds
 * later. Only availability that appears after a check that included that service notifies.
 *
 * Bookkeeping lives in streaming_alerts (schema v24 / pg 0013):
 *   provider_id = '<serviceId>'  announced (baseline = 0) or recorded silently (baseline = 1)
 *   provider_id = '*'            the title was looked at; checked_services is the JSON list of the
 *                                member's services at the last successful check (NULL = never checked
 *                                successfully, e.g. unreleased or the lookup failed)
 *
 * Work is bounded: at most `maxTitles` distinct title+region lookups per run (shared by every member
 * with that title), least recently checked first, so repeated runs rotate through everyone.
 * Safe to run often and concurrently: each (member, title, service) is claimed with an insert that
 * does nothing on conflict before anything is sent.
 */
import { db, now } from './db';
import { isReleased } from './eligibility';
import { getReminderPrefs } from './reminders';
import { cleanServiceIds, matchServices, servicesForRegion } from './services';
import type { WatchProviderInfo } from './types';

export type ProvidersFor = (titleId: string, region: string) => Promise<WatchProviderInfo>;

export interface StreamingAlertOptions {
  /** Most members handled in one run (default 500). */
  limitUsers?: number;
  /** Most distinct title+region lookups in one run (default 60). */
  maxTitles?: number;
  /** Watch-provider lookup; defaults to the cached TMDB lookup in lib/catalog.ts. Throw when unknown. */
  providersFor?: ProvidersFor;
  /** Whether a title id can be looked up in the current catalog (defaults to catalog titleIdAvailable). */
  isAvailable?: (titleId: string) => boolean;
  /** "Now", for tests. */
  at?: Date;
}

export interface StreamingAlertResult {
  users: number;
  titlesChecked: number;
  lookupsFailed: number;
  notified: number;
  baseline: number;
  skipped: number;
}

const SENTINEL = '*';
const MAX_ROWS = 3000;
const POOL = 6;
/** Most skipped (unreleased/demo) rows re-queued per run, so they never dominate the work. */
const MAX_SKIPPED = 500;

/**
 * The default lookup. lib/catalog.ts swallows TMDB errors (and demo mode) into an empty result that
 * has no `free`/`ads` lists; a real answer always has them. Treat the former as "unknown", never as
 * "not streaming", so an outage on a first check cannot turn into a burst of alerts later.
 */
async function defaultProvidersFor(titleId: string, region: string): Promise<WatchProviderInfo> {
  const { watchProviders } = await import('./catalog');
  const info = await watchProviders(titleId, region);
  if (!Array.isArray(info?.free) || !Array.isArray(info?.ads)) throw new Error('watch providers unavailable');
  return info;
}

async function defaultIsAvailable(): Promise<(id: string) => boolean> {
  const { titleIdAvailable } = await import('./catalog');
  return titleIdAvailable;
}

const regionOf = (r: unknown): 'IN' | 'US' => (String(r || 'IN').toUpperCase() === 'US' ? 'US' : 'IN');

function parseList(json: unknown): string[] | null {
  if (typeof json !== 'string' || !json) return null;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

interface Snapshot { id: string; title: string; poster: string | null; mediaType: string; releaseDate: string | null }
function snapshotOf(titleId: string, json: string): Snapshot | null {
  try {
    const t = JSON.parse(json);
    if (!t || typeof t !== 'object') return null;
    return {
      id: titleId,
      title: typeof t.title === 'string' && t.title ? t.title : titleId,
      poster: typeof t.poster === 'string' ? t.poster : null,
      mediaType: t.mediaType === 'tv' ? 'tv' : 'movie',
      releaseDate: typeof t.releaseDate === 'string' ? t.releaseDate : null,
    };
  } catch {
    return null;
  }
}

async function pooled<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

interface Candidate {
  userId: string;
  region: 'IN' | 'US';
  services: string[];
  titleId: string;
  snapshot: Snapshot;
  /** null when never checked successfully. */
  checked: string[] | null;
}

export async function runStreamingAlerts(options: StreamingAlertOptions = {}): Promise<StreamingAlertResult> {
  const d = db();
  const at = options.at ?? new Date();
  const stamp = options.at ? at.toISOString() : now();
  const limitUsers = Math.max(1, Math.min(options.limitUsers ?? 500, 5000));
  const maxTitles = Math.max(1, Math.min(options.maxTitles ?? 60, 200));
  const providersFor = options.providersFor ?? defaultProvidersFor;
  const isAvailable = options.isAvailable ?? (await defaultIsAvailable());
  const result: StreamingAlertResult = { users: 0, titlesChecked: 0, lookupsFailed: 0, notified: 0, baseline: 0, skipped: 0 };

  // Watchlisted titles of members who picked services, never-checked first, then least recently checked.
  const rows = (await d.all(
    `SELECT l.user_id, l.title_id, l.title_json, u.region, us.services, s.checked_services, s.notified_at AS checked_at
     FROM library l
     JOIN user_services us ON us.user_id = l.user_id
     JOIN users u ON u.id = l.user_id
     LEFT JOIN streaming_alerts s ON s.user_id = l.user_id AND s.title_id = l.title_id AND s.provider_id = ?
     WHERE l.status = 'watchlist' AND us.services IS NOT NULL AND us.services <> '[]'
     ORDER BY CASE WHEN s.notified_at IS NULL THEN 0 ELSE 1 END, s.notified_at ASC, l.updated_at DESC
     LIMIT ?`,
    SENTINEL, MAX_ROWS,
  )) as any[];

  const users = new Set<string>();
  const groups = new Map<string, { titleId: string; region: 'IN' | 'US'; members: Candidate[] }>();
  const skippedRows: Array<{ userId: string; titleId: string; snapshot: Snapshot | null }> = [];

  for (const row of rows) {
    const userId = String(row.user_id);
    if (!users.has(userId) && users.size >= limitUsers) continue;
    const region = regionOf(row.region);
    const services = cleanServiceIds(parseList(row.services) ?? [], region);
    if (!services.length) continue;
    const titleId = String(row.title_id);
    const snapshot = snapshotOf(titleId, String(row.title_json || ''));
    if (!snapshot || !isAvailable(titleId) || !isReleased(snapshot.releaseDate, at.getTime())) {
      if (skippedRows.length >= MAX_SKIPPED) continue;
      users.add(userId);
      skippedRows.push({ userId, titleId, snapshot });
      continue;
    }
    const key = `${titleId}|${region}`;
    let group = groups.get(key);
    if (!group) {
      if (groups.size >= maxTitles) continue;
      group = { titleId, region, members: [] };
      groups.set(key, group);
    }
    users.add(userId);
    group.members.push({ userId, region, services, titleId, snapshot, checked: row.checked_services == null ? null : parseList(row.checked_services) });
  }
  result.users = users.size;

  // Unreleased, demo or unreadable titles: no lookup, but move them to the back of the queue.
  for (const s of skippedRows) {
    result.skipped++;
    await touchSentinel(s.userId, s.titleId, s.snapshot, stamp);
  }

  const prefs = new Map<string, boolean>();
  const wantsAlerts = async (userId: string): Promise<boolean> => {
    if (!prefs.has(userId)) prefs.set(userId, await getReminderPrefs(userId).then((p) => p.watchlist).catch(() => true));
    return prefs.get(userId)!;
  };

  await pooled([...groups.values()], POOL, async (group) => {
    let info: WatchProviderInfo | null = null;
    try { info = await providersFor(group.titleId, group.region); } catch { info = null; }
    if (!info || !Array.isArray(info.flatrate)) {
      result.lookupsFailed++;
      for (const m of group.members) await touchSentinel(m.userId, m.titleId, m.snapshot, stamp);
      return;
    }
    result.titlesChecked++;
    for (const m of group.members) {
      const names = new Set(matchServices(info, m.services, m.region));
      const onNow = servicesForRegion(m.region).filter((s) => m.services.includes(s.id) && names.has(s.name));
      const allowed = await wantsAlerts(m.userId);
      for (const service of onNow) {
        // New only if the previous successful check already covered this service and it wasn't there.
        const isNew = m.checked !== null && m.checked.includes(service.id) && allowed;
        const claim = await d.run(
          `INSERT INTO streaming_alerts (user_id, title_id, provider_id, provider_name, title_json, checked_services, baseline, notified_at)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?) ON CONFLICT(user_id, title_id, provider_id) DO NOTHING`,
          m.userId, m.titleId, service.id, service.name, JSON.stringify(m.snapshot), isNew ? 0 : 1, stamp,
        );
        if (!claim.changes) continue; // already announced or recorded
        if (!isNew) { result.baseline++; continue; }
        await d.run(
          `INSERT INTO notifications (user_id, actor_id, type, target_type, target_id, created_at) VALUES (?, ?, 'now_streaming', 'title', ?, ?)`,
          m.userId, m.userId, `${m.titleId}|${service.id}`, stamp,
        );
        result.notified++;
      }
      await d.run(
        `INSERT INTO streaming_alerts (user_id, title_id, provider_id, provider_name, title_json, checked_services, baseline, notified_at)
         VALUES (?, ?, ?, NULL, ?, ?, 1, ?)
         ON CONFLICT(user_id, title_id, provider_id) DO UPDATE SET checked_services = excluded.checked_services, title_json = excluded.title_json, notified_at = excluded.notified_at`,
        m.userId, m.titleId, SENTINEL, JSON.stringify(m.snapshot), JSON.stringify(m.services), stamp,
      );
    }
  });
  return result;
}

/** Marks a title as looked at without changing what counts as its last successful check. */
async function touchSentinel(userId: string, titleId: string, snapshot: Snapshot | null, stamp: string): Promise<void> {
  await db().run(
    `INSERT INTO streaming_alerts (user_id, title_id, provider_id, provider_name, title_json, checked_services, baseline, notified_at)
     VALUES (?, ?, ?, NULL, ?, NULL, 1, ?)
     ON CONFLICT(user_id, title_id, provider_id) DO UPDATE SET notified_at = excluded.notified_at`,
    userId, titleId, SENTINEL, snapshot ? JSON.stringify(snapshot) : null, stamp,
  );
}
