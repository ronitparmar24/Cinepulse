import { db, now } from '../db';
import type { NotificationRecord, NotificationType, TargetType } from '../types';

export async function createNotification(
  userId: string,
  actorId: string,
  type: NotificationType,
  targetType?: TargetType,
  targetId?: string
): Promise<number | null> {
  // Do not notify a user about their own actions
  if (userId === actorId) return null;

  const d = db();
  const stamp = now();

  // Avoid duplicate unread notifications of same type/actor/target
  const existing = (await d.get(`
    SELECT id FROM notifications
    WHERE user_id = ? AND actor_id = ? AND type = ? AND target_id = ? AND read_at IS NULL
  `, userId, actorId, type, targetId || null)) as { id: number } | undefined;

  if (existing) {
    return existing.id;
  }

  const res = (await d.get<{ id: number }>(`
    INSERT INTO notifications (user_id, actor_id, type, target_type, target_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING id
  `, userId, actorId, type, targetType || null, targetId || null, stamp));

  return Number(res?.id);
}

function reminderTitle(json: string, fallbackId: string): { id: string; title: string; poster: string | null } {
  try {
    const t = JSON.parse(json);
    return { id: String(t.id || fallbackId), title: String(t.title || fallbackId), poster: typeof t.poster === 'string' ? t.poster : null };
  } catch {
    return { id: fallbackId, title: fallbackId, poster: null };
  }
}

export async function getUnreadCount(userId: string): Promise<number> {
  const d = db();
  const row = (await d.get(`
    SELECT COUNT(*) as count FROM notifications
    WHERE user_id = ? AND read_at IS NULL
  `, userId)) as { count: number } | undefined;

  return Number(row?.count || 0);
}

export async function getNotifications(
  userId: string,
  limit = 20,
  cursor?: string | null
): Promise<{ items: NotificationRecord[]; nextCursor: string | null; hasMore: boolean }> {
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

  const rows = (await d.all(`
    SELECT
      n.id, n.user_id, n.actor_id, n.type, n.target_type, n.target_id, n.read_at, n.created_at,
      u.username, u.display_name, u.name, u.avatar_url, rr.title_json AS reminder_title_json
    FROM notifications n
    JOIN users u ON u.id = n.actor_id
    LEFT JOIN release_reminders rr ON n.type = 'release_day' AND rr.user_id = n.user_id AND rr.title_id = n.target_id
    WHERE n.user_id = ?
    ${cursorClause}
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT ?
  `, ...params)) as any[];

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
    ...(r.reminder_title_json ? { title: reminderTitle(r.reminder_title_json, r.target_id) } : {}),
  }));

  let nextCursor: string | null = null;
  if (hasMore && itemsSlice.length > 0) {
    const last = itemsSlice[itemsSlice.length - 1];
    nextCursor = `${last.created_at}|${last.id}`;
  }

  return { items, nextCursor, hasMore };
}

export async function markNotificationsAsRead(userId: string, ids?: number[]): Promise<void> {
  const d = db();
  const stamp = now();

  if (Array.isArray(ids) && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    (await d.run(`
      UPDATE notifications SET read_at = ?
      WHERE user_id = ? AND id IN (${placeholders}) AND read_at IS NULL
    `, stamp, userId, ...ids));
  } else {
    (await d.run(`
      UPDATE notifications SET read_at = ?\
      WHERE user_id = ? AND read_at IS NULL
    `, stamp, userId));
  }
}

/**
 * Groups notifications of the same type + target into aggregated summaries.
 * Example: "5 people liked your review of Blade Runner 2049"
 */
