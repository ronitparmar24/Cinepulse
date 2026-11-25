/**
 * Single entry point for /api/*. The handlers live in lib/api/routes/, one module per
 * group of top-level path segments; this file picks the module and handles errors/HEAD.
 */
import type { NextRequest } from 'next/server';
import { HttpError, asError } from '../../../lib/errors';
import { enforceOrigin } from '../../../lib/auth';
import { enforceWriteLimit } from '../../../lib/auth/writeLimit';
import { json, type ApiContext } from '../../../lib/api/http';
import { handleCatalog } from '../../../lib/api/routes/catalog';
import { handleAuth } from '../../../lib/api/routes/auth';
import { handleLibrary } from '../../../lib/api/routes/library';
import { handleForecasts } from '../../../lib/api/routes/forecasts';
import { handleAi } from '../../../lib/api/routes/ai';
import { handleRecommendations } from '../../../lib/api/routes/recommendations';
import { handleSocial } from '../../../lib/api/routes/social';
import { handleGroups } from '../../../lib/api/routes/groups';
import { handleOps } from '../../../lib/api/routes/ops';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Handler = (ctx: ApiContext) => Promise<Response | null>;
const ROUTES: Record<string, Handler> = {};
const mount = (handler: Handler, segments: string[]) => segments.forEach((s) => (ROUTES[s] = handler));
mount(handleCatalog, [
  'calendar',
  'health',
  'config',
  'trailers',
  'news',
  'trakt',
  'streaming',
  'theaters',
  'artwork',
  'anime',
  'catalog',
  'genres',
  'title',
  'providers',
  'similar',
  'recommended',
  'person',
  'currency',
  'cinema-map',
  'hype-radar',
]);
mount(handleAuth, ['auth', 'account', 'export', 'analytics']);
mount(handleLibrary, ['library', 'community', 'reviews', 'diary', 'import', 'wrapped', 'reminders']);
mount(handleForecasts, ['pulse', 'my-forecasts', 'prediction', 'accuracy', 'receipts', 'leaderboard', 'score-card', 'contrarian']);
mount(handleAi, ['ai']);
mount(handleRecommendations, ['recommendations', 'feedback']);
mount(handleSocial, [
  'user',
  'users',
  'profile',
  'follows',
  'likes',
  'comments',
  'blocks',
  'feed',
  'notifications',
  'privacy',
  'lists',
  'suggestions',
  'explore',
  'search',
  'mutes',
]);
mount(handleGroups, ['movie-night', 'circles']);
mount(handleOps, ['cron', 'admin']);

type Ctx = { params: Promise<{ path: string[] }> };

async function dispatch(request: NextRequest, context: Ctx): Promise<Response> {
  let res: Response;
  try {
    const parts = (await context.params).path || [];
    const method = request.method === 'HEAD' ? 'GET' : request.method;
    if (method !== 'GET') {
      enforceOrigin(request);
      await enforceWriteLimit(request, parts[0] ?? '');
    }
    const handler = ROUTES[parts[0] ?? ''];
    const handled = handler ? await handler({ request, parts, method, query: request.nextUrl.searchParams }) : null;
    if (!handled) throw new HttpError(404, 'Not found');
    res = handled;
  } catch (error) {
    const e = asError(error);
    res = json({ error: e.message }, e.status);
  }
  return request.method === 'HEAD' ? new Response(null, { status: res.status, headers: res.headers }) : res;
}

export async function GET(request: NextRequest, context: Ctx) {
  return dispatch(request, context);
}
export async function HEAD(request: NextRequest, context: Ctx) {
  return dispatch(request, context);
}
export async function POST(request: NextRequest, context: Ctx) {
  return dispatch(request, context);
}
export async function PUT(request: NextRequest, context: Ctx) {
  return dispatch(request, context);
}
export async function DELETE(request: NextRequest, context: Ctx) {
  return dispatch(request, context);
}
