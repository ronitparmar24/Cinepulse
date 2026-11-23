import { db, now } from '../db';
import { getPrivacySettings } from './visibility';
import type { ActivityEvent, ActivityType, TargetType, VisibilityLevel } from '../types';

/**
 * Resolves activity visibility at write time from privacy_settings.
 * Per specification: visibility is resolved at write time, not recomputed dynamically.
 */
export async function resolveWriteTimeVisibility(
  userId: string,
  type: ActivityType
): Promise<VisibilityLevel> {
  const privacy = (await getPrivacySettings(userId));
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
export async function logActivityEvent(
  userId: string,
  type: ActivityType,
  targetType: TargetType,
  targetId: string,
  metadata: Record<string, any> = {},
  timestamp?: string
): Promise<number> {
  const d = db();
  const visibility = (await resolveWriteTimeVisibility(userId, type));
  const stamp = timestamp || now();

  const res = (await d.get<{ id: number }>(`
    INSERT INTO activity_events (user_id, type, target_type, target_id, metadata, visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `, userId,
    type,
    targetType,
    targetId,
    JSON.stringify(metadata),
    visibility,
    stamp));

  return Number(res?.id);
}

/**
 * Checks if viewer has revealed a specific spoiler.
 * Stored in table revealed_spoilers (created if not exists).
 */
export async function isSpoilerRevealed(viewerId: string, targetId: string): Promise<boolean> {
  const d = db();

  const row = (await d.get('SELECT 1 FROM revealed_spoilers WHERE user_id = ? AND target_id = ?', viewerId, targetId));
  return Boolean(row);
}

export async function revealSpoiler(viewerId: string, targetId: string): Promise<void> {
  const d = db();

  (await d.run('INSERT INTO revealed_spoilers (user_id, target_id) VALUES (?, ?) ON CONFLICT DO NOTHING', viewerId, targetId));
}

/**
 * Server-side spoiler redaction.
 * If event contains spoiler review and viewer is not author and hasn't revealed it,
 * completely withhold the review body from the API response payload.
 */
export async function applyServerSideSpoilerProtection(
  event: ActivityEvent,
  viewerId: string | null
): Promise<ActivityEvent> {
  if (!event.metadata || !event.metadata.spoiler) {
    return event;
  }

  // Author can always see their own spoiler
  if (viewerId && viewerId === event.user.id) {
    return event;
  }

  // If logged in and explicitly revealed
  if (viewerId && (await isSpoilerRevealed(viewerId, String(event.id)))) {
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
export async function getFollowedFeed(
  viewerId: string,
  limit = 20,
  cursor?: string | null
): Promise<FeedResponse> {
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
  const rows = (await d.all(`
    SELECT
      ae.id, ae.user_id, ae.type, ae.target_type, ae.target_id, ae.metadata,
      ae.visibility, ae.created_at,
      u.username, u.display_name, u.name, u.avatar_url, COALESCE(u.is_ai, 0) as is_ai
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
  `, ...params)) as any[];

  const hasMore = rows.length > safeLimit;
  const itemsSlice = hasMore ? rows.slice(0, safeLimit) : rows;

  const rawEvents: ActivityEvent[] = (await Promise.all(itemsSlice.map(async (r) => {
    let meta: any = {};
    try {
      meta = r.metadata ? JSON.parse(r.metadata) : {};
    } catch {}

    // Like count and viewer liked status
    const likeCount = ((await d.get("SELECT COUNT(*) as count FROM likes WHERE target_type = 'activity_event' AND target_id = ?", r.id)) as any)?.count || 0;
    const isLiked = Boolean((await d.get("SELECT 1 FROM likes WHERE user_id = ? AND target_type = 'activity_event' AND target_id = ?", viewerId, r.id)));

    return {
      id: r.id,
      user: {
        id: r.user_id,
        username: r.username,
        displayName: r.display_name || r.name,
        avatarUrl: r.avatar_url,
        isAi: Boolean(r.is_ai),
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
  })));

  const protectedEvents = await Promise.all(rawEvents.map((evt) => applyServerSideSpoilerProtection(evt, viewerId)));

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
export async function getGlobalFeed(
  viewerId: string | null,
  limit = 20,
  cursor?: string | null
): Promise<FeedResponse> {
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

  const rows = (await d.all(`
    SELECT
      ae.id, ae.user_id, ae.type, ae.target_type, ae.target_id, ae.metadata,
      ae.visibility, ae.created_at,
      u.username, u.display_name, u.name, u.avatar_url, COALESCE(u.is_ai, 0) as is_ai
    FROM activity_events ae
    JOIN users u ON u.id = ae.user_id
    WHERE ae.visibility = 'public'
    ${blockFilter}
    ${cursorClause}
    ORDER BY ae.created_at DESC, ae.id DESC
    LIMIT ?
  `, ...params)) as any[];

  const hasMore = rows.length > safeLimit;
  const itemsSlice = hasMore ? rows.slice(0, safeLimit) : rows;

  const rawEvents: ActivityEvent[] = (await Promise.all(itemsSlice.map(async (r) => {
    let meta: any = {};
    try {
      meta = r.metadata ? JSON.parse(r.metadata) : {};
    } catch {}

    const likeCount = ((await d.get("SELECT COUNT(*) as count FROM likes WHERE target_type = 'activity_event' AND target_id = ?", r.id)) as any)?.count || 0;
    const isLiked = viewerId
      ? Boolean((await d.get("SELECT 1 FROM likes WHERE user_id = ? AND target_type = 'activity_event' AND target_id = ?", viewerId, r.id)))
      : false;

    return {
      id: r.id,
      user: {
        id: r.user_id,
        username: r.username,
        displayName: r.display_name || r.name,
        avatarUrl: r.avatar_url,
        isAi: Boolean(r.is_ai),
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
  })));

  const protectedEvents = await Promise.all(rawEvents.map((evt) => applyServerSideSpoilerProtection(evt, viewerId)));

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
