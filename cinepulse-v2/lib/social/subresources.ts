import { db } from '../db';
import { resolveVisibility } from './visibility';
import { getUserByUsername, computeUserPredictionMetrics } from './profile';
import { isSpoilerRevealed } from './activity';

export interface SubResourceResult<T> {
  allowed: boolean;
  status: 'granted' | 'denied' | 'pending' | 'blocked';
  reason?: string;
  items?: T[];
  nextCursor?: string | null;
  hasMore?: boolean;
}

export function getUserWatchlist(
  targetUsername: string,
  viewerId: string | null,
  limit = 20,
  cursor?: string | null
): SubResourceResult<any> {
  const target = getUserByUsername(targetUsername);
  if (!target) return { allowed: false, status: 'denied', reason: 'User not found' };

  const decision = resolveVisibility(viewerId, target.id, 'watchlist');
  if (!decision.allowed) {
    return { allowed: false, status: decision.status, reason: decision.reason };
  }

  const d = db();
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  let cursorClause = '';
  const params: any[] = [target.id];

  if (cursor) {
    const [cursorUpdatedAt, cursorTitleId] = cursor.split('|');
    if (cursorUpdatedAt && cursorTitleId) {
      cursorClause = 'AND (updated_at < ? OR (updated_at = ? AND title_id < ?))';
      params.push(cursorUpdatedAt, cursorUpdatedAt, cursorTitleId);
    }
  }

  params.push(safeLimit + 1);

  const rows = d.prepare(`
    SELECT title_id, title_json, rating, updated_at
    FROM library
    WHERE user_id = ? AND status = 'watchlist'
    ${cursorClause}
    ORDER BY updated_at DESC, title_id DESC
    LIMIT ?
  `).all(...params) as any[];

  const hasMore = rows.length > safeLimit;
  const itemsSlice = hasMore ? rows.slice(0, safeLimit) : rows;

  const items = itemsSlice.map((r) => {
    let titleData: any = {};
    try {
      titleData = JSON.parse(r.title_json);
    } catch {}
    return {
      titleId: r.title_id,
      title: titleData.title || 'Untitled',
      poster: titleData.poster || null,
      releaseDate: titleData.releaseDate || null,
      mediaType: titleData.mediaType || 'movie',
      rating: r.rating,
      addedAt: r.updated_at,
    };
  });

  let nextCursor: string | null = null;
  if (hasMore && itemsSlice.length > 0) {
    const last = itemsSlice[itemsSlice.length - 1];
    nextCursor = `${last.updated_at}|${last.title_id}`;
  }

  return { allowed: true, status: 'granted', items, nextCursor, hasMore };
}

export function getUserDiary(
  targetUsername: string,
  viewerId: string | null,
  limit = 20,
  cursor?: string | null
): SubResourceResult<any> {
  const target = getUserByUsername(targetUsername);
  if (!target) return { allowed: false, status: 'denied', reason: 'User not found' };

  const decision = resolveVisibility(viewerId, target.id, 'diary');
  if (!decision.allowed) {
    return { allowed: false, status: decision.status, reason: decision.reason };
  }

  const d = db();
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  let cursorClause = '';
  const params: any[] = [target.id];

  if (cursor) {
    const [cursorUpdatedAt, cursorTitleId] = cursor.split('|');
    if (cursorUpdatedAt && cursorTitleId) {
      cursorClause = 'AND (l.updated_at < ? OR (l.updated_at = ? AND l.title_id < ?))';
      params.push(cursorUpdatedAt, cursorUpdatedAt, cursorTitleId);
    }
  }

  params.push(safeLimit + 1);

  const rows = d.prepare(`
    SELECT
      l.title_id, l.title_json, l.rating, l.updated_at,
      r.id as review_id, r.body as review_body, r.spoiler
    FROM library l
    LEFT JOIN reviews r ON r.user_id = l.user_id AND r.title_id = l.title_id
    WHERE l.user_id = ? AND l.status = 'watched'
    ${cursorClause}
    ORDER BY l.updated_at DESC, l.title_id DESC
    LIMIT ?
  `).all(...params) as any[];

  const hasMore = rows.length > safeLimit;
  const itemsSlice = hasMore ? rows.slice(0, safeLimit) : rows;

  const items = itemsSlice.map((r) => {
    let titleData: any = {};
    try {
      titleData = JSON.parse(r.title_json);
    } catch {}

    let body = r.review_body || null;
    let spoilerRedacted = false;

    // Server-side spoiler redaction for diary thoughts
    if (r.spoiler && body && (!viewerId || (viewerId !== target.id && !isSpoilerRevealed(viewerId, String(r.review_id))))) {
      body = null;
      spoilerRedacted = true;
    }

    return {
      titleId: r.title_id,
      title: titleData.title || 'Untitled',
      poster: titleData.poster || null,
      releaseDate: titleData.releaseDate || null,
      mediaType: titleData.mediaType || 'movie',
      rating: r.rating,
      watchedDate: r.updated_at,
      reviewId: r.review_id || null,
      reviewBody: body,
      spoiler: Boolean(r.spoiler),
      spoilerRedacted,
    };
  });

  let nextCursor: string | null = null;
  if (hasMore && itemsSlice.length > 0) {
    const last = itemsSlice[itemsSlice.length - 1];
    nextCursor = `${last.updated_at}|${last.title_id}`;
  }

  return { allowed: true, status: 'granted', items, nextCursor, hasMore };
}

