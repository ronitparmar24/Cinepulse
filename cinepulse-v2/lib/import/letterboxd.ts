/**
 * Letterboxd import (server side): match exported films to catalogue titles, then write the
 * viewings, ratings, watchlist, likes and reviews. The import only fills gaps — it never
 * overwrites a rating or review the user already has here, and skips diary entries already
 * logged for that film on that date — so running the same export twice changes nothing.
 */
import { randomUUID } from 'node:crypto';
import { db, now } from '../db';
import { bad } from '../errors';
import { catalog, titleById } from '../catalog';
import { isReleased } from '../eligibility';
import { parseRating } from '../rating';
import { parseTags } from '../diary';
import { toCsv } from './csv';
import { COMMIT_BATCH, MATCH_BATCH, type ImportKind } from './letterboxd-parse';
import type { Title, User } from '../types';

export { COMMIT_BATCH, MATCH_BATCH };

export interface FilmQuery { key: string; name: string; year: number | null }
export interface FilmMatch {
  key: string;
  match: { titleId: string; title: string; year: number | null; poster: string | null; confidence: 'exact' | 'likely' } | null;
}

export function normaliseTitle(s: string): string {
  return s
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(the|a|an) /, '')
    .trim();
}

const yearOf = (t: Pick<Title, 'releaseDate'>) => (t.releaseDate ? Number(t.releaseDate.slice(0, 4)) : null);

/** Best catalogue candidate for a Letterboxd film: same title and year; else same title ±1 year;
 *  else the provider's top result with the same year (flagged as a guess for the user to confirm). */
export function pickMatch(candidates: Title[], name: string, year: number | null): FilmMatch['match'] {
  const want = normaliseTitle(name);
  const sameTitle = candidates.filter((c) => normaliseTitle(c.title) === want);
  const exact = sameTitle.find((c) => year === null || yearOf(c) === year);
  const near = year === null ? undefined : sameTitle.find((c) => { const y = yearOf(c); return y !== null && Math.abs(y - year) <= 1; });
  const guess = year === null ? undefined : candidates.find((c) => yearOf(c) === year);
  const pick = exact ?? near ?? guess;
  if (!pick) return null;
  return { titleId: pick.id, title: pick.title, year: yearOf(pick), poster: pick.poster, confidence: exact || near ? 'exact' : 'likely' };
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

export function parseFilmQueries(value: unknown): FilmQuery[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MATCH_BATCH) throw bad(`films must be a list of 1–${MATCH_BATCH} films`);
  return value.map((f: any) => {
    if (!f || typeof f.name !== 'string' || !f.name.trim() || f.name.length > 300 || typeof f.key !== 'string' || f.key.length > 320) throw bad('Each film needs a key and a name');
    const year = f.year === null || f.year === undefined ? null : Number(f.year);
    if (year !== null && (!Number.isInteger(year) || year < 1870 || year > 2100)) throw bad('Film year is invalid');
    return { key: f.key, name: f.name.trim(), year };
  });
}

export async function matchFilms(films: FilmQuery[]): Promise<FilmMatch[]> {
  return pool(films, 5, async (f) => {
    try {
      const res = await catalog({ media: 'movie', collection: 'trending', search: f.name, page: 1 });
      return { key: f.key, match: pickMatch(res.items ?? [], f.name, f.year) };
    } catch {
      return { key: f.key, match: null };
    }
  });
}

export interface CommitAction { kind: ImportKind; watchedOn?: string; rating?: number | null; rewatch?: boolean; tags?: string[]; review?: string }
export interface CommitItem { titleId: string; actions: CommitAction[] }
export interface CommitResult {
  diaryAdded: number; diarySkipped: number; watched: number; watchlisted: number;
  rated: number; liked: number; reviews: number; skippedTitles: { titleId: string; reason: string }[];
}

const KINDS = new Set<ImportKind>(['diary', 'rating', 'watched', 'watchlist', 'like', 'review']);

