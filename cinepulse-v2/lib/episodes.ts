/**
 * TV episode tracking (Trakt / Serializd style): members tick off episodes, see per-season
 * progress and a "Next up" episode, and may rate single episodes ½–5 stars.
 *
 * One row per watched episode in `episode_progress` (SQLite schema v23, Postgres 0012).
 * Unwatching deletes the row (and its rating).
 */
import type { Title, User } from './types';
import { db, now } from './db';
import { bad, notFound } from './errors';
import { parseRating } from './rating';
import { isReleased } from './eligibility';
import { season as catalogSeason, titleById, titleIdAvailable } from './catalog';
import { putLibrary } from './library';

export interface WatchedEpisode {
  season: number;
  episode: number;
  watchedAt: string;
  rating: number | null;
}

export interface NextUp {
  season: number;
  episode: number;
  name: string | null;
  /** ISO date when known; in the future when the episode has not aired yet. */
  airDate: string | null;
}

export interface SeriesProgress {
  titleId: string;
  watchedCount: number;
  lastWatchedAt: string;
  nextUp: NextUp | null;
}

export interface EpisodeProgressResponse {
  episodes: WatchedEpisode[];
  nextUp: NextUp | null;
  /** The title's library status after the change (writes only). */
  libraryStatus?: string | null;
}

export type SeasonEpisodes = { episodeNumber: number; name?: string; airDate?: string | null }[];
export type SeasonFetcher = (season: number) => Promise<SeasonEpisodes>;

export const MAX_SEASON = 100;
export const MAX_EPISODE = 5000;
export const MAX_SEASON_COUNT = 1000;

