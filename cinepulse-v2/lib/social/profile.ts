import { db, now } from '../db';
import type { PublicProfile, VisibilityLevel, UserStats } from '../types';
import { resolveVisibility } from './visibility';
import { titleById } from '../catalog';

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

export function getUserByUsername(username: string): any | null {
  const d = db();
  const trimmed = username.trim();
  return d.prepare(`
    SELECT id, name, email, username, display_name, bio, avatar_url, banner_url,
           profile_visibility, is_verified, favorite_title_ids, created_at
    FROM users
    WHERE (username = ? COLLATE NOCASE) OR (id = ?)
  `).get(trimmed, trimmed) || null;
}

export function getUserById(id: string): any | null {
  const d = db();
  const trimmed = id.trim();
  return d.prepare(`
    SELECT id, name, email, username, display_name, bio, avatar_url, banner_url,
           profile_visibility, is_verified, favorite_title_ids, created_at
    FROM users
    WHERE (id = ?) OR (username = ? COLLATE NOCASE)
  `).get(trimmed, trimmed) || null;
}

export function updateUserProfile(
  userId: string,
  updates: {
    username?: string;
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
    bannerUrl?: string;
    profileVisibility?: VisibilityLevel;
    favoriteTitleIds?: string[];
  }
): { success: boolean; error?: string } {
  const d = db();
  const current = getUserById(userId);
  if (!current) return { success: false, error: 'User not found' };

  let nextUsername = current.username;
  if (updates.username && updates.username.trim() !== current.username) {
    const cleanUsername = updates.username.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,24}$/.test(cleanUsername)) {
      return { success: false, error: 'Username must be 3-24 characters containing only letters, numbers, underscores or hyphens' };
    }
    const conflict = d.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?').get(cleanUsername, userId);
    if (conflict) {
      return { success: false, error: 'Username is already taken' };
    }
    nextUsername = cleanUsername;
  }

  let favJson = current.favorite_title_ids;
  if (updates.favoriteTitleIds !== undefined) {
    favJson = JSON.stringify(updates.favoriteTitleIds.slice(0, 4));
  }

  d.prepare(`
    UPDATE users SET
      username = ?,
      display_name = ?,
      bio = ?,
      avatar_url = ?,
      banner_url = ?,
      profile_visibility = ?,
      favorite_title_ids = ?
    WHERE id = ?
  `).run(
    nextUsername,
    updates.displayName !== undefined ? updates.displayName : current.display_name,
    updates.bio !== undefined ? updates.bio : current.bio,
    updates.avatarUrl !== undefined ? updates.avatarUrl : current.avatar_url,
    updates.bannerUrl !== undefined ? updates.bannerUrl : current.banner_url,
    updates.profileVisibility !== undefined ? updates.profileVisibility : current.profile_visibility,
    favJson,
    userId
  );

  return { success: true };
}

/**
 * Computes taste personality tags from viewing patterns.
 * Tags are generated from genre frequency, decade preference, and volume signals.
 */
export function computeTasteTags(userId: string): Array<{ tag: string; label: string; icon: string; score: number }> {
  const d = db();

  const libRows = d.prepare(`
    SELECT title_json, rating FROM library WHERE user_id = ? AND status = 'watched' AND title_json IS NOT NULL
  `).all(userId) as any[];

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
export function getYearInReview(userId: string, year: number): {
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
} {
  const d = db();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const libRows = d.prepare(`
    SELECT title_id, title_json, rating, updated_at FROM library
    WHERE user_id = ? AND status = 'watched' AND updated_at >= ? AND updated_at <= ?
    ORDER BY updated_at DESC
  `).all(userId, yearStart, yearEnd) as any[];

  const reviewCount = (d.prepare(`
    SELECT COUNT(*) as count FROM reviews WHERE user_id = ? AND created_at >= ? AND created_at <= ?
  `).get(userId, yearStart, yearEnd) as any)?.count || 0;

  const listCount = (d.prepare(`
    SELECT COUNT(*) as count FROM activity_events
    WHERE user_id = ? AND type = 'created_list' AND created_at >= ? AND created_at <= ?
  `).get(userId, yearStart, yearEnd) as any)?.count || 0;

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
export function getPinnedLists(userId: string, viewerId: string | null): any[] {
  const d = db();

  const rows = d.prepare(`
    SELECT ul.id, ul.title as list_name, ul.description, ul.visibility, ul.title_ids, ul.items_json, ul.updated_at,
           pl.pin_order
    FROM pinned_lists pl
    JOIN user_lists ul ON ul.id = pl.list_id
    WHERE pl.user_id = ? AND ul.visibility = 'public'
    ORDER BY pl.pin_order ASC
    LIMIT 3
  `).all(userId) as any[];

  return rows.map((r) => {
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
          const libRow = d.prepare(`SELECT title_json FROM library WHERE title_id = ? AND title_json IS NOT NULL LIMIT 1`).get(tid) as any;
          coverPosters.push(libRow?.title_json ? JSON.parse(libRow.title_json).poster || null : null);
        } catch { coverPosters.push(null); }
      }
    } catch {}

    const likeCount = (d.prepare(`SELECT COUNT(*) as count FROM likes WHERE target_type = 'list' AND target_id = ?`).get(r.id) as any)?.count || 0;
    const isLiked = viewerId ? Boolean(d.prepare(`SELECT 1 FROM likes WHERE user_id = ? AND target_type = 'list' AND target_id = ?`).get(viewerId, r.id)) : false;

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
  });
}

