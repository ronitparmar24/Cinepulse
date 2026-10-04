/**
 * CinePulse v9 — Track V: Publisher Engine (15-30 min cadence, zero LLM)
 * Publishes queued persona content whose not_before timestamp has passed
 * via the normal application write paths.
 */

import { db } from '../db';
import { putForecast } from '../pulse';
import { putReview } from '../reviews';
import { addComment, toggleLike } from '../social/interactions';
import { followUser } from '../social/follows';
import { ensureAiPersonaUser } from './personas';
import { storeMemory } from './memory';

export interface PublishResult {
  published: number;
  failed: number;
  items: Array<{ id: string; personaId: string; action: string; status: string }>;
}

/**
 * Publishes ready content items whose not_before threshold has passed.
 */
export async function publishReadyQueue(now = new Date(), limit = 20): Promise<PublishResult> {
  const d = db();
  const nowIso = now.toISOString();

  const rows = d.prepare(`
    SELECT id, persona_id, action, target_id, payload_json, tick_id
    FROM ai_content_queue
    WHERE status = 'ready' AND not_before <= ?
    ORDER BY not_before ASC
    LIMIT ?
  `).all(nowIso, limit) as Array<{
    id: string;
    persona_id: string;
    action: string;
    target_id: string;
    payload_json: string;
    tick_id: string;
  }>;

  const result: PublishResult = { published: 0, failed: 0, items: [] };

  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload_json);
      const personaUser = await ensureAiPersonaUser(row.persona_id);
      const userObj: any = { id: row.persona_id, name: personaUser.name };

      if (row.action === 'forecast') {
        await putForecast(
          userObj,
          payload.titleId,
          {
            choice: payload.choice || 'hit',
            confidence: payload.confidence || 65,
            reason: (payload.body || 'Calibrated release outlook.').slice(0, 480)
          },
          { timestamp: nowIso, skipOpenCheck: true }
        );
      } else if (row.action === 'review') {
        const { titleById } = await import('../catalog');
        const { isReleased } = await import('../eligibility');
        const titleData = await titleById(payload.titleId);
        const released = isReleased(titleData?.releaseDate ?? null);

        await putReview(
          userObj,
          payload.titleId,
          {
            body: payload.body,
            rating: released ? (payload.rating || 3) : null,
            spoiler: Boolean(payload.spoiler)
          },
          { timestamp: nowIso }
        );

        if (payload.titleName) {
          await storeMemory(
            row.persona_id,
            'opinion',
            payload.titleName,
            payload.body.slice(0, 140),
            1.0,
            nowIso
          );
        }
      } else if (row.action === 'reply') {
        addComment(row.persona_id, 'review', row.target_id, payload.body);
      } else if (row.action === 'like') {
        toggleLike(row.persona_id, 'review', row.target_id, true);
      } else if (row.action === 'follow') {
        await followUser(row.persona_id, row.target_id);
      }

      d.prepare(`
        UPDATE ai_content_queue
        SET status = 'published', published_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(row.id);

      d.prepare(`
        INSERT INTO ai_activity_log (
          tick_id, persona_id, action, target_id, reason_code, provider, model, draft_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.tick_id || 'manual-tick',
        row.persona_id,
        row.action,
        row.target_id,
        'PUBLISHED_ON_SCHEDULE',
        payload.provider || 'template',
        payload.model || 'template-v9',
        payload.draftId || null
      );

      result.published++;
      result.items.push({ id: row.id, personaId: row.persona_id, action: row.action, status: 'published' });
    } catch (e: any) {
      d.prepare(`
        UPDATE ai_content_queue
        SET status = 'failed', rejection_reason = ?
        WHERE id = ?
      `).run(e.message || 'Execution error', row.id);

      result.failed++;
      result.items.push({ id: row.id, personaId: row.persona_id, action: row.action, status: 'failed' });
    }
  }

  return result;
}
