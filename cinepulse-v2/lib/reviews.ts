import { randomUUID } from 'node:crypto';
import { parseRating } from './rating';
import type { Review, User } from './types';
import { db, now } from './db';
import { bad, notFound } from './errors';
import { titleById } from './catalog';
import { isReleased } from './eligibility';

function mapped(row:any): Review {
  const profileName = row.profiles?.name || row.display_name || row.name || 'Anonymous Cinephile';
  return {
    id: row.id,
    userId: row.user_id,
    name: profileName,
    titleId: row.title_id,
    titleName: row.title_name,
    body: row.body,
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    spoiler: Boolean(row.spoiler),
    kind: row.kind,
    createdAt: row.created_at,
    isAi: Boolean(row.is_ai),
    isSeed: Boolean(row.is_seed),
    aiPersonaId: row.ai_persona_id || undefined,
  };
}

const reviewSelect = `SELECT r.*, u.name, u.display_name, u.username, u.is_ai, u.is_seed, u.ai_persona_id FROM reviews r JOIN users u ON u.id=r.user_id`;

export async function community(): Promise<Review[]> {
  return ((await db().all(`${reviewSelect} WHERE r.hidden_at IS NULL ORDER BY r.created_at DESC LIMIT 50`)) as any[]).map(mapped);
}

export async function titleReviews(titleId:string): Promise<Review[]> {
  return ((await db().all(`${reviewSelect} WHERE r.title_id=? AND r.hidden_at IS NULL ORDER BY r.created_at DESC`, titleId)) as any[]).map(mapped);
}

export async function putReview(
  user: User,
  titleId: string,
  input: any,
  options?: { timestamp?: string }
): Promise<void> {
  if (typeof input?.body !== 'string' || input.body.trim().length < 1 || input.body.length > 5000) throw bad('Review body is invalid');
  const spoiler=input?.spoiler; if (typeof spoiler !== 'boolean') throw bad('Spoiler flag is invalid');
  let rating:null|number=parseRating(input?.rating);
  const title=await titleById(titleId); const released=isReleased(title.releaseDate);
  if (rating !== null && !released) throw bad('A title cannot be rated before release');
  const kind=released ? 'review' : 'first-impression';
  const normalizedBody=input.body.trim().replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n');
  const stamp=options?.timestamp || now();


  (await db().run(`INSERT INTO reviews(id,user_id,title_id,title_name,body,rating,spoiler,kind,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,title_id) DO UPDATE SET title_name=excluded.title_name,body=excluded.body,rating=excluded.rating,spoiler=excluded.spoiler,kind=excluded.kind,created_at=excluded.created_at`, randomUUID(),user.id,title.id,title.title,normalizedBody, rating, spoiler?1:0,kind,stamp));

  try {
    const { logActivityEvent } = await import('./social/activity');
    (await logActivityEvent(user.id, 'reviewed', 'title', title.id, {
      titleName: title.title,
      poster: title.poster,
      rating,
      spoiler,
      reviewBody: normalizedBody,
      kind,
    }, stamp));
  } catch {}
}

export async function deleteReview(user: User, titleId: string): Promise<void> {
  const result=(await db().run('DELETE FROM reviews WHERE user_id=? AND title_id=?', user.id,titleId)) as any;
  if (!result.changes) throw notFound('Review not found');
}