/** A whole-number path/body value in [min, max]; anything else is a 400. */
export function parseIntIn(value: unknown, min: number, max: number, label: string): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${label} is invalid`);
  return n;
}

function parseWatched(value: unknown): boolean {
  if (typeof value !== 'boolean') throw bad('watched must be true or false');
  return value;
}

function row(r: any): WatchedEpisode {
  return {
    season: Number(r.season),
    episode: Number(r.episode),
    watchedAt: String(r.watched_at),
    rating: r.rating === null || r.rating === undefined ? null : Number(r.rating),
  };
}

export async function listEpisodes(userId: string, titleId: string): Promise<WatchedEpisode[]> {
  const rows = await db().all(
    'SELECT season, episode, watched_at, rating FROM episode_progress WHERE user_id = ? AND title_id = ? ORDER BY season, episode',
    userId,
    titleId,
  );
  return rows.map(row);
}

/**
 * The first unwatched episode after the latest one watched (Trakt's "up next"): later in the
 * same season, else the first unwatched episode of the next season. null when caught up or
 * nothing is watched. Without episode lists (demo catalog) it falls back to "last + 1".
 */
export async function computeNextUp(watched: WatchedEpisode[], seasonsCount: number | null, fetchSeason: SeasonFetcher): Promise<NextUp | null> {
  const regular = watched.filter((e) => e.season >= 1);
  if (!regular.length) return null;
  const last = regular.reduce((a, b) => (b.season > a.season || (b.season === a.season && b.episode > a.episode) ? b : a));
  const seen = new Set(watched.map((e) => `${e.season}:${e.episode}`));
  const firstUnwatched = (season: number, list: SeasonEpisodes, after: number): NextUp | null => {
    const next = [...list]
      .filter((e) => Number.isInteger(e.episodeNumber) && e.episodeNumber > after && !seen.has(`${season}:${e.episodeNumber}`))
      .sort((a, b) => a.episodeNumber - b.episodeNumber)[0];
    return next ? { season, episode: next.episodeNumber, name: next.name || null, airDate: next.airDate ?? null } : null;
  };
  const current = await fetchSeason(last.season).catch(() => [] as SeasonEpisodes);
  if (!current.length) return { season: last.season, episode: last.episode + 1, name: null, airDate: null };
  const sameSeason = firstUnwatched(last.season, current, last.episode);
  if (sameSeason) return sameSeason;
  if (!seasonsCount || last.season >= seasonsCount) return null;
  const following = await fetchSeason(last.season + 1).catch(() => [] as SeasonEpisodes);
  if (!following.length) return { season: last.season + 1, episode: 1, name: null, airDate: null };
  return firstUnwatched(last.season + 1, following, 0);
}

function catalogSeasonFetcher(titleId: string): SeasonFetcher {
  return async (n) => ((await catalogSeason(titleId, n)) as { episodes?: SeasonEpisodes }).episodes ?? [];
}

async function titleOrNull(titleId: string): Promise<Title | null> {
  return titleById(titleId).catch(() => null);
}

async function assertTrackable(titleId: string): Promise<Title> {
  if (!titleIdAvailable(titleId)) throw notFound('Unknown title');
  const title = await titleById(titleId);
  if (title.mediaType !== 'tv') throw bad('Episodes are tracked for series only');
  if (!isReleased(title.releaseDate)) throw bad('Episodes of an unreleased series cannot be marked watched');
  return title;
}

/** Progress plus "Next up" for one series. */
export async function episodeProgress(user: User, titleId: string, title?: Title | null): Promise<EpisodeProgressResponse> {
  if (!titleIdAvailable(titleId)) throw notFound('Unknown title');
  const episodes = await listEpisodes(user.id, titleId);
  if (!episodes.length) return { episodes, nextUp: null };
  const t = title === undefined ? await titleOrNull(titleId) : title;
  const nextUp = await computeNextUp(episodes, t?.seasons ?? null, catalogSeasonFetcher(titleId)).catch(() => null);
  return { episodes, nextUp };
}

/**
 * Watching any episode moves the series to "watching" unless it is already watching/watched.
 * putLibrary clears the rating for non-watched statuses unless one is passed, so an existing
 * rating is passed through rather than wiped.
 */
async function ensureWatching(user: User, titleId: string): Promise<string> {
  const current = (await db().get('SELECT status, rating FROM library WHERE user_id = ? AND title_id = ?', user.id, titleId)) as
    | { status: string; rating: number | null }
    | undefined;
  if (current?.status === 'watched' || current?.status === 'watching') return current.status;
  const rating = current?.rating === null || current?.rating === undefined ? undefined : Number(current.rating);
  await putLibrary(user, titleId, rating === undefined ? { status: 'watching' } : { status: 'watching', rating });
  return 'watching';
}

async function libraryStatus(userId: string, titleId: string): Promise<string | null> {
  const r = (await db().get('SELECT status FROM library WHERE user_id = ? AND title_id = ?', userId, titleId)) as { status?: string } | undefined;
  return r?.status ?? null;
}

/** PUT /api/episodes/:titleId/:season/:episode  {watched, rating?} */
export async function setEpisode(user: User, titleId: string, seasonRaw: unknown, episodeRaw: unknown, input: Record<string, unknown>): Promise<EpisodeProgressResponse> {
  const season = parseIntIn(seasonRaw, 0, MAX_SEASON, 'Season');
  const episode = parseIntIn(episodeRaw, 1, MAX_EPISODE, 'Episode');
  const watched = parseWatched(input?.watched);
  const hasRating = input !== null && typeof input === 'object' && 'rating' in input;
  const rating = hasRating ? parseRating(input.rating) : null;
  if (!titleIdAvailable(titleId)) throw notFound('Unknown title');
  if (!watched) {
    await db().run('DELETE FROM episode_progress WHERE user_id = ? AND title_id = ? AND season = ? AND episode = ?', user.id, titleId, season, episode);
    return { ...(await episodeProgress(user, titleId)), libraryStatus: await libraryStatus(user.id, titleId) };
  }
  const title = await assertTrackable(titleId);
  // A repeat "watched" keeps the first watch date; the rating changes only when one is sent.
  await db().run(
    hasRating
      ? 'INSERT INTO episode_progress(user_id, title_id, season, episode, watched_at, rating) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id, title_id, season, episode) DO UPDATE SET rating = excluded.rating'
      : 'INSERT INTO episode_progress(user_id, title_id, season, episode, watched_at, rating) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id, title_id, season, episode) DO NOTHING',
    user.id,
    titleId,
    season,
    episode,
    now(),
    rating,
  );
  const status = await ensureWatching(user, titleId);
  return { ...(await episodeProgress(user, titleId, title)), libraryStatus: status };
}

/** PUT /api/episodes/:titleId/season/:season  {watched, count} — episodes 1..count. */
export async function setSeason(user: User, titleId: string, seasonRaw: unknown, input: Record<string, unknown>): Promise<EpisodeProgressResponse> {
  const season = parseIntIn(seasonRaw, 0, MAX_SEASON, 'Season');
  const watched = parseWatched(input?.watched);
  if (!titleIdAvailable(titleId)) throw notFound('Unknown title');
  if (!watched) {
    await db().run('DELETE FROM episode_progress WHERE user_id = ? AND title_id = ? AND season = ?', user.id, titleId, season);
    return { ...(await episodeProgress(user, titleId)), libraryStatus: await libraryStatus(user.id, titleId) };
  }
  const count = parseIntIn(input?.count, 1, MAX_SEASON_COUNT, 'Episode count');
  const title = await assertTrackable(titleId);
  const stamp = now();
  await db().transaction(async () => {
    for (let episode = 1; episode <= count; episode++) {
      await db().run(
        'INSERT INTO episode_progress(user_id, title_id, season, episode, watched_at, rating) VALUES(?,?,?,?,?,NULL) ON CONFLICT(user_id, title_id, season, episode) DO NOTHING',
        user.id,
        titleId,
        season,
        episode,
        stamp,
      );
    }
  });
  const status = await ensureWatching(user, titleId);
  return { ...(await episodeProgress(user, titleId, title)), libraryStatus: status };
}

/** GET /api/episodes — series with progress, most recently watched first, each with its Next up. */
export async function seriesInProgress(user: User, limit = 12): Promise<SeriesProgress[]> {
  const rows = (await db().all(
    'SELECT title_id, COUNT(*) AS watched_count, MAX(watched_at) AS last_watched_at FROM episode_progress WHERE user_id = ? GROUP BY title_id ORDER BY MAX(watched_at) DESC LIMIT ?',
    user.id,
    Math.max(1, Math.min(50, limit)),
  )) as { title_id: string; watched_count: number; last_watched_at: string }[];
  return Promise.all(
    rows
      .filter((r) => titleIdAvailable(r.title_id))
      .map(async (r) => ({
        titleId: r.title_id,
        watchedCount: Number(r.watched_count),
        lastWatchedAt: String(r.last_watched_at),
        nextUp: (await episodeProgress(user, r.title_id).catch(() => null))?.nextUp ?? null,
      })),
  );
}
