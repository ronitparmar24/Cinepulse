/**
 * "Pick up where you left off": the last few titles opened on this device.
 * Stored only in localStorage (never sent anywhere); components listen for
 * the `cinepulse:recent` event to refresh.
 */
import type { Title } from './types';

export interface RecentTitle {
  id: string;
  title: string;
  poster: string | null;
  backdrop: string | null;
  year: string | null;
  genre: string | null;
  voteAverage: number | null;
  viewedAt: number;
}

const KEY = 'cinepulse_recent_v1';
const MAX = 12;
export const RECENT_EVENT = 'cinepulse:recent';

export function readRecent(): RecentTitle[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is RecentTitle => !!r && typeof r === 'object' && typeof (r as RecentTitle).id === 'string' && typeof (r as RecentTitle).title === 'string')
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function write(list: RecentTitle[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* storage full or blocked: the rail simply stays empty */
  }
  window.dispatchEvent(new Event(RECENT_EVENT));
}

export function rememberTitle(t: Title) {
  if (typeof window === 'undefined' || !t?.id) return;
  const entry: RecentTitle = {
    id: t.id,
    title: t.title,
    poster: t.poster,
    backdrop: t.backdrop,
    year: t.releaseDate ? t.releaseDate.slice(0, 4) : null,
    genre: t.genres?.[0] ?? null,
    voteAverage: t.voteCount > 0 ? t.voteAverage : null,
    viewedAt: Date.now(),
  };
  write([entry, ...readRecent().filter((r) => r.id !== t.id)]);
}

export function forgetTitle(id: string) {
  write(readRecent().filter((r) => r.id !== id));
}

export function clearRecent() {
  write([]);
}

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.round(d / 7)}w ago`;
}
