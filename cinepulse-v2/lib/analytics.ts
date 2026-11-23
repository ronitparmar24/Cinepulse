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
  | 'share_link_created'
  | 'letterboxd_import';

export interface AnalyticsEvent {
  id: string;
  eventType: AnalyticsEventType;
  metadata: Record<string, unknown>;
  userId: string | null;
  createdAt: string;
}

export async function logEvent(
  eventType: AnalyticsEventType,
  metadata: Record<string, unknown> = {},
  userId: string | null = null
): Promise<void> {
  try {
    const d = db();
    const id = randomUUID();
    const metadataJson = JSON.stringify(metadata);
    (await d.run(`INSERT INTO analytics_events (id, event_type, metadata_json, user_id, created_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`, id, eventType, metadataJson, userId));
  } catch {
    // Non-blocking telemetry; keep main application resilient
  }
}

export async function getRecentEvents(limit = 50): Promise<AnalyticsEvent[]> {
  try {
    const d = db();
    const rows = (await d.all(`SELECT id, event_type as "eventType", metadata_json, user_id as "userId", created_at as "createdAt"
       FROM analytics_events
       ORDER BY created_at DESC
       LIMIT ?`, limit)) as any[];

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
