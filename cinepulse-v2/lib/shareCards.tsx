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
import { avatarData, loadFonts, posterData } from './ogAssets';
import { resolveVisibility } from './social/visibility';
import { computeTopGenres, computeUserStats, getUserByUsername, resolveFavoriteTitles, showsPredictionSummary } from './social/profile';

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

function Stars({ rating, size, dim = 'rgba(255,255,255,0.18)' }: { rating: number | null; size: number; dim?: string }) {
  if (rating === null) return null;
  const path = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';
  return (
    <div style={{ display: 'flex', gap: size * 0.18 }}>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = rating >= i + 1 ? 1 : rating >= i + 0.5 ? 0.5 : 0;
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24">
            <defs><linearGradient id={`g${i}`}><stop offset={`${fill * 100}%`} stopColor="#fbbf24" /><stop offset={`${fill * 100}%`} stopColor={dim} /></linearGradient></defs>
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

const fmtTicketDate = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase();

/** Deterministic barcode bars from the title, so every ticket looks unique. */
function Barcode({ seed, height, bars }: { seed: string; height: number; bars: number }) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const widths: number[] = [];
  for (let i = 0; i < bars; i++) { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; widths.push(1 + (h % 4)); }
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height, gap: 3 }}>
      {widths.map((w, i) => <div key={i} style={{ width: w * 2, height, background: '#1b1b1b', opacity: i % 7 === 3 ? 0.35 : 1 }} />)}
    </div>
  );
}

/**
 * The card: a colour wash from the film's own poster, the poster tilted like a print on a table,
 * and a cream cinema-ticket stub with the title, stars, the take, who logged it and when.
 */