export function parseCommitItems(value: unknown): CommitItem[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > COMMIT_BATCH) throw bad(`items must be a list of 1–${COMMIT_BATCH} titles`);
  return value.map((it: any) => {
    if (!it || typeof it.titleId !== 'string' || !Array.isArray(it.actions) || it.actions.length === 0 || it.actions.length > 200) throw bad('Each item needs a titleId and actions');
    const actions = it.actions.map((a: any): CommitAction => {
      if (!a || !KINDS.has(a.kind)) throw bad('Unknown import action');
      const watchedOn = typeof a.watchedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.watchedOn) && a.watchedOn >= '1888-01-01' && a.watchedOn <= new Date().toISOString().slice(0, 10) ? a.watchedOn : undefined;
      let rating: number | null = null;
      try { rating = parseRating(a.rating); } catch { rating = null; }
      let tags: string[] = [];
      try { tags = parseTags(Array.isArray(a.tags) ? a.tags.slice(0, 20) : undefined); } catch { tags = []; }
      const review = typeof a.review === 'string' && a.review.trim() ? a.review.trim().slice(0, 5000) : undefined;
      return { kind: a.kind, watchedOn, rating, rewatch: a.rewatch === true, tags, review };
    });
    if (actions.some((a: CommitAction) => a.kind === 'diary' && !a.watchedOn)) throw bad('Diary entries need a valid watched date');
    return { titleId: it.titleId, actions };
  });
}

