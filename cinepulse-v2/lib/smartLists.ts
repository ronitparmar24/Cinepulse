/**
 * Smart lists for the library: quick filters built from what the member already saved.
 * Pure and browser-safe (no database imports), so the library view and tests share it.
 */
import type { LibraryEntry } from './types';

export type SmartListId = 'all' | 'services' | 'short' | 'month' | 'loved' | 'unrated';

export interface SmartListDef {
  id: SmartListId;
  label: string;
  /** Empty state when the list has nothing in it. */
  emptyTitle: string;
  emptyBody: string;
}

export const SMART_LISTS: SmartListDef[] = [
  { id: 'all', label: 'All', emptyTitle: 'No titles in this view.', emptyBody: 'Try another filter or search.' },
  { id: 'services', label: 'On my services', emptyTitle: 'Nothing on your services right now.', emptyBody: 'None of your watchlist is streaming on the services you picked. We’ll tell you when something lands.' },
  { id: 'short', label: 'Under 100 min', emptyTitle: 'No short films here.', emptyBody: 'Films under 100 minutes that you save will show up here, for nights when time is tight.' },
  { id: 'month', label: 'Releasing this month', emptyTitle: 'Nothing releasing this month.', emptyBody: 'Save upcoming titles and the ones arriving this month gather here.' },
  { id: 'loved', label: 'Highly rated (4★+)', emptyTitle: 'No 4★ favourites yet.', emptyBody: 'Rate what you watch and your best-loved titles collect here.' },
  { id: 'unrated', label: 'Unrated watched', emptyTitle: 'Everything you watched is rated.', emptyBody: 'Nice. Titles you mark watched without a rating will wait here.' },
];

export const SMART_LIST_IDS = SMART_LISTS.map((l) => l.id);
export const SMART_LIST_STORAGE_KEY = 'cinepulse.library.smartList';

export function isSmartListId(value: unknown): value is SmartListId {
  return typeof value === 'string' && (SMART_LIST_IDS as string[]).includes(value);
}

export interface SmartListContext {
  /** titleId → names of the member's services carrying it (GET /api/services/watchlist). */
  matches: Record<string, string[]>;
  now?: Date;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function inSmartList(id: SmartListId, entry: LibraryEntry, ctx: SmartListContext): boolean {
  const t = entry.title;
  switch (id) {
    case 'all': return true;
    case 'services': return entry.status !== 'watched' && (ctx.matches[t.id]?.length ?? 0) > 0;
    case 'short': return t.mediaType === 'movie' && typeof t.runtime === 'number' && t.runtime > 0 && t.runtime < 100;
    case 'month': return typeof t.releaseDate === 'string' && t.releaseDate.slice(0, 7) === monthKey(ctx.now ?? new Date());
    case 'loved': return typeof entry.rating === 'number' && entry.rating >= 4;
    case 'unrated': return entry.status === 'watched' && (entry.rating === null || entry.rating === undefined);
  }
}

export function smartListCounts(entries: LibraryEntry[], ctx: SmartListContext): Record<SmartListId, number> {
  const counts = Object.fromEntries(SMART_LIST_IDS.map((id) => [id, 0])) as Record<SmartListId, number>;
  for (const e of entries) for (const id of SMART_LIST_IDS) if (inSmartList(id, e, ctx)) counts[id]++;
  return counts;
}