export function getUserReviews(
  targetUsername: string,
  viewerId: string | null,
  limit = 20,
  cursor?: string | null
): SubResourceResult<any> {
  const target = getUserByUsername(targetUsername);
  if (!target) return { allowed: false, status: 'denied', reason: 'User not found' };

  const decision = resolveVisibility(viewerId, target.id, 'reviews');
  if (!decision.allowed) {
    return { allowed: false, status: decision.status, reason: decision.reason };
  }

  const d = db();
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  let cursorClause = '';
  const params: any[] = [target.id];

  if (cursor) {
    const [cursorCreatedAt, cursorId] = cursor.split('|');
    if (cursorCreatedAt && cursorId) {
      cursorClause = 'AND (r.created_at < ? OR (r.created_at = ? AND r.id < ?))';
      params.push(cursorCreatedAt, cursorCreatedAt, cursorId);
    }
  }

  params.push(safeLimit + 1);

  const rows = d.prepare(`
    SELECT
      r.id, r.user_id, r.title_id, r.title_name, r.body, r.rating, r.spoiler, r.kind, r.created_at,
      l.title_json
    FROM reviews r
    LEFT JOIN library l ON l.user_id = r.user_id AND l.title_id = r.title_id
    WHERE r.user_id = ?
    ${cursorClause}
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ?
  `).all(...params) as any[];

  const hasMore = rows.length > safeLimit;
  const itemsSlice = hasMore ? rows.slice(0, safeLimit) : rows;

  const items = itemsSlice.map((r) => {
    let titleData: any = {};
    try {
      if (r.title_json) titleData = JSON.parse(r.title_json);
    } catch {}

    const isAuthor = viewerId === target.id;
    const isRevealed = viewerId ? isSpoilerRevealed(viewerId, String(r.id)) : false;
    const isSpoiler = Boolean(r.spoiler);
    const shouldRedact = isSpoiler && !isAuthor && !isRevealed;

    const likeCount = (d.prepare('SELECT COUNT(*) as count FROM likes WHERE target_type = "review" AND target_id = ?').get(r.id) as any)?.count || 0;
    const isLiked = viewerId ? Boolean(d.prepare('SELECT 1 FROM likes WHERE user_id = ? AND target_type = "review" AND target_id = ?').get(viewerId, r.id)) : false;
    const commentCount = (d.prepare('SELECT COUNT(*) as count FROM comments WHERE target_type = "review" AND target_id = ? AND deleted_at IS NULL').get(r.id) as any)?.count || 0;

    return {
      id: r.id,
      titleId: r.title_id,
      titleName: r.title_name,
      poster: titleData.poster || null,
      rating: r.rating,
      body: shouldRedact ? null : r.body,
      spoiler: isSpoiler,
      spoilerRedacted: shouldRedact,
      kind: r.kind,
      createdAt: r.created_at,
      likesCount: likeCount,
      isLiked,
      commentCount,
    };
  });

  let nextCursor: string | null = null;
  if (hasMore && itemsSlice.length > 0) {
    const last = itemsSlice[itemsSlice.length - 1];
    nextCursor = `${last.created_at}|${last.id}`;
  }

  return { allowed: true, status: 'granted', items, nextCursor, hasMore };
}

export function getUserPredictions(
  targetUsername: string,
  viewerId: string | null
): {
  allowed: boolean;
  status: string;
  reason?: string;
  brierScore?: number | null;
  hitRate?: number | null;
  totalPredictions?: number;
  resolvedCount?: number;
  calls?: any[];
} {
  const target = getUserByUsername(targetUsername);
  if (!target) return { allowed: false, status: 'denied', reason: 'User not found' };

  const decision = resolveVisibility(viewerId, target.id, 'predictions');
  if (!decision.allowed) {
    return { allowed: false, status: decision.status, reason: decision.reason };
  }

  const d = db();
  const metrics = computeUserPredictionMetrics(target.id);

  const rows = d.prepare(`
    SELECT
      fe.id, fe.title_id, fe.choice, fe.confidence, fe.reason, fe.created_at, fe.release_date,
      f.title_json
    FROM forecast_events fe
    LEFT JOIN forecasts f ON f.user_id = fe.user_id AND f.title_id = fe.title_id
    WHERE fe.user_id = ? AND fe.first_submission = 1
    ORDER BY fe.created_at DESC
  `).all(target.id) as any[];

  const currentDate = new Date().toISOString().slice(0, 10);

  const calls = rows.map((r) => {
    let titleData: any = {};
    try {
      if (r.title_json) titleData = JSON.parse(r.title_json);
    } catch {}

    const isResolved = Boolean(r.release_date && r.release_date <= currentDate);

    return {
      id: r.id,
      titleId: r.title_id,
      title: titleData.title || r.title_id,
      poster: titleData.poster || null,
      choice: r.choice,
      confidence: r.confidence,
      reason: r.reason,
      releaseDate: r.release_date,
      createdAt: r.created_at,
      isResolved,
    };
  });

  return {
    allowed: true,
    status: 'granted',
    brierScore: metrics.brierScore,
    hitRate: metrics.hitRate,
    totalPredictions: metrics.totalPredictions,
    resolvedCount: metrics.resolvedCount,
    calls,
  };
}
