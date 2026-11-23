/**
 * Turns the CSV files inside a Letterboxd export ZIP into import actions. Runs in the browser
 * (the ZIP never has to be uploaded whole) and in tests. Pure: no network, no database.
 */
import { parseCsvObjects } from './csv';

/** Films per /api/import/letterboxd/match request, and titles per /commit request. */
export const MATCH_BATCH = 25;
export const COMMIT_BATCH = 40;

export type ImportKind = 'diary' | 'rating' | 'watched' | 'watchlist' | 'like' | 'review';

export interface ImportAction {
  kind: ImportKind;
  /** Film key: `${name}|${year}` — what gets matched to a catalogue title. */
  film: string;
  name: string;
  year: number | null;
  watchedOn?: string;
  rating?: number | null;
  rewatch?: boolean;
  tags?: string[];
  review?: string;
}

export interface ParsedExport {
  actions: ImportAction[];
  films: { key: string; name: string; year: number | null }[];
  counts: Record<ImportKind, number>;
  unrecognisedFiles: string[];
}

const year = (v: string | undefined) => (v && /^\d{4}$/.test(v) ? Number(v) : null);
const rating = (v: string | undefined) => {
  const n = Number(v);
  return v && Number.isFinite(n) && n >= 0.5 && n <= 5 && n * 2 === Math.round(n * 2) ? n : null;
};
const date = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const tags = (v: string | undefined) => (v ? v.split(',').map((t) => t.trim()).filter(Boolean) : []);

/** files: path inside the ZIP → file text. Paths may include a top-level folder. */
export function parseLetterboxdExport(files: Record<string, string>): ParsedExport {
  const actions: ImportAction[] = [];
  const unrecognisedFiles: string[] = [];
  // Keep the parent folder only for likes/films.csv (likes/lists.csv etc. are different data).
  const base = (p: string) => {
    const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
    const last = parts.at(-1) ?? '';
    return parts.at(-2) === 'likes' ? `likes/${last}` : last;
  };
  const byName: Record<string, string> = {};
  for (const [path, text] of Object.entries(files)) byName[base(path).toLowerCase()] = text;

  const push = (kind: ImportKind, r: Record<string, string>, extra: Partial<ImportAction> = {}) => {
    const name = r.Name?.trim();
    if (!name) return;
    const y = year(r.Year);
    actions.push({ kind, film: `${name}|${y ?? ''}`, name, year: y, ...extra });
  };

  // reviews.csv rows also appear in diary.csv; index them to attach the text to the diary entry.
  const reviewText = new Map<string, string>();
  for (const r of parseCsvObjects(byName['reviews.csv'] ?? '')) {
    if (r.Review) reviewText.set(`${r.Name}|${r.Year}|${r['Watched Date'] || r.Date}`, r.Review);
  }
  const usedReviews = new Set<string>();
  for (const r of parseCsvObjects(byName['diary.csv'] ?? '')) {
    const watchedOn = date(r['Watched Date']) ?? date(r.Date);
    const key = `${r.Name}|${r.Year}|${watchedOn}`;
    const review = reviewText.get(key);
    if (review) usedReviews.add(key);
    push('diary', r, { watchedOn, rating: rating(r.Rating), rewatch: /^yes$/i.test(r.Rewatch || ''), tags: tags(r.Tags), review });
  }
  for (const [key, text] of reviewText) {
    if (usedReviews.has(key)) continue;
    const [name, y] = key.split('|');
    push('review', { Name: name, Year: y }, { review: text });
  }
  for (const r of parseCsvObjects(byName['ratings.csv'] ?? '')) push('rating', r, { rating: rating(r.Rating) });
  for (const r of parseCsvObjects(byName['watched.csv'] ?? '')) push('watched', r);
  for (const r of parseCsvObjects(byName['watchlist.csv'] ?? '')) push('watchlist', r);
  for (const r of parseCsvObjects(byName['likes/films.csv'] ?? '')) push('like', r);

  const known = new Set(['diary.csv', 'reviews.csv', 'ratings.csv', 'watched.csv', 'watchlist.csv', 'likes/films.csv']);
  const accountMeta = new Set(['profile.csv']); // account settings, not film data
  for (const p of Object.keys(byName)) if (p.endsWith('.csv') && !known.has(p) && !accountMeta.has(p)) unrecognisedFiles.push(p);

  const films = new Map<string, { key: string; name: string; year: number | null }>();
  for (const a of actions) if (!films.has(a.film)) films.set(a.film, { key: a.film, name: a.name, year: a.year });
  const counts = { diary: 0, rating: 0, watched: 0, watchlist: 0, like: 0, review: 0 } as Record<ImportKind, number>;
  for (const a of actions) counts[a.kind]++;
  return { actions, films: [...films.values()], counts, unrecognisedFiles };
}
