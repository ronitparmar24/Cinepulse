/**
 * Year-round viewing stats for the signed-in member's own library (Letterboxd/Trakt-style).
 *
 * Built on the same sources as Wrapped (lib/wrapped.ts): diary entries dated by the day you
 * watched, and library titles marked watched (dated by when you marked them) for titles that
 * were never logged in the diary. Episode check-offs (episode_progress) add episode counts and,
 * when the series' episode runtime is known, hours. A title counts once per period.
 * Private data: only ever computed for the requesting user.
 */
import { db } from './db';
import { bad } from './errors';
import { ratingStyle, type RatingStyle, type WatchRecord } from './wrapped';

export type StatsPeriod = number | 'all';

export interface StatsWatch extends WatchRecord {
  director: string | null;
  cast: string[];
  /** true for a diary entry flagged as a rewatch. */
  rewatch?: boolean;
}

export interface EpisodeWatch {
  titleId: string;
  watchedAt: string;
  /** Episode runtime in minutes when known. */
  runtime: number | null;
}

export interface StatsSummary {
  period: StatsPeriod;
  hasData: boolean;
  /** Years (newest first) with any logged viewing, always including the current year. */
  availableYears: number[];
  titlesLogged: number;
  filmsLogged: number;
  seriesLogged: number;
  episodesWatched: number;
  diaryEntries: number;
  rewatches: number;
  /** Rounded to one decimal. */
  hoursWatched: number;
  /** Per month (a year) or per year (all time), oldest first. */
  timeline: { granularity: 'month' | 'year'; buckets: Array<{ key: string; label: string; count: number }> };
  topGenres: Array<{ name: string; count: number }>;
  /** Ten buckets: 0.5, 1, …, 5 stars. */
  ratingHistogram: Array<{ stars: number; count: number }>;
  ratings: { count: number; average: number | null; style: RatingStyle | null };
  longestStreak: { days: number; start: string; end: string } | null;
  busiestDay: { date: string; count: number } | null;
  topDirectors: Array<{ name: string; count: number }>;
  topActors: Array<{ name: string; count: number }>;
  topRated: Array<{ titleId: string; title: string; poster: string | null; rating: number }>;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

/** `year` query value → a year number or 'all'. Missing means the current year. */
export function parseStatsPeriod(raw: string | null | undefined, now = new Date()): StatsPeriod {
  const current = now.getUTCFullYear();
  if (raw === null || raw === undefined || raw === '') return current;
  if (raw === 'all') return 'all';
  if (!/^\d{4}$/.test(raw)) throw bad('year must be a four-digit year or "all"');
  const year = Number(raw);
  if (year < 1900 || year > current) throw bad('That year is not available.');
  return year;
}

const day = (s: string) => String(s).slice(0, 10);
const inPeriod = (date: string, period: StatsPeriod) => period === 'all' || String(date).slice(0, 4) === String(period);
const topN = (map: Map<string, number>, n: number) =>
  [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([name, count]) => ({ name, count }));
const bump = (map: Map<string, number>, key: string, by = 1) => map.set(key, (map.get(key) || 0) + by);
const validRuntime = (n: unknown): n is number => typeof n === 'number' && n > 0 && n < 600;

/** Longest run of consecutive calendar days with at least one viewing. */
export function longestStreak(dates: string[]): StatsSummary['longestStreak'] {
  const days = [...new Set(dates.map(day).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  if (!days.length) return null;
  let best = { days: 1, start: days[0], end: days[0] };
  let run = { days: 1, start: days[0], end: days[0] };
  for (let i = 1; i < days.length; i++) {
    const gap = Math.round((Date.parse(`${days[i]}T00:00:00Z`) - Date.parse(`${days[i - 1]}T00:00:00Z`)) / DAY_MS);
    run = gap === 1 ? { days: run.days + 1, start: run.start, end: days[i] } : { days: 1, start: days[i], end: days[i] };
    if (run.days > best.days) best = { ...run };
  }
  return best;
}

/** Pure aggregation (no database), so it can be tested directly. */
export function summarizeStats(
  period: StatsPeriod,
  watches: StatsWatch[],
  episodes: EpisodeWatch[] = [],
  now = new Date(),
): StatsSummary {
  const current = now.getUTCFullYear();
  const years = new Set<number>([current]);
  for (const w of watches) { const y = Number(String(w.watchedAt).slice(0, 4)); if (y >= 1900 && y <= current) years.add(y); }
  for (const e of episodes) { const y = Number(String(e.watchedAt).slice(0, 4)); if (y >= 1900 && y <= current) years.add(y); }

  const inScope = watches.filter((w) => w?.titleId && inPeriod(w.watchedAt, period));
  const epScope = episodes.filter((e) => e?.titleId && inPeriod(e.watchedAt, period));

  // One entry per title for the period: earliest date wins, any rating wins (as in Wrapped).
  const byTitle = new Map<string, StatsWatch>();
  for (const w of [...inScope].sort((a, b) => String(a.watchedAt).localeCompare(String(b.watchedAt)))) {
    const prev = byTitle.get(w.titleId);
    if (!prev) { byTitle.set(w.titleId, { ...w }); continue; }
    if (w.rating !== null && w.rating !== undefined) prev.rating = w.rating; // the latest rating is the current opinion
    if (!prev.poster && w.poster) prev.poster = w.poster;
    if (!prev.director && w.director) prev.director = w.director;
    if (!prev.cast.length && w.cast.length) prev.cast = w.cast;
  }
  const titles = [...byTitle.values()];

  const genres = new Map<string, number>();
  const directors = new Map<string, number>();
  const actors = new Map<string, number>();
  const histogram = new Array(10).fill(0) as number[];
  let minutes = 0, films = 0, ratingSum = 0, ratingCount = 0;
  for (const t of titles) {
    if (t.mediaType !== 'tv') {
      films++;
      if (validRuntime(t.runtime)) minutes += t.runtime;
    }
    for (const g of new Set(t.genres || [])) bump(genres, g);
    if (t.director) bump(directors, t.director);
    for (const name of new Set((t.cast || []).slice(0, 5))) bump(actors, name);
    if (typeof t.rating === 'number' && t.rating >= 0.5 && t.rating <= 5) {
      ratingSum += t.rating;
      ratingCount++;
      histogram[Math.min(9, Math.max(0, Math.round(t.rating * 2) - 1))]++;
    }
  }
  for (const e of epScope) if (validRuntime(e.runtime)) minutes += e.runtime;

  // Timeline: every viewing date in scope (titles once, by their first date in the period).
  let buckets: StatsSummary['timeline']['buckets'];
  if (period === 'all') {
    const counts = new Map<number, number>();
    for (const t of titles) { const y = Number(String(t.watchedAt).slice(0, 4)); if (y >= 1900) counts.set(y, (counts.get(y) || 0) + 1); }
    const ys = [...counts.keys()].sort((a, b) => a - b);
    const from = ys.length ? Math.max(ys[0], (ys.at(-1) as number) - 11) : current; // up to 12 bars
    const to = ys.length ? (ys.at(-1) as number) : current;
    buckets = [];
    for (let y = from; y <= to; y++) buckets.push({ key: String(y), label: String(y), count: counts.get(y) || 0 });
    // Older years beyond the 12 shown fold into the first bar's count so totals still add up.
    const older = ys.filter((y) => y < from).reduce((n, y) => n + (counts.get(y) || 0), 0);
    if (older && buckets[0]) { buckets[0].count += older; buckets[0].label = `≤${buckets[0].label}`; }
  } else {
    const months = new Array(12).fill(0) as number[];
    for (const t of titles) { const m = Number(String(t.watchedAt).slice(5, 7)); if (m >= 1 && m <= 12) months[m - 1]++; }
    buckets = months.map((count, i) => ({ key: `${period}-${String(i + 1).padStart(2, '0')}`, label: MONTHS_SHORT[i], count }));
  }

  // Activity by day uses every viewing (rewatches and episodes too), not just first watches.
  const activityDates = [...inScope.map((w) => day(w.watchedAt)), ...epScope.map((e) => day(e.watchedAt))];
  const perDay = new Map<string, number>();
  for (const d of activityDates) bump(perDay, d);
  const busiest = [...perDay.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];

  const average = ratingCount ? Math.round((ratingSum / ratingCount) * 100) / 100 : null;
  const diaryEntries = inScope.filter((w) => w.rewatch !== undefined).length;
  const topRated = titles
    .filter((t): t is StatsWatch & { rating: number } => typeof t.rating === 'number')
    .sort((a, b) => b.rating - a.rating || String(b.watchedAt).localeCompare(String(a.watchedAt)))
    .slice(0, 6)
    .map((t) => ({ titleId: t.titleId, title: t.title, poster: t.poster, rating: t.rating }));
  // Only people who appear more than once say anything about taste (unless the log is tiny).
  const people = (map: Map<string, number>) => { const list = topN(map, 5); return titles.length >= 4 ? list.filter((p) => p.count > 1) : list; };

  return {
    period,
    hasData: titles.length > 0 || epScope.length > 0,
    availableYears: [...years].sort((a, b) => b - a),
    titlesLogged: titles.length,
    filmsLogged: films,
    seriesLogged: titles.length - films,
    episodesWatched: epScope.length,
    diaryEntries,
    rewatches: inScope.filter((w) => w.rewatch === true).length,
    hoursWatched: Math.round((minutes / 60) * 10) / 10,
    timeline: { granularity: period === 'all' ? 'year' : 'month', buckets },
    topGenres: topN(genres, 8),
    ratingHistogram: histogram.map((count, i) => ({ stars: (i + 1) / 2, count })),
    ratings: { count: ratingCount, average, style: ratingStyle(average, ratingCount) },
    longestStreak: longestStreak(activityDates),
    busiestDay: busiest && busiest[1] > 1 ? { date: busiest[0], count: busiest[1] } : null,
    topDirectors: people(directors),
    topActors: people(actors),
    topRated,
  };
}

function parseJson(json: unknown): Record<string, any> {
  try { return typeof json === 'string' ? JSON.parse(json) : json && typeof json === 'object' ? (json as Record<string, any>) : {}; } catch { return {}; }
}

export function toStatsWatch(titleId: string, json: unknown, rating: unknown, watchedAt: unknown, rewatch?: boolean): StatsWatch {
  const t = parseJson(json);
  const r = rating === null || rating === undefined || rating === '' ? null : Number(rating);
  return {
    titleId: String(titleId),
    title: typeof t.title === 'string' && t.title ? t.title : String(titleId),
    poster: typeof t.poster === 'string' ? t.poster : null,
    mediaType: t.mediaType === 'tv' ? 'tv' : 'movie',
    genres: Array.isArray(t.genres) ? t.genres.filter((g: unknown): g is string => typeof g === 'string') : [],
    releaseDate: typeof t.releaseDate === 'string' ? t.releaseDate : null,
    runtime: typeof t.runtime === 'number' ? t.runtime : null,
    rating: r !== null && Number.isFinite(r) ? r : null,
    watchedAt: String(watchedAt ?? ''),
    director: typeof t.director === 'string' && t.director.trim() ? t.director.trim() : null,
    cast: Array.isArray(t.cast) ? t.cast.map((c: any) => (typeof c?.name === 'string' ? c.name.trim() : '')).filter(Boolean) : [],
    rewatch,
  };
}

export async function getStats(userId: string, period: StatsPeriod, now = new Date()): Promise<StatsSummary> {
  const d = db();
  const safe = async (fn: () => Promise<any[]>): Promise<any[]> => { try { return await fn(); } catch { return []; } };
  // A member's own rows only; small enough to aggregate in memory, and one query path serves
  // every period (and the list of years that have data).
  const [diaryRows, libraryRows, episodeRows] = await Promise.all([
    safe(() => d.all<any>('SELECT title_id, title_json, rating, watched_on, rewatch FROM diary_entries WHERE user_id = ?', userId)),
    // Every library row: "watched" ones are logged titles; any row can carry a series' runtime.
    safe(() => d.all<any>('SELECT title_id, title_json, status, rating, updated_at FROM library WHERE user_id = ?', userId)),
    safe(() => d.all<any>('SELECT title_id, watched_at FROM episode_progress WHERE user_id = ?', userId)),
  ]) as [any[], any[], any[]];

  const diaryIds = new Set(diaryRows.map((r) => String(r.title_id)));
  const libraryById = new Map(libraryRows.map((r) => [String(r.title_id), r]));
  const logged: StatsWatch[] = [
    ...diaryRows.map((r) => {
      const w = toStatsWatch(r.title_id, r.title_json, r.rating, r.watched_on, Number(r.rewatch) === 1);
      // The library holds the current rating when a diary entry was logged without one.
      if (w.rating === null) { const lib = libraryById.get(w.titleId); if (lib?.rating !== null && lib?.rating !== undefined) w.rating = Number(lib.rating); }
      return w;
    }),
    // Library "watched" counts only for titles that were never logged in the diary.
    ...libraryRows
      .filter((r) => r.status === 'watched' && !diaryIds.has(String(r.title_id)))
      .map((r) => toStatsWatch(r.title_id, r.title_json, r.rating, r.updated_at)),
  ];

  const episodes: EpisodeWatch[] = episodeRows.map((r) => {
    const series = parseJson(libraryById.get(String(r.title_id))?.title_json);
    return { titleId: String(r.title_id), watchedAt: String(r.watched_at), runtime: typeof series.runtime === 'number' ? series.runtime : null };
  });
  return summarizeStats(period, logged, episodes, now);
}
