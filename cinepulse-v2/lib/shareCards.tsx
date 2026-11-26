/**
 * Share images for reviews and "just watched" logs, in the formats social apps expect:
 *   story  1080×1920  (Instagram / WhatsApp / Snapchat stories)
 *   square 1080×1350  (Instagram feed, X, Threads)
 *   og     1200×630   (link previews for /r/:id)
 *
 * Who can see what follows the member's privacy settings: a review card or page is public only
 * when the author's reviews are public and the review isn't hidden by moderators. Spoiler reviews
 * never print their text on the image.
 */
import { ImageResponse } from 'next/og';
import { db } from './db';
import { notFound } from './errors';
import { loadFonts, posterData } from './ogAssets';
import { resolveVisibility } from './social/visibility';

export type CardFormat = 'story' | 'square' | 'og';
export const SIZES: Record<CardFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1350 },
  og: { width: 1200, height: 630 },
};
export function parseFormat(v: string | null): CardFormat {
  return v === 'square' || v === 'og' ? v : 'story';
}

export interface ShareSubject {
  kind: 'review' | 'watched';
  id: string;
  titleId: string;
  title: string;
  year: string | null;
  poster: string | null;
  backdrop: string | null;
  rating: number | null;
  body: string | null;
  spoiler: boolean;
  author: { name: string; username: string | null };
  date: string;
  /** True when anyone may see it (safe for a public CDN cache and a public link). */
  isPublic: boolean;
}

function parseTitle(json: string | null | undefined): { poster: string | null; backdrop: string | null; year: string | null } {
  try {
    const t = JSON.parse(json || '{}');
    return { poster: typeof t.poster === 'string' ? t.poster : null, backdrop: typeof t.backdrop === 'string' ? t.backdrop : null, year: typeof t.releaseDate === 'string' ? t.releaseDate.slice(0, 4) : null };
  } catch {
    return { poster: null, backdrop: null, year: null };
  }
}

/** A review as a share subject, or 404 when the viewer may not see it. */
export async function reviewSubject(reviewId: string, viewerId: string | null, loadTitle?: (id: string) => Promise<{ poster: string | null; backdrop: string | null; releaseDate: string | null }>): Promise<ShareSubject> {
  const row = (await db().get(
    `SELECT r.id, r.user_id, r.title_id, r.title_name, r.body, r.rating, r.spoiler, r.created_at, r.hidden_at,
            u.name, u.display_name, u.username, l.title_json
     FROM reviews r JOIN users u ON u.id = r.user_id
     LEFT JOIN library l ON l.user_id = r.user_id AND l.title_id = r.title_id
     WHERE r.id = ?`, reviewId,
  )) as any;
  if (!row) throw notFound('Review not found');
  const isOwner = viewerId === row.user_id;
  if (row.hidden_at && !isOwner) throw notFound('Review not found');
  const anonymous = await resolveVisibility(null, row.user_id, 'reviews');
  if (!isOwner) {
    const viewer = viewerId ? await resolveVisibility(viewerId, row.user_id, 'reviews') : anonymous;
    if (!viewer.allowed) throw notFound('Review not found');
  }
  let art = parseTitle(row.title_json);
  if (!art.poster && loadTitle) {
    const t = await loadTitle(row.title_id).catch(() => null);
    if (t) art = { poster: t.poster, backdrop: t.backdrop, year: t.releaseDate ? t.releaseDate.slice(0, 4) : null };
  }
  return {
    kind: 'review', id: row.id, titleId: row.title_id, title: row.title_name, ...art,
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    body: row.body, spoiler: Boolean(row.spoiler),
    author: { name: row.display_name || row.name || 'A CinePulse member', username: row.username ?? null },
    date: String(row.created_at), isPublic: anonymous.allowed && !row.hidden_at,
  };
}

/** Your own "just watched" card for a title in your library (never public). */
export async function watchedSubject(userId: string, titleId: string): Promise<ShareSubject> {
  const row = (await db().get(
    `SELECT l.title_id, l.title_json, l.rating, l.status, l.updated_at, u.name, u.display_name, u.username,
            (SELECT watched_on FROM diary_entries d WHERE d.user_id = l.user_id AND d.title_id = l.title_id ORDER BY watched_on DESC LIMIT 1) AS watched_on
     FROM library l JOIN users u ON u.id = l.user_id WHERE l.user_id = ? AND l.title_id = ?`, userId, titleId,
  )) as any;
  if (!row || row.status !== 'watched') throw notFound('Mark this title as watched first.');
  let t: any = {};
  try { t = JSON.parse(row.title_json || '{}'); } catch {}
  return {
    kind: 'watched', id: titleId, titleId, title: String(t.title || titleId), ...parseTitle(row.title_json),
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating), body: null, spoiler: false,
    author: { name: row.display_name || row.name || 'I', username: row.username ?? null },
    date: String(row.watched_on || row.updated_at), isPublic: false,
  };
}

function Stars({ rating, size }: { rating: number | null; size: number }) {
  if (rating === null) return null;
  const path = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';
  return (
    <div style={{ display: 'flex', gap: size * 0.18 }}>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = rating >= i + 1 ? 1 : rating >= i + 0.5 ? 0.5 : 0;
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24">
            <defs><linearGradient id={`g${i}`}><stop offset={`${fill * 100}%`} stopColor="#fbbf24" /><stop offset={`${fill * 100}%`} stopColor="rgba(255,255,255,0.18)" /></linearGradient></defs>
            <path d={path} fill={`url(#g${i})`} />
          </svg>
        );
      })}
    </div>
  );
}

