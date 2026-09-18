import { randomUUID } from 'node:crypto';
import type { Review, User } from './types';
import { db, now } from './db';
import { bad, notFound } from './errors';
import { titleById } from './catalog';
import { isReleased } from './eligibility';
import { isSupabaseConfigured, supabaseAdmin } from './supabase';

function mapped(row:any): Review {
  const profileName = row.profiles?.name || row.name || 'Anonymous Cinephile';
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
    createdAt: row.created_at
  };
}

const reviewSelect = `SELECT r.*,u.name FROM reviews r JOIN users u ON u.id=r.user_id`;

export async function community(): Promise<Review[]> {
  if (isSupabaseConfigured()) {
    const admin = supabaseAdmin();
    if (admin) {
      const { data, error } = await admin
        .from('reviews')
        .select('id, user_id, title_id, title_name, body, rating, spoiler, kind, created_at, profiles(name)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error && data) {
        return data.map(mapped);
      }
    }
  }
  return (db().prepare(`${reviewSelect} ORDER BY r.created_at DESC LIMIT 50`).all() as any[]).map(mapped);
}

export async function titleReviews(titleId:string): Promise<Review[]> {
  if (isSupabaseConfigured()) {
    const admin = supabaseAdmin();
    if (admin) {
      const { data, error } = await admin
        .from('reviews')
        .select('id, user_id, title_id, title_name, body, rating, spoiler, kind, created_at, profiles(name)')
        .eq('title_id', titleId)
        .order('created_at', { ascending: false });
      if (!error && data) {
        return data.map(mapped);
      }
    }
  }
  return (db().prepare(`${reviewSelect} WHERE r.title_id=? ORDER BY r.created_at DESC`).all(titleId) as any[]).map(mapped);
}

export async function putReview(user: User, titleId: string, input: any): Promise<void> {
  if (typeof input?.body !== 'string' || input.body.trim().length < 1 || input.body.length > 5000) throw bad('Review body is invalid');
  const spoiler=input?.spoiler; if (typeof spoiler !== 'boolean') throw bad('Spoiler flag is invalid');
  let rating:null|number=null; if (input?.rating !== undefined && input?.rating !== null) { if (!Number.isInteger(input.rating)||input.rating<1||input.rating>5) throw bad('Rating is invalid'); rating=input.rating; }
  const title=await titleById(titleId); const released=isReleased(title.releaseDate);
  if (rating !== null && !released) throw bad('A title cannot be rated before release');
  const kind=released ? 'review' : 'first-impression';
  const normalizedBody=input.body.trim().replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n');
  const stamp=now();

  if (isSupabaseConfigured()) {
    const admin = supabaseAdmin();
    if (admin) {
      const { error } = await admin.from('reviews').upsert({
        user_id: user.id,
        title_id: title.id,
        title_name: title.title,
        body: normalizedBody,
        rating,
        spoiler,
        kind,
        created_at: stamp,
      }, { onConflict: 'user_id,title_id' });
      if (error) throw bad(error.message);
      return;
    }
  }

  db().prepare(`INSERT INTO reviews(id,user_id,title_id,title_name,body,rating,spoiler,kind,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,title_id) DO UPDATE SET title_name=excluded.title_name,body=excluded.body,rating=excluded.rating,spoiler=excluded.spoiler,kind=excluded.kind,created_at=excluded.created_at`).run(randomUUID(),user.id,title.id,title.title,normalizedBody, rating, spoiler?1:0,kind,stamp);

  try {
    const { logActivityEvent } = await import('./social/activity');
    logActivityEvent(user.id, 'reviewed', 'title', title.id, {
      titleName: title.title,
      poster: title.poster,
      rating,
      spoiler,
      reviewBody: normalizedBody,
      kind,
    });
  } catch {}
}

export async function deleteReview(user: User, titleId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const admin = supabaseAdmin();
    if (admin) {
      const { error, count } = await admin
        .from('reviews')
        .delete({ count: 'exact' })
        .eq('user_id', user.id)
        .eq('title_id', titleId);
      if (error) throw bad(error.message);
      if (count === 0) throw notFound('Review not found');
      return;
    }
  }
  const result=db().prepare('DELETE FROM reviews WHERE user_id=? AND title_id=?').run(user.id,titleId) as any;
  if (!result.changes) throw notFound('Review not found');
}
