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
import { enforceImportLimit } from '../../auth/writeLimit';
import type { ApiContext } from '../http';
import { body, json, param } from '../http';

export async function handleLibrary({ request, parts, method, query }: ApiContext): Promise<Response | null> {
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

  if (parts[0] === 'community' && method === 'GET' && parts.length === 1) return json({ reviews: await community() });

  if (parts[0] === 'reviews' && parts.length === 2 && method === 'GET') return json({ reviews: await titleReviews(param(parts, 1, 'id')) });

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
