import { db, now } from '../db';
import type { NotificationRecord, NotificationType, TargetType } from '../types';

export function createNotification(
  userId: string,
  actorId: string,
  type: NotificationType,
  targetType?: TargetType,
  targetId?: string
): number | null {
  // Do not notify a user about their own actions
  if (userId === actorId) return null;

  const d = db();
  const stamp = now();

  // Avoid duplicate unread notifications of same type/actor/target
  const existing = d.prepare(`
    SELECT id FROM notifications
    WHERE user_id = ? AND actor_id = ? AND type = ? AND target_id = ? AND read_at IS NULL
  `).get(userId, actorId, type, targetId || null) as { id: number } | undefined;

  if (existing) {
    return existing.id;
  }

  const res = d.prepare(`
    INSERT INTO notifications (user_id, actor_id, type, target_type, target_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, actorId, type, targetType || null, targetId || null, stamp);

  return Number(res.lastInsertRowid);
}

export function getUnreadCount(userId: string): number {
  const d = db();
  const row = d.prepare(`
    SELECT COUNT(*) as count FROM notifications
    WHERE user_id = ? AND read_at IS NULL
  `).get(userId) as { count: number } | undefined;

  return Number(row?.count || 0);
}

export function getNotifications(
  userId: string,
  limit = 20,
  cursor?: string | null
): { items: NotificationRecord[]; nextCursor: string | null; hasMore: boolean } {
  const d = db();
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  let cursorClause = '';
  const params: any[] = [userId];

  if (cursor) {
    const [cursorCreatedAt, cursorId] = cursor.split('|');
    if (cursorCreatedAt && cursorId) {
      cursorClause = 'AND (n.created_at < ? OR (n.created_at = ? AND n.id < ?))';
      params.push(cursorCreatedAt, cursorCreatedAt, Number(cursorId));
    }
  }

  params.push(safeLimit + 1);

  const rows = d.prepare(`
    SELECT
      n.id, n.user_id, n.actor_id, n.type, n.target_type, n.target_id, n.read_at, n.created_at,
      u.username, u.display_name, u.name, u.avatar_url
    FROM notifications n
    JOIN users u ON u.id = n.actor_id
    WHERE n.user_id = ?
    ${cursorClause}
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT ?
  `).all(...params) as any[];

  const hasMore = rows.length > safeLimit;
  const itemsSlice = hasMore ? rows.slice(0, safeLimit) : rows;

  const items: NotificationRecord[] = itemsSlice.map((r) => ({
    id: r.id,
    userId: r.user_id,
    actorId: r.actor_id,
    actor: {
      id: r.actor_id,
      username: r.username,
      displayName: r.display_name || r.name,
      avatarUrl: r.avatar_url,
    },
    type: r.type,
    targetType: r.target_type,
    targetId: r.target_id,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));

  let nextCursor: string | null = null;
  if (hasMore && itemsSlice.length > 0) {
    const last = itemsSlice[itemsSlice.length - 1];
    nextCursor = `${last.created_at}|${last.id}`;
  }

  return { items, nextCursor, hasMore };
}

export function markNotificationsAsRead(userId: string, ids?: number[]): void {
  const d = db();
  const stamp = now();

  if (Array.isArray(ids) && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    d.prepare(`
      UPDATE notifications SET read_at = ?
      WHERE user_id = ? AND id IN (${placeholders}) AND read_at IS NULL
    `).run(stamp, userId, ...ids);
  } else {
    d.prepare(`
      UPDATE notifications SET read_at = ?
      WHERE user_id = ? AND read_at IS NULL
    `).run(stamp, userId);
  }
}