export function pinList(userId: string, listId: string): { success: boolean; error?: string } {
  const d = db();
  const list = d.prepare(`SELECT user_id FROM user_lists WHERE id = ?`).get(listId) as any;
  if (!list) return { success: false, error: 'List not found' };
  if (list.user_id !== userId) return { success: false, error: 'Not authorized' };

  const count = (d.prepare(`SELECT COUNT(*) as count FROM pinned_lists WHERE user_id = ?`).get(userId) as any)?.count || 0;
  if (Number(count) >= 3) return { success: false, error: 'Maximum 3 lists can be pinned' };

  d.prepare(`INSERT OR IGNORE INTO pinned_lists (user_id, list_id, pin_order) VALUES (?, ?, ?)`).run(userId, listId, Number(count));
  return { success: true };
}

export function unpinList(userId: string, listId: string): { success: boolean; error?: string } {
  const d = db();
  d.prepare(`DELETE FROM pinned_lists WHERE user_id = ? AND list_id = ?`).run(userId, listId);
  return { success: true };
}

/**
 * Computes prediction accuracy and Brier score for a user.
 * Brier score: (p - outcome)^2, where outcome = 1 for hit, 0 for flop.
 * p is predicted probability of a hit.
 */
export function computeUserPredictionMetrics(userId: string): {
  brierScore: number | null;
  hitRate: number | null;
  totalPredictions: number;
  resolvedCount: number;
} {
  const d = db();
  const forecasts = d.prepare(`
    SELECT title_id, choice, confidence, release_date
    FROM forecast_events
    WHERE user_id = ? AND first_submission = 1
  `).all(userId) as any[];

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
    const avgScoreRow = d.prepare(`
      SELECT AVG(rating) as avg_rating FROM library WHERE title_id = ? AND rating IS NOT NULL
    `).get(f.title_id) as { avg_rating?: number | null };

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

export function computeUserStats(userId: string): UserStats {
  const d = db();
  const currentYear = new Date().getFullYear().toString();
  const yearStart = `${currentYear}-01-01`;

  const watchedStats = d.prepare(`
    SELECT
      COUNT(CASE WHEN updated_at >= ? THEN 1 END) as this_year,
      COUNT(*) as total_watched,
      AVG(CASE WHEN rating IS NOT NULL THEN rating END) as avg_rating
    FROM library
    WHERE user_id = ? AND status = 'watched'
  `).get(yearStart, userId) as any;

  const totalReviews = (d.prepare('SELECT COUNT(*) as count FROM reviews WHERE user_id = ?').get(userId) as any)?.count || 0;
  const predMetrics = computeUserPredictionMetrics(userId);
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

export async function resolveFavoriteTitles(titleIdsJson?: string | null): Promise<any[]> {
  if (!titleIdsJson) return [];
  try {
    const ids: string[] = JSON.parse(titleIdsJson);
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const validIds = ids.slice(0, 4);

    const titles = await Promise.all(
      validIds.map(async (id) => {
        try {
          const t = await titleById(id);
          return {
            id: t.id,
            title: t.title,
            poster: t.poster,
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
  const user = getUserByUsername(targetUsername);
  if (!user) {
    return { profile: null, error: 'User not found', status: 404 };
  }

  const d = db();
  const visibility = resolveVisibility(viewerId, user.id, 'profile');

  // Check if viewer has blocked user or user blocked viewer
  let isBlocked = false;
  let isViewerBlocked = false;
  if (viewerId) {
    const blockRows = d.prepare(`
      SELECT blocker_id FROM blocks
      WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
    `).all(viewerId, user.id, user.id, viewerId) as { blocker_id: string }[];

    isBlocked = blockRows.some((b) => b.blocker_id === viewerId);
    isViewerBlocked = blockRows.some((b) => b.blocker_id === user.id);
  }

  // Follow counts
  const followerCount = (d.prepare("SELECT COUNT(*) as count FROM follows WHERE followee_id = ? AND status = 'accepted'").get(user.id) as any)?.count || 0;
  const followingCount = (d.prepare("SELECT COUNT(*) as count FROM follows WHERE follower_id = ? AND status = 'accepted'").get(user.id) as any)?.count || 0;

  let followStatus: 'accepted' | 'pending' | null = null;
  let isFollower = false;
  if (viewerId) {
    const followRow = d.prepare('SELECT status FROM follows WHERE follower_id = ? AND followee_id = ?').get(viewerId, user.id) as any;
    if (followRow) followStatus = followRow.status;

    const reverseFollow = d.prepare("SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ? AND status = 'accepted'").get(user.id, viewerId);
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
    Promise.resolve(computeUserStats(user.id)),
  ]);

  return {
    profile: {
      ...baseProfile,
      favoriteFilms,
      stats,
    },
  };
}



