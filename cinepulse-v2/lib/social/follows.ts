import { db, now } from '../db';
import { getUserByUsername, getUserById } from './profile';
import { resolveVisibility } from './visibility';
import { createNotification } from './notifications';
import { logActivityEvent } from './activity';

export interface FollowListResponse {
  items: Array<{
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    isFollowing?: boolean;
    followedAt: string;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

export function followUser(
  followerId: string,
  targetUsername: string
): { success: boolean; status: 'accepted' | 'pending'; error?: string; httpStatus?: number } {
  const target = getUserByUsername(targetUsername);
  if (!target) return { success: false, status: 'pending', error: 'User not found', httpStatus: 404 };
  if (followerId === target.id) return { success: false, status: 'pending', error: 'You cannot follow yourself', httpStatus: 400 };

  const d = db();

  // Check blocks
  const blocked = d.prepare(`
    SELECT 1 FROM blocks
    WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
  `).get(followerId, target.id, target.id, followerId);

  if (blocked) {
    return { success: false, status: 'pending', error: 'Unable to follow this user', httpStatus: 403 };
  }

  // Check existing follow
  const existing = d.prepare('SELECT status FROM follows WHERE follower_id = ? AND followee_id = ?').get(followerId, target.id) as { status: string } | undefined;
  if (existing) {
    return { success: true, status: existing.status as 'accepted' | 'pending' };
  }

  const isPrivate = target.profile_visibility === 'private';
  const followStatus: 'accepted' | 'pending' = isPrivate ? 'pending' : 'accepted';
  const stamp = now();

  d.prepare(`
    INSERT INTO follows (follower_id, followee_id, status, created_at)
    VALUES (?, ?, ?, ?)
  `).run(followerId, target.id, followStatus, stamp);

  if (followStatus === 'pending') {
    createNotification(target.id, followerId, 'follow_request', 'user', followerId);
  } else {
    createNotification(target.id, followerId, 'followed_you', 'user', followerId);
    logActivityEvent(followerId, 'followed', 'user', target.id, { username: target.username });
  }

  return { success: true, status: followStatus };
}

export function unfollowUser(
  followerId: string,
  targetUsername: string
): { success: boolean; error?: string; httpStatus?: number } {
  const target = getUserByUsername(targetUsername);
  if (!target) return { success: false, error: 'User not found', httpStatus: 404 };

  const d = db();
  d.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(followerId, target.id);
  return { success: true };
}

export function getPendingFollowRequests(userId: string): Array<{
  id: string; // followerId
  follower: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
  };
  createdAt: string;
}> {
  const d = db();
  const rows = d.prepare(`
    SELECT f.follower_id, f.created_at,
           u.id, u.username, u.display_name, u.name, u.avatar_url, u.bio
    FROM follows f
    JOIN users u ON u.id = f.follower_id
    WHERE f.followee_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(userId) as any[];

  return rows.map((r) => ({
    id: r.follower_id,
    follower: {
      id: r.id,
      username: r.username,
      displayName: r.display_name || r.name,
      avatarUrl: r.avatar_url,
      bio: r.bio,
    },
    createdAt: r.created_at,
  }));
}

export function acceptFollowRequest(
  followeeId: string,
  followerId: string
): { success: boolean; error?: string; httpStatus?: number } {
  const d = db();
  const res = d.prepare(`
    UPDATE follows SET status = 'accepted'
    WHERE follower_id = ? AND followee_id = ? AND status = 'pending'
  `).run(followerId, followeeId);

  if (res.changes === 0) {
    return { success: false, error: 'Request not found or already accepted', httpStatus: 404 };
  }

  createNotification(followerId, followeeId, 'followed_you', 'user', followeeId);
  const target = getUserById(followeeId);
  if (target) {
    logActivityEvent(followerId, 'followed', 'user', followeeId, { username: target.username });
  }

  return { success: true };
}

export function declineFollowRequest(
  followeeId: string,
  followerId: string
): { success: boolean; error?: string; httpStatus?: number } {
  const d = db();
  const res = d.prepare(`
    DELETE FROM follows
    WHERE follower_id = ? AND followee_id = ? AND status = 'pending'
  `).run(followerId, followeeId);

  if (res.changes === 0) {
    return { success: false, error: 'Request not found', httpStatus: 404 };
  }

  return { success: true };
}

export function getFollowers(
  targetUsername: string,
  viewerId: string | null,
  limit = 20,
  cursor?: string | null
): FollowListResponse & { error?: string; httpStatus?: number } {
  const target = getUserByUsername(targetUsername);
  if (!target) return { items: [], nextCursor: null, hasMore: false, error: 'User not found', httpStatus: 404 };

  const visibility = resolveVisibility(viewerId, target.id, 'profile');
  if (!visibility.allowed) {
    return { items: [], nextCursor: null, hasMore: false, error: 'Private account', httpStatus: 403 };
  }

  const d = db();
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  // Composite cursor decoding: "created_at|id"
  let cursorQuery = '';
  const params: any[] = [target.id];

  if (cursor) {
    const [cursorCreatedAt, cursorId] = cursor.split('|');
    if (cursorCreatedAt && cursorId) {
      cursorQuery = 'AND (f.created_at < ? OR (f.created_at = ? AND f.follower_id < ?))';
      params.push(cursorCreatedAt, cursorCreatedAt, cursorId);
    }
  }

  params.push(safeLimit + 1);

  const rows = d.prepare(`
    SELECT f.follower_id, f.created_at,
           u.id, u.username, u.display_name, u.name, u.avatar_url, u.bio
    FROM follows f
    JOIN users u ON u.id = f.follower_id
    WHERE f.followee_id = ? AND f.status = 'accepted'
    ${cursorQuery}
    ORDER BY f.created_at DESC, f.follower_id DESC
    LIMIT ?
  `).all(...params) as any[];

  const hasMore = rows.length > safeLimit;
  const itemsSlice = hasMore ? rows.slice(0, safeLimit) : rows;

  // Check viewer's following status for each user
  const items = itemsSlice.map((r) => {
    let isFollowing = false;
    if (viewerId) {
      const isF = d.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ? AND status = "accepted"').get(viewerId, r.id);
      isFollowing = Boolean(isF);
    }
    return {
      id: r.id,
      username: r.username,
      displayName: r.display_name || r.name,
      avatarUrl: r.avatar_url,
      bio: r.bio,
      isFollowing,
      followedAt: r.created_at,
    };
  });

  let nextCursor: string | null = null;
  if (hasMore && itemsSlice.length > 0) {
    const lastItem = itemsSlice[itemsSlice.length - 1];
    nextCursor = `${lastItem.created_at}|${lastItem.id}`;
  }

  return { items, nextCursor, hasMore };
}

export function getFollowing(
  targetUsername: string,
  viewerId: string | null,
  limit = 20,
  cursor?: string | null
): FollowListResponse & { error?: string; httpStatus?: number } {
  const target = getUserByUsername(targetUsername);
  if (!target) return { items: [], nextCursor: null, hasMore: false, error: 'User not found', httpStatus: 404 };

  const visibility = resolveVisibility(viewerId, target.id, 'profile');
  if (!visibility.allowed) {
    return { items: [], nextCursor: null, hasMore: false, error: 'Private account', httpStatus: 403 };
  }

  const d = db();
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  let cursorQuery = '';
  const params: any[] = [target.id];

  if (cursor) {
    const [cursorCreatedAt, cursorId] = cursor.split('|');
    if (cursorCreatedAt && cursorId) {
      cursorQuery = 'AND (f.created_at < ? OR (f.created_at = ? AND f.followee_id < ?))';
      params.push(cursorCreatedAt, cursorCreatedAt, cursorId);
    }
  }

  params.push(safeLimit + 1);

  const rows = d.prepare(`
    SELECT f.followee_id, f.created_at,
           u.id, u.username, u.display_name, u.name, u.avatar_url, u.bio
    FROM follows f
    JOIN users u ON u.id = f.followee_id
    WHERE f.follower_id = ? AND f.status = 'accepted'
    ${cursorQuery}
    ORDER BY f.created_at DESC, f.followee_id DESC
    LIMIT ?
  `).all(...params) as any[];

  const hasMore = rows.length > safeLimit;
  const itemsSlice = hasMore ? rows.slice(0, safeLimit) : rows;

  const items = itemsSlice.map((r) => {
    let isFollowing = false;
    if (viewerId) {
      const isF = d.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ? AND status = "accepted"').get(viewerId, r.id);
      isFollowing = Boolean(isF);
    }
    return {
      id: r.id,
      username: r.username,
      displayName: r.display_name || r.name,
      avatarUrl: r.avatar_url,
      bio: r.bio,
      isFollowing,
      followedAt: r.created_at,
    };
  });

  let nextCursor: string | null = null;
  if (hasMore && itemsSlice.length > 0) {
    const lastItem = itemsSlice[itemsSlice.length - 1];
    nextCursor = `${lastItem.created_at}|${lastItem.id}`;
  }

  return { items, nextCursor, hasMore };
}
