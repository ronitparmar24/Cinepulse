/**
 * A member's streaming services, which of their saved titles those services carry, and
 * "Tonight's pick": one film or series from their watchlist that fits the time and mood they
 * have, preferring ones they can stream right now.
 */
import { db, now } from './db';
import { bad } from './errors';
import { isReleased } from './eligibility';
import { cleanServiceIds, matchServices } from './services';
import type { Title, User, WatchProviderInfo } from './types';

export type LoadProviders = (id: string, region?: string) => Promise<WatchProviderInfo>;

export async function getUserServices(userId: string, region: string | null | undefined): Promise<string[]> {
  const row = (await db().get('SELECT services FROM user_services WHERE user_id = ?', userId)) as { services?: string } | undefined;
  if (!row?.services) return [];
  try { return cleanServiceIds(JSON.parse(row.services), region); } catch { return []; }
}

export async function setUserServices(user: User, input: unknown): Promise<string[]> {
  const raw = (input && typeof input === 'object' ? (input as Record<string, unknown>).services : undefined);
  if (!Array.isArray(raw)) throw bad('services must be a list');
  const services = cleanServiceIds(raw, user.region);
  await db().run(
    `INSERT INTO user_services (user_id, services, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET services = excluded.services, updated_at = excluded.updated_at`,
    user.id, JSON.stringify(services), now(),
  );
  return services;
}

interface SavedTitle { title: Title; status: string; updatedAt: string }

async function savedTitles(userId: string, statuses: string[]): Promise<SavedTitle[]> {
  const marks = statuses.map(() => '?').join(',');
  const rows = (await db().all(`SELECT title_json, status, updated_at FROM library WHERE user_id = ? AND status IN (${marks}) ORDER BY updated_at DESC LIMIT 500`, userId, ...statuses)) as any[];
  const out: SavedTitle[] = [];
  for (const r of rows) {
    try {
      const t = JSON.parse(r.title_json);
      if (t?.id && t?.title) out.push({ title: t as Title, status: String(r.status), updatedAt: String(r.updated_at) });
    } catch { /* skip unreadable snapshots */ }
  }
  return out;
}

/** Runs `fn` over `items` with at most `limit` at a time. */
async function pooled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

/** For released titles on the watchlist (or being watched): which of the member's services carry each. */
export async function watchlistAvailability(user: User, loadProviders: LoadProviders, max = 60): Promise<Record<string, string[]>> {
  const services = await getUserServices(user.id, user.region);
  if (!services.length) return {};
  const items = (await savedTitles(user.id, ['watchlist', 'watching'])).filter((s) => isReleased(s.title.releaseDate)).slice(0, max);
  const found = await pooled(items, 6, async (s) => {
    const info = await loadProviders(s.title.id, user.region).catch(() => null);
    return [s.title.id, matchServices(info, services, user.region)] as const;
  });
  return Object.fromEntries(found.filter(([, names]) => names.length));
}

export interface TonightOptions { minutes?: number | null; mood?: string | null; servicesOnly?: boolean }
export interface TonightPick {
  title: Title;
  services: string[];
  reasons: string[];
}
export interface TonightResult {
  pick: TonightPick | null;
  alternates: TonightPick[];
  considered: number;
  moods: string[];
  message?: string;
}

/** Parses query-string options into safe values. */
export function parseTonightOptions(q: URLSearchParams): TonightOptions {
  const minutes = Number(q.get('minutes'));
  const mood = (q.get('mood') || '').trim();
  return {
    minutes: Number.isFinite(minutes) && minutes >= 30 && minutes <= 600 ? Math.round(minutes) : null,
    mood: mood && mood.length <= 40 ? mood : null,
    servicesOnly: q.get('servicesOnly') === '1',
  };
}

export async function tonightPick(user: User, options: TonightOptions, loadProviders: LoadProviders, random: () => number = Math.random): Promise<TonightResult> {
  const saved = (await savedTitles(user.id, ['watchlist'])).filter((s) => isReleased(s.title.releaseDate));
  const moods = [...new Set(saved.flatMap((s) => s.title.genres || []))].sort();
  if (!saved.length) return { pick: null, alternates: [], considered: 0, moods, message: 'Your watchlist has nothing that’s out yet. Save a few films and try again.' };

  let pool = saved;
  if (options.mood) pool = pool.filter((s) => (s.title.genres || []).includes(options.mood!));
  if (options.minutes) pool = pool.filter((s) => typeof s.title.runtime === 'number' && s.title.runtime > 0 && s.title.runtime <= options.minutes! + 5);
  if (!pool.length) return { pick: null, alternates: [], considered: 0, moods, message: 'Nothing on your watchlist fits that. Try more time or another mood.' };

  const services = await getUserServices(user.id, user.region);
  if (options.servicesOnly && !services.length) {
    return { pick: null, alternates: [], considered: pool.length, moods, message: 'Choose your streaming services first (profile → Services).' };
  }
  const candidates = pool.slice(0, 40);
  const withServices = await pooled(candidates, 6, async (s) => ({
    s,
    names: services.length ? matchServices(await loadProviders(s.title.id, user.region).catch(() => null), services, user.region) : [],
  }));
  let ranked = withServices;
  if (options.servicesOnly) ranked = ranked.filter((x) => x.names.length);
  if (!ranked.length) return { pick: null, alternates: [], considered: candidates.length, moods, message: 'None of these are on your services right now. Turn off “Only my services” to see everything.' };

  const oldest = Math.min(...ranked.map((x) => Date.parse(x.s.updatedAt) || Date.now()));
  const scored = ranked.map((x) => {
    const rating = typeof x.s.title.voteAverage === 'number' && x.s.title.voteAverage > 0 ? x.s.title.voteAverage : 6.5;
    const waiting = Math.min(1, (Date.now() - (Date.parse(x.s.updatedAt) || Date.now())) / (Date.now() - oldest || 1));
    const score = rating + (x.names.length ? 1.5 : 0) + waiting * 0.8 + random() * 2.2;
    return { ...x, score };
  }).sort((a, b) => b.score - a.score);

  const toPick = (x: (typeof scored)[number]): TonightPick => {
    const reasons: string[] = [];
    if (x.names.length) reasons.push(`Streaming on your ${x.names.join(' and ')}`);
    if (typeof x.s.title.runtime === 'number' && x.s.title.runtime > 0) reasons.push(options.minutes ? `Fits your ${options.minutes} minutes (${x.s.title.runtime} min)` : `${x.s.title.runtime} min`);
    if (options.mood) reasons.push(`Matches your ${options.mood} mood`);
    const days = Math.floor((Date.now() - (Date.parse(x.s.updatedAt) || Date.now())) / 86_400_000);
    if (days >= 30) reasons.push(`On your watchlist for ${days >= 365 ? `${Math.floor(days / 365)}+ year${days >= 730 ? 's' : ''}` : `${Math.floor(days / 30)} month${days >= 60 ? 's' : ''}`}`);
    return { title: x.s.title, services: x.names, reasons };
  };
  return { pick: toPick(scored[0]), alternates: scored.slice(1, 3).map(toPick), considered: ranked.length, moods };
}
