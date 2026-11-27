/**
 * /api/episodes — TV episode tracking for the signed-in member (lib/episodes.ts).
 *
 *   GET /api/episodes                              series in progress, each with its Next up
 *   GET /api/episodes/:titleId                     watched episodes + Next up for one series
 *   PUT /api/episodes/:titleId/:season/:episode    {watched: boolean, rating?: ½–5 | null}
 *   PUT /api/episodes/:titleId/season/:season      {watched: boolean, count: number}
 */
import { requireUser } from '../../auth';
import { episodeProgress, seriesInProgress, setEpisode, setSeason } from '../../episodes';
import type { ApiContext } from '../http';
import { body, json, param } from '../http';

const noStore = { 'Cache-Control': 'private, no-store' };

export async function handleEpisodes({ request, parts, method }: ApiContext): Promise<Response | null> {
  if (parts[0] !== 'episodes') return null;
  if (parts.length === 1 && method === 'GET') {
    const user = await requireUser(request);
    return json({ series: await seriesInProgress(user) }, 200, noStore);
  }
  if (parts.length === 2 && method === 'GET') {
    const user = await requireUser(request);
    return json(await episodeProgress(user, param(parts, 1, 'title id')), 200, noStore);
  }
  if (parts.length === 4 && method === 'PUT') {
    const user = await requireUser(request);
    const titleId = param(parts, 1, 'title id');
    if (parts[2] === 'season') return json(await setSeason(user, titleId, parts[3], await body(request, 1024)), 200, noStore);
    return json(await setEpisode(user, titleId, parts[2], parts[3], await body(request, 1024)), 200, noStore);
  }
  return null;
}
