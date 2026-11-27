import { db, now } from '../db';
import type { PublicProfile, VisibilityLevel, UserStats } from '../types';
import { resolveVisibility } from './visibility';
import { titleById, titleIdAvailable } from '../catalog';
import { bad, HttpError } from '../errors';

export interface ProfileStats {
  filmsWatchedThisYear: number;
  totalFilmsWatched: number;
  averageRatingGiven: number | null;
  totalReviews: number;
  totalPredictions: number;
  brierScore: number | null;
  hitRate: number | null;
  resolvedPredictionsCount: number;
}

export async function getUserByUsername(username: string): Promise<any | null> {
  const d = db();
  const trimmed = username.trim();
  return (await d.get(`
    SELECT id, name, email, username, display_name, bio, avatar_url, banner_url,
           profile_visibility, is_verified, favorite_title_ids, region, created_at
    FROM users
    WHERE (LOWER(username) = LOWER(?)) OR (id = ?)
  `, trimmed, trimmed)) || null;
}

export async function getUserById(id: string): Promise<any | null> {
  const d = db();
  const trimmed = id.trim();
  return (await d.get(`
    SELECT id, name, email, username, display_name, bio, avatar_url, banner_url,
           profile_visibility, is_verified, favorite_title_ids, region, is_seed, is_ai, ai_persona_id, created_at
    FROM users
    WHERE (id = ?) OR (LOWER(username) = LOWER(?))
  `, trimmed, trimmed)) || null;
}

export async function updateUserProfile(
  userId: string,
  updates: {
    username?: string;
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
    bannerUrl?: string;
    profileVisibility?: VisibilityLevel;
    favoriteTitleIds?: string[];
    region?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const d = db();
  const current = (await getUserById(userId));
  if (!current) return { success: false, error: 'User not found' };

  let nextUsername = current.username;
  if (updates.username && updates.username.trim() !== current.username) {
    const cleanUsername = updates.username.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,24}$/.test(cleanUsername)) {
      return { success: false, error: 'Username must be 3-24 characters containing only letters, numbers, underscores or hyphens' };
    }
    const conflict = (await d.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?', cleanUsername, userId));
    if (conflict) {
      return { success: false, error: 'Username is already taken' };
    }
    nextUsername = cleanUsername;
  }

  let favJson = current.favorite_title_ids;
  let nextBanner = current.banner_url ?? null;
  try {
    if (updates.favoriteTitleIds !== undefined) favJson = JSON.stringify(parseFavouriteIds(updates.favoriteTitleIds));
    if (updates.bannerUrl !== undefined) nextBanner = parseBannerUrl(updates.bannerUrl);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Invalid profile update' };
  }

  if (updates.region !== undefined && updates.region !== 'IN' && updates.region !== 'US') {
    return { success: false, error: 'Region must be IN or US' };
  }
  const nextRegion = updates.region !== undefined ? updates.region : (current.region || 'IN');

  (await d.run(`
    UPDATE users SET
      username = ?,
      display_name = ?,
      bio = ?,
      avatar_url = ?,
      banner_url = ?,
      profile_visibility = ?,
      favorite_title_ids = ?,
      region = ?
    WHERE id = ?
  `, nextUsername,
    updates.displayName !== undefined ? updates.displayName : current.display_name,
    updates.bio !== undefined ? updates.bio : current.bio,
    updates.avatarUrl !== undefined ? updates.avatarUrl : current.avatar_url,
    nextBanner,
    updates.profileVisibility !== undefined ? updates.profileVisibility : current.profile_visibility,
    favJson,
    nextRegion,
    userId));

  return { success: true };
}

/**
 * Computes taste personality tags from viewing patterns.
 * Tags are generated from genre frequency, decade preference, and volume signals.
 */
