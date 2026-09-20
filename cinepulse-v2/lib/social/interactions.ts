import { db, now } from '../db';
import { getUserByUsername, getUserById } from './profile';
import { createNotification } from './notifications';
import type { CommentRecord, TargetType } from '../types';

// ─── Likes ──────────────────────────────────────────────────────────────────

export function toggleLike(
  userId: string,
  targetType: TargetType,
  targetId: string,
  likeAction: boolean
): { liked: boolean; likesCount: number; error?: string } {
  const d = db();
  const stamp = now();

  if (likeAction) {
    d.prepare(`
      INSERT OR IGNORE INTO likes (user_id, target_type, target_id, created_at)
      VALUES (?, ?, ?, ?)
    `).run(userId, targetType, targetId, stamp);

    // Notify target author if applicable
    let ownerId: string | null = null;
    if (targetType === 'review') {
      const row = d.prepare('SELECT user_id FROM reviews WHERE id = ?').get(targetId) as { user_id: string } | undefined;
      ownerId = row?.user_id || null;
      if (ownerId) createNotification(ownerId, userId, 'liked_review', 'review', targetId);
    } else if (targetType === 'list') {
      const row = d.prepare('SELECT user_id FROM user_lists WHERE id = ?').get(targetId) as { user_id: string } | undefined;
      ownerId = row?.user_id || null;
      if (ownerId) createNotification(ownerId, userId, 'liked_review', 'list', targetId);
    } else if (targetType === 'activity_event') {
      const row = d.prepare('SELECT user_id FROM activity_events WHERE id = ?').get(targetId) as { user_id: string } | undefined;
      ownerId = row?.user_id || null;
      if (ownerId) createNotification(ownerId, userId, 'liked_review', 'activity_event', targetId);
    }
  } else {
    d.prepare(`
      DELETE FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?
    `).run(userId, targetType, targetId);
  }

  const countRow = d.prepare(`
    SELECT COUNT(*) as count FROM likes WHERE target_type = ? AND target_id = ?
  `).get(targetType, targetId) as { count: number } | undefined;

  return { liked: likeAction, likesCount: Number(countRow?.count || 0) };
}

export function getLikesSummary(targetType: TargetType, targetId: string, viewerId?: string | null): {
  count: number;
  isLiked: boolean;
} {
  const d = db();
  const countRow = d.prepare(`
    SELECT COUNT(*) as count FROM likes WHERE target_type = ? AND target_id = ?
  `).get(targetType, targetId) as { count: number } | undefined;

  const isLiked = viewerId
    ? Boolean(d.prepare('SELECT 1 FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?').get(viewerId, targetType, targetId))
    : false;

  return { count: Number(countRow?.count || 0), isLiked };
}

// ─── Comments ───────────────────────────────────────────────────────────────

