/**
 * /api/movie-night, /api/circles
 * Moved verbatim from the former catch-all route; returns null when no branch matches.
 */

import { currentUser, requireUser } from '../../auth';
import {
  addCircleWatchlist,
  castCircleVote,
  createCircle,
  createWeeklyVoteSession,
  getCircleDetails,
  joinCircleByInvite,
  listUserCircles,
  removeCircleWatchlist,
} from '../../circles';
import { HttpError } from '../../errors';

/** What Movie Night rooms need from the catalog, libraries and services. */
async function roomDeps() {
  const { titleById, catalog, watchProviders } = await import('../../catalog');
  const { getUserServices } = await import('../../userServices');
  const { db } = await import('../../db');
  return {
    loadTitle: titleById,
    // Trending first, then top-rated (always released) so the shortlist can fill up.
    trending: async () => {
      const [trend, top] = await Promise.all([
        catalog({ media: 'all', collection: 'trending', page: 1 }).then((r) => r.items).catch(() => []),
        catalog({ media: 'movie', collection: 'top', page: 1 }).then((r) => r.items).catch(() => []),
      ]);
      return [...trend, ...top];
    },
    providers: (id: string, region: string) => watchProviders(id, region),
    // Links straight to the title on each official service, for the room's region.
    directLinks: async (id: string, region: string) => {
      const [kind, num] = id.split('-');
      if (!num || id.startsWith('demo-')) return [];
      const { getWatchmodeDirectSources } = await import('../../fetchers/watchmode');
      const sources = await getWatchmodeDirectSources(num, kind === 'tv' ? 'tv' : 'movie');
      return sources.filter((s) => !s.region || s.region.toUpperCase() === region).map((s) => ({ name: s.name, type: s.type, url: s.webUrl }));
    },
    services: (userId: string, region: string) => getUserServices(userId, region),
    watchlist: async (userId: string) => {
      const rows = (await db().all("SELECT title_json FROM library WHERE user_id = ? AND status = 'watchlist' ORDER BY updated_at DESC LIMIT 40", userId)) as Array<{ title_json: string }>;
      return rows.flatMap((r) => { try { return [JSON.parse(r.title_json)]; } catch { return []; } });
    },
  };
}
import type { ApiContext } from '../http';
import { body, json, param } from '../http';

export async function handleGroups({ request, parts, method, query }: ApiContext): Promise<Response | null> {
  // ─── Movie Night rooms: POST /api/movie-night/rooms, GET /api/movie-night/rooms/:code,
  //     POST /api/movie-night/rooms/:code/join, POST /api/movie-night/rooms/:code/:action (x-room-token)
  if (parts[0] === 'movie-night' && parts[1] === 'rooms') {
    const rooms = await import('../../movieRoom');
    const deps = await roomDeps();
    const token = request.headers.get('x-room-token');
    const noStore = { 'Cache-Control': 'no-store' };
    if (parts.length === 2 && method === 'POST') {
      const res = await rooms.createRoom(await currentUser(request), await body(request, 4 * 1024), deps);
      return json(res, 200, noStore);
    }
    const roomCode = param(parts, 2, 'room code');
    if (!/^[A-Z0-9]{4,10}$/i.test(roomCode)) throw new HttpError(404, 'That movie night room doesn’t exist. Check the code.');
    if (parts.length === 3 && method === 'GET') {
      const v = Number(query.get('v'));
      return json(await rooms.getRoom(roomCode, token, Number.isFinite(v) && v > 0 ? v : null), 200, noStore);
    }
    if (parts.length === 4 && parts[3] === 'join' && method === 'POST') {
      return json(await rooms.joinRoom(roomCode, await currentUser(request), await body(request, 2 * 1024), deps), 200, noStore);
    }
    if (parts.length === 4 && method === 'POST') {
      return json({ room: await rooms.roomAction(roomCode, token, parts[3], await body(request, 2 * 1024), deps) }, 200, noStore);
    }
  }

  // ─── Track C2: Watch Circles ────────────────────────────────────────────────
  if (parts[0] === 'circles') {
    if (parts.length === 1 && method === 'GET') {
      const user = await requireUser(request);
      return json({ circles: await listUserCircles(user) });
    }
    if (parts.length === 1 && method === 'POST') {
      const user = await requireUser(request);
      const b = (await body(request)) as any;
      const circle = await createCircle(user, b.name, b.description);
      return json({ circle });
    }
    if (parts.length === 2 && parts[1] === 'join' && method === 'POST') {
      const user = await requireUser(request);
      const b = (await body(request)) as any;
      const circle = await joinCircleByInvite(user, b.inviteCode);
      return json({ circle });
    }
    if (parts.length === 2 && method === 'GET') {
      const u = await currentUser(request);
      const circle = await getCircleDetails(param(parts, 1, 'id'), u);
      return json({ circle });
    }
    if (parts.length === 3 && parts[2] === 'watchlist' && method === 'POST') {
      const user = await requireUser(request);
      const b = (await body(request)) as any;
      await addCircleWatchlist(user, param(parts, 1, 'id'), b.titleId);
      return json({ ok: true });
    }
    if (parts.length === 4 && parts[2] === 'watchlist' && method === 'DELETE') {
      const user = await requireUser(request);
      await removeCircleWatchlist(user, param(parts, 1, 'id'), param(parts, 3, 'titleId'));
      return json({ ok: true });
    }
    if (parts.length === 3 && parts[2] === 'pick' && method === 'POST') {
      const user = await requireUser(request);
      const b = (await body(request)) as any;
      const pick = await createWeeklyVoteSession(user, param(parts, 1, 'id'), b.candidateTitleIds, b.weekOf);
      return json({ pick });
    }
    if (parts.length === 3 && parts[2] === 'vote' && method === 'POST') {
      const user = await requireUser(request);
      const b = (await body(request)) as any;
      const pick = await castCircleVote(user, param(parts, 1, 'id'), b.pickId, b.ranking);
      return json({ pick });
    }
  }
  return null;
}