export async function computeTasteTags(userId: string): Promise<Array<{ tag: string; label: string; icon: string; score: number }>> {
  const d = db();

  const libRows = (await d.all(`
    SELECT title_json, rating FROM library WHERE user_id = ? AND status = 'watched' AND title_json IS NOT NULL
  `, userId)) as any[];

  if (libRows.length < 5) return [];

  const genreCounts: Record<string, number> = {};
  const decadeCounts: Record<string, number> = {};
  let totalRated = 0;
  let totalRating = 0;

  for (const row of libRows) {
    let td: any = {};
    try { td = JSON.parse(row.title_json); } catch {}

    // Genres
    for (const g of (td.genres || [])) {
      genreCounts[g] = (genreCounts[g] || 0) + 1;
    }

    // Decade
    if (td.releaseDate) {
      const year = parseInt(td.releaseDate.slice(0, 4));
      if (!isNaN(year)) {
        const decade = `${Math.floor(year / 10) * 10}s`;
        decadeCounts[decade] = (decadeCounts[decade] || 0) + 1;
      }
    }

    if (row.rating) {
      totalRated++;
      totalRating += row.rating;
    }
  }

  const tags: Array<{ tag: string; label: string; icon: string; score: number }> = [];
  const total = libRows.length;

  // Genre tags
  const genreTagMap: Record<string, { label: string; icon: string }> = {
    'Horror': { label: 'Horror Devotee', icon: '🎃' },
    'Science Fiction': { label: 'Sci-Fi Explorer', icon: '🚀' },
    'Documentary': { label: 'Documentary Buff', icon: '🎥' },
    'Animation': { label: 'Animation Fan', icon: '✨' },
    'Drama': { label: 'Drama Connoisseur', icon: '🎭' },
    'Comedy': { label: 'Comedy Lover', icon: '😂' },
    'Action': { label: 'Action Junkie', icon: '💥' },
    'Thriller': { label: 'Thriller Seeker', icon: '😰' },
    'Romance': { label: 'Romantic at Heart', icon: '💕' },
    'Crime': { label: 'Crime Aficionado', icon: '🔍' },
    'Fantasy': { label: 'Fantasy Dweller', icon: '🧙' },
    'History': { label: 'History Buff', icon: '📜' },
    'Music': { label: 'Music Film Fan', icon: '🎵' },
    'Western': { label: 'Western Fan', icon: '🤠' },
    'War': { label: 'War Film Watcher', icon: '⚔️' },
  };

  const topGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [genre, count] of topGenres) {
    const ratio = count / total;
    if (ratio >= 0.15 && genreTagMap[genre]) {
      tags.push({ tag: genre.toLowerCase().replace(/\s+/g, '-'), label: genreTagMap[genre].label, icon: genreTagMap[genre].icon, score: ratio });
    }
  }

  // Decade tags
  const topDecades = Object.entries(decadeCounts).sort((a, b) => b[1] - a[1]).slice(0, 2);
  for (const [decade, count] of topDecades) {
    const ratio = count / total;
    if (ratio >= 0.20) {
      tags.push({ tag: `${decade.toLowerCase()}-watcher`, label: `${decade} Enthusiast`, icon: '📽️', score: ratio });
    }
  }

  // Volume tags
  if (total >= 500) tags.push({ tag: 'cinephile', label: 'Certified Cinephile', icon: '🏆', score: 1.0 });
  else if (total >= 200) tags.push({ tag: 'film-buff', label: 'Dedicated Film Buff', icon: '🎬', score: 0.9 });
  else if (total >= 100) tags.push({ tag: 'regular-watcher', label: 'Regular Watcher', icon: '👁️', score: 0.7 });

  // Rating behavior
  const avgRating = totalRated > 0 ? totalRating / totalRated : null;
  if (avgRating !== null && totalRated >= 20) {
    if (avgRating < 2.5) tags.push({ tag: 'harsh-critic', label: 'Harsh Critic', icon: '🔪', score: 0.8 });
    else if (avgRating >= 4.0) tags.push({ tag: 'generous-rater', label: 'Generous Spirit', icon: '❤️', score: 0.8 });
  }

  return tags.sort((a, b) => b.score - a.score).slice(0, 5);
}

/**
 * Returns an annual Year In Review summary for the given year.
 */
