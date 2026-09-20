import { randomUUID } from 'node:crypto';
import { db } from './db';

export type AnalyticsEventType =
  | 'search_submitted'
  | 'movie_opened'
  | 'watchlist_added'
  | 'prediction_submitted'
  | 'review_posted'
  | 'recommendation_clicked'
  | 'movie_night_generated'
  | 'share_link_created';

export interface AnalyticsEvent {
  id: string;
  eventType: AnalyticsEventType;
  metadata: Record<string, unknown>;
  userId: string | null;
  createdAt: string;
}

export function logEvent(
  eventType: AnalyticsEventType,
  metadata: Record<string, unknown> = {},
  userId: string | null = null
): void {
  try {
    const d = db();
    const id = randomUUID();
    const metadataJson = JSON.stringify(metadata);
    d.prepare(
      `INSERT INTO analytics_events (id, event_type, metadata_json, user_id, created_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(id, eventType, metadataJson, userId);
  } catch {
    // Non-blocking telemetry; keep main application resilient
  }
}

export function getRecentEvents(limit = 50): AnalyticsEvent[] {
  try {
    const d = db();
    const rows = d.prepare(
      `SELECT id, event_type as eventType, metadata_json, user_id as userId, created_at as createdAt
       FROM analytics_events
       ORDER BY created_at DESC
       LIMIT ?`
    ).all(limit) as any[];

    return rows.map((r) => ({
      id: r.id,
      eventType: r.eventType as AnalyticsEventType,
      metadata: (() => {
        try {
          return JSON.parse(r.metadata_json);
        } catch {
          return {};
        }
      })(),
      userId: r.userId,
      createdAt: r.createdAt,
    }));
  } catch {
    return [];
  }
}
