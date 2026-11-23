import type { LibraryEntry, User } from './types';
import { parseRating } from './rating';
import { db, now } from './db';
import { bad, notFound } from './errors';
import { titleById } from './catalog';
import { isReleased } from './eligibility';

function entry(row:any): LibraryEntry {
  const t = typeof row.title_json === 'string' ? JSON.parse(row.title_json) : row.title_json;
  return {
    title: t,
    status: row.status,
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    updatedAt: row.updated_at
  };
}

export async function listLibrary(user: User): Promise<LibraryEntry[]> {
  return ((await db().all('SELECT title_json,status,rating,updated_at FROM library WHERE user_id=? ORDER BY updated_at DESC', user.id)) as any[]).map(entry);
}

export async function putLibrary(user: User, titleId: string, input: any): Promise<void> {
  const status=input?.status; if (!['watchlist','watching','watched'].includes(status)) throw bad('Status is invalid');
  let rating: number|null = parseRating(input?.rating);
  const title=await titleById(titleId);
  const released = isReleased(title.releaseDate);
  if ((status==='watched' || status==='watching') && !released) throw bad(`An unreleased ${title.mediaType} cannot be marked watching or watched`);
  if (rating !== null && !released) throw bad(`An unreleased ${title.mediaType} cannot be rated`);
  if (status !== 'watched' && input?.rating === undefined) rating=null;


  (await db().run(`INSERT INTO library(user_id,title_id,title_json,status,rating,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,title_id) DO UPDATE SET title_json=excluded.title_json,status=excluded.status,rating=excluded.rating,updated_at=excluded.updated_at`, user.id,title.id,JSON.stringify(title),status,rating,now()));

  try {
    const { logActivityEvent } = await import('./social/activity');
    if (status === 'watched') {
      (await logActivityEvent(user.id, 'watched', 'title', title.id, { titleName: title.title, poster: title.poster, rating }));
    } else if (status === 'watchlist') {
      (await logActivityEvent(user.id, 'added_to_watchlist', 'title', title.id, { titleName: title.title, poster: title.poster }));
    }
    if (rating !== null) {
      (await logActivityEvent(user.id, 'rated', 'title', title.id, { titleName: title.title, poster: title.poster, rating }));
    }
  } catch {}
}

export async function deleteLibrary(user: User, titleId: string): Promise<void> {
  const result=(await db().run('DELETE FROM library WHERE user_id=? AND title_id=?', user.id,titleId)) as any;
  if (!result.changes) throw notFound('Library item not found');
}