export async function getYearInReview(userId: string, year: number): Promise<{
  year: number;
  filmsWatched: number;
  reviewsWritten: number;
  listsCreated: number;
  favoriteGenre: string | null;
  favoriteDecade: string | null;
  totalRatings: number;
  averageRating: number | null;
  topFilms: Array<{ titleId: string; title: string; poster: string | null; rating: number | null }>;
  mostActiveMonth: string | null;
}> {
  const d = db();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const libRows = (await d.all(`
    SELECT title_id, title_json, rating, updated_at FROM library
    WHERE user_id = ? AND status = 'watched' AND updated_at >= ? AND updated_at <= ?
    ORDER BY updated_at DESC
  `, userId, yearStart, yearEnd)) as any[];

  const reviewCount = ((await d.get(`
    SELECT COUNT(*) as count FROM reviews WHERE user_id = ? AND created_at >= ? AND created_at <= ?
  `, userId, yearStart, yearEnd)) as any)?.count || 0;

  const listCount = ((await d.get(`
    SELECT COUNT(*) as count FROM activity_events
    WHERE user_id = ? AND type = 'created_list' AND created_at >= ? AND created_at <= ?
  `, userId, yearStart, yearEnd)) as any)?.count || 0;

  const genreCounts: Record<string, number> = {};
  const decadeCounts: Record<string, number> = {};
  const monthCounts: Record<string, number> = {};
  let totalRating = 0;
  let ratingCount = 0;
  const topFilmCandidates: Array<{ titleId: string; title: string; poster: string | null; rating: number | null }> = [];

  for (const row of libRows) {
    let td: any = {};
    try { td = JSON.parse(row.title_json || '{}'); } catch {}

    for (const g of (td.genres || [])) genreCounts[g] = (genreCounts[g] || 0) + 1;
    if (td.releaseDate) {
      const yr = parseInt(td.releaseDate.slice(0, 4));
      if (!isNaN(yr)) {
        const decade = `${Math.floor(yr / 10) * 10}s`;
        decadeCounts[decade] = (decadeCounts[decade] || 0) + 1;
      }
    }
    if (row.updated_at) {
      const month = row.updated_at.slice(0, 7); // YYYY-MM
      monthCounts[month] = (monthCounts[month] || 0) + 1;
    }
    if (row.rating) { totalRating += row.rating; ratingCount++; }

    topFilmCandidates.push({
      titleId: row.title_id,
      title: td.title || row.title_id,
      poster: td.poster || null,
      rating: row.rating,
    });
  }

  const favoriteGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const favoriteDecade = Object.entries(decadeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const mostActiveMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const topFilms = topFilmCandidates
    .filter((f) => f.rating !== null)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 5);

  return {
    year,
    filmsWatched: libRows.length,
    reviewsWritten: Number(reviewCount),
    listsCreated: Number(listCount),
    favoriteGenre,
    favoriteDecade,
    totalRatings: ratingCount,
    averageRating: ratingCount > 0 ? Number((totalRating / ratingCount).toFixed(1)) : null,
    topFilms,
    mostActiveMonth,
  };
}

/**
 * Returns up to 3 pinned lists for a user.
 */
export async function getPinnedLists(userId: string, viewerId: string | null): Promise<any[]> {
  const d = db();

  const rows = (await d.all(`
    SELECT ul.id, ul.title as list_name, ul.description, ul.visibility, ul.title_ids, ul.items_json, ul.updated_at,
           pl.pin_order
    FROM pinned_lists pl
    JOIN user_lists ul ON ul.id = pl.list_id
    WHERE pl.user_id = ? AND ul.visibility = 'public'
    ORDER BY pl.pin_order ASC
    LIMIT 3
  `, userId)) as any[];

  return (await Promise.all(rows.map(async (r) => {
    let filmCount = 0;
    const coverPosters: Array<string | null> = [];
    try {
      const raw = r.title_ids || r.items_json;
      const parsed = JSON.parse(raw || '[]');
      const titleIds: string[] = Array.isArray(parsed)
        ? parsed.map((it: any) => (typeof it === 'string' ? it : it?.titleId)).filter(Boolean)
        : [];
      filmCount = titleIds.length;
      for (const tid of titleIds.slice(0, 4)) {
        try {
          const libRow = (await d.get(`SELECT title_json FROM library WHERE title_id = ? AND title_json IS NOT NULL LIMIT 1`, tid)) as any;
          coverPosters.push(libRow?.title_json ? JSON.parse(libRow.title_json).poster || null : null);
        } catch { coverPosters.push(null); }
      }
    } catch {}

    const likeCount = ((await d.get(`SELECT COUNT(*) as count FROM likes WHERE target_type = 'list' AND target_id = ?`, r.id)) as any)?.count || 0;
    const isLiked = viewerId ? Boolean((await d.get(`SELECT 1 FROM likes WHERE user_id = ? AND target_type = 'list' AND target_id = ?`, viewerId, r.id))) : false;

    return {
      id: r.id,
      name: r.list_name,
      description: r.description,
      filmCount,
      coverPosters,
      likesCount: Number(likeCount),
      isLiked,
      updatedAt: r.updated_at,
      pinOrder: r.pin_order,
    };
  })));
}

