import { db, now } from '../db';
import { getUserByUsername, getUserById } from './profile';
import { createNotification } from './notifications';
import type { CommentRecord, TargetType } from '../types';

// ─── Likes ──────────────────────────────────────────────────────────────────

export async function toggleLike(
  userId: string,
  targetType: TargetType,
  targetId: string,
  likeAction: boolean,
  timestamp?: string
): Promise<{ liked: boolean; likesCount: number; error?: string }> {
  const d = db();
  const stamp = timestamp || now();

  if (likeAction) {
    (await d.run(`
      INSERT INTO likes (user_id, target_type, target_id, created_at)
      VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING
    `, userId, targetType, targetId, stamp));

    // Notify target author if applicable
    let ownerId: string | null = null;
    if (targetType === 'review') {
      const row = (await d.get('SELECT user_id FROM reviews WHERE id = ?', targetId)) as { user_id: string } | undefined;
      ownerId = row?.user_id || null;
      if (ownerId) (await createNotification(ownerId, userId, 'liked_review', 'review', targetId));
    } else if (targetType === 'list') {
      const row = (await d.get('SELECT user_id FROM user_lists WHERE id = ?', targetId)) as { user_id: string } | undefined;
      ownerId = row?.user_id || null;
      if (ownerId) (await createNotification(ownerId, userId, 'liked_list', 'list', targetId));
    } else if (targetType === 'activity_event') {
      const row = (await d.get('SELECT user_id FROM activity_events WHERE id = ?', targetId)) as { user_id: string } | undefined;
      ownerId = row?.user_id || null;
      if (ownerId) (await createNotification(ownerId, userId, 'liked_review', 'activity_event', targetId));
    }
  } else {
    (await d.run(`
      DELETE FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?
    `, userId, targetType, targetId));
  }

  const countRow = (await d.get(`
    SELECT COUNT(*) as count FROM likes WHERE target_type = ? AND target_id = ?
  `, targetType, targetId)) as { count: number } | undefined;

  return { liked: likeAction, likesCount: Number(countRow?.count || 0) };
}

export async function getLikesSummary(targetType: TargetType, targetId: string, viewerId?: string | null): Promise<{
  count: number;
  isLiked: boolean;
}> {
  const d = db();
  const countRow = (await d.get(`
    SELECT COUNT(*) as count FROM likes WHERE target_type = ? AND target_id = ?
  `, targetType, targetId)) as { count: number } | undefined;

  const isLiked = viewerId
    ? Boolean((await d.get('SELECT 1 FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?', viewerId, targetType, targetId)))
    : false;

  return { count: Number(countRow?.count || 0), isLiked };
}

// ─── Comments ───────────────────────────────────────────────────────────────

export async function addComment(
  userId: string,
  targetType: TargetType,
  targetId: string,
  body: string,
  timestamp?: string
): Promise<{ success: boolean; comment?: CommentRecord; error?: string; httpStatus?: number }> {
  const cleanBody = body?.trim();
  if (!cleanBody) return { success: false, error: 'Comment body cannot be empty', httpStatus: 400 };
  if (cleanBody.length > 2000) return { success: false, error: 'Comment cannot exceed 2000 characters', httpStatus: 400 };

  const d = db();
  const stamp = timestamp || now();

  // Find target author to check blocks
  let targetOwnerId: string | null = null;
  if (targetType === 'review') {
    const row = (await d.get('SELECT user_id FROM reviews WHERE id = ?', targetId)) as { user_id: string } | undefined;
    targetOwnerId = row?.user_id || null;
  } else if (targetType === 'list') {
    const row = (await d.get('SELECT user_id FROM user_lists WHERE id = ?', targetId)) as { user_id: string } | undefined;
    targetOwnerId = row?.user_id || null;
  }

  if (targetOwnerId) {
    const blocked = (await d.get(`
      SELECT 1 FROM blocks
      WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
    `, userId, targetOwnerId, targetOwnerId, userId));

    if (blocked) {
      return { success: false, error: 'Unable to comment on this content', httpStatus: 403 };
    }
  }

  const res = (await d.get<{ id: number }>(`
    INSERT INTO comments (user_id, target_type, target_id, body, created_at)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id
  `, userId, targetType, targetId, cleanBody, stamp));

  const commentId = Number(res?.id);

  if (targetOwnerId && targetOwnerId !== userId) {
    (await createNotification(targetOwnerId, userId, 'commented', targetType, targetId));
  }

  const user = (await getUserById(userId));
  const comment: CommentRecord = {
    id: commentId,
    userId,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name || user.name,
      avatarUrl: user.avatar_url,
    },
    targetType,
    targetId,
    body: cleanBody,
    createdAt: stamp,
    isOwner: true,
  };

  return { success: true, comment };
}

