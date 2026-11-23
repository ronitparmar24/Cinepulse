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
import {
  createMovieNightSession,
  finalizeMovieNightSession,
  getMovieNightSession,
  joinMovieNightSession,
  submitMovieNightVote,
} from '../../movieNight';
import type { ApiContext } from '../http';
import { body, json, param } from '../http';

export async function handleGroups({ request, parts, method, query }: ApiContext): Promise<Response | null> {
  // ─── Track C1: Movie Night Generator ─────────────────────────────────────────
  if (parts[0] === 'movie-night') {
    if (parts[1] === 'session' && parts.length === 2 && method === 'POST') {
      const u = await currentUser(request);
      const b = (await body(request)) as any;
      const session = await createMovieNightSession({ id: u?.id || null, name: u?.name || b.hostName || 'Host' }, b);
      return json({ session });
    }
    if (parts[1] === 'session' && parts.length === 3 && method === 'GET') {
      const session = await getMovieNightSession(param(parts, 2, 'codeOrId'));
      if (!session) throw new HttpError(404, 'Movie night session not found');
      return json({ session });
    }
    if (parts[1] === 'session' && parts.length === 4 && parts[3] === 'join' && method === 'POST') {
      const u = await currentUser(request);
      const b = (await body(request)) as any;
      const res = await joinMovieNightSession(param(parts, 2, 'codeOrId'), b.participantName || u?.name || 'Guest', u?.id || null);
      return json(res);
    }
    if (parts[1] === 'session' && parts.length === 4 && parts[3] === 'vote' && method === 'POST') {
      const b = (await body(request)) as any;
      const session = await submitMovieNightVote(param(parts, 2, 'codeOrId'), b.voterId, { ranking: b.ranking, approvals: b.approvals });
      return json({ session });
    }
    if (parts[1] === 'session' && parts.length === 4 && parts[3] === 'finalize' && method === 'POST') {
      const session = await finalizeMovieNightSession(param(parts, 2, 'codeOrId'));
      return json({ session });
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