export function addComment(
  userId: string,
  targetType: TargetType,
  targetId: string,
  body: string
): { success: boolean; comment?: CommentRecord; error?: string; httpStatus?: number } {
  const cleanBody = body?.trim();
  if (!cleanBody) return { success: false, error: 'Comment body cannot be empty', httpStatus: 400 };
  if (cleanBody.length > 2000) return { success: false, error: 'Comment cannot exceed 2000 characters', httpStatus: 400 };

  const d = db();
  const stamp = now();

  // Find target author to check blocks
  let targetOwnerId: string | null = null;
  if (targetType === 'review') {
    const row = d.prepare('SELECT user_id FROM reviews WHERE id = ?').get(targetId) as { user_id: string } | undefined;
    targetOwnerId = row?.user_id || null;
  } else if (targetType === 'list') {
    const row = d.prepare('SELECT user_id FROM user_lists WHERE id = ?').get(targetId) as { user_id: string } | undefined;
    targetOwnerId = row?.user_id || null;
  }

  if (targetOwnerId) {
    const blocked = d.prepare(`
      SELECT 1 FROM blocks
      WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
    `).get(userId, targetOwnerId, targetOwnerId, userId);

    if (blocked) {
      return { success: false, error: 'Unable to comment on this content', httpStatus: 403 };
    }
  }

  const res = d.prepare(`
    INSERT INTO comments (user_id, target_type, target_id, body, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, targetType, targetId, cleanBody, stamp);

  const commentId = Number(res.lastInsertRowid);

  if (targetOwnerId && targetOwnerId !== userId) {
    createNotification(targetOwnerId, userId, 'commented', targetType, targetId);
  }

  const user = getUserById(userId);
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

export function deleteComment(
  commentId: number,
  requesterId: string
): { success: boolean; error?: string; httpStatus?: number } {
  const d = db();
  const comment = d.prepare(`
    SELECT c.*, 
      r.user_id as review_owner_id, 
      l.user_id as list_owner_id
    FROM comments c
    LEFT JOIN reviews r ON c.target_type = 'review' AND c.target_id = r.id
    LEFT JOIN user_lists l ON c.target_type = 'list' AND c.target_id = l.id
    WHERE c.id = ?
  `).get(commentId) as any;

  if (!comment) return { success: false, error: 'Comment not found', httpStatus: 404 };

  const isAuthor = comment.user_id === requesterId;
  const isTargetOwner = comment.review_owner_id === requesterId || comment.list_owner_id === requesterId;

  if (!isAuthor && !isTargetOwner) {
    return { success: false, error: 'Not authorized to delete this comment', httpStatus: 403 };
  }

  const stamp = now();
  d.prepare('UPDATE comments SET deleted_at = ? WHERE id = ?').run(stamp, commentId);

  return { success: true };
}

export function getComments(
  targetType: TargetType,
  targetId: string,
  viewerId?: string | null
): CommentRecord[] {
  const d = db();

  // Find target owner
  let targetOwnerId: string | null = null;
  if (targetType === 'review') {
    const row = d.prepare('SELECT user_id FROM reviews WHERE id = ?').get(targetId) as { user_id: string } | undefined;
    targetOwnerId = row?.user_id || null;
  } else if (targetType === 'list') {
    const row = d.prepare('SELECT user_id FROM user_lists WHERE id = ?').get(targetId) as { user_id: string } | undefined;
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

  const rows = d.prepare(`
    SELECT
      c.id, c.user_id, c.target_type, c.target_id, c.body, c.created_at, c.deleted_at,
      u.username, u.display_name, u.name, u.avatar_url
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.target_type = ? AND c.target_id = ?
    ${blockFilter}
    ORDER BY c.created_at ASC
  `).all(...params) as any[];

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

export function blockUser(
  blockerId: string,
  targetUsername: string
): { success: boolean; error?: string; httpStatus?: number } {
  const target = getUserByUsername(targetUsername);
  if (!target) return { success: false, error: 'User not found', httpStatus: 404 };
  if (blockerId === target.id) return { success: false, error: 'Cannot block yourself', httpStatus: 400 };

  const d = db();
  const stamp = now();

  // Sever follows in both directions
  d.prepare('DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)').run(
    blockerId, target.id, target.id, blockerId
  );

  d.prepare(`
    INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at)
    VALUES (?, ?, ?)
  `).run(blockerId, target.id, stamp);

  return { success: true };
}

export function unblockUser(
  blockerId: string,
  targetUsername: string
): { success: boolean; error?: string; httpStatus?: number } {
  const target = getUserByUsername(targetUsername);
  if (!target) return { success: false, error: 'User not found', httpStatus: 404 };

  const d = db();
  d.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(blockerId, target.id);

  return { success: true };
}

export function getBlockedUsers(userId: string): Array<{
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  blockedAt: string;
}> {
  const d = db();
  const rows = d.prepare(`
    SELECT b.blocked_id, b.created_at,
           u.id, u.username, u.display_name, u.name, u.avatar_url
    FROM blocks b
    JOIN users u ON u.id = b.blocked_id
    WHERE b.blocker_id = ?
    ORDER BY b.created_at DESC
  `).all(userId) as any[];

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name || r.name,
    avatarUrl: r.avatar_url,
    blockedAt: r.created_at,
  }));
}
