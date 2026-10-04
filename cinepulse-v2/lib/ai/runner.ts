/**
 * CinePulse v9 — Track X: AI Community Tick Runner
 * Coordinates scheduled policy sampling, queue generation, and publisher execution.
 */

import { randomUUID } from 'node:crypto';
import { isAiCommunityEnabled, AI_CONFIG } from './config';
import { publishReadyQueue } from './publisher';
import { chooseAction } from './policy';
import { loadAllAiPersonas } from './personas';
import { queuePersonaAction } from './writersRoom';
import { db } from '../db';
import demoCatalog from '../demo-catalog.json';

export interface TickResult {
  executed: boolean;
  tickId: string;
  publishedCount: number;
  queuedCount: number;
  reason?: string;
}

/**
 * Runs a single tick of the AI community operations cycle.
 */
export async function runAiTick(customTickId?: string, now = new Date()): Promise<TickResult> {
  const tickId = customTickId || `tick_${Date.now()}_${randomUUID().slice(0, 8)}`;

  if (!isAiCommunityEnabled()) {
    return {
      executed: false,
      tickId,
      publishedCount: 0,
      queuedCount: 0,
      reason: 'AI_COMMUNITY_DISABLED_VIA_KILL_SWITCH'
    };
  }

  // 1. Publisher execution: release ready items
  const pub = await publishReadyQueue(now);

  // 2. Policy sampling: choose actions for active personas
  const allPersonas = loadAllAiPersonas();
  const activeCount = Math.min(allPersonas.length, AI_CONFIG.activePersonasCount);
  const activePersonas = allPersonas.slice(0, activeCount);

  // Load catalog items for world state
  const upcomingTitles = (demoCatalog as any[])
    .filter(row => row[4] && row[4] > now.toISOString().slice(0, 10))
    .map(row => ({
      id: `demo-${row[0]}`,
      title: row[1],
      releaseDate: row[4],
      modelProb: 0.65,
      crowdProb: 0.55,
      genres: row[3],
      director: row[8]
    }));

  const releasedTitles = (demoCatalog as any[])
    .map(row => ({
      id: `demo-${row[0]}`,
      title: row[1],
      genres: row[3],
      director: row[8]
    }));

  let queuedCount = 0;
  const maxActions = AI_CONFIG.maxActionsPerTick;
  const d = db();

  for (const persona of activePersonas) {
    if (queuedCount >= maxActions) break;

    // Daily persona action count
    const dayStartIso = new Date(now.getTime() - 86400 * 1000).toISOString();
    const countRow = d.prepare(`
      SELECT COUNT(*) as count
      FROM ai_content_queue
      WHERE persona_id = ? AND created_at >= ?
    `).get(persona.id, dayStartIso) as { count: number } | undefined;

    const action = chooseAction(persona, now, {
      tickId,
      upcomingTitles,
      releasedTitles,
      allPersonas,
      personaDailyActionCount: Number(countRow?.count || 0)
    });

    if (action.type !== 'idle' && action.payload) {
      // Schedule publication between 1 and 12 minutes in the future for organic spread
      const offsetMs = (1 + (queuedCount * 2)) * 60 * 1000;
      const notBefore = new Date(now.getTime() + offsetMs);

      const targetId = (action.payload.titleId as string) || (action.payload.targetPersonaId as string) || 'global';

      try {
        await queuePersonaAction(
          persona,
          action.type as any,
          targetId,
          {
            titleId: action.payload.titleId as string || 'demo-dunes',
            title: action.payload.titleName as string || 'Beyond the Dunes',
            director: 'Ari Laurent',
            genres: ['Sci-Fi']
          },
          notBefore,
          tickId
        );
        queuedCount++;
      } catch (err: any) {
        // Idempotency: skip duplicate insertions
      }
    }
  }

  return {
    executed: true,
    tickId,
    publishedCount: pub.published,
    queuedCount
  };
}
