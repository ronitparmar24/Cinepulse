/**
 * /api/library, /api/community, /api/reviews, /api/diary, /api/import/letterboxd/*
 * Moved verbatim from the former catch-all route; returns null when no branch matches.
 */

import { logEvent } from '../../analytics';
import { requireUser } from '../../auth';
import { deleteLibrary, listLibrary, putLibrary } from '../../library';
import { community, deleteReview, putReview, titleReviews } from '../../reviews';
import { revealSpoiler } from '../../social/activity';
import { deleteDiary, listDiary, logDiary, updateDiary } from '../../diary';
import { enforceImageLimit, enforceImportLimit } from '../../auth/writeLimit';
import type { ApiContext } from '../http';
import { body, json, param } from '../http';

async function viewerOf(request: Request) {
  const { currentUser } = await import('../../auth');
  try { return await currentUser(request as any); } catch { return null; }
}

export async function handleLibrary({ request, parts, method, query }: ApiContext): Promise<Response | null> {
  // ── Share cards: GET /api/share/review/:reviewId?format=story|square|og, GET /api/share/watched/:titleId?format=…
  if (parts[0] === 'share' && parts.length === 3 && method === 'GET') {
    await enforceImageLimit(request);
    const cards = await import('../../shareCards');
    const format = cards.parseFormat(query.get('format'));
    const origin = (process.env.APP_ORIGIN || new URL(request.url).origin).replace(/\/$/, '');
    if (parts[1] === 'review') {
      const { currentUser } = await import('../../auth');
      const { titleById } = await import('../../catalog');
      const viewer = await currentUser(request);
      return cards.renderShareCard(await cards.reviewSubject(param(parts, 2, 'review id'), viewer?.id ?? null, titleById), format, origin);
    }
    if (parts[1] === 'watched') {
      const user = await requireUser(request);
      return cards.renderShareCard(await cards.watchedSubject(user.id, param(parts, 2, 'title id')), format, origin);
    }
  }

  // ── Goals: GET|PUT /api/goals  ·  Reports: POST /api/reports
  if (parts[0] === 'goals' && parts.length === 1) {
    const user = await requireUser(request);
    const g = await import('../../goals');
    if (method === 'GET') return json(await g.getGoalStatus(user.id), 200, { 'Cache-Control': 'private, no-store' });
    if (method === 'PUT') {
      const status = await g.setGoal(user.id, await body(request, 1024));
      await g.checkMilestones(user.id);
      return json(status);
    }
  }
  if (parts[0] === 'reports' && parts.length === 1 && method === 'POST') {
    const user = await requireUser(request);
    const { reportContent } = await import('../../moderation');
    return json(await reportContent(user.id, await body(request, 4 * 1024)));
  }

  // ── Streaming services: GET|PUT /api/services, GET /api/services/watchlist; Tonight's pick: GET /api/tonight
  if (parts[0] === 'services' || parts[0] === 'tonight') {
    const user = await requireUser(request);
    const us = await import('../../userServices');
    const { watchProviders } = await import('../../catalog');
    const noStore = { 'Cache-Control': 'private, no-store' };
    if (parts[0] === 'tonight' && parts.length === 1 && method === 'GET') {
      return json(await us.tonightPick(user, us.parseTonightOptions(query), watchProviders), 200, noStore);
    }
    if (parts[0] === 'services' && parts.length === 1 && method === 'GET') {
      const { servicesForRegion } = await import('../../services');
      return json({ region: user.region || 'IN', available: servicesForRegion(user.region).map(({ id, name }) => ({ id, name })), selected: await us.getUserServices(user.id, user.region) }, 200, noStore);
    }
    if (parts[0] === 'services' && parts.length === 1 && method === 'PUT') {
      return json({ selected: await us.setUserServices(user, await body(request, 4 * 1024)) });
    }
    if (parts[0] === 'services' && parts[1] === 'title' && parts.length === 3 && method === 'GET') {
      const { matchServices } = await import('../../services');
      const titleId = param(parts, 2, 'title id');
      const selected = await us.getUserServices(user.id, user.region);
      if (!selected.length) return json({ services: [], link: null }, 200, noStore);
      const info = await watchProviders(titleId, user.region || undefined).catch(() => null);
      return json({ services: matchServices(info, selected, user.region), link: info?.link ?? null }, 200, noStore);
    }
    if (parts[0] === 'services' && parts[1] === 'watchlist' && parts.length === 2 && method === 'GET') {
      return json({ matches: await us.watchlistAvailability(user, watchProviders) }, 200, noStore);
    }
  }

  // ── Release reminders: GET /api/reminders, PUT /api/reminders/settings, PUT|DELETE /api/reminders/:titleId
  if (parts[0] === 'reminders') {
    const user = await requireUser(request);
    const r = await import('../../reminders');
    if (parts.length === 1 && method === 'GET') {
      const [reminders, prefs] = await Promise.all([r.listReminders(user.id), r.getReminderPrefs(user.id)]);
      return json({ reminders, prefs }, 200, { 'Cache-Control': 'private, no-store' });
    }
    if (parts.length === 2 && parts[1] === 'settings' && method === 'PUT') {
      return json({ prefs: await r.setReminderPrefs(user.id, await body(request, 4 * 1024)) });
    }
    if (parts.length === 2 && parts[1] !== 'settings') {
      const titleId = param(parts, 1, 'title id');
      if (method === 'PUT') {
        const { titleById } = await import('../../catalog');
        return json({ reminder: await r.addReminder(user, titleId, titleById) });
      }
      if (method === 'DELETE') {
        await r.removeReminder(user.id, titleId);
        return json({ ok: true });
      }
    }
  }

  // ── Wrapped (your own year only): GET /api/wrapped?year=, GET /api/wrapped/card?year=
  if (parts[0] === 'wrapped' && method === 'GET' && (parts.length === 1 || (parts.length === 2 && parts[1] === 'card'))) {
    const user = await requireUser(request);
    const { getWrapped, wrappedYearAllowed } = await import('../../wrapped');
    const year = Number(query.get('year')) || new Date().getUTCFullYear();
    if (!wrappedYearAllowed(year)) return json({ error: 'That year is not available.' }, 400);
    const wrapped = await getWrapped(user.id, year);
    if (parts.length === 1) return json({ wrapped }, 200, { 'Cache-Control': 'private, no-store' });
    if (!wrapped.hasData) return json({ error: 'Nothing to share for that year yet.' }, 404);
    await enforceImageLimit(request);
    const { renderWrappedCard } = await import('../../wrappedCard');
    const firstName = (user.displayName || user.name || 'My').split(' ')[0].slice(0, 24);
    return renderWrappedCard(wrapped, firstName);
  }

  // ── Stats (your own library only): GET /api/stats?year=YYYY|all
  if (parts[0] === 'stats' && parts.length === 1 && method === 'GET') {
    const user = await requireUser(request);
    const { getStats, parseStatsPeriod } = await import('../../stats');
    return json({ stats: await getStats(user.id, parseStatsPeriod(query.get('year'))) }, 200, { 'Cache-Control': 'private, no-store' });
  }

  // ── Letterboxd import: POST /api/import/letterboxd/match, POST /api/import/letterboxd/commit
  if (parts[0] === 'import' && parts[1] === 'letterboxd' && parts.length === 3 && method === 'POST') {
    const user = await requireUser(request);
    await enforceImportLimit(request);
    const lb = await import('../../import/letterboxd');
    if (parts[2] === 'match') return json({ matches: await lb.matchFilms(lb.parseFilmQueries((await body(request, 64 * 1024)).films)) });
    if (parts[2] === 'commit') {
      const result = await lb.commitImport(user, lb.parseCommitItems((await body(request, 256 * 1024)).items));
      await logEvent('letterboxd_import', { ...result, skippedTitles: result.skippedTitles.length }, user.id);
      return json(result);
    }
  }

  // ── Diary: GET /api/diary, POST /api/diary/:titleId, PUT|DELETE /api/diary/entry/:id
  if (parts[0] === 'diary') {
    const user = await requireUser(request);
    if (parts.length === 1 && method === 'GET') return json(await listDiary(user.id, Number(query.get('limit')) || 30, query.get('cursor')));
    if (parts.length === 2 && method === 'POST') return json({ entry: await logDiary(user, param(parts, 1, 'title id'), await body(request)) });
    if (parts.length === 3 && parts[1] === 'entry' && method === 'PUT') return json({ entry: await updateDiary(user, param(parts, 2, 'entry id'), await body(request)) });
    if (parts.length === 3 && parts[1] === 'entry' && method === 'DELETE') {
      await deleteDiary(user, param(parts, 2, 'entry id'));
      return json({ ok: true });
    }
  }

  if (parts[0] === 'library' && method === 'GET' && parts.length === 1)
    return json({ items: await listLibrary(await requireUser(request)) });

  if (parts[0] === 'library' && parts.length === 2 && method === 'PUT') {
    const user = await requireUser(request);
    const id = param(parts, 1, 'id');
    await putLibrary(user, id, await body(request));
    await logEvent('watchlist_added', { titleId: id }, user.id);
    return json({ ok: true });
  }

  if (parts[0] === 'library' && parts.length === 2 && method === 'DELETE') {
    await deleteLibrary(await requireUser(request), param(parts, 1, 'id'));
    return json({ ok: true });
  }

  if (parts[0] === 'community' && method === 'GET' && parts.length === 1) return json({ reviews: await community((await viewerOf(request))?.id ?? null) });

  if (parts[0] === 'reviews' && parts.length === 2 && method === 'GET') return json({ reviews: await titleReviews(param(parts, 1, 'id'), (await viewerOf(request))?.id ?? null) });

  if (parts[0] === 'reviews' && parts.length === 2 && (method === 'POST' || method === 'PUT')) {
    const user = await requireUser(request);
    const id = param(parts, 1, 'id');
    await putReview(user, id, await body(request));
    await logEvent('review_posted', { titleId: id }, user.id);
    return json({ ok: true });
  }

  if (parts[0] === 'reviews' && parts.length === 2 && method === 'DELETE') {
    await deleteReview(await requireUser(request), param(parts, 1, 'id'));
    return json({ ok: true });
  }

  // Spoiler explicit reveal
  if (parts[0] === 'reviews' && parts.length === 3 && parts[2] === 'reveal' && method === 'POST') {
    const user = await requireUser(request);
    await revealSpoiler(user.id, param(parts, 1, 'id'));
    return json({ ok: true });
  }
  return null;
}