export async function renderShareCard(s: ShareSubject, format: CardFormat, origin: string): Promise<Response> {
  const { width, height } = SIZES[format];
  const og = format === 'og';
  const story = format === 'story';
  const [fonts, poster, wash] = await Promise.all([
    loadFonts(),
    posterData(s.poster, og ? 'w342' : 'w500'),
    // A 92px poster stretched over the whole card reads as a soft, blurred colour wash — cheap to fetch and to compress.
    posterData(s.poster, 'w92'),
  ]);
  const quote = s.body && !s.spoiler ? excerpt(s.body, og ? 120 : story ? 210 : 120) : null;
  const handle = s.author.username ? `@${s.author.username}` : s.author.name;
  const host = origin.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const label = s.kind === 'watched' ? 'JUST WATCHED' : 'MY REVIEW';
  const posterW = og ? 270 : story ? 560 : 400;
  const posterH = Math.round(posterW * 1.5);
  const ticketW = og ? 700 : story ? 920 : 940;
  const titleSize = og ? (s.title.length > 24 ? 44 : 54) : story ? (s.title.length > 30 ? 62 : s.title.length > 18 ? 76 : 92) : (s.title.length > 26 ? 52 : 64);
  const ink = '#141414';
  const cream = '#f6f1e7';
  const notch = og ? 22 : 30;

  const brand = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end' }}>
        <div style={{ width: 9, height: 24, borderRadius: 5, background: '#b3f3d5' }} />
        <div style={{ width: 9, height: 36, borderRadius: 5, background: '#b3f3d5' }} />
        <div style={{ width: 9, height: 29, borderRadius: 5, background: '#b3f3d5' }} />
      </div>
      <span style={{ fontSize: og ? 28 : 38, fontWeight: 800, color: '#fff', letterSpacing: -1 }}>cinepulse</span>
      <span style={{ fontSize: og ? 28 : 38, fontWeight: 800, color: '#b3f3d5', marginLeft: -12 }}>.</span>
    </div>
  );
  const pill = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: og ? '8px 16px' : '12px 24px', borderRadius: 999, background: 'rgba(255,255,255,0.14)', border: '2px solid rgba(255,255,255,0.28)' }}>
      <div style={{ width: og ? 10 : 14, height: og ? 10 : 14, borderRadius: 999, background: s.kind === 'watched' ? '#b3f3d5' : '#fbbf24' }} />
      <span style={{ fontSize: og ? 18 : 26, fontWeight: 800, letterSpacing: 4, color: '#fff' }}>{label}</span>
    </div>
  );

  const posterEl = (
    <div style={{ display: 'flex', transform: og ? 'rotate(-3deg)' : 'rotate(-4deg)', padding: og ? 8 : 12, background: '#fff', borderRadius: og ? 16 : 22, boxShadow: '0 50px 90px rgba(0,0,0,0.55), 0 12px 28px rgba(0,0,0,0.35)' }}>
      <div style={{ display: 'flex', width: posterW, height: posterH, borderRadius: og ? 10 : 14, overflow: 'hidden', background: '#1c2624', alignItems: 'center', justifyContent: 'center' }}>
        {poster
          ? <img src={poster} width={posterW} height={posterH} style={{ objectFit: 'cover' }} alt="" />
          : <span style={{ fontSize: og ? 30 : 46, color: '#9db0a8', fontWeight: 800, textAlign: 'center', padding: 30 }}>{s.title.slice(0, 40)}</span>}
      </div>
    </div>
  );

  const ticket = (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: ticketW, background: cream, borderRadius: og ? 22 : 30, padding: og ? '26px 34px 22px' : story ? '44px 56px 36px' : '34px 48px 28px', color: ink, boxShadow: '0 40px 80px rgba(0,0,0,0.45)' }}>
      {/* Punched notches on both sides, on the perforation line */}
      <div style={{ position: 'absolute', left: -notch, bottom: og ? 70 : story ? 104 : 86, width: notch * 2, height: notch * 2, borderRadius: 999, background: '#0b0f12' }} />
      <div style={{ position: 'absolute', right: -notch, bottom: og ? 70 : story ? 104 : 86, width: notch * 2, height: notch * 2, borderRadius: 999, background: '#0b0f12' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: og ? 16 : 22, fontWeight: 800, letterSpacing: 4, color: '#0f5132' }}>
        <span>ADMIT ONE</span>
        <span style={{ color: '#7a7466' }}>{s.year ? `${s.year}` : 'CINEPULSE'}</span>
      </div>
      <span style={{ marginTop: og ? 10 : 16, fontSize: titleSize, fontWeight: 800, lineHeight: 1.02, letterSpacing: og ? -1.5 : -2.5, color: ink }}>{s.title}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: og ? 12 : 18 }}>
        <Stars rating={s.rating} size={og ? 34 : story ? 58 : 48} dim="rgba(20,20,20,0.16)" />
        {s.rating !== null && <span style={{ fontSize: og ? 24 : 34, fontWeight: 800, color: ink }}>{`${s.rating}/5`}</span>}
      </div>
      {s.spoiler ? (
        <span style={{ marginTop: og ? 12 : 22, fontSize: og ? 20 : 30, fontWeight: 800, color: '#9a3412' }}>Spoilers inside — read it on CinePulse</span>
      ) : quote ? (
        <span style={{ marginTop: og ? 12 : 22, fontSize: og ? 21 : story ? 36 : 30, lineHeight: 1.38, fontWeight: 500, color: '#2b2b2b' }}>{`“${quote}”`}</span>
      ) : null}
      {/* Perforation */}
      <div style={{ display: 'flex', marginTop: og ? 18 : 30, marginBottom: og ? 14 : 22, borderTop: `${og ? 3 : 4}px dashed rgba(20,20,20,0.25)` }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: og ? 20 : 28, fontWeight: 800, color: ink }}>{handle}</span>
          <span style={{ fontSize: og ? 15 : 21, fontWeight: 800, letterSpacing: 3, color: '#7a7466' }}>{`${s.kind === 'watched' ? 'WATCHED' : 'REVIEWED'} ${fmtTicketDate(s.date)}`}</span>
        </div>
        <Barcode seed={`${s.titleId}${s.date}`} height={og ? 44 : 64} bars={og ? 22 : 30} />
      </div>
    </div>
  );

  const bg = (
    <div style={{ position: 'absolute', top: 0, left: 0, width, height, display: 'flex' }}>
      {wash && <img src={wash} width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover', opacity: 0.6 }} alt="" />}
      <div style={{ position: 'absolute', top: 0, left: 0, width, height, display: 'flex', backgroundImage: wash ? 'linear-gradient(180deg, rgba(8,12,15,0.35) 0%, rgba(8,12,15,0.55) 45%, rgba(8,12,15,0.88) 100%)' : 'radial-gradient(circle at 30% 20%, #1d4a3d 0%, #0b1013 60%)' }} />
    </div>
  );

  const footer = (
    <div style={{ display: 'flex', width: '100%', justifyContent: 'center', fontSize: og ? 20 : 26, fontWeight: 800, letterSpacing: 2, color: 'rgba(255,255,255,0.78)' }}>
      <span>{`LOG YOURS ON ${host.toUpperCase()}`}</span>
    </div>
  );

  const body = og ? (
    <div style={{ display: 'flex', width: '100%', height: '100%', padding: '44px 56px', gap: 50, alignItems: 'center' }}>
      {posterEl}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>{brand}{pill}</div>
        {ticket}
      </div>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%', padding: story ? '84px 70px 70px' : '48px 60px 44px' }}>
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>{brand}{pill}</div>
      <div style={{ display: 'flex', marginTop: story ? 90 : 40 }}>{posterEl}</div>
      <div style={{ display: 'flex', marginTop: story ? -60 : -46 }}>{ticket}</div>
      <div style={{ display: 'flex', marginTop: 'auto', width: '100%' }}>{footer}</div>
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ position: 'relative', display: 'flex', width: '100%', height: '100%', background: '#0b0f12', color: '#f4f6f5', fontFamily: fonts.length ? 'Manrope' : 'sans-serif', fontWeight: 500 }}>
        {bg}
        {body}
      </div>
    ),
    {
      width, height, ...(fonts.length ? { fonts } : {}), // no fonts → the renderer's built-in one (never a crash)
      // Public reviews are cached at the edge for a day (the URL carries a version that changes on edit).
      // Private cards stay in the member's own browser only, briefly, so switching sizes and saving are instant.
      headers: { 'Cache-Control': s.isPublic ? 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' : 'private, max-age=300' },
    },
  );
}