export async function pinList(userId: string, listId: string): Promise<{ success: boolean; error?: string }> {
  const d = db();
  const list = (await d.get(`SELECT user_id FROM user_lists WHERE id = ?`, listId)) as any;
  if (!list) return { success: false, error: 'List not found' };
  if (list.user_id !== userId) return { success: false, error: 'Not authorized' };

  const count = ((await d.get(`SELECT COUNT(*) as count FROM pinned_lists WHERE user_id = ?`, userId)) as any)?.count || 0;
  if (Number(count) >= 3) return { success: false, error: 'Maximum 3 lists can be pinned' };

  (await d.run(`INSERT INTO pinned_lists (user_id, list_id, pin_order) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`, userId, listId, Number(count)));
  return { success: true };
}

export async function unpinList(userId: string, listId: string): Promise<{ success: boolean; error?: string }> {
  const d = db();
  (await d.run(`DELETE FROM pinned_lists WHERE user_id = ? AND list_id = ?`, userId, listId));
  return { success: true };
}

/**
 * Computes prediction accuracy and Brier score for a user.
 * Brier score: (p - outcome)^2, where outcome = 1 for hit, 0 for flop.
 * p is predicted probability of a hit.
 */
export async function computeUserPredictionMetrics(userId: string): Promise<{
  brierScore: number | null;
  hitRate: number | null;
  totalPredictions: number;
  resolvedCount: number;
}> {
  const d = db();
  const forecasts = (await d.all(`
    SELECT title_id, choice, confidence, release_date
    FROM forecast_events
    WHERE user_id = ? AND first_submission = 1
  `, userId)) as any[];

  const totalPredictions = forecasts.length;
  if (totalPredictions === 0) {
    return { brierScore: null, hitRate: null, totalPredictions: 0, resolvedCount: 0 };
  }

  const currentDate = new Date().toISOString().slice(0, 10);
  let resolvedCount = 0;
  let totalBrier = 0;
  let correctHits = 0;

  for (const f of forecasts) {
    // A forecast is resolved if the film release date is in the past
    if (!f.release_date || f.release_date > currentDate) {
      continue;
    }

    // Check if we have library or review data indicating reception, or fall back to vote average
    // In our catalog system, release_date in past means film has concluded initial run
    // Let's inspect library rating or review rating as community signal
    const avgScoreRow = (await d.get(`
      SELECT AVG(rating) as avg_rating FROM library WHERE title_id = ? AND rating IS NOT NULL
    `, f.title_id)) as { avg_rating?: number | null };

    // Default heuristic for outcome resolution if community has ratings
    // Rating scale is 1 to 5 stars, >= 3.5 is a Hit, < 3.5 is Flop
    // If no community ratings yet, check if release date is older than 14 days
    const outcome = (avgScoreRow?.avg_rating != null && avgScoreRow.avg_rating >= 3.5) ? 1 : 0;
    resolvedCount++;

    const pHit = f.choice === 'hit' ? (f.confidence / 100) : (1 - f.confidence / 100);
    totalBrier += Math.pow(pHit - outcome, 2);

    const hitMatch = (f.choice === 'hit' && outcome === 1) || (f.choice === 'flop' && outcome === 0);
    if (hitMatch) correctHits++;
  }

  if (resolvedCount === 0) {
    return { brierScore: null, hitRate: null, totalPredictions, resolvedCount: 0 };
  }

  const brierScore = Number((totalBrier / resolvedCount).toFixed(3));
  const hitRate = Number(((correctHits / resolvedCount) * 100).toFixed(1));

  return { brierScore, hitRate, totalPredictions, resolvedCount };
}

export async function computeUserStats(userId: string): Promise<UserStats> {
  const d = db();
  const currentYear = new Date().getFullYear().toString();
  const yearStart = `${currentYear}-01-01`;

  const watchedStats = (await d.get(`
    SELECT
      COUNT(CASE WHEN updated_at >= ? THEN 1 END) as this_year,
      COUNT(*) as total_watched,
      AVG(CASE WHEN rating IS NOT NULL THEN rating END) as avg_rating
    FROM library
    WHERE user_id = ? AND status = 'watched'
  `, yearStart, userId)) as any;

  const totalReviews = ((await d.get('SELECT COUNT(*) as count FROM reviews WHERE user_id = ?', userId)) as any)?.count || 0;
  const predMetrics = (await computeUserPredictionMetrics(userId));
  const avgRating = watchedStats?.avg_rating != null ? Number(Number(watchedStats.avg_rating).toFixed(1)) : null;

  return {
    filmsWatchedThisYear: Number(watchedStats?.this_year || 0),
    totalWatched: Number(watchedStats?.total_watched || 0),
    totalFilmsWatched: Number(watchedStats?.total_watched || 0),
    averageRating: avgRating,
    averageRatingGiven: avgRating,
    totalReviews: Number(totalReviews),
    totalPredictions: predMetrics.totalPredictions,
    totalCalls: predMetrics.totalPredictions,
    brierScore: predMetrics.brierScore,
    hitRate: predMetrics.hitRate,
    accuracyRate: predMetrics.hitRate,
    followersCount: 0,
    followingCount: 0,
  };
}

