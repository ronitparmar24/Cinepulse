/**
 * /api/pulse, /api/my-forecasts, /api/prediction, /api/accuracy, /api/receipts, /api/leaderboard, /api/score-card, /api/contrarian
 * Moved verbatim from the former catch-all route; returns null when no branch matches.
 */

import { getAccuracyMetrics } from '../../accuracy/backtest';
import { logEvent } from '../../analytics';
import { currentUser, requireUser } from '../../auth';
import { getClientIp } from '../../auth/rateLimit';
import { enforceTurnstile } from '../../auth/turnstile';
import { titleById } from '../../catalog';
import { getContrarianReleases } from '../../contrarian';
import { notFound } from '../../errors';
import { getPrediction } from '../../prediction';
import { getPulse, myForecasts, putForecast } from '../../pulse';
import { getCrowdVsEngine, getLeaderboard, getYouVsEngine } from '../../pulse/adjudication';
import { getForecastReceiptById, getPublicReceipts } from '../../receipts';
import { getUnifiedScoreCard } from '../../scoreCard';
import type { ApiContext } from '../http';
import { body, json, param } from '../http';

export async function handleForecasts({ request, parts, method, query }: ApiContext): Promise<Response | null> {
  if (parts[0] === 'pulse' && parts.length === 2 && method === 'GET') {
    const url = new URL(request.url);
    const crew = url.searchParams.get('crew') === '1' || url.searchParams.get('crew') === 'true';
    return json({ pulse: await getPulse(param(parts, 1, 'id'), await currentUser(request), { crew }) });
  }

  if (parts[0] === 'pulse' && parts.length === 2 && method === 'POST') {
    const user = await requireUser(request);
    const id = param(parts, 1, 'id');
    const reqBody = await body(request);
    await enforceTurnstile(request, reqBody, getClientIp(request), { required: false });
    await putForecast(user, id, reqBody);
    await logEvent('prediction_submitted', { titleId: id }, user.id);
    return json({ ok: true });
  }

  if (parts[0] === 'my-forecasts' && method === 'GET') return json({ items: await myForecasts(await requireUser(request)) });

  if (parts[0] === 'prediction' && parts.length === 2 && method === 'GET') {
    const id = param(parts, 1, 'id');
    const title = await titleById(id);
    const prediction = await getPrediction(id, title);
    return json({ prediction });
  }

  // Feature 4: CinePulse v3 Accuracy, Leaderboard & AI Endpoints
  if (parts[0] === 'accuracy' && method === 'GET') return json(await getAccuracyMetrics());

  // Track O: Public Receipts & Track Record
  if (parts[0] === 'receipts' && parts.length === 1 && method === 'GET') return json(await getPublicReceipts());

  if (parts[0] === 'receipts' && parts.length === 2 && method === 'GET') {
    const item = await getForecastReceiptById(param(parts, 1, 'id'));
    if (!item) throw notFound('Forecast receipt not found');
    return json({ receipt: item });
  }

  if (parts[0] === 'leaderboard' && method === 'GET') {
    const viewer = await currentUser(request);
    const url = new URL(request.url);
    const crewOnly = url.searchParams.get('crew') === '1' || url.searchParams.get('crew') === 'true';
    return json({
      leaderboard: await getLeaderboard(50, 1, { crewOnly }),
      youVsEngine: await getYouVsEngine(viewer?.id || null),
      crowdVsEngine: await getCrowdVsEngine(),
    });
  }

  // ─── CinePulse v4 Unified Endpoints ─────────────────────────────────────────
  if (parts[0] === 'score-card' && parts.length === 2 && method === 'GET') {
    const id = param(parts, 1, 'id');
    const viewer = await currentUser(request);
    return json(await getUnifiedScoreCard(id, viewer), 200, {
      'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=86400',
    });
  }

  if (parts[0] === 'contrarian' && method === 'GET') {
    return json({ contrarian: await getContrarianReleases() });
  }
  return null;
}
