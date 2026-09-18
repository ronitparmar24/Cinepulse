import type { LibraryEntry, User } from './types';
import { db, now } from './db';
import { bad, notFound } from './errors';
import { titleById } from './catalog';
import { isReleased } from './eligibility';

function entry(row:any): LibraryEntry { return {title:JSON.parse(row.title_json),status:row.status,rating:row.rating===null?null:Number(row.rating),updatedAt:row.updated_at}; }
export function listLibrary(user: User): LibraryEntry[] { return (db().prepare('SELECT title_json,status,rating,updated_at FROM library WHERE user_id=? ORDER BY updated_at DESC').all(user.id) as any[]).map(entry); }
export async function putLibrary(user: User, titleId: string, input: any): Promise<void> {
  const status=input?.status; if (!['watchlist','watching','watched'].includes(status)) throw bad('Status is invalid');
  let rating: number|null = null; if (input?.rating !== undefined && input?.rating !== null) { if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw bad('Rating is invalid'); rating=input.rating; }
  const title=await titleById(titleId);
  const released = isReleased(title.releaseDate);
  if ((status==='watched' || status==='watching') && !released) throw bad(`An unreleased ${title.mediaType} cannot be marked watching or watched`);
  if (rating !== null && !released) throw bad(`An unreleased ${title.mediaType} cannot be rated`);
  if (status !== 'watched' && input?.rating === undefined) rating=null;
  db().prepare(`INSERT INTO library(user_id,title_id,title_json,status,rating,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,title_id) DO UPDATE SET title_json=excluded.title_json,status=excluded.status,rating=excluded.rating,updated_at=excluded.updated_at`).run(user.id,title.id,JSON.stringify(title),status,rating,now());
}
export function deleteLibrary(user: User,titleId:string): void { const result=db().prepare('DELETE FROM library WHERE user_id=? AND title_id=?').run(user.id,titleId) as any; if (!result.changes) throw notFound('Library item not found'); }