// ─── Favourite four + banner (Letterboxd-style) ────────────────────────────────

export const MAX_FAVOURITES = 4;
const TMDB_IMAGE = /^https:\/\/image\.tmdb\.org\/t\/p\/[a-z0-9]{1,12}\/[A-Za-z0-9_-]{1,80}\.(?:jpg|jpeg|png|webp)$/;
/** Demo-catalog artwork shipped with the app (public/assets). */
const LOCAL_ASSET = /^\/assets\/[a-z0-9-]{1,64}\.webp$/;

/** Banners are only ever TMDB artwork or the app's own demo artwork, never an arbitrary URL. */
export function isAllowedBannerUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 300 && (TMDB_IMAGE.test(value) || LOCAL_ASSET.test(value));
}

/** null / '' clears the banner; otherwise it must be an allowed artwork URL. */
export function parseBannerUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (!isAllowedBannerUrl(value)) throw bad('The banner must be TMDB artwork (https://image.tmdb.org) or a title');
  return value;
}

/** Up to four distinct catalog ids, in the order given. */
export function parseFavouriteIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw bad('favourites must be a list of title ids');
  const ids: string[] = [];
  for (const raw of value) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!titleIdAvailable(id)) throw bad('One of the favourites is not a title in this catalog');
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length > MAX_FAVOURITES) throw bad(`Pick up to ${MAX_FAVOURITES} favourites`);
  return ids;
}

/**
 * PUT /api/profile/favourites. `titleIds` replaces the favourite four (each must exist in the
 * catalog); `banner` is an allowed artwork URL, a title id (its backdrop is looked up here, so a
 * client never supplies the URL), or null to clear. Either field may be left out.
 */
export async function setProfileFavourites(
  userId: string,
  input: { titleIds?: unknown; banner?: unknown },
): Promise<{ favoriteFilms: any[]; bannerUrl: string | null }> {
  const d = db();
  const current = await getUserById(userId);
  if (!current) throw new HttpError(404, 'User not found');
  if (input === null || typeof input !== 'object' || (input.titleIds === undefined && input.banner === undefined)) {
    throw bad('Send titleIds and/or banner');
  }

  let favJson: string = current.favorite_title_ids || '[]';
  if (input.titleIds !== undefined) {
    const ids = parseFavouriteIds(input.titleIds);
    await Promise.all(ids.map(async (id) => {
      try { await titleById(id); } catch (e) {
        if (e instanceof HttpError && e.status >= 500) throw e;
        throw bad('One of the favourites could not be found');
      }
    }));
    favJson = JSON.stringify(ids);
  }

  let banner: string | null = current.banner_url ?? null;
  if (input.banner !== undefined) {
    const raw = typeof input.banner === 'string' ? input.banner.trim() : input.banner;
    if (typeof raw === 'string' && titleIdAvailable(raw)) {
      let art: string | null = null;
      try { const t = await titleById(raw); art = t.backdrop || t.poster; } catch (e) {
        if (e instanceof HttpError && e.status >= 500) throw e;
        throw bad('That title could not be found');
      }
      if (!isAllowedBannerUrl(art)) throw bad('That title has no artwork to use as a banner');
      banner = art;
    } else {
      banner = parseBannerUrl(raw);
    }
  }

  await d.run('UPDATE users SET favorite_title_ids = ?, banner_url = ? WHERE id = ?', favJson, banner, userId);
  return { favoriteFilms: await resolveFavoriteTitles(favJson), bannerUrl: banner };
}

export async function resolveFavoriteTitles(titleIdsJson?: string | null): Promise<any[]> {
  if (!titleIdsJson) return [];
  try {
    const ids: string[] = JSON.parse(titleIdsJson);
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const validIds = ids.filter((id) => typeof id === 'string' && titleIdAvailable(id)).slice(0, MAX_FAVOURITES);

    const titles = await Promise.all(
      validIds.map(async (id) => {
        try {
          const t = await titleById(id);
          return {
            id: t.id,
            title: t.title,
            poster: t.poster,
            backdrop: t.backdrop,
            releaseDate: t.releaseDate,
            mediaType: t.mediaType,
          };
        } catch {
          return null;
        }
      })
    );

    return titles.filter(Boolean);
  } catch {
    return [];
  }
}

