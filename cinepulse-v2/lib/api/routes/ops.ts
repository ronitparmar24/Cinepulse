/**
 * /api/cron, /api/admin
 * Moved verbatim from the former catch-all route; returns null when no branch matches.
 */

import { requireCron } from '../../auth/cron';
import { resolvePendingCalls } from '../../cron/resolveCalls';
import { snapshotUpcomingTitles } from '../../cron/snapshotHype';
import { requireAdmin } from '../../auth/guards';
import type { ApiContext } from '../http';
import { body, json } from '../http';

export async function handleOps({ request, parts, method, query }: ApiContext): Promise<Response | null> {
  if (parts[0] === 'cron' && parts[1] === 'resolve-calls' && (method === 'POST' || method === 'GET')) {
    requireCron(request);
    const summary = await resolvePendingCalls();
    return json({ ok: true, ...summary });
  }

  // ─── Track L3: Hype Snapshot Cron ────────────────────────────────────────────
  if (parts[0] === 'cron' && parts[1] === 'snapshot' && parts.length === 2 && (method === 'POST' || method === 'GET')) {
    requireCron(request);
    const result = await snapshotUpcomingTitles();
    return json({ ok: true, ...result });
  }

  // ─── Track L3b: Cache Prewarm Cron ──────────────────────────────────────────
  if (parts[0] === 'cron' && parts[1] === 'prewarm' && parts.length === 2 && (method === 'POST' || method === 'GET')) {
    requireCron(request);
    const { prewarmOmdbCache } = await import('../../fetchers/omdb');
    const { batchFetchUpcomingNews } = await import('../../fetchers/news');
    const { batchBackfillTitleEmbeddings } = await import('../../fetchers/huggingface');
    const { catalog } = await import('../../catalog');
    const upcoming = await catalog({ media: 'all', collection: 'upcoming', page: 1 })
      .then((c) => c.items)
      .catch(() => []);
    const omdbResult = await prewarmOmdbCache();
    const newsResult = await batchFetchUpcomingNews(upcoming);
    const embResult = await batchBackfillTitleEmbeddings(upcoming);
    return json({ ok: true, omdb: omdbResult, news: newsResult, embeddings: embResult });
  }

  // ─── Track X: AI Community Tick Cron ─────────────────────────────────────────
  if (parts[0] === 'cron' && parts[1] === 'ai-tick' && parts.length === 2 && (method === 'POST' || method === 'GET')) {
    requireCron(request);
    const { runAiTick } = await import('../../ai/runner');
    const result = await runAiTick();
    return json(result);
  }

  // ─── Track X: Admin AI Community Dashboard ──────────────────────────────────
  if (parts[0] === 'admin' && parts[1] === 'ai-community' && parts.length === 2) {
    await requireAdmin(request);
    if (method === 'GET') {
      const { isAiCommunityEnabled } = await import('../../ai/config');
      const { db } = await import('../../db');
      const d = db();
      const enabled = await isAiCommunityEnabled();
      const readyQueue = (await d.get("SELECT COUNT(*) as count FROM ai_content_queue WHERE status = 'ready'")) as any;
      const publishedQueue = (await d.get("SELECT COUNT(*) as count FROM ai_content_queue WHERE status = 'published'")) as any;
      const rejectedQueue = (await d.get("SELECT COUNT(*) as count FROM ai_content_queue WHERE status = 'rejected'")) as any;
      const recentActions = (await d.all('SELECT * FROM ai_activity_log ORDER BY created_at DESC LIMIT 100')) as any[];

      return json({
        enabled,
        queue: {
          ready: readyQueue?.count || 0,
          published: publishedQueue?.count || 0,
          rejected: rejectedQueue?.count || 0,
        },
        recentActions,
      });
    }

    if (method === 'POST') {
      const { setAiCommunityPaused } = await import('../../ai/config');
      const b = (await body(request)) as any;
      const paused = Boolean(b.paused);
      await setAiCommunityPaused(paused);
      return json({ ok: true, paused });
    }
  }
  return null;
}
