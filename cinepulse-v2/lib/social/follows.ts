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

export async function followUser(
  followerId: string,
  targetUsername: string,
  timestamp?: string
): Promise<{ success: boolean; status: 'accepted' | 'pending'; error?: string; httpStatus?: number }> {
  const target = (await getUserByUsername(targetUsername));
  if (!target) return { success: false, status: 'pending', error: 'User not found', httpStatus: 404 };
  if (followerId === target.id) return { success: false, status: 'pending', error: 'You cannot follow yourself', httpStatus: 400 };

  const d = db();

  // Check blocks
  const blocked = (await d.get(`
    SELECT 1 FROM blocks
    WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
  `, followerId, target.id, target.id, followerId));

  if (blocked) {
    return { success: false, status: 'pending', error: 'Unable to follow this user', httpStatus: 403 };
  }

  // Check existing follow
  const existing = (await d.get('SELECT status FROM follows WHERE follower_id = ? AND followee_id = ?', followerId, target.id)) as { status: string } | undefined;
  if (existing) {
    return { success: true, status: existing.status as 'accepted' | 'pending' };
  }

  const isPrivate = target.profile_visibility === 'private';
  const followStatus: 'accepted' | 'pending' = isPrivate ? 'pending' : 'accepted';
  const stamp = timestamp || now();

  (await d.run(`
    INSERT INTO follows (follower_id, followee_id, status, created_at)
    VALUES (?, ?, ?, ?)
  `, followerId, target.id, followStatus, stamp));

  if (followStatus === 'pending') {
    (await createNotification(target.id, followerId, 'follow_request', 'user', followerId));
  } else {
    (await createNotification(target.id, followerId, 'followed_you', 'user', followerId));
    (await logActivityEvent(followerId, 'followed', 'user', target.id, { username: target.username }, stamp));
  }

  return { success: true, status: followStatus };
}

export async function unfollowUser(
  followerId: string,
  targetUsername: string
): Promise<{ success: boolean; error?: string; httpStatus?: number }> {
  const target = (await getUserByUsername(targetUsername));
  if (!target) return { success: false, error: 'User not found', httpStatus: 404 };

  const d = db();
  (await d.run('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?', followerId, target.id));
  return { success: true };
}

export async function getPendingFollowRequests(userId: string): Promise<Array<{
  id: string; // followerId
  follower: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
  };
  createdAt: string;
}>> {
  const d = db();
  const rows = (await d.all(`
    SELECT f.follower_id, f.created_at,
           u.id, u.username, u.display_name, u.name, u.avatar_url, u.bio
    FROM follows f
    JOIN users u ON u.id = f.follower_id
    WHERE f.followee_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `, userId)) as any[];

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

export async function acceptFollowRequest(
  followeeId: string,
  followerId: string
): Promise<{ success: boolean; error?: string; httpStatus?: number }> {
  const d = db();
  const res = (await d.run(`
    UPDATE follows SET status = 'accepted'
    WHERE follower_id = ? AND followee_id = ? AND status = 'pending'
  `, followerId, followeeId));

  if (res.changes === 0) {
    return { success: false, error: 'Request not found or already accepted', httpStatus: 404 };
  }

  (await createNotification(followerId, followeeId, 'followed_you', 'user', followeeId));
  const target = (await getUserById(followeeId));
  if (target) {
    (await logActivityEvent(followerId, 'followed', 'user', followeeId, { username: target.username }));
  }

  return { success: true };
}

export async function declineFollowRequest(
  followeeId: string,
  followerId: string
): Promise<{ success: boolean; error?: string; httpStatus?: number }> {
  const d = db();
  const res = (await d.run(`
    DELETE FROM follows
    WHERE follower_id = ? AND followee_id = ? AND status = 'pending'
  `, followerId, followeeId));

  if (res.changes === 0) {
    return { success: false, error: 'Request not found', httpStatus: 404 };
  }

  return { success: true };
}

export async function getFollowers(
  targetUsername: string,
  viewerId: string | null,
  limit = 20,
  cursor?: string | null
): Promise<FollowListResponse & { error?: string; httpStatus?: number }> {
  const target = (await getUserByUsername(targetUsername));
  if (!target) return { items: [], nextCursor: null, hasMore: false, error: 'User not found', httpStatus: 404 };

  const visibility = (await resolveVisibility(viewerId, target.id, 'profile'));
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

  const rows = (await d.all(`
    SELECT f.follower_id, f.created_at,
           u.id, u.username, u.display_name, u.name, u.avatar_url, u.bio
    FROM follows f
    JOIN users u ON u.id = f.follower_id
    WHERE f.followee_id = ? AND f.status = 'accepted'
    ${cursorQuery}
    ORDER BY f.created_at DESC, f.follower_id DESC
    LIMIT ?
  `, ...params)) as any[];

  const hasMore = rows.length > safeLimit;
  const itemsSlice = hasMore ? rows.slice(0, safeLimit) : rows;

  // Check viewer's following status for each user
  const items = (await Promise.all(itemsSlice.map(async (r) => {
    let isFollowing = false;
    if (viewerId) {
      const isF = (await d.get(`SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ? AND status = 'accepted'`, viewerId, r.id));
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
  })));

  let nextCursor: string | null = null;
  if (hasMore && itemsSlice.length > 0) {
    const lastItem = itemsSlice[itemsSlice.length - 1];
    nextCursor = `${lastItem.created_at}|${lastItem.id}`;
  }

  return { items, nextCursor, hasMore };
}

export async function getFollowing(
  targetUsername: string,
  viewerId: string | null,
  limit = 20,
  cursor?: string | null
): Promise<FollowListResponse & { error?: string; httpStatus?: number }> {
  const target = (await getUserByUsername(targetUsername));
  if (!target) return { items: [], nextCursor: null, hasMore: false, error: 'User not found', httpStatus: 404 };

  const visibility = (await resolveVisibility(viewerId, target.id, 'profile'));
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

  const rows = (await d.all(`
    SELECT f.followee_id, f.created_at,
           u.id, u.username, u.display_name, u.name, u.avatar_url, u.bio
    FROM follows f
    JOIN users u ON u.id = f.followee_id
    WHERE f.follower_id = ? AND f.status = 'accepted'
    ${cursorQuery}
    ORDER BY f.created_at DESC, f.followee_id DESC
    LIMIT ?
  `, ...params)) as any[];

  const hasMore = rows.length > safeLimit;
  const itemsSlice = hasMore ? rows.slice(0, safeLimit) : rows;

  const items = (await Promise.all(itemsSlice.map(async (r) => {
    let isFollowing = false;
    if (viewerId) {
      const isF = (await d.get(`SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ? AND status = 'accepted'`, viewerId, r.id));
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
  })));

  let nextCursor: string | null = null;
  if (hasMore && itemsSlice.length > 0) {
    const lastItem = itemsSlice[itemsSlice.length - 1];
    nextCursor = `${lastItem.created_at}|${lastItem.id}`;
  }

  return { items, nextCursor, hasMore };
}