export async function getPublicProfile(
  targetUsername: string,
  viewerId: string | null
): Promise<{ profile: PublicProfile | null; error?: string; status?: number }> {
  const user = (await getUserByUsername(targetUsername));
  if (!user) {
    return { profile: null, error: 'User not found', status: 404 };
  }

  const d = db();
  const visibility = (await resolveVisibility(viewerId, user.id, 'profile'));

  // Check if viewer has blocked user or user blocked viewer
  let isBlocked = false;
  let isViewerBlocked = false;
  if (viewerId) {
    const blockRows = (await d.all(`
      SELECT blocker_id FROM blocks
      WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
    `, viewerId, user.id, user.id, viewerId)) as { blocker_id: string }[];

    isBlocked = blockRows.some((b) => b.blocker_id === viewerId);
    isViewerBlocked = blockRows.some((b) => b.blocker_id === user.id);
  }

  // Follow counts
  const followerCount = ((await d.get("SELECT COUNT(*) as count FROM follows WHERE followee_id = ? AND status = 'accepted'", user.id)) as any)?.count || 0;
  const followingCount = ((await d.get("SELECT COUNT(*) as count FROM follows WHERE follower_id = ? AND status = 'accepted'", user.id)) as any)?.count || 0;

  let followStatus: 'accepted' | 'pending' | null = null;
  let isFollower = false;
  if (viewerId) {
    const followRow = (await d.get('SELECT status FROM follows WHERE follower_id = ? AND followee_id = ?', viewerId, user.id)) as any;
    if (followRow) followStatus = followRow.status;

    const reverseFollow = (await d.get("SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ? AND status = 'accepted'", user.id, viewerId));
    if (reverseFollow) isFollower = true;
  }

  const isOwner = Boolean(viewerId && viewerId === user.id);
  const isPrivate = (user.profile_visibility as VisibilityLevel) === 'private';
  const isFollowersOnly = (user.profile_visibility as VisibilityLevel) === 'followers_only';

  // Base profile info visible even if gated/pending (as per spec)
  const baseProfile: PublicProfile = {
    id: user.id,
    username: user.username,
    displayName: user.display_name || user.name,
    bio: user.bio,
    avatarUrl: user.avatar_url,
    profileVisibility: user.profile_visibility || 'public',
    isVerified: Boolean(user.is_verified),
    isSeed: Boolean(user.is_seed),
    isAi: Boolean(user.is_ai),
    aiPersonaId: user.ai_persona_id || undefined,
    createdAt: user.created_at,
    followerCount,
    followingCount,
    isFollowing: followStatus === 'accepted',
    isPendingFollow: followStatus === 'pending',
    isFollower,
    isBlocked,
    isViewerBlocked,
    isOwner,
    favoriteFilms: [],
    stats: {
      filmsWatchedThisYear: 0,
      totalWatched: 0,
      totalFilmsWatched: 0,
      averageRating: null,
      averageRatingGiven: null,
      totalReviews: 0,
      totalPredictions: 0,
      totalCalls: 0,
      brierScore: null,
      hitRate: null,
      accuracyRate: null,
      followersCount: followerCount,
      followingCount,
    },
  };

  // If blocked by owner
  if (visibility.status === 'blocked') {
    return {
      profile: {
        ...baseProfile,
        bio: null,
        favoriteFilms: [],
      },
      error: 'Profile unavailable',
      status: 403,
    };
  }

  // If private account and viewer is not accepted follower or owner
  if (!visibility.allowed) {
    // In pending state, user sees name/avatar/bio only, Request pending state, nothing else
    return {
      profile: {
        ...baseProfile,
        // Strip stats and favorites for private/denied profile
        favoriteFilms: [],
      },
    };
  }

  // Full access: populate favorites and stats
  const [favoriteFilms, stats] = await Promise.all([
    resolveFavoriteTitles(user.favorite_title_ids),
    Promise.resolve((await computeUserStats(user.id))),
  ]);

  return {
    profile: {
      ...baseProfile,
      favoriteFilms,
      // The banner is part of the member's taste (usually a favourite's backdrop), so it is
      // shown with the favourites, only to viewers allowed to see the full profile.
      bannerUrl: isAllowedBannerUrl(user.banner_url) ? user.banner_url : null,
      stats,
    },
  };
}



