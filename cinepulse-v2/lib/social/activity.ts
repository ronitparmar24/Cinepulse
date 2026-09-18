import { db, now } from '../db';
import { getPrivacySettings } from './visibility';
import type { ActivityEvent, ActivityType, TargetType, VisibilityLevel } from '../types';

/**
 * Resolves activity visibility at write time from privacy_settings.
 * Per specification: visibility is resolved at write time, not recomputed dynamically.
 */
export function resolveWriteTimeVisibility(
  userId: string,
  type: ActivityType
): VisibilityLevel {
  const privacy = getPrivacySettings(userId);
  switch (type) {
    case 'watched':
      return privacy.diaryVisibility;
    case 'rated':
      return privacy.ratingsVisibility;
    case 'reviewed':
      return privacy.reviewsVisibility;
    case 'added_to_watchlist':
      return privacy.watchlistVisibility;
    case 'made_call':
      return privacy.predictionsVisibility;
    case 'followed':
    case 'created_list':
    default:
      return privacy.activityVisibility;
  }
}

/**
 * Logs an activity event.
 */
export function logActivityEvent(
  userId: string,
  type: ActivityType,
  targetType: TargetType,
  targetId: string,
  metadata: Record<string, any> = {}
): number {
  const d = db();
  const visibility = resolveWriteTimeVisibility(userId, type);
  const stamp = now();

  const res = d.prepare(`
    INSERT INTO activity_events (user_id, type, target_type, target_id, metadata, visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    type,
    targetType,
    targetId,
    JSON.stringify(metadata),
    visibility,
    stamp
  );

  return Number(res.lastInsertRowid);
}

/**
 * Checks if viewer has revealed a specific spoiler.
 * Stored in table revealed_spoilers (created if not exists).
 */
export function isSpoilerRevealed(viewerId: string, targetId: string): boolean {
  const d = db();
  d.exec(`
    CREATE TABLE IF NOT EXISTS revealed_spoilers (
      user_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, target_id)
    );
  `);

  const row = d.prepare('SELECT 1 FROM revealed_spoilers WHERE user_id = ? AND target_id = ?').get(viewerId, targetId);
  return Boolean(row);
}

export function revealSpoiler(viewerId: string, targetId: string): void {
  const d = db();
  d.exec(`
    CREATE TABLE IF NOT EXISTS revealed_spoilers (
      user_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, target_id)
    );
  `);

  d.prepare('INSERT OR IGNORE INTO revealed_spoilers (user_id, target_id) VALUES (?, ?)').run(viewerId, targetId);
}

/**
 * Server-side spoiler redaction.
 * If event contains spoiler review and viewer is not author and hasn't revealed it,
 * completely withhold the review body from the API response payload.
 */
export function applyServerSideSpoilerProtection(
  event: ActivityEvent,
  viewerId: string | null
): ActivityEvent {
  if (!event.metadata || !event.metadata.spoiler) {
    return event;
  }

  // Author can always see their own spoiler
  if (viewerId && viewerId === event.user.id) {
    return event;
  }

  // If logged in and explicitly revealed
  if (viewerId && isSpoilerRevealed(viewerId, String(event.id))) {
    return {
      ...event,
      metadata: {
        ...event.metadata,
        spoilerRevealed: true,
      },
    };
  }

  // Withhold review body entirely from client response
  const sanitizedMeta = { ...event.metadata };
  delete sanitizedMeta.body;
  delete sanitizedMeta.reviewBody;
  sanitizedMeta.spoilerRedacted = true;

  return {
    ...event,
    metadata: sanitizedMeta,
  };
}

export interface FeedResponse {
  items: ActivityEvent[];
  nextCursor: string | null;
  hasMore: boolean;
  productNote: string;
}

/**
 * Reverse-chronological activity feed from followed accounts.
 * Composite cursor: "created_at|id"
 */
export function getFollowedFeed(
  viewerId: string,
  limit = 20,
  cursor?: string | null
): FeedResponse {
  const d = db();
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  let cursorClause = '';
  const params: any[] = [viewerId, viewerId, viewerId, viewerId];

  if (cursor) {
    const [cursorCreatedAt, cursorId] = cursor.split('|');
    if (cursorCreatedAt && cursorId) {
      cursorClause = 'AND (ae.created_at < ? OR (ae.created_at = ? AND ae.id < ?))';
      params.push(cursorCreatedAt, cursorCreatedAt, Number(cursorId));
    }
  }

  params.push(safeLimit + 1);

  // Eligible users: users viewer follows (accepted status) OR viewer themselves
  // Exclude users who blocked viewer or whom viewer blocked
  const rows = d.prepare(`
    SELECT
      ae.id, ae.user_id, ae.type, ae.target_type, ae.target_id, ae.metadata,
      ae.visibility, ae.created_at,
      u.username, u.display_name, u.name, u.avatar_url
    FROM activity_events ae
    JOIN users u ON u.id = ae.user_id
    WHERE (
      ae.user_id = ?
      OR ae.user_id IN (
        SELECT followee_id FROM follows WHERE follower_id = ? AND status = 'accepted'
      )
    )
    AND ae.user_id NOT IN (
      SELECT blocked_id FROM blocks WHERE blocker_id = ?
      UNION
      SELECT blocker_id FROM blocks WHERE blocked_id = ?
    )
    AND (
      ae.visibility = 'public'
      OR (ae.visibility = 'followers_only')
      OR (ae.user_id = '${viewerId}')
    )
    ${cursorClause}
    ORDER BY ae.created_at DESC, ae.id DESC
    LIMIT ?
  `).all(...params) as any[];

  const hasMore = rows.length > safeLimit;
  const itemsSlice = hasMore ? rows.slice(0, safeLimit) : rows;

  const rawEvents: ActivityEvent[] = itemsSlice.map((r) => {
    let meta: any = {};
    try {
      meta = r.metadata ? JSON.parse(r.metadata) : {};
    } catch {}

    // Like count and viewer liked status
    const likeCount = (d.prepare('SELECT COUNT(*) as count FROM likes WHERE target_type = "activity_event" AND target_id = ?').get(r.id) as any)?.count || 0;
    const isLiked = Boolean(d.prepare('SELECT 1 FROM likes WHERE user_id = ? AND target_type = "activity_event" AND target_id = ?').get(viewerId, r.id));

    return {
      id: r.id,
      user: {
        id: r.user_id,
        username: r.username,
        displayName: r.display_name || r.name,
        avatarUrl: r.avatar_url,
      },
      type: r.type,
      targetType: r.target_type,
      targetId: r.target_id,
      metadata: meta,
      visibility: r.visibility,
      createdAt: r.created_at,
      likesCount: likeCount,
      isLiked,
    };
  });

  const protectedEvents = rawEvents.map((evt) => applyServerSideSpoilerProtection(evt, viewerId));

  let nextCursor: string | null = null;
  if (hasMore && itemsSlice.length > 0) {
    const last = itemsSlice[itemsSlice.length - 1];
    nextCursor = `${last.created_at}|${last.id}`;
  }

  return {
    items: protectedEvents,
    nextCursor,
    hasMore,
    productNote: 'Reverse-chronological activity feed from people you follow. No algorithmic ranking, no dwell-time optimization.',
  };
}

/**
 * Public global firehose (opt-in public feed).
 */
export function getGlobalFeed(
  viewerId: string | null,
  limit = 20,
  cursor?: string | null
): FeedResponse {
  const d = db();
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  let cursorClause = '';
  const params: any[] = [];

  if (cursor) {
    const [cursorCreatedAt, cursorId] = cursor.split('|');
    if (cursorCreatedAt && cursorId) {
      cursorClause = 'AND (ae.created_at < ? OR (ae.created_at = ? AND ae.id < ?))';
      params.push(cursorCreatedAt, cursorCreatedAt, Number(cursorId));
    }
  }

  params.push(safeLimit + 1);

  let blockFilter = '';
  if (viewerId) {
    blockFilter = `
      AND ae.user_id NOT IN (
        SELECT blocked_id FROM blocks WHERE blocker_id = '${viewerId}'
        UNION
        SELECT blocker_id FROM blocks WHERE blocked_id = '${viewerId}'
      )
    `;
  }

  const rows = d.prepare(`
    SELECT
      ae.id, ae.user_id, ae.type, ae.target_type, ae.target_id, ae.metadata,
      ae.visibility, ae.created_at,
      u.username, u.display_name, u.name, u.avatar_url
    FROM activity_events ae
    JOIN users u ON u.id = ae.user_id
    WHERE ae.visibility = 'public'
    ${blockFilter}
    ${cursorClause}
    ORDER BY ae.created_at DESC, ae.id DESC
    LIMIT ?
  `).all(...params) as any[];

  const hasMore = rows.length > safeLimit;
  const itemsSlice = hasMore ? rows.slice(0, safeLimit) : rows;

  const rawEvents: ActivityEvent[] = itemsSlice.map((r) => {
    let meta: any = {};
    try {
      meta = r.metadata ? JSON.parse(r.metadata) : {};
    } catch {}

    const likeCount = (d.prepare('SELECT COUNT(*) as count FROM likes WHERE target_type = "activity_event" AND target_id = ?').get(r.id) as any)?.count || 0;
    const isLiked = viewerId
      ? Boolean(d.prepare('SELECT 1 FROM likes WHERE user_id = ? AND target_type = "activity_event" AND target_id = ?').get(viewerId, r.id))
      : false;

    return {
      id: r.id,
      user: {
        id: r.user_id,
        username: r.username,
        displayName: r.display_name || r.name,
        avatarUrl: r.avatar_url,
      },
      type: r.type,
      targetType: r.target_type,
      targetId: r.target_id,
      metadata: meta,
      visibility: r.visibility,
      createdAt: r.created_at,
      likesCount: likeCount,
      isLiked,
    };
  });

  const protectedEvents = rawEvents.map((evt) => applyServerSideSpoilerProtection(evt, viewerId));

  let nextCursor: string | null = null;
  if (hasMore && itemsSlice.length > 0) {
    const last = itemsSlice[itemsSlice.length - 1];
    nextCursor = `${last.created_at}|${last.id}`;
  }

  return {
    items: protectedEvents,
    nextCursor,
    hasMore,
    productNote: 'Global public activity firehose.',
  };
}