function excerpt(body: string, max: number): string {
  const clean = body.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max).replace(/\s+\S*$/, '')}…` : clean;
}

const fmtDate = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export async function renderShareCard(s: ShareSubject, format: CardFormat, origin: string): Promise<Response> {
  const { width, height } = SIZES[format];
  const [fonts, poster, backdrop] = await Promise.all([
    loadFonts(),
    posterData(s.poster, format === 'og' ? 'w342' : 'w500'),
    posterData(s.backdrop, 'w780'),
  ]);
  const og = format === 'og';
  const posterW = og ? 300 : format === 'story' ? 560 : 360;
  const verb = s.kind === 'watched' ? 'watched' : s.body && s.rating === null ? 'reviewed' : 'reviewed';
  const quote = s.body && !s.spoiler ? excerpt(s.body, og ? 150 : format === 'story' ? 240 : 130) : null;
  const handle = s.author.username ? `@${s.author.username}` : s.author.name;
  const host = origin.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const headline = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: og ? 'flex-start' : 'center', textAlign: og ? 'left' : 'center', gap: og ? 10 : 18 }}>
      <span style={{ fontSize: og ? 24 : 32, color: '#b3f3d5', fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase' }}>{`${s.author.name} ${verb}`}</span>
      <span style={{ fontSize: og ? 54 : format === 'square' ? (s.title.length > 26 ? 52 : 64) : s.title.length > 26 ? 64 : 80, fontWeight: 800, lineHeight: 1.05, color: '#fff', letterSpacing: -2 }}>{s.title}</span>
      {s.year && <span style={{ fontSize: og ? 26 : 34, color: '#9db0a8' }}>{s.year}</span>}
      <Stars rating={s.rating} size={og ? 40 : 64} />
    </div>
  );
  const quoteBlock = s.spoiler ? (
    <span style={{ fontSize: og ? 24 : 34, color: '#fde68a', fontWeight: 800 }}>Contains spoilers — read it on CinePulse</span>
  ) : quote ? (
    <span style={{ fontSize: og ? 26 : format === 'story' ? 40 : 32, lineHeight: 1.4, color: '#e5ece9', fontWeight: 500, textAlign: og ? 'left' : 'center' }}>{`“${quote}”`}</span>
  ) : null;

  const brand = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        <div style={{ width: 10, height: 26, borderRadius: 5, background: '#b3f3d5' }} />
        <div style={{ width: 10, height: 38, borderRadius: 5, background: '#b3f3d5' }} />
        <div style={{ width: 10, height: 31, borderRadius: 5, background: '#b3f3d5' }} />
      </div>
      <span style={{ fontSize: og ? 30 : 40, fontWeight: 800, color: '#fff', letterSpacing: -1 }}>cinepulse</span>
      <span style={{ fontSize: og ? 30 : 40, fontWeight: 800, color: '#b3f3d5', marginLeft: -14 }}>.</span>
    </div>
  );

  const posterEl = (
    <div style={{ display: 'flex', width: posterW, height: posterW * 1.5, borderRadius: og ? 18 : 30, overflow: 'hidden', background: '#16211f', boxShadow: '0 40px 80px rgba(0,0,0,0.6)', border: '2px solid rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
      {poster ? <img src={poster} width={posterW} height={posterW * 1.5} style={{ objectFit: 'cover' }} alt="" /> : <span style={{ fontSize: 40, color: '#4b5b55', fontWeight: 800 }}>{s.title.slice(0, 18)}</span>}
    </div>
  );

  const bg = (
    <div style={{ position: 'absolute', top: 0, left: 0, width, height, display: 'flex' }}>
      {backdrop && <img src={backdrop} width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover', opacity: 0.3 }} alt="" />}
      <div style={{ position: 'absolute', top: 0, left: 0, width, height, display: 'flex', backgroundImage: 'linear-gradient(180deg, rgba(8,12,15,0.5) 0%, rgba(8,12,15,0.85) 45%, rgba(8,12,15,0.97) 70%, #080c0f 100%)' }} />
    </div>
  );

  const body = og ? (
    <div style={{ display: 'flex', width: '100%', height: '100%', padding: 56, gap: 48, alignItems: 'center' }}>
      {posterEl}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, flex: 1, minWidth: 0 }}>
        {brand}
        {headline}
        {quoteBlock}
      </div>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%', padding: format === 'story' ? '100px 80px 90px' : '56px 70px 50px', gap: format === 'story' ? 44 : 22 }}>
      {brand}
      {posterEl}
      {headline}
      {quoteBlock}
      <div style={{ display: 'flex', marginTop: 'auto', width: '100%', justifyContent: 'space-between', fontSize: 28, color: '#8fb3a5' }}>
        <span>{`${handle} · ${fmtDate(s.date)}`}</span>
        <span style={{ color: '#b3f3d5', fontWeight: 800 }}>{host}</span>
      </div>
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ position: 'relative', display: 'flex', width: '100%', height: '100%', background: '#080c0f', color: '#f4f6f5', fontFamily: fonts.length ? 'Manrope' : 'sans-serif', fontWeight: 500 }}>
        {bg}
        {body}
      </div>
    ),
    {
      width, height, fonts,
      // Public reviews are cached at the edge for a day (the URL carries a version that changes on edit);
      // private cards are never stored by shared caches.
      headers: { 'Cache-Control': s.isPublic ? 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' : 'private, no-store' },
    },
  );
}
