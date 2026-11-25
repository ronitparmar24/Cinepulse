/**
 * Diary: a dated log of every viewing (Letterboxd's diary). Logging a film also marks it
 * watched in the library (with the latest rating), so the two stay in step.
 */
import { randomUUID } from 'node:crypto';
import { db, now } from './db';
import { bad, notFound } from './errors';
import { titleById } from './catalog';
import { isReleased } from './eligibility';
import { parseRating } from './rating';
import type { Title, User } from './types';

export interface DiaryEntry {
  id: string;
  titleId: string;
  title: Pick<Title, 'id' | 'title' | 'poster' | 'releaseDate' | 'mediaType'> | null;
  watchedOn: string;
  rating: number | null;
  rewatch: boolean;
  liked: boolean;
  tags: string[];
  note: string | null;
  createdAt: string;
}

export interface DiaryInput {
  watchedOn?: unknown;
  rating?: unknown;
  rewatch?: unknown;
  liked?: unknown;
  tags?: unknown;
  note?: unknown;
}

const today = () => new Date().toISOString().slice(0, 10);

export function parseWatchedOn(value: unknown): string {
  if (value === undefined || value === null || value === '') return today();
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw bad('watchedOn must be a date like 2026-11-17');
  }
  if (value > today()) throw bad('You cannot log a viewing in the future');
  if (value < '1888-01-01') throw bad('watchedOn is too early');
  return value;
}

export function parseTags(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : null;
  if (!list) throw bad('tags must be a list');
  const tags = [...new Set(list.map((t) => String(t).trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean))];
  if (tags.length > 20 || tags.some((t) => t.length > 40 || t.includes(','))) throw bad('Up to 20 tags of 40 characters, no commas');
  return tags;
}

function rowToEntry(r: Record<string, unknown>): DiaryEntry {
  let t: DiaryEntry['title'] = null;
  try {
    const parsed = r.title_json ? JSON.parse(String(r.title_json)) : null;
    if (parsed) t = { id: parsed.id ?? r.title_id, title: parsed.title, poster: parsed.poster ?? null, releaseDate: parsed.releaseDate ?? null, mediaType: parsed.mediaType ?? 'movie' };
  } catch { /* keep null */ }
  return {
    id: String(r.id),
    titleId: String(r.title_id),
    title: t,
    watchedOn: String(r.watched_on),
    rating: r.rating === null || r.rating === undefined ? null : Number(r.rating),
    rewatch: Number(r.rewatch) === 1,
    liked: Number(r.liked) === 1,
    tags: r.tags ? String(r.tags).split(',').filter(Boolean) : [],
    note: r.note ? String(r.note) : null,
    createdAt: String(r.created_at),
  };
}

export async function logDiary(user: User, titleId: string, input: DiaryInput): Promise<DiaryEntry> {
  const title = await titleById(titleId);
  if (!isReleased(title.releaseDate)) throw bad(`An unreleased ${title.mediaType} cannot be logged as watched`);
  const watchedOn = parseWatchedOn(input.watchedOn);
  const rating = parseRating(input.rating);
  const tags = parseTags(input.tags);
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 2000) : null;
  const d = db();
  const id = randomUUID();
  const stamp = now();
  // A first viewing unless the user has already logged or marked this title watched.
  const seen = await d.get('SELECT 1 FROM diary_entries WHERE user_id = ? AND title_id = ?', user.id, title.id);
  const rewatch = input.rewatch === undefined ? Boolean(seen) : Boolean(input.rewatch);
  const liked = Boolean(input.liked);
  const snapshot = JSON.stringify(title);
  await d.transaction(async () => {
    await d.run(
      `INSERT INTO diary_entries (id, user_id, title_id, title_json, watched_on, rating, rewatch, liked, tags, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, user.id, title.id, snapshot, watchedOn, rating, rewatch ? 1 : 0, liked ? 1 : 0, tags.join(',') || null, note, stamp, stamp,
    );
    await d.run(
      `INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at) VALUES (?, ?, ?, 'watched', ?, ?)
       ON CONFLICT (user_id, title_id) DO UPDATE SET status = 'watched', title_json = excluded.title_json,
         rating = COALESCE(excluded.rating, library.rating), updated_at = excluded.updated_at`,
      user.id, title.id, snapshot, rating, stamp,
    );
    if (liked) await d.run(`INSERT INTO likes (user_id, target_type, target_id, created_at) VALUES (?, 'title', ?, ?) ON CONFLICT DO NOTHING`, user.id, title.id, stamp);
  });
  try {
    const { logActivityEvent } = await import('./social/activity');
    await logActivityEvent(user.id, 'watched', 'title', title.id, { titleName: title.title, poster: title.poster, rating, rewatch });
  } catch { /* the feed is best-effort */ }
  await (await import('./goals')).checkMilestones(user.id);
  return rowToEntry({ id, title_id: title.id, title_json: snapshot, watched_on: watchedOn, rating, rewatch: rewatch ? 1 : 0, liked: liked ? 1 : 0, tags: tags.join(','), note, created_at: stamp });
}

export async function updateDiary(user: User, entryId: string, input: DiaryInput): Promise<DiaryEntry> {
  const d = db();
  const row = await d.get<Record<string, unknown>>('SELECT * FROM diary_entries WHERE id = ? AND user_id = ?', entryId, user.id);
  if (!row) throw notFound('Diary entry not found');
  const next = {
    watched_on: input.watchedOn !== undefined ? parseWatchedOn(input.watchedOn) : row.watched_on,
    rating: input.rating !== undefined ? parseRating(input.rating) : row.rating,
    rewatch: input.rewatch !== undefined ? (input.rewatch ? 1 : 0) : row.rewatch,
    liked: input.liked !== undefined ? (input.liked ? 1 : 0) : row.liked,
    tags: input.tags !== undefined ? parseTags(input.tags).join(',') || null : row.tags,
    note: input.note !== undefined ? (typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 2000) : null) : row.note,
  };
  await d.run(
    'UPDATE diary_entries SET watched_on = ?, rating = ?, rewatch = ?, liked = ?, tags = ?, note = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    next.watched_on, next.rating, next.rewatch, next.liked, next.tags, next.note, now(), entryId, user.id,
  );
  return rowToEntry({ ...row, ...next });
}

export async function deleteDiary(user: User, entryId: string): Promise<void> {
  const res = await db().run('DELETE FROM diary_entries WHERE id = ? AND user_id = ?', entryId, user.id);
  if (!res.changes) throw notFound('Diary entry not found');
}

/** Newest viewings first. Cursor = "<watched_on>|<created_at>|<id>" from the previous page. */
export async function listDiary(userId: string, limit = 30, cursor?: string | null): Promise<{ items: DiaryEntry[]; nextCursor: string | null }> {
  const safe = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const params: unknown[] = [userId];
  let where = '';
  if (cursor) {
    const [w, c, i] = cursor.split('|');
    if (w && c && i) {
      where = 'AND (watched_on < ? OR (watched_on = ? AND (created_at < ? OR (created_at = ? AND id < ?))))';
      params.push(w, w, c, c, i);
    }
  }
  const rows = await db().all<Record<string, unknown>>(
    `SELECT * FROM diary_entries WHERE user_id = ? ${where} ORDER BY watched_on DESC, created_at DESC, id DESC LIMIT ?`,
    ...params, safe + 1,
  );
  const page = rows.slice(0, safe).map(rowToEntry);
  const last = page.at(-1);
  return { items: page, nextCursor: rows.length > safe && last ? `${last.watchedOn}|${last.createdAt}|${last.id}` : null };
}
