/**
 * Yearly watch goals, weekly streaks and milestone notifications.
 *
 * Progress counts titles watched this calendar year the same way Wrapped does (diary dates,
 * else when a title was marked watched). A streak is the run of consecutive weeks (Monday to
 * Sunday, UTC) with at least one watch, ending this week — or last week, so a streak is not
 * "lost" on a Monday morning before you have had a chance to watch anything.
 */
import { db, now } from './db';
import { bad } from './errors';
import { getWrapped } from './wrapped';

export const MILESTONES = [10, 25, 50, 100, 200];
export const GOAL_MIN = 1;
export const GOAL_MAX = 1000;

export interface GoalStatus {
  year: number;
  target: number | null;
  watched: number;
  percent: number | null;
  /** Watches needed per remaining week to finish on time (null when no goal or already done). */
  perWeekToFinish: number | null;
  streak: { current: number; best: number };
  /** Watches in each of the last 12 weeks, oldest first. */
  weeks: number[];
}

/** Monday (UTC) of the week containing `date` (YYYY-MM-DD or ISO), as YYYY-MM-DD. */
export function weekStart(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

function shiftWeeks(monday: string, weeks: number): string {
  const d = new Date(`${monday}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

/** Current and best weekly streaks, plus the last 12 weeks' counts. Pure, for testing. */
export function weeklyStreak(watchDates: string[], today: string): { current: number; best: number; weeks: number[] } {
  const counts = new Map<string, number>();
  for (const date of watchDates) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(date)) continue;
    const w = weekStart(date);
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  const thisWeek = weekStart(today);
  let start = counts.has(thisWeek) ? thisWeek : shiftWeeks(thisWeek, -1);
  let current = 0;
  while (counts.has(start)) { current++; start = shiftWeeks(start, -1); }

  const sorted = [...counts.keys()].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const w of sorted) {
    run = prev && shiftWeeks(prev, 1) === w ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  const weeks = Array.from({ length: 12 }, (_, i) => counts.get(shiftWeeks(thisWeek, i - 11)) || 0);
  return { current, best: Math.max(best, current), weeks };
}

async function watchDates(userId: string, since: string): Promise<string[]> {
  const d = db();
  const [diary, library] = await Promise.all([
    d.all('SELECT title_id, watched_on AS at FROM diary_entries WHERE user_id = ? AND watched_on >= ?', userId, since) as Promise<any[]>,
    d.all("SELECT title_id, updated_at AS at FROM library WHERE user_id = ? AND status = 'watched' AND updated_at >= ?", userId, since) as Promise<any[]>,
  ]);
  // A diary entry is the real watch date; the library date only counts titles with no diary entry.
  const diaryTitles = new Set(diary.map((r) => String(r.title_id)));
  return [...diary.map((r) => String(r.at)), ...library.filter((r) => !diaryTitles.has(String(r.title_id))).map((r) => String(r.at))];
}

export async function getGoalStatus(userId: string, at: Date = new Date()): Promise<GoalStatus> {
  const year = at.getUTCFullYear();
  const today = at.toISOString().slice(0, 10);
  const [row, wrapped, dates] = await Promise.all([
    db().get('SELECT target FROM user_goals WHERE user_id = ? AND year = ?', userId, year) as Promise<{ target?: number } | undefined>,
    getWrapped(userId, year),
    watchDates(userId, `${year - 1}-01-01`),
  ]);
  const target = row?.target ? Number(row.target) : null;
  const watched = wrapped.filmsWatched;
  const streak = weeklyStreak(dates, today);
  const weeksLeft = Math.max(1, Math.ceil((Date.UTC(year, 11, 31) - Date.UTC(year, at.getUTCMonth(), at.getUTCDate())) / (7 * 86_400_000)));
  return {
    year,
    target,
    watched,
    percent: target ? Math.min(100, Math.round((watched / target) * 100)) : null,
    perWeekToFinish: target && watched < target ? Math.round(((target - watched) / weeksLeft) * 10) / 10 : null,
    streak: { current: streak.current, best: streak.best },
    weeks: streak.weeks,
  };
}

export async function setGoal(userId: string, input: unknown, at: Date = new Date()): Promise<GoalStatus> {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>).target : undefined;
  const year = at.getUTCFullYear();
  if (raw === null) {
    await db().run('DELETE FROM user_goals WHERE user_id = ? AND year = ?', userId, year);
    return getGoalStatus(userId, at);
  }
  const target = Number(raw);
  if (!Number.isInteger(target) || target < GOAL_MIN || target > GOAL_MAX) throw bad(`Goal must be a whole number from ${GOAL_MIN} to ${GOAL_MAX}`);
  await db().run(
    `INSERT INTO user_goals (user_id, year, target, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, year) DO UPDATE SET target = excluded.target, updated_at = excluded.updated_at`,
    userId, year, target, now(),
  );
  return getGoalStatus(userId, at);
}

/**
 * Sends "milestone" notifications for counts crossed this year (10, 25, 50…) and for reaching the
 * goal, each once. Called after something is marked watched or logged. Never throws.
 */
export async function checkMilestones(userId: string, at: Date = new Date()): Promise<string[]> {
  try {
    const status = await getGoalStatus(userId, at);
    const keys: string[] = MILESTONES.filter((m) => status.watched >= m).map((m) => `${status.year}:count:${m}`);
    if (status.target && status.watched >= status.target) keys.push(`${status.year}:goal:${status.target}`);
    if (!keys.length) return [];
    const marks = keys.map(() => '?').join(',');
    const existing = new Set(((await db().all(`SELECT target_id FROM notifications WHERE user_id = ? AND type = 'milestone' AND target_id IN (${marks})`, userId, ...keys)) as any[]).map((r) => String(r.target_id)));
    const fresh = keys.filter((k) => !existing.has(k));
    // Only the newest count milestone is announced, so a big import doesn't send five at once.
    const counts = fresh.filter((k) => k.includes(':count:'));
    const toSend = [...counts.slice(-1), ...fresh.filter((k) => k.includes(':goal:'))];
    const silent = counts.slice(0, -1);
    const stamp = now();
    for (const key of toSend) {
      await db().run(`INSERT INTO notifications (user_id, actor_id, type, target_type, target_id, created_at) VALUES (?, ?, 'milestone', 'goal', ?, ?)`, userId, userId, key, stamp);
    }
    for (const key of silent) {
      await db().run(`INSERT INTO notifications (user_id, actor_id, type, target_type, target_id, read_at, created_at) VALUES (?, ?, 'milestone', 'goal', ?, ?, ?)`, userId, userId, key, stamp, stamp);
    }
    return toSend;
  } catch {
    return [];
  }
}

export { milestoneText } from './goalText';