export async function deleteComment(
  commentId: number,
  requesterId: string
): Promise<{ success: boolean; error?: string; httpStatus?: number }> {
  const d = db();
  const comment = (await d.get(`
    SELECT c.*, 
      r.user_id as review_owner_id, 
      l.user_id as list_owner_id
    FROM comments c
    LEFT JOIN reviews r ON c.target_type = 'review' AND c.target_id = r.id
    LEFT JOIN user_lists l ON c.target_type = 'list' AND c.target_id = l.id
    WHERE c.id = ?
  `, commentId)) as any;

  if (!comment) return { success: false, error: 'Comment not found', httpStatus: 404 };

  const isAuthor = comment.user_id === requesterId;
  const isTargetOwner = comment.review_owner_id === requesterId || comment.list_owner_id === requesterId;

  if (!isAuthor && !isTargetOwner) {
    return { success: false, error: 'Not authorized to delete this comment', httpStatus: 403 };
  }

  const stamp = now();
  (await d.run('UPDATE comments SET deleted_at = ? WHERE id = ?', stamp, commentId));

  return { success: true };
}

export async function getComments(
  targetType: TargetType,
  targetId: string,
  viewerId?: string | null
): Promise<CommentRecord[]> {
  const d = db();

  // Find target owner
  let targetOwnerId: string | null = null;
  if (targetType === 'review') {
    const row = (await d.get('SELECT user_id FROM reviews WHERE id = ?', targetId)) as { user_id: string } | undefined;
    targetOwnerId = row?.user_id || null;
  } else if (targetType === 'list') {
    const row = (await d.get('SELECT user_id FROM user_lists WHERE id = ?', targetId)) as { user_id: string } | undefined;
    targetOwnerId = row?.user_id || null;
  }

  // Block cascade: hide comments from users blocked by viewer OR targetOwner
  let blockFilter = '';
  if (viewerId || targetOwnerId) {
    const blockers = [viewerId, targetOwnerId].filter(Boolean);
    const placeholders = blockers.map(() => '?').join(',');
    blockFilter = `
      AND c.user_id NOT IN (
        SELECT blocked_id FROM blocks WHERE blocker_id IN (${placeholders})
        UNION
        SELECT blocker_id FROM blocks WHERE blocked_id IN (${placeholders})
      )
    `;
  }

  const params: any[] = [targetType, targetId];
  if (viewerId || targetOwnerId) {
    const blockers = [viewerId, targetOwnerId].filter(Boolean);
    params.push(...blockers, ...blockers);
  }

  const rows = (await d.all(`
    SELECT
      c.id, c.user_id, c.target_type, c.target_id, c.body, c.created_at, c.deleted_at,
      u.username, u.display_name, u.name, u.avatar_url
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.target_type = ? AND c.target_id = ? AND c.hidden_at IS NULL
    ${blockFilter}
    ORDER BY c.created_at ASC
  `, ...params)) as any[];

  return rows.map((r) => {
    const isDeleted = Boolean(r.deleted_at);
    const isAuthor = viewerId === r.user_id;
    const isTargetOwner = viewerId === targetOwnerId;

    return {
      id: r.id,
      userId: r.user_id,
      user: {
        id: r.user_id,
        username: isDeleted ? 'deleted' : r.username,
        displayName: isDeleted ? 'Deleted User' : (r.display_name || r.name),
        avatarUrl: isDeleted ? null : r.avatar_url,
      },
      targetType: r.target_type,
      targetId: r.target_id,
      body: isDeleted ? '[Comment deleted]' : r.body,
      createdAt: r.created_at,
      deletedAt: r.deleted_at,
      isDeleted,
      isOwner: isAuthor,
      canDelete: isAuthor || isTargetOwner,
    };
  });
}

