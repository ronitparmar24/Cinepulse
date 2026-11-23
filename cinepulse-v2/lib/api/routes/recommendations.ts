/**
 * /api/recommendations, /api/feedback
 * Moved verbatim from the former catch-all route; returns null when no branch matches.
 */

import { currentUser, requireUser } from '../../auth';
import { catalog, titleById } from '../../catalog';
import { db } from '../../db';
import { bad } from '../../errors';
import { getRecommendationsForTitle, getUserPersonalizedRecommendations } from '../../recommendations';
import type { ApiContext } from '../http';
import { body, json, param } from '../http';

export async function handleRecommendations({ request, parts, method, query }: ApiContext): Promise<Response | null> {
  if (parts[0] === 'recommendations' && parts[1] === 'why' && parts.length === 3 && method === 'GET') {
    const id = param(parts, 2, 'id');
    const viewer = await currentUser(request);
    return json({ recommendations: await getRecommendationsForTitle(id, viewer?.id) });
  }

  if (parts[0] === 'recommendations' && parts[1] === 'personalized' && method === 'GET') {
    const viewer = await currentUser(request);
    const excludeParam = query.get('exclude');
    const extraExcludes = excludeParam
      ? excludeParam
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [];
    if (!viewer) {
      // Anonymous visitor support: rerank trending catalog using exclude query param
      const cat = await catalog({ media: 'all', collection: 'trending', page: 1 });
      const { rerank } = await import('../../feedback/rerank');
      const recs = await rerank(cat.items, null, { excludeIds: extraExcludes, limit: 10 });
      return json({ recommendations: recs });
    }
    return json({ recommendations: await getUserPersonalizedRecommendations(viewer.id, extraExcludes) });
  }

  // ─── CinePulse v10: Interest Feedback Loop Endpoints ─────────────────────────
  if (parts[0] === 'feedback' && parts[1] === 'interest') {
    if (method === 'POST') {
      const user = await requireUser(request);
      const b = await body(request);
      const { validateFeedbackInput, assertUserCanGiveFeedback } = await import('../../feedback/guardrails');
      const valid = validateFeedbackInput(b);
      await assertUserCanGiveFeedback(user.id);

      const { applyFeedback } = await import('../../feedback/affinity');
      let title = await titleById(valid.titleId);
      if (!title) {
        title = (b.title as any) || { id: valid.titleId, title: valid.titleId, genres: [] };
      }

      const result = await applyFeedback(user.id, title, valid.signal, valid.reason, valid.surface);

      // Provide ONE fresh replacement suggestion on negative/snooze signal
      let nextSuggestion = null;
      if (valid.signal === 'not_interested' || valid.signal === 'already_seen' || valid.signal === 'snooze') {
        try {
          const recs = await getUserPersonalizedRecommendations(user.id, [valid.titleId]);
          if (recs && recs.length > 0) {
            nextSuggestion = recs[0];
          }
        } catch {}
      }

      return json({ ok: true, feedback: result.feedback, nextSuggestion });
    }

    if (method === 'DELETE' && parts.length === 3) {
      const user = await requireUser(request);
      const titleId = param(parts, 2, 'titleId');
      const { undoFeedback } = await import('../../feedback/affinity');
      const res = await undoFeedback(user.id, titleId);
      return json({ ok: true, ...res });
    }

    if (method === 'GET' && parts.length === 2) {
      const user = await requireUser(request);
      const signalFilter = query.get('signal');
      const d = db();
      let rows: any[];
      if (signalFilter) {
        rows = await d.all(
          `
          SELECT title_id, signal, reason, surface, title_json, created_at, updated_at
          FROM interest_feedback
          WHERE user_id = ? AND signal = ?
          ORDER BY updated_at DESC
        `,
          user.id,
          signalFilter,
        );
      } else {
        rows = await d.all(
          `
          SELECT title_id, signal, reason, surface, title_json, created_at, updated_at
          FROM interest_feedback
          WHERE user_id = ?
          ORDER BY updated_at DESC
        `,
          user.id,
        );
      }
      const feedback = rows.map((r: any) => ({
        titleId: r.title_id,
        signal: r.signal,
        reason: r.reason,
        surface: r.surface,
        title: r.title_json ? JSON.parse(r.title_json) : null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      return json({ feedback });
    }
  }

  if (parts[0] === 'feedback' && parts[1] === 'summary' && method === 'GET') {
    const user = await requireUser(request);
    const { getFeedbackSummary } = await import('../../feedback/affinity');
    return json(await getFeedbackSummary(user.id));
  }

  if (parts[0] === 'feedback' && parts[1] === 'affinity' && method === 'DELETE') {
    const user = await requireUser(request);
    const featureType = query.get('featureType') as any;
    const featureValue = query.get('featureValue');
    if (!featureType || !featureValue) throw bad('featureType and featureValue are required');
    const { removeUserAffinity } = await import('../../feedback/affinity');
    const ok = await removeUserAffinity(user.id, featureType, featureValue);
    return json({ ok });
  }

  if (parts[0] === 'feedback' && parts[1] === 'reset' && method === 'POST') {
    const user = await requireUser(request);
    const { resetUserFeedback } = await import('../../feedback/affinity');
    await resetUserFeedback(user.id);
    return json({ ok: true });
  }

  if (parts[0] === 'feedback' && parts[1] === 'merge' && method === 'POST') {
    const user = await requireUser(request);
    const b = await body(request);
    const items = Array.isArray(b.items) ? b.items : [];
    const { mergeLocalFeedback } = await import('../../feedback/affinity');
    const mergedCount = await mergeLocalFeedback(user.id, items as any);
    return json({ ok: true, mergedCount });
  }

  if (parts[0] === 'feedback' && parts[1] === 'social-proof' && parts.length === 3 && method === 'GET') {
    const titleId = param(parts, 2, 'titleId');
    const d = db();
    const countRow = (await d.get(
      `
      SELECT COUNT(DISTINCT user_id) as count
      FROM interest_feedback
      WHERE title_id = ? AND signal = 'interested'
    `,
      titleId,
    )) as { count: number } | undefined;
    const count = Number(countRow?.count || 0);
    // Real social proof: hide when under 5 so it never looks fake, never fabricate counts
    return json({ titleId, interestedCount: count >= 5 ? count : null });
  }
  return null;
}
