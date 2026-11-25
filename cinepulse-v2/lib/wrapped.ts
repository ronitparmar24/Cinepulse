/**
 * CinePulse Wrapped: a private, per-user summary of one calendar year.
 *
 * "Watched" comes from two places: diary entries (dated by the day you watched) and library
 * titles marked watched (dated by when you marked them). A title counts once per year, using
 * the diary's date when both exist. Everything here is the signed-in user's own data; it is
 * never computed for someone else.
 */
import { db } from './db';

export interface WatchRecord {
  titleId: string;
  title: string;
  poster: string | null;
  mediaType: 'movie' | 'tv' | string;
  genres: string[];
  releaseDate: string | null;
  runtime: number | null;
  rating: number | null;
  /** YYYY-MM-DD (or a full ISO timestamp) of when it was watched or marked watched. */
  watchedAt: string;
}

export interface CallRecord {
  choice: 'hit' | 'flop' | string;
  createdAt: string;
  /** null while the title's outcome is not resolved yet. */
  actualHit: boolean | null;
}

export type RatingStyle = 'generous' | 'balanced' | 'tough';

export interface WrappedSummary {
  year: number;
  hasData: boolean;
  filmsWatched: number;
  moviesWatched: number;
  seriesWatched: number;
  /** Whole hours of feature films with a known runtime (series are left out: episode counts are unknown). */
  hoursWatched: number;
  topGenres: Array<{ name: string; count: number }>;
  favoriteDecade: string | null;
  busiestMonth: { month: string; label: string; count: number } | null;
  months: number[];
  ratings: { count: number; average: number | null; style: RatingStyle | null; fiveStars: number };
  topFilms: Array<{ titleId: string; title: string; poster: string | null; rating: number | null }>;
  firstWatch: { title: string; date: string } | null;
  reviewsWritten: number;
  listsCreated: number;
  predictions: { calls: number; resolved: number; correct: number; accuracy: number | null };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function ratingStyle(average: number | null, count: number): RatingStyle | null {
  if (average === null || count < 3) return null;
  if (average >= 3.9) return 'generous';
  if (average <= 2.9) return 'tough';
  return 'balanced';
}

function inYear(date: string, year: number): boolean {
  return typeof date === 'string' && date.slice(0, 4) === String(year);
}

/** Pure aggregation, kept separate from the database so it can be tested directly. */
export function summarizeYear(
  year: number,
  watches: WatchRecord[],
  calls: CallRecord[],
  extras: { reviewsWritten?: number; listsCreated?: number } = {},
): WrappedSummary {
  // One entry per title for the year; the earliest watch wins the date, a rating from any wins the score.
  const byTitle = new Map<string, WatchRecord>();
  for (const w of watches) {
    if (!w?.titleId || !inYear(w.watchedAt, year)) continue;
    const prev = byTitle.get(w.titleId);
    if (!prev) { byTitle.set(w.titleId, { ...w }); continue; }
    if (w.watchedAt < prev.watchedAt) prev.watchedAt = w.watchedAt;
    if (prev.rating === null && w.rating !== null) prev.rating = w.rating;
    if (!prev.poster && w.poster) prev.poster = w.poster;
  }
  const titles = [...byTitle.values()].sort((a, b) => a.watchedAt.localeCompare(b.watchedAt));

  const genreCounts = new Map<string, number>();
  const decadeCounts = new Map<string, number>();
  const months = new Array(12).fill(0) as number[];
  let minutes = 0;
  let movies = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  let fiveStars = 0;

  for (const t of titles) {
    if (t.mediaType === 'tv') {
      // counted below via seriesWatched
    } else {
      movies++;
      if (typeof t.runtime === 'number' && t.runtime > 0 && t.runtime < 600) minutes += t.runtime;
    }
    for (const g of t.genres || []) genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
    const released = Number(String(t.releaseDate || '').slice(0, 4));
    if (Number.isFinite(released) && released > 1880) {
      const decade = `${Math.floor(released / 10) * 10}s`;
      decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + 1);
    }
    const m = Number(t.watchedAt.slice(5, 7));
    if (m >= 1 && m <= 12) months[m - 1]++;
    if (typeof t.rating === 'number') {
      ratingSum += t.rating;
      ratingCount++;
      if (t.rating >= 5) fiveStars++;
    }
  }

