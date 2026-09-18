import { db, now } from '../db';
import type { PublicProfile, VisibilityLevel } from '../types';
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
  return d.prepare(`
    SELECT id, name, email, username, display_name, bio, avatar_url,
           profile_visibility, is_verified, favorite_title_ids, created_at
    FROM users
    WHERE username = ? COLLATE NOCASE
  `).get(username.trim()) || null;
}

export function getUserById(id: string): any | null {
  const d = db();
  return d.prepare(`
    SELECT id, name, email, username, display_name, bio, avatar_url,
           profile_visibility, is_verified, favorite_title_ids, created_at
    FROM users
    WHERE id = ?
  `).get(id) || null;
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
  const followerCount = (d.prepare('SELECT COUNT(*) as count FROM follows WHERE followee_id = ? AND status = "accepted"').get(user.id) as any)?.count || 0;
  const followingCount = (d.prepare('SELECT COUNT(*) as count FROM follows WHERE follower_id = ? AND status = "accepted"').get(user.id) as any)?.count || 0;

  let followStatus: 'accepted' | 'pending' | null = null;
  let isFollower = false;
  if (viewerId) {
    const followRow = d.prepare('SELECT status FROM follows WHERE follower_id = ? AND followee_id = ?').get(viewerId, user.id) as any;
    if (followRow) followStatus = followRow.status;

    const reverseFollow = d.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ? AND status = "accepted"').get(user.id, viewerId);
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
      totalFilmsWatched: 0,
      averageRatingGiven: null,
      totalReviews: 0,
      totalPredictions: 0,
      brierScore: null,
      hitRate: null,
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

export function updateUserProfile(
  userId: string,
  updates: {
    username?: string;
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
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
    // Validate format: 3-24 alphanumeric and underscores/hyphens
    if (!/^[a-z0-9_-]{3,24}$/.test(cleanUsername)) {
      return { success: false, error: 'Username must be 3-24 characters containing only letters, numbers, underscores or hyphens' };
    }
    // Check uniqueness
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
      profile_visibility = ?,
      favorite_title_ids = ?
    WHERE id = ?
  `).run(
    nextUsername,
    updates.displayName !== undefined ? updates.displayName : current.display_name,
    updates.bio !== undefined ? updates.bio : current.bio,
    updates.avatarUrl !== undefined ? updates.avatarUrl : current.avatar_url,
    updates.profileVisibility !== undefined ? updates.profileVisibility : current.profile_visibility,
    favJson,
    userId
  );

  return { success: true };
}
