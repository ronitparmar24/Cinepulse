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

async function runReminders() {
  const { runReleaseReminders } = await import('../../reminders');
  const { titleById } = await import('../../catalog');
  const { sendReleaseReminderEmail } = await import('../../mailer');
  return runReleaseReminders({ loadTitle: titleById, sendEmail: sendReleaseReminderEmail });
}

export async function handleOps({ request, parts, method, query }: ApiContext): Promise<Response | null> {
  if (parts[0] === 'cron' && parts[1] === 'resolve-calls' && (method === 'POST' || method === 'GET')) {
    requireCron(request);
    const summary = await resolvePendingCalls();
    // The daily run also sends release-day reminders (India's morning; the 12:00 UTC run covers the US).
    const reminders = await runReminders().catch((e: Error) => ({ error: e.message }));
    return json({ ok: true, ...summary, reminders });
  }

  // ─── Release-day reminders (also run from the daily jobs above and below) ───
  if (parts[0] === 'cron' && parts[1] === 'release-reminders' && parts.length === 2 && (method === 'POST' || method === 'GET')) {
    requireCron(request);
    return json({ ok: true, ...(await runReminders()) });
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
    // Cheap when nothing is due (one indexed query), so every tick can deliver reminders on time.
    const reminders = await runReminders().catch((e: Error) => ({ error: e.message }));
    const { runAiTick } = await import('../../ai/runner');
    const result = await runAiTick();
    return json({ ...(result as object), reminders });
  }

  // ─── Announcement email (admins only): stats, preview, test, send a batch, retry failures ───
  if (parts[0] === 'admin' && parts[1] === 'announce') {
    const admin = await requireAdmin(request);
    const a = await import('../../announce');
    const { deliverAnnouncement } = await import('../../mailer');
    const origin = (process.env.APP_ORIGIN || new URL(request.url).origin).replace(/\/$/, '');
    const noStore = { 'Cache-Control': 'private, no-store' };
    if (parts.length === 2 && method === 'GET') return json({ ...(await a.campaignStats()), setup: a.mailSetup(), sends: await a.campaignSends() }, 200, noStore);
    if (parts.length === 3 && parts[2] === 'preview' && method === 'GET') {
      return new Response(a.previewHtml(origin, (admin.displayName || admin.name || 'Asha').split(' ')[0]), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'" } });
    }
    if (parts.length === 3 && parts[2] === 'test' && method === 'POST') {
      const ok = await a.sendTest(deliverAnnouncement, origin, { email: admin.email, name: admin.displayName || admin.name || '' });
      return json({ ok, to: admin.email }, ok ? 200 : 502, noStore);
    }
    if (parts.length === 3 && parts[2] === 'send' && method === 'POST') {
      const b = await body(request, 512);
      if (b.confirm !== 'SEND') return json({ error: 'Confirmation missing.' }, 400);
      return json(await a.sendBatch(deliverAnnouncement, origin, { limit: 20 }), 200, noStore);
    }
    if (parts.length === 3 && parts[2] === 'retry' && method === 'POST') return json({ reset: await a.retryFailed() }, 200, noStore);
  }

  // ─── One-click unsubscribe from product news: GET (link) or POST (List-Unsubscribe-Post) ───
  if (parts[0] === 'email' && parts[1] === 'unsubscribe' && parts.length === 2 && (method === 'GET' || method === 'POST')) {
    const { unsubscribe } = await import('../../announce');
    const ok = await unsubscribe(String(query.get('t') || ''));
    if (method === 'POST') return json({ ok }, ok ? 200 : 404);
    const page = (title: string, text: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · CinePulse</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0e12;color:#f4f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;padding:24px}main{max-width:420px}h1{font-size:26px;margin:0 0 10px}p{color:#9db0a8;line-height:1.6}a{display:inline-block;margin-top:14px;padding:12px 22px;border-radius:12px;background:#b3f3d5;color:#0f2a1d;font-weight:800;text-decoration:none}</style></head><body><main><h1>${title}</h1><p>${text}</p><a href="/">Back to CinePulse</a></main></body></html>`;
    return new Response(ok ? page('You’re unsubscribed', 'You won’t get product news from CinePulse anymore. Account emails such as sign-in codes and reminders you turned on still arrive. You can switch product news back on in your profile → Privacy → Notifications.') : page('Link not recognised', 'This unsubscribe link is invalid or has expired. You can turn product news off in your profile → Privacy → Notifications.'),
      { status: ok ? 200 : 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  // ─── Moderation queue: GET /api/admin/reports, POST /api/admin/reports/resolve ───
  if (parts[0] === 'admin' && parts[1] === 'reports') {
    const admin = await requireAdmin(request);
    const m = await import('../../moderation');
    if (parts.length === 2 && method === 'GET') return json({ reports: await m.listOpenReports() }, 200, { 'Cache-Control': 'private, no-store' });
    if (parts.length === 3 && parts[2] === 'resolve' && method === 'POST') return json(await m.resolveReports(admin.email, await body(request, 2048)));
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