export async function getGroupedNotifications(
  userId: string,
  limit = 20
): Promise<Array<{
  type: string;
  targetType: string | null;
  targetId: string | null;
  actors: Array<{ id: string; username: string; displayName: string; avatarUrl: string | null }>;
  count: number;
  label: string;
  latestAt: string;
  isRead: boolean;
  targetTitle?: string | null;
}>> {
  const d = db();

  // Get all unread + recent read notifications
  const rows = (await d.all(`
    SELECT
      n.id, n.type, n.target_type, n.target_id, n.read_at, n.created_at, n.actor_id,
      u.username, u.display_name, u.name, u.avatar_url,
      r.title_name as review_title,
      ul.title as list_title
    FROM notifications n
    JOIN users u ON u.id = n.actor_id
    LEFT JOIN reviews r ON n.target_type = 'review' AND n.target_id = r.id
    LEFT JOIN user_lists ul ON n.target_type = 'list' AND n.target_id = ul.id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT 100
  `, userId)) as any[];

  // Group by type + target
  const groups = new Map<string, any>();

  for (const r of rows) {
    const key = `${r.type}|${r.target_type || ''}|${r.target_id || ''}`;
    if (!groups.has(key)) {
      groups.set(key, {
        type: r.type,
        targetType: r.target_type,
        targetId: r.target_id,
        actors: [],
        actorIds: new Set<string>(),
        count: 0,
        latestAt: r.created_at,
        isRead: Boolean(r.read_at),
        targetTitle: r.review_title || r.list_title || null,
      });
    }

    const group = groups.get(key)!;
    if (!group.actorIds.has(r.actor_id) && group.actors.length < 3) {
      group.actors.push({
        id: r.actor_id,
        username: r.username,
        displayName: r.display_name || r.name,
        avatarUrl: r.avatar_url,
      });
    }
    group.actorIds.add(r.actor_id);
    group.count++;
    if (!r.read_at) group.isRead = false; // one unread = group unread
  }

  // Build labels
  const result = [];
  for (const group of groups.values()) {
    const actorLabel = group.actors.length > 0
      ? group.actors.map((a: any) => `@${a.username}`).join(', ')
      : 'Someone';

    const otherCount = group.count - group.actors.length;
    const actorStr = otherCount > 0
      ? `${actorLabel} and ${otherCount} other${otherCount !== 1 ? 's' : ''}`
      : actorLabel;

    const targetStr = group.targetTitle ? ` of "${group.targetTitle}"` : '';

    let label = '';
    switch (group.type) {
      case 'followed_you': label = `${actorStr} followed you`; break;
      case 'follow_request': label = `${actorStr} requested to follow you`; break;
      case 'liked_review': label = `${actorStr} liked your review${targetStr}`; break;
      case 'liked_list': label = `${actorStr} liked your list${targetStr}`; break;
      case 'commented': label = `${actorStr} commented on your ${group.targetType === 'list' ? 'list' : 'review'}${targetStr}`; break;
      case 'mention': label = `${actorStr} mentioned you`; break;
      case 'milestone': label = group.targetTitle || 'You reached a milestone! 🎉'; break;
      case 'call_resolved': label = `Your prediction${targetStr} has been resolved`; break;
      default: label = `${actorStr} interacted with your content`;
    }

    result.push({
      type: group.type,
      targetType: group.targetType,
      targetId: group.targetId,
      actors: group.actors,
      count: group.count,
      label,
      latestAt: group.latestAt,
      isRead: group.isRead,
      targetTitle: group.targetTitle,
    });

    if (result.length >= limit) break;
  }

  return result;
}

/**
 * Checks film watched milestones and creates a notification if a threshold is crossed.
 * Call this after logging a watch event.
 */
export async function checkAndCreateMilestone(userId: string): Promise<void> {
  const d = db();
  const milestones = [10, 25, 50, 100, 250, 500, 1000];

  const count = ((await d.get(`SELECT COUNT(*) as count FROM library WHERE user_id = ? AND status = 'watched'`, userId)) as any)?.count || 0;
  const total = Number(count);

  if (!milestones.includes(total)) return;

  // Only create once per milestone
  const existing = (await d.get(`
    SELECT id FROM notifications WHERE user_id = ? AND actor_id = ? AND type = 'milestone' AND target_id = ?
  `, userId, userId, String(total)));

  if (existing) return;

  const stamp = now();
  (await d.run(`
    INSERT INTO notifications (user_id, actor_id, type, target_type, target_id, created_at)
    VALUES (?, ?, 'milestone', 'user', ?, ?)
  `, userId, userId, String(total), stamp));
}


/**
 * Creates a notification when feedback unlocks a matching film in theaters (max 1/day, real data only).
 */
export async function checkAndNotifyTasteTheatricalMatch(userId: string, titleId: string, titleName?: string): Promise<boolean> {
  const d = db();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Rate limit: max 1 taste notification per day per user
  const recent = (await d.get(`
    SELECT id FROM notifications
    WHERE user_id = ? AND type = 'taste_recommendation' AND created_at >= ?
  `, userId, dayAgo));

  if (recent) return false;

  const stamp = now();
  (await d.run(`
    INSERT INTO notifications (user_id, actor_id, type, target_type, target_id, created_at)
    VALUES (?, ?, 'taste_recommendation', 'title', ?, ?)
  `, userId, userId, titleId, stamp));

  return true;
}