export async function commitImport(user: User, items: CommitItem[]): Promise<CommitResult> {
  const result: CommitResult = { diaryAdded: 0, diarySkipped: 0, watched: 0, watchlisted: 0, rated: 0, liked: 0, reviews: 0, skippedTitles: [] };
  // Catalogue lookups (network) happen before the transaction.
  const titles = await pool(items, 5, async (it) => {
    try { return await titleById(it.titleId); } catch { return null; }
  });
  const d = db();
  await d.transaction(async () => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const title = titles[i];
      if (!title) { result.skippedTitles.push({ titleId: item.titleId, reason: 'Title not found' }); continue; }
      const released = isReleased(title.releaseDate);
      const snapshot = JSON.stringify(title);
      const stamp = now();
      const diary = item.actions.filter((a) => a.kind === 'diary').sort((a, b) => String(a.watchedOn).localeCompare(String(b.watchedOn)));
      const seenWatch = diary.length > 0 || item.actions.some((a) => a.kind === 'watched' || a.kind === 'rating' || a.kind === 'review');

      if (!released && seenWatch) {
        // Letterboxd allows logging festival screenings before release; CinePulse does not.
        if (item.actions.some((a) => a.kind === 'watchlist')) {
          const r = await d.run(`INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at) VALUES (?, ?, ?, 'watchlist', NULL, ?) ON CONFLICT DO NOTHING`, user.id, title.id, snapshot, stamp);
          result.watchlisted += r.changes ? 1 : 0;
        }
        result.skippedTitles.push({ titleId: title.id, reason: 'Not released yet, so it cannot be marked watched' });
        continue;
      }

      // Diary entries, skipping any already logged on the same date.
      const have = new Set(((await d.all<{ watched_on: string }>('SELECT watched_on FROM diary_entries WHERE user_id = ? AND title_id = ?', user.id, title.id)) ?? []).map((r) => r.watched_on));
      for (const a of diary) {
        if (have.has(a.watchedOn!)) { result.diarySkipped++; continue; }
        have.add(a.watchedOn!);
        await d.run(
          `INSERT INTO diary_entries (id, user_id, title_id, title_json, watched_on, rating, rewatch, liked, tags, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
          randomUUID(), user.id, title.id, snapshot, a.watchedOn, a.rating ?? null, a.rewatch ? 1 : 0, a.tags?.join(',') || null, a.review ? a.review.slice(0, 2000) : null, stamp, stamp,
        );
        result.diaryAdded++;
      }

      // Library: watched (with the current rating) or watchlist. Existing ratings are kept.
      const currentRating = item.actions.find((a) => a.kind === 'rating' && a.rating != null)?.rating
        ?? [...diary].reverse().find((a) => a.rating != null)?.rating ?? null;
      if (seenWatch) {
        const before = await d.get<{ status: string; rating: number | null }>('SELECT status, rating FROM library WHERE user_id = ? AND title_id = ?', user.id, title.id);
        await d.run(
          `INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at) VALUES (?, ?, ?, 'watched', ?, ?)
           ON CONFLICT (user_id, title_id) DO UPDATE SET status = 'watched', rating = COALESCE(library.rating, excluded.rating), updated_at = excluded.updated_at`,
          user.id, title.id, snapshot, currentRating, stamp,
        );
        if (before?.status !== 'watched') result.watched++;
        if (currentRating != null && (before?.rating === null || before?.rating === undefined)) result.rated++;
      } else if (item.actions.some((a) => a.kind === 'watchlist')) {
        const r = await d.run(`INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at) VALUES (?, ?, ?, 'watchlist', NULL, ?) ON CONFLICT DO NOTHING`, user.id, title.id, snapshot, stamp);
        result.watchlisted += r.changes ? 1 : 0;
      }

      if (item.actions.some((a) => a.kind === 'like')) {
        const r = await d.run(`INSERT INTO likes (user_id, target_type, target_id, created_at) VALUES (?, 'title', ?, ?) ON CONFLICT DO NOTHING`, user.id, title.id, stamp);
        result.liked += r.changes ? 1 : 0;
      }

      // One review per title here: the most recent review text from the export, if none exists yet.
      const reviewed = [...diary].reverse().find((a) => a.review) ?? item.actions.find((a) => a.kind === 'review' && a.review);
      if (reviewed?.review) {
        const body = reviewed.review.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
        const r = await d.run(
          `INSERT INTO reviews (id, user_id, title_id, title_name, body, rating, spoiler, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, 'review', ?) ON CONFLICT DO NOTHING`,
          randomUUID(), user.id, title.id, title.title, body, reviewed.rating ?? currentRating, stamp,
        );
        result.reviews += r.changes ? 1 : 0;
      }
    }
  });
  return result;
}

/** The diary (plus watched titles never logged) in Letterboxd's import CSV format. */
export async function exportLetterboxdCsv(user: User): Promise<string> {
  const d = db();
  const rows: (string | number | null)[][] = [['Title', 'Year', 'tmdbID', 'WatchedDate', 'Rating', 'Tags', 'Review', 'Rewatch']];
  const tmdbId = (id: string) => (/^movie-\d+$/.test(id) ? id.slice(6) : '');
  const info = (json: unknown, id: string) => {
    try { const t = JSON.parse(String(json)); return { title: String(t.title ?? id), year: t.releaseDate ? String(t.releaseDate).slice(0, 4) : '', media: t.mediaType }; } catch { return { title: id, year: '', media: 'movie' }; }
  };
  const reviews = new Map(((await d.all<{ title_id: string; body: string }>('SELECT title_id, body FROM reviews WHERE user_id = ?', user.id)) ?? []).map((r) => [r.title_id, r.body]));
  const usedReview = new Set<string>();
  const diary = await d.all<Record<string, unknown>>('SELECT title_id, title_json, watched_on, rating, rewatch, tags, note FROM diary_entries WHERE user_id = ? ORDER BY watched_on, created_at', user.id);
  const logged = new Set<string>();
  // Attach the title's review to its most recent diary entry.
  const lastEntry = new Map<string, number>();
  diary.forEach((r, i) => lastEntry.set(String(r.title_id), i));
  diary.forEach((r, i) => {
    const id = String(r.title_id);
    const t = info(r.title_json, id);
    if (t.media === 'tv') return; // Letterboxd is films only
    logged.add(id);
    const review = lastEntry.get(id) === i ? reviews.get(id) ?? (r.note ? String(r.note) : '') : r.note ? String(r.note) : '';
    if (lastEntry.get(id) === i && reviews.has(id)) usedReview.add(id);
    rows.push([t.title, t.year, tmdbId(id), String(r.watched_on), r.rating == null ? '' : Number(r.rating), r.tags ? String(r.tags).split(',').join(', ') : '', review, Number(r.rewatch) === 1 ? 'Yes' : '']);
  });
  const lib = await d.all<Record<string, unknown>>(`SELECT title_id, title_json, rating FROM library WHERE user_id = ? AND status = 'watched' ORDER BY updated_at`, user.id);
  for (const r of lib) {
    const id = String(r.title_id);
    if (logged.has(id)) continue;
    const t = info(r.title_json, id);
    if (t.media === 'tv') continue;
    rows.push([t.title, t.year, tmdbId(id), '', r.rating == null ? '' : Number(r.rating), '', reviews.get(id) ?? '', '']);
  }
  return toCsv(rows);
}