// ─── Profile cards: GET /api/share/profile/:username ────────────────────────────

export interface ProfileShareSubject {
  username: string;
  name: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  favourites: Array<{ title: string; poster: string | null }>;
  films: number;
  reviews: number;
  followers: number;
  topGenres: string[];
  /** Only set when the owner shows their prediction summary and predictions are visible. */
  hitRate: number | null;
  joined: string;
  /** True when anyone may see the profile (safe for a public CDN cache and a public link). */
  isPublic: boolean;
}

/** A profile as a share subject, or 404 when the viewer may not see the full profile. */
export async function profileSubject(username: string, viewerId: string | null): Promise<ProfileShareSubject> {
  const user = await getUserByUsername(username);
  if (!user) throw notFound('Profile not found');
  const isOwner = Boolean(viewerId && viewerId === user.id);
  const anonymous = await resolveVisibility(null, user.id, 'profile');
  if (!isOwner) {
    const viewer = viewerId ? await resolveVisibility(viewerId, user.id, 'profile') : anonymous;
    if (!viewer.allowed) throw notFound('Profile not found');
  }
  const isPublic = anonymous.allowed;
  // A public card is cached for everyone, so what it shows must not depend on who asked.
  const predictions = await resolveVisibility(isPublic ? null : viewerId, user.id, 'predictions');
  const [favourites, stats, topGenres, followers] = await Promise.all([
    resolveFavoriteTitles(user.favorite_title_ids),
    computeUserStats(user.id),
    computeTopGenres(user.id),
    db().get<{ count: number }>("SELECT COUNT(*) AS count FROM follows WHERE followee_id = ? AND status = 'accepted'", user.id),
  ]);
  const showHitRate = showsPredictionSummary(user) && predictions.allowed && stats.hitRate != null;
  return {
    username: String(user.username || user.id),
    name: String(user.display_name || user.name || user.username || 'A CinePulse member'),
    avatarUrl: typeof user.avatar_url === 'string' ? user.avatar_url : null,
    bannerUrl: typeof user.banner_url === 'string' ? user.banner_url : null,
    favourites: favourites.slice(0, 4).map((f: any) => ({ title: String(f.title || ''), poster: typeof f.poster === 'string' ? f.poster : null })),
    films: Number(stats.totalFilmsWatched ?? stats.totalWatched ?? 0),
    reviews: Number(stats.totalReviews ?? 0),
    followers: Number(followers?.count ?? 0),
    topGenres: topGenres.slice(0, 3),
    hitRate: showHitRate ? Math.round(Number(stats.hitRate)) : null,
    joined: String(user.created_at || ''),
    isPublic,
  };
}

