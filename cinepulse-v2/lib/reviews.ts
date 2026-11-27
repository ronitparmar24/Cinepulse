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
    username: row.username || null,
    likesCount: Number(row.likes_count || 0),
    commentsCount: Number(row.comments_count || 0),
    viewerLiked: Boolean(Number(row.viewer_liked || 0)),
  };
}

/** Reviews with their like and (visible) comment counts, and whether the viewer liked each one. */
const reviewSelect = `SELECT r.*, u.name, u.display_name, u.username, u.is_ai, u.is_seed, u.ai_persona_id,
  (SELECT COUNT(*) FROM likes lk WHERE lk.target_type='review' AND lk.target_id=r.id) AS likes_count,
  (SELECT COUNT(*) FROM comments c WHERE c.target_type='review' AND c.target_id=r.id AND c.deleted_at IS NULL AND c.hidden_at IS NULL) AS comments_count,
  (SELECT COUNT(*) FROM likes mine WHERE mine.target_type='review' AND mine.target_id=r.id AND mine.user_id=?) AS viewer_liked
  FROM reviews r JOIN users u ON u.id=r.user_id`;

export async function community(viewerId: string | null = null): Promise<Review[]> {
  return ((await db().all(`${reviewSelect} WHERE r.hidden_at IS NULL ORDER BY r.created_at DESC LIMIT 50`, viewerId ?? '')) as any[]).map(mapped);
}

export async function titleReviews(titleId:string, viewerId: string | null = null): Promise<Review[]> {
  return ((await db().all(`${reviewSelect} WHERE r.title_id=? AND r.hidden_at IS NULL ORDER BY r.created_at DESC`, viewerId ?? '', titleId)) as any[]).map(mapped);
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
  // Only a brand-new review tells followers; edits don't re-notify.
  const existed=Boolean(await db().get('SELECT 1 FROM reviews WHERE user_id=? AND title_id=?', user.id, title.id));

  (await db().run(`INSERT INTO reviews(id,user_id,title_id,title_name,body,rating,spoiler,kind,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,title_id) DO UPDATE SET title_name=excluded.title_name,body=excluded.body,rating=excluded.rating,spoiler=excluded.spoiler,kind=excluded.kind,created_at=excluded.created_at`, randomUUID(),user.id,title.id,title.title,normalizedBody, rating, spoiler?1:0,kind,stamp));

  if (!existed) {
    try { await notifyFollowersOfReview(user.id, title.id); } catch { /* never block saving a review */ }
  }

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

/**
 * Friend activity: people who follow the author hear about a new review — only when the author's
 * reviews are visible to followers and the review isn't hidden, and at most 300 followers per review.
 */
export async function notifyFollowersOfReview(authorId: string, titleId: string): Promise<number> {
  const d = db();
  const review = (await d.get('SELECT id, hidden_at FROM reviews WHERE user_id = ? AND title_id = ?', authorId, titleId)) as { id?: string; hidden_at?: string | null } | undefined;
  if (!review?.id || review.hidden_at) return 0;
  const { resolveVisibility } = await import('./social/visibility');
  const { createNotification } = await import('./social/notifications');
  const followers = (await d.all(
    `SELECT f.follower_id FROM follows f JOIN users u ON u.id = f.follower_id
     WHERE f.followee_id = ? AND f.status = 'accepted' AND COALESCE(u.is_ai, 0) = 0
     ORDER BY f.created_at DESC LIMIT 300`,
    authorId,
  )) as Array<{ follower_id: string }>;
  let sent = 0;
  for (const f of followers) {
    const allowed = await resolveVisibility(f.follower_id, authorId, 'reviews');
    if (!allowed.allowed) continue;
    if (await createNotification(f.follower_id, authorId, 'friend_review', 'review', String(review.id))) sent++;
  }
  return sent;
}