// ─── Blocks ─────────────────────────────────────────────────────────────────

export async function blockUser(
  blockerId: string,
  targetUsername: string
): Promise<{ success: boolean; error?: string; httpStatus?: number }> {
  const target = (await getUserByUsername(targetUsername));
  if (!target) return { success: false, error: 'User not found', httpStatus: 404 };
  if (blockerId === target.id) return { success: false, error: 'Cannot block yourself', httpStatus: 400 };

  const d = db();
  const stamp = now();

  // Sever follows in both directions
  (await d.run('DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)', blockerId, target.id, target.id, blockerId));

  (await d.run(`
    INSERT INTO blocks (blocker_id, blocked_id, created_at)
    VALUES (?, ?, ?) ON CONFLICT DO NOTHING
  `, blockerId, target.id, stamp));

  return { success: true };
}

export async function unblockUser(
  blockerId: string,
  targetUsername: string
): Promise<{ success: boolean; error?: string; httpStatus?: number }> {
  const target = (await getUserByUsername(targetUsername));
  if (!target) return { success: false, error: 'User not found', httpStatus: 404 };

  const d = db();
  (await d.run('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', blockerId, target.id));

  return { success: true };
}

export async function getBlockedUsers(userId: string): Promise<Array<{
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  blockedAt: string;
}>> {
  const d = db();
  const rows = (await d.all(`
    SELECT b.blocked_id, b.created_at,
           u.id, u.username, u.display_name, u.name, u.avatar_url
    FROM blocks b
    JOIN users u ON u.id = b.blocked_id
    WHERE b.blocker_id = ?
    ORDER BY b.created_at DESC
  `, userId)) as any[];

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name || r.name,
    avatarUrl: r.avatar_url,
    blockedAt: r.created_at,
  }));
}

// ─── Mutes ──────────────────────────────────────────────────────────────────

export async function muteUser(
  muterId: string,
  targetUsername: string
): Promise<{ success: boolean; error?: string; httpStatus?: number }> {
  const target = (await getUserByUsername(targetUsername));
  if (!target) return { success: false, error: 'User not found', httpStatus: 404 };
  if (muterId === target.id) return { success: false, error: 'Cannot mute yourself', httpStatus: 400 };

  const d = db();
  const stamp = new Date().toISOString();
  (await d.run(`INSERT INTO mutes (muter_id, muted_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`, muterId, target.id, stamp));

  return { success: true };
}

export async function unmuteUser(
  muterId: string,
  targetUsername: string
): Promise<{ success: boolean; error?: string; httpStatus?: number }> {
  const target = (await getUserByUsername(targetUsername));
  if (!target) return { success: false, error: 'User not found', httpStatus: 404 };

  const d = db();
  (await d.run(`DELETE FROM mutes WHERE muter_id = ? AND muted_id = ?`, muterId, target.id));

  return { success: true };
}

export async function getMutedUsers(userId: string): Promise<Array<{
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  mutedAt: string;
}>> {
  const d = db();
  const rows = (await d.all(`
    SELECT m.muted_id, m.created_at,
           u.id, u.username, u.display_name, u.name, u.avatar_url
    FROM mutes m
    JOIN users u ON u.id = m.muted_id
    WHERE m.muter_id = ?
    ORDER BY m.created_at DESC
  `, userId)) as any[];

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name || r.name,
    avatarUrl: r.avatar_url,
    mutedAt: r.created_at,
  }));
}

export async function isMuted(muterId: string, targetId: string): Promise<boolean> {
  const d = db();
  return Boolean((await d.get(`SELECT 1 FROM mutes WHERE muter_id = ? AND muted_id = ?`, muterId, targetId)));
}