const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` : n >= 10_000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : String(n));
const clip = (s: string, max: number) => ([...s].length > max ? `${[...s].slice(0, max - 1).join('').trimEnd()}…` : s);
const fmtJoined = (d: string) => {
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
};

/** A small progress ring for the prediction hit rate. */
function HitRing({ pct, size }: { pct: number; size: number }) {
  const stroke = Math.round(size * 0.13);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(20,20,20,0.12)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#0f9d6b" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(c * p) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

/**
 * The profile card, in the same family as the review ticket: a colour wash from the banner (or
 * first favourite), the avatar in a mint ring, the favourite four fanned out like prints on a
 * table, and a cream member-pass stub with the stats, top genres and the profile address.
 */
export async function renderProfileCard(s: ProfileShareSubject, format: CardFormat, origin: string): Promise<Response> {
  const { width, height } = SIZES[format];
  const og = format === 'og';
  const story = format === 'story';
  const washSource = s.bannerUrl || s.favourites.find((f) => f.poster)?.poster || null;
  const posterSize = og ? 'w185' : 'w342';
  const [fonts, wash, avatar, ...posters] = await Promise.all([
    loadFonts(),
    posterData(washSource, 'w92'),
    avatarData(s.avatarUrl),
    ...s.favourites.map((f) => posterData(f.poster, posterSize)),
  ]);
  const host = origin.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const profilePath = `${host}/u/${s.username}`;
  const ink = '#141414';
  const cream = '#f6f1e7';
  const name = clip(s.name, 28);
  const initial = ([...s.name.trim()][0] || '?').toUpperCase();
  const hasFavs = s.favourites.length > 0;
  const joined = fmtJoined(s.joined);

  const brand = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end' }}>
        <div style={{ width: 9, height: 24, borderRadius: 5, background: '#b3f3d5' }} />
        <div style={{ width: 9, height: 36, borderRadius: 5, background: '#b3f3d5' }} />
        <div style={{ width: 9, height: 29, borderRadius: 5, background: '#b3f3d5' }} />
      </div>
      <span style={{ fontSize: og ? 28 : 38, fontWeight: 800, color: '#fff', letterSpacing: -1 }}>cinepulse</span>
      <span style={{ fontSize: og ? 28 : 38, fontWeight: 800, color: '#b3f3d5', marginLeft: -12 }}>.</span>
    </div>
  );
  const pill = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: og ? '8px 16px' : '12px 24px', borderRadius: 999, background: 'rgba(255,255,255,0.14)', border: '2px solid rgba(255,255,255,0.28)' }}>
      <div style={{ width: og ? 10 : 14, height: og ? 10 : 14, borderRadius: 999, background: '#b3f3d5' }} />
      <span style={{ fontSize: og ? 18 : 26, fontWeight: 800, letterSpacing: 4, color: '#fff' }}>MEMBER PASS</span>
    </div>
  );

  const avatarSize = og ? 124 : story ? 250 : 168;
  const ring = Math.round(avatarSize * 0.035) + 3;
  const avatarEl = (
    <div style={{ display: 'flex', padding: ring, borderRadius: 999, backgroundImage: 'linear-gradient(135deg, #b3f3d5 0%, #34d399 45%, #fbbf24 100%)', boxShadow: '0 30px 60px rgba(0,0,0,0.5)' }}>
      <div style={{ display: 'flex', width: avatarSize, height: avatarSize, borderRadius: 999, overflow: 'hidden', border: `${ring}px solid #0b0f12`, alignItems: 'center', justifyContent: 'center', backgroundImage: 'linear-gradient(135deg, #10b981 0%, #064e3b 100%)' }}>
        {avatar
          ? <img src={avatar} width={avatarSize} height={avatarSize} style={{ objectFit: 'cover' }} alt="" />
          : <span style={{ fontSize: Math.round(avatarSize * 0.44), fontWeight: 800, color: '#fff' }}>{initial}</span>}
      </div>
    </div>
  );

  const nameSize = og ? (name.length > 18 ? 40 : 50) : story ? (name.length > 20 ? 64 : name.length > 12 ? 78 : 92) : (name.length > 18 ? 52 : 64);
  const names = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: story ? 'center' : 'flex-start', gap: og ? 4 : 8, minWidth: 0 }}>
      <span style={{ fontSize: nameSize, fontWeight: 800, color: '#fff', letterSpacing: og ? -1.2 : -2.2, lineHeight: 1.05, textAlign: story ? 'center' : 'left' }}>{name}</span>
      <span style={{ fontSize: og ? 24 : story ? 40 : 34, fontWeight: 800, color: '#b3f3d5' }}>{`@${s.username}`}</span>
    </div>
  );
  const identity = story ? (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>{avatarEl}{names}</div>
  ) : (
    <div style={{ display: 'flex', alignItems: 'center', gap: og ? 24 : 34 }}>{avatarEl}{names}</div>
  );

  // Favourite four, fanned like prints on a table.
  const pw = og ? 128 : story ? 196 : 168;
  const ph = Math.round(pw * 1.5);
  const tilt = [-7, -2.5, 2.5, 7];
  const drop = [og ? 14 : 22, 0, 0, og ? 14 : 22];
  const favRow = hasFavs ? (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: og ? 0 : story ? 22 : 18, paddingBottom: og ? 14 : 22 }}>
      {s.favourites.map((f, i) => {
        const k = s.favourites.length === 4 ? i : Math.round((i * 3) / Math.max(1, s.favourites.length - 1));
        return (
          <div key={i} style={{ display: 'flex', marginLeft: og && i > 0 ? -18 : 0, transform: `translateY(${drop[k] ?? 0}px) rotate(${tilt[k] ?? 0}deg)`, padding: og ? 6 : 9, background: '#fff', borderRadius: og ? 12 : 16, boxShadow: '0 30px 60px rgba(0,0,0,0.5), 0 8px 20px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', width: pw, height: ph, borderRadius: og ? 7 : 10, overflow: 'hidden', background: '#1c2624', alignItems: 'center', justifyContent: 'center' }}>
              {posters[i]
                ? <img src={posters[i]!} width={pw} height={ph} style={{ objectFit: 'cover' }} alt="" />
                : <span style={{ fontSize: og ? 15 : 22, color: '#9db0a8', fontWeight: 800, textAlign: 'center', padding: og ? 10 : 16 }}>{clip(f.title, 30)}</span>}
            </div>
          </div>
        );
      })}
    </div>
  ) : null;

  const stat = (value: number, label: string, first: boolean) => (
    <div key={label} style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingLeft: first ? 0 : og ? 18 : 28, borderLeft: first ? 'none' : `${og ? 2 : 3}px dashed rgba(20,20,20,0.2)` }}>
      <span style={{ fontSize: og ? 44 : story ? 76 : 64, fontWeight: 800, color: ink, letterSpacing: -2, lineHeight: 1 }}>{compact(value)}</span>
      <span style={{ marginTop: og ? 6 : 10, fontSize: og ? 14 : 20, fontWeight: 800, letterSpacing: 3, color: '#7a7466' }}>{label}</span>
    </div>
  );
  const notch = og ? 20 : 30;
  const ticketW = og ? (hasFavs ? 560 : 1088) : story ? 920 : 940;
  // Notch centres sit on the perforation: bottom padding + footer row + its top margin.
  const footRowBottom = og ? 52 : story ? 88 : 78;
  const ticket = (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: ticketW, background: cream, borderRadius: og ? 22 : 30, padding: og ? '22px 30px 18px' : story ? '40px 54px 34px' : '32px 46px 26px', color: ink, boxShadow: '0 40px 80px rgba(0,0,0,0.45)' }}>
      <div style={{ position: 'absolute', left: -notch, bottom: footRowBottom, width: notch * 2, height: notch * 2, borderRadius: 999, background: '#0b0f12' }} />
      <div style={{ position: 'absolute', right: -notch, bottom: footRowBottom, width: notch * 2, height: notch * 2, borderRadius: 999, background: '#0b0f12' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: og ? 14 : 21, fontWeight: 800, letterSpacing: 4, color: '#0f5132' }}>
        <span>ADMIT ONE</span>
        <span style={{ color: '#7a7466' }}>{joined ? `MEMBER SINCE ${joined}` : 'CINEPULSE'}</span>
      </div>
      <div style={{ display: 'flex', marginTop: og ? 14 : 24 }}>
        {stat(s.films, 'FILMS', true)}
        {stat(s.reviews, 'REVIEWS', false)}
        {stat(s.followers, 'FOLLOWERS', false)}
      </div>
      {(s.topGenres.length > 0 || s.hitRate !== null) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: og ? 14 : 26 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: og ? 8 : 12, flex: 1 }}>
            {s.topGenres.map((g) => (
              <span key={g} style={{ display: 'flex', padding: og ? '5px 12px' : '9px 20px', borderRadius: 999, background: '#e3f5ec', border: `${og ? 2 : 3}px solid #0f5132`, color: '#0f5132', fontSize: og ? 15 : 23, fontWeight: 800 }}>{clip(g, 18)}</span>
            ))}
          </div>
          {s.hitRate !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: og ? 8 : 14 }}>
              <div style={{ display: 'flex', position: 'relative', alignItems: 'center', justifyContent: 'center', width: og ? 48 : 74, height: og ? 48 : 74 }}>
                <HitRing pct={s.hitRate} size={og ? 48 : 74} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: og ? 24 : 36, fontWeight: 800, color: ink, lineHeight: 1 }}>{`${s.hitRate}%`}</span>
                <span style={{ fontSize: og ? 11 : 16, fontWeight: 800, letterSpacing: 2, color: '#7a7466' }}>CALL HIT RATE</span>
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', marginTop: og ? 16 : 28, marginBottom: og ? 12 : 22, borderTop: `${og ? 3 : 4}px dashed rgba(20,20,20,0.25)` }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: og ? 13 : 19, fontWeight: 800, letterSpacing: 3, color: '#7a7466' }}>FIND ME ON CINEPULSE</span>
          <span style={{ fontSize: og ? 19 : 27, fontWeight: 800, color: ink }}>{clip(profilePath, og ? 34 : 40)}</span>
        </div>
        <Barcode seed={`profile:${s.username}`} height={og ? 40 : 60} bars={og ? 18 : 26} />
      </div>
    </div>
  );

  const bg = (
    <div style={{ position: 'absolute', top: 0, left: 0, width, height, display: 'flex' }}>
      {wash && <img src={wash} width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover', opacity: 0.6 }} alt="" />}
      <div style={{ position: 'absolute', top: 0, left: 0, width, height, display: 'flex', backgroundImage: wash ? 'linear-gradient(180deg, rgba(8,12,15,0.4) 0%, rgba(8,12,15,0.6) 45%, rgba(8,12,15,0.9) 100%)' : 'radial-gradient(circle at 30% 20%, #1d4a3d 0%, #0b1013 60%)' }} />
    </div>
  );
  const footer = (
    <div style={{ display: 'flex', width: '100%', justifyContent: 'center', fontSize: og ? 20 : 26, fontWeight: 800, letterSpacing: 2, color: 'rgba(255,255,255,0.78)' }}>
      <span>{`FOLLOW ALONG ON ${host.toUpperCase()}`}</span>
    </div>
  );

  const body = og ? (
    <div style={{ display: 'flex', width: '100%', height: '100%', padding: '40px 56px', gap: 40, alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>{brand}{hasFavs ? null : pill}</div>
        {identity}
        {ticket}
      </div>
      {hasFavs && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 }}>
          {pill}
          {favRow}
        </div>
      )}
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%', padding: story ? '84px 70px 70px' : '48px 60px 44px' }}>
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>{brand}{pill}</div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: story ? 'center' : 'stretch', justifyContent: 'center', flex: 1, width: story ? '100%' : ticketW, gap: story ? 64 : 36 }}>
        {identity}
        {favRow}
        {ticket}
      </div>
      {footer}
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ position: 'relative', display: 'flex', width: '100%', height: '100%', background: '#0b0f12', color: '#f4f6f5', fontFamily: fonts.length ? 'Manrope' : 'sans-serif', fontWeight: 500 }}>
        {bg}
        {body}
      </div>
    ),
    {
      width, height, ...(fonts.length ? { fonts } : {}),
      // Public profiles are cached at the edge (the client's URL carries a version that changes on edit).
      headers: { 'Cache-Control': s.isPublic ? 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' : 'private, max-age=300' },
    },
  );
}
