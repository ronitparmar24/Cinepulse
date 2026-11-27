/**
 * IMDb exports (Your Ratings → Export, Your Watchlist → Export) turned into the same import
 * actions as a Letterboxd export, so matching and committing reuse one pipeline.
 * Pure: runs in the browser and in tests.
 *
 * IMDb ratings are 1–10; CinePulse uses ½–5 stars, so 7 → 3.5, 10 → 5, 1 → ½.
 */
import { parseCsvObjects } from './csv';
import type { ImportAction, ImportKind, ParsedExport } from './letterboxd-parse';

const TV_TYPES = new Set(['tvseries', 'tvminiseries', 'tv series', 'tv mini series', 'tvmovie', 'tv movie']);
const SKIP_TYPES = new Set(['tvepisode', 'tv episode', 'videogame', 'video game', 'podcastseries', 'podcastepisode']);

/** True when a CSV header row looks like an IMDb export (has Const and either Your Rating or Position). */
export function isImdbCsv(text: string): boolean {
  const header = text.slice(0, 600).split(/\r?\n/)[0]?.toLowerCase() ?? '';
  return header.includes('const') && (header.includes('your rating') || header.includes('position')) && header.includes('title');
}

const toStars = (v: string | undefined): number | null => {
  const n = Number(v);
  if (!v || !Number.isFinite(n) || n < 1 || n > 10) return null;
  return Math.max(0.5, Math.min(5, Math.round(n) / 2));
};
const year = (v: string | undefined) => (v && /^\d{4}$/.test(v.trim()) ? Number(v.trim()) : null);
const isoDate = (v: string | undefined) => {
  const s = v?.trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
};

/** files: file name → CSV text. Ratings files become rated + watched; watchlist files become watchlist. */
export function parseImdbExport(files: Record<string, string>): ParsedExport {
  const actions: ImportAction[] = [];
  const unrecognisedFiles: string[] = [];
  for (const [path, text] of Object.entries(files)) {
    if (!isImdbCsv(text)) { unrecognisedFiles.push(path); continue; }
    const rows = parseCsvObjects(text);
    const isWatchlist = rows.length > 0 && 'Position' in rows[0] && !rows.some((r) => r['Your Rating']?.trim());
    for (const r of rows) {
      const type = (r['Title Type'] || '').trim().toLowerCase();
      if (SKIP_TYPES.has(type)) continue;
      const name = (r.Title || r['Original Title'] || '').trim();
      if (!name) continue;
      const y = year(r.Year) ?? year((r['Release Date'] || '').slice(0, 4));
      const film = `${name}|${y ?? ''}`;
      const base = { film, name, year: y };
      const stars = toStars(r['Your Rating']);
      if (!isWatchlist && stars !== null) {
        actions.push({ kind: 'rating', ...base, rating: stars });
        actions.push({ kind: 'watched', ...base, watchedOn: isoDate(r['Date Rated']) });
      } else if (isWatchlist || 'Position' in r) {
        actions.push({ kind: 'watchlist', ...base });
      }
      void TV_TYPES; // series and films are matched the same way (by name + year)
    }
  }
  const films = new Map<string, { key: string; name: string; year: number | null }>();
  for (const a of actions) if (!films.has(a.film)) films.set(a.film, { key: a.film, name: a.name, year: a.year });
  const counts = { diary: 0, rating: 0, watched: 0, watchlist: 0, like: 0, review: 0 } as Record<ImportKind, number>;
  for (const a of actions) counts[a.kind]++;
  return { actions, films: [...films.values()], counts, unrecognisedFiles };
}