  const top = <K>(map: Map<K, number>) => [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  const busiestIndex = months.reduce((best, n, i) => (n > months[best] ? i : best), 0);
  const average = ratingCount ? Math.round((ratingSum / ratingCount) * 10) / 10 : null;

  const rated = titles.filter((t) => typeof t.rating === 'number').sort((a, b) => (b.rating! - a.rating!) || b.watchedAt.localeCompare(a.watchedAt));
  const pool = rated.length >= 3 ? rated : [...rated, ...[...titles].reverse().filter((t) => typeof t.rating !== 'number')];
  const topFilms = pool.slice(0, 5).map((t) => ({ titleId: t.titleId, title: t.title, poster: t.poster, rating: t.rating }));

  const yearCalls = calls.filter((c) => inYear(c.createdAt, year));
  const resolved = yearCalls.filter((c) => c.actualHit !== null);
  const correct = resolved.filter((c) => (c.choice === 'hit') === c.actualHit).length;

  return {
    year,
    hasData: titles.length > 0 || yearCalls.length > 0,
    filmsWatched: titles.length,
    moviesWatched: movies,
    seriesWatched: titles.length - movies,
    hoursWatched: Math.round(minutes / 60),
    topGenres: top(genreCounts).slice(0, 3).map(([name, count]) => ({ name, count })),
    favoriteDecade: top(decadeCounts)[0]?.[0] ?? null,
    busiestMonth: titles.length ? { month: `${year}-${String(busiestIndex + 1).padStart(2, '0')}`, label: MONTHS[busiestIndex], count: months[busiestIndex] } : null,
    months,
    ratings: { count: ratingCount, average, style: ratingStyle(average, ratingCount), fiveStars },
    topFilms,
    firstWatch: titles[0] ? { title: titles[0].title, date: titles[0].watchedAt.slice(0, 10) } : null,
    reviewsWritten: extras.reviewsWritten ?? 0,
    listsCreated: extras.listsCreated ?? 0,
    predictions: { calls: yearCalls.length, resolved: resolved.length, correct, accuracy: resolved.length ? Math.round((correct / resolved.length) * 100) : null },
  };
}

function parseTitle(json: unknown): Partial<WatchRecord> & { id?: string; title?: string } {
  try { return typeof json === 'string' ? JSON.parse(json) : {}; } catch { return {}; }
}

function toWatch(titleId: string, json: unknown, rating: unknown, watchedAt: string): WatchRecord {
  const t = parseTitle(json) as any;
  return {
    titleId,
    title: typeof t.title === 'string' && t.title ? t.title : titleId,
    poster: typeof t.poster === 'string' ? t.poster : null,
    mediaType: t.mediaType === 'tv' ? 'tv' : 'movie',
    genres: Array.isArray(t.genres) ? t.genres.filter((g: unknown) => typeof g === 'string') : [],
    releaseDate: typeof t.releaseDate === 'string' ? t.releaseDate : null,
    runtime: typeof t.runtime === 'number' ? t.runtime : null,
    rating: typeof rating === 'number' ? rating : rating === null || rating === undefined ? null : Number(rating) || null,
    watchedAt: String(watchedAt),
  };
}

export async function getWrapped(userId: string, year: number): Promise<WrappedSummary> {
  const d = db();
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => { try { return await fn(); } catch { return fallback; } };

  const [libraryRows, diaryRows, callRows, reviews, lists] = await Promise.all([
    safe(() => d.all(`SELECT title_id, title_json, rating, updated_at FROM library WHERE user_id = ? AND status = 'watched' AND updated_at >= ? AND updated_at < ?`, userId, start, end) as Promise<any[]>, []),
    safe(() => d.all(`SELECT title_id, title_json, rating, watched_on FROM diary_entries WHERE user_id = ? AND watched_on >= ? AND watched_on < ?`, userId, start, end) as Promise<any[]>, []),
    safe(() => d.all(`
      SELECT f.choice, f.created_at, p.actual_hit, p.resolved_at
      FROM forecasts f
      LEFT JOIN (SELECT title_id, MAX(actual_hit) AS actual_hit, MAX(resolved_at) AS resolved_at FROM predictions_log GROUP BY title_id) p ON p.title_id = f.title_id
      WHERE f.user_id = ? AND f.created_at >= ? AND f.created_at < ?`, userId, start, end) as Promise<any[]>, []),
    safe(async () => Number(((await d.get(`SELECT COUNT(*) AS n FROM reviews WHERE user_id = ? AND created_at >= ? AND created_at < ?`, userId, start, end)) as any)?.n || 0), 0),
    safe(async () => Number(((await d.get(`SELECT COUNT(*) AS n FROM activity_events WHERE user_id = ? AND type = 'created_list' AND created_at >= ? AND created_at < ?`, userId, start, end)) as any)?.n || 0), 0),
  ]);

  const watches = [
    ...diaryRows.map((r) => toWatch(r.title_id, r.title_json, r.rating, r.watched_on)),
    ...libraryRows.map((r) => toWatch(r.title_id, r.title_json, r.rating, r.updated_at)),
  ];
  const calls: CallRecord[] = callRows.map((r) => ({
    choice: r.choice,
    createdAt: String(r.created_at),
    actualHit: r.resolved_at && r.actual_hit !== null && r.actual_hit !== undefined ? Boolean(Number(r.actual_hit)) : null,
  }));
  return summarizeYear(year, watches, calls, { reviewsWritten: reviews, listsCreated: lists });
}

/** Wrapped covers the current year, plus last year during January so it can still be shared. */
export function wrappedYearAllowed(year: number, now = new Date()): boolean {
  const current = now.getUTCFullYear();
  return Number.isInteger(year) && year >= 2020 && year <= current;
}
