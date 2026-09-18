import { db } from '../db';
import type { PrivacySettings, VisibilityLevel } from '../types';

export type ResourceType =
  | 'profile'
  | 'watchlist'
  | 'diary'
  | 'ratings'
  | 'reviews'
  | 'predictions'
  | 'activity'
  | 'list';

export interface VisibilityDecision {
  allowed: boolean;
  status: 'granted' | 'denied' | 'pending' | 'blocked';
  reason?: string;
  isOwner?: boolean;
  followStatus?: 'accepted' | 'pending' | null;
}

/**
 * Single, non-negotiable entry point for all reads of another user's content.
 * Evaluation Order:
 * 1. Self Check (Viewer is Owner -> Granted)
 * 2. Block Status (Either user blocked the other -> Blocked)
 * 3. Profile-Level Visibility (users.profile_visibility)
 * 4. Resource-Level Visibility (privacy_settings or custom list visibility)
 */
export function resolveVisibility(
  viewerId: string | null,
  ownerId: string,
  resource: ResourceType,
  specificListVisibility?: VisibilityLevel
): VisibilityDecision {
  // 1. Self Check: Owner always has full access to their own resources
  if (viewerId && viewerId === ownerId) {
    return { allowed: true, status: 'granted', isOwner: true };
  }

  const d = db();

  // 2. Block Status Check
  if (viewerId) {
    const blockRow = d.prepare(`
      SELECT 1 FROM blocks 
      WHERE (blocker_id = ? AND blocked_id = ?) 
         OR (blocker_id = ? AND blocked_id = ?)
      LIMIT 1
    `).get(ownerId, viewerId, viewerId, ownerId);

    if (blockRow) {
      return { allowed: false, status: 'blocked', reason: 'User blocked' };
    }
  }

  // Look up owner and profile-level visibility
  const userRow = d.prepare(`
    SELECT profile_visibility FROM users WHERE id = ?
  `).get(ownerId) as { profile_visibility?: string } | undefined;

  if (!userRow) {
    return { allowed: false, status: 'denied', reason: 'User not found' };
  }

  const profileVis: VisibilityLevel = (userRow.profile_visibility as VisibilityLevel) || 'public';

  // Determine follow status if viewer is logged in
  let followStatus: 'accepted' | 'pending' | null = null;
  if (viewerId) {
    const followRow = d.prepare(`
      SELECT status FROM follows WHERE follower_id = ? AND followee_id = ?
    `).get(viewerId, ownerId) as { status: string } | undefined;

    if (followRow) {
      followStatus = followRow.status as 'accepted' | 'pending';
    }
  }

  // 3. Profile-Level Visibility Evaluation
  if (profileVis === 'private') {
    if (followStatus === 'accepted') {
      // Viewer is an accepted follower; proceed to resource check
    } else if (followStatus === 'pending') {
      return { allowed: false, status: 'pending', reason: 'Follow request pending', followStatus };
    } else {
      return { allowed: false, status: 'denied', reason: 'Private account', followStatus };
    }
  } else if (profileVis === 'followers_only') {
    if (followStatus === 'accepted') {
      // Proceed to resource check
    } else {
      return {
        allowed: false,
        status: followStatus === 'pending' ? 'pending' : 'denied',
        reason: 'Followers-only account',
        followStatus
      };
    }
  }

  // If resource is just the profile card itself and profile is public/accessible
  if (resource === 'profile') {
    return { allowed: true, status: 'granted', followStatus };
  }

  // 4. Resource-Level Visibility Evaluation
  let resourceVis: VisibilityLevel = 'public';

  if (resource === 'list' && specificListVisibility) {
    resourceVis = specificListVisibility;
  } else {
    const privacyRow = d.prepare(`
      SELECT * FROM privacy_settings WHERE user_id = ?
    `).get(ownerId) as any;

    if (privacyRow) {
      switch (resource) {
        case 'watchlist':
          resourceVis = privacyRow.watchlist_visibility || 'public';
          break;
        case 'diary':
          resourceVis = privacyRow.diary_visibility || 'public';
          break;
        case 'ratings':
          resourceVis = privacyRow.ratings_visibility || 'public';
          break;
        case 'reviews':
          resourceVis = privacyRow.reviews_visibility || 'public';
          break;
        case 'predictions':
          resourceVis = privacyRow.predictions_visibility || 'public';
          break;
        case 'activity':
          resourceVis = privacyRow.activity_visibility || 'followers_only';
          break;
        default:
          resourceVis = 'public';
      }
    } else if (resource === 'activity') {
      resourceVis = 'followers_only';
    }
  }

  if (resourceVis === 'public') {
    return { allowed: true, status: 'granted', followStatus };
  }

  if (resourceVis === 'followers_only') {
    if (followStatus === 'accepted') {
      return { allowed: true, status: 'granted', followStatus };
    }
    return {
      allowed: false,
      status: followStatus === 'pending' ? 'pending' : 'denied',
      reason: 'Followers-only resource',
      followStatus
    };
  }

  // Private resource: only owner can see (already handled in Step 1)
  return { allowed: false, status: 'denied', reason: 'Private resource', followStatus };
}

export function getPrivacySettings(userId: string): PrivacySettings {
  const d = db();
  let row = d.prepare('SELECT * FROM privacy_settings WHERE user_id = ?').get(userId) as any;
  if (!row) {
    d.prepare('INSERT OR IGNORE INTO privacy_settings (user_id) VALUES (?)').run(userId);
    row = d.prepare('SELECT * FROM privacy_settings WHERE user_id = ?').get(userId) as any;
  }
  return {
    userId,
    watchlistVisibility: row?.watchlist_visibility || 'public',
    diaryVisibility: row?.diary_visibility || 'public',
    ratingsVisibility: row?.ratings_visibility || 'public',
    reviewsVisibility: row?.reviews_visibility || 'public',
    predictionsVisibility: row?.predictions_visibility || 'public',
    activityVisibility: row?.activity_visibility || 'followers_only',
    showInSearch: Boolean(row?.show_in_search ?? 1),
    allowActivityFrom: row?.allow_activity_from || 'everyone',
  };
}

export function updatePrivacySettings(userId: string, updates: Partial<PrivacySettings>): PrivacySettings {
  const current = getPrivacySettings(userId);
  const next: PrivacySettings = { ...current, ...updates };
  const d = db();

  d.prepare(`
    INSERT INTO privacy_settings (
      user_id, watchlist_visibility, diary_visibility, ratings_visibility,
      reviews_visibility, predictions_visibility, activity_visibility,
      show_in_search, allow_activity_from
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      watchlist_visibility = excluded.watchlist_visibility,
      diary_visibility = excluded.diary_visibility,
      ratings_visibility = excluded.ratings_visibility,
      reviews_visibility = excluded.reviews_visibility,
      predictions_visibility = excluded.predictions_visibility,
      activity_visibility = excluded.activity_visibility,
      show_in_search = excluded.show_in_search,
      allow_activity_from = excluded.allow_activity_from
  `).run(
    userId,
    next.watchlistVisibility,
    next.diaryVisibility,
    next.ratingsVisibility,
    next.reviewsVisibility,
    next.predictionsVisibility,
    next.activityVisibility,
    next.showInSearch ? 1 : 0,
    next.allowActivityFrom
  );

  return next;
}
