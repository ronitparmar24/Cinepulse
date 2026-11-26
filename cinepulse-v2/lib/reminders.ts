/**
 * Release-day reminders.
 *
 * A reminder is one row per member and title. It is created when you press "Remind me" on an
 * upcoming title (source "manual"), or automatically when you watchlist an upcoming title and
 * have watchlist reminders on (source "watchlist"). A scheduled job notifies you once on release
 * day — in the app's notification bell, and by email if you chose that — then marks it sent.
 *
 * Release dates move, so the job re-checks the catalog before notifying and reschedules quietly
 * when a date slips. "Today" is taken in the member's region (India or US Eastern time).
 */
import { db, now } from './db';
import { bad, notFound } from './errors';
import { isValidDate } from './eligibility';
import { addDays, regionToday, reminderEligible } from './releaseDates';

export { addDays, regionToday, reminderEligible };
import type { Title, User } from './types';

export interface ReminderPrefs { watchlist: boolean; email: boolean; /** Product news emails (announcements). */ productUpdates: boolean }
export interface ReminderRecord {
  titleId: string;
  title: string;
  poster: string | null;
  mediaType: string;
  releaseDate: string;
  source: 'manual' | 'watchlist';
  createdAt: string;
}

const DEFAULT_PREFS: ReminderPrefs = { watchlist: true, email: false, productUpdates: true };
/** Releases discovered later than this are marked done without a (very late) alert. */
const STALE_DAYS = 7;

function snapshot(title: Title): string {
  return JSON.stringify({ id: title.id, title: title.title, poster: title.poster ?? null, backdrop: title.backdrop ?? null, mediaType: title.mediaType, releaseDate: title.releaseDate ?? null });
}

function toRecord(row: any): ReminderRecord {
  let t: any = {};
  try { t = JSON.parse(row.title_json || '{}'); } catch {}
  return {
    titleId: String(row.title_id),
    title: typeof t.title === 'string' ? t.title : String(row.title_id),
    poster: typeof t.poster === 'string' ? t.poster : null,
    mediaType: t.mediaType === 'tv' ? 'tv' : 'movie',
    releaseDate: String(row.release_date),
    source: row.source === 'watchlist' ? 'watchlist' : 'manual',
    createdAt: String(row.created_at),
  };
}

export async function getReminderPrefs(userId: string): Promise<ReminderPrefs> {
  const row = (await db().get('SELECT watchlist_reminders, email_reminders, product_updates FROM notification_prefs WHERE user_id = ?', userId)) as any;
  if (!row) return { ...DEFAULT_PREFS };
  return { watchlist: Number(row.watchlist_reminders) === 1, email: Number(row.email_reminders) === 1, productUpdates: row.product_updates === null || row.product_updates === undefined ? true : Number(row.product_updates) === 1 };
}

export async function setReminderPrefs(userId: string, input: unknown): Promise<ReminderPrefs> {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const current = await getReminderPrefs(userId);
  const next: ReminderPrefs = {
    watchlist: typeof body.watchlist === 'boolean' ? body.watchlist : current.watchlist,
    email: typeof body.email === 'boolean' ? body.email : current.email,
    productUpdates: typeof body.productUpdates === 'boolean' ? body.productUpdates : current.productUpdates,
  };
  await db().run(
    `INSERT INTO notification_prefs (user_id, watchlist_reminders, email_reminders, product_updates, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET watchlist_reminders = excluded.watchlist_reminders, email_reminders = excluded.email_reminders, product_updates = excluded.product_updates, updated_at = excluded.updated_at`,
    userId, next.watchlist ? 1 : 0, next.email ? 1 : 0, next.productUpdates ? 1 : 0, now(),
  );
  // Turning watchlist reminders off clears the automatic ones that have not gone out yet.
  if (current.watchlist && !next.watchlist) {
    await db().run(`DELETE FROM release_reminders WHERE user_id = ? AND source = 'watchlist' AND notified_at IS NULL`, userId);
  }
  return next;
}

/** Upcoming (not yet sent) reminders, soonest first. */
export async function listReminders(userId: string): Promise<ReminderRecord[]> {
  const rows = (await db().all(
    `SELECT title_id, title_json, release_date, source, created_at FROM release_reminders WHERE user_id = ? AND notified_at IS NULL ORDER BY release_date ASC, created_at ASC LIMIT 200`,
    userId,
  )) as any[];
  return rows.map(toRecord);
}

export async function addReminder(user: User, titleId: string, loadTitle: (id: string) => Promise<Title>): Promise<ReminderRecord> {
  const title = await loadTitle(titleId);
  if (!title.releaseDate || !isValidDate(title.releaseDate)) throw bad('This title has no release date yet, so there is nothing to remind you about.');
  if (!reminderEligible(title.releaseDate, user.region)) throw bad(`${title.title} is already out.`);
  const stamp = now();
  // A manual reminder replaces an automatic one (so removing it from the watchlist keeps it).
  await db().run(
    `INSERT INTO release_reminders (user_id, title_id, title_json, release_date, source, created_at, notified_at) VALUES (?, ?, ?, ?, 'manual', ?, NULL)
     ON CONFLICT(user_id, title_id) DO UPDATE SET title_json = excluded.title_json, release_date = excluded.release_date, source = 'manual', notified_at = NULL`,
    user.id, title.id, snapshot(title), title.releaseDate, stamp,
  );
  return toRecord({ title_id: title.id, title_json: snapshot(title), release_date: title.releaseDate, source: 'manual', created_at: stamp });
}

export async function removeReminder(userId: string, titleId: string): Promise<void> {
  const res = await db().run('DELETE FROM release_reminders WHERE user_id = ? AND title_id = ? AND notified_at IS NULL', userId, titleId);
  if (!res.changes) throw notFound('No reminder is set for this title.');
}

/**
 * Keeps automatic reminders in step with the watchlist: watchlisting an upcoming title adds one
 * (if the member wants them); moving it out of the watchlist removes only the automatic one.
 * Never throws: library saves must not fail because of reminders.
 */
export async function syncWatchlistReminder(user: User, title: Title, status: string | null): Promise<void> {
  try {
    if (status === 'watchlist') {
      if (!title.releaseDate || !reminderEligible(title.releaseDate, user.region)) return;
      if (!(await getReminderPrefs(user.id)).watchlist) return;
      await db().run(
        `INSERT INTO release_reminders (user_id, title_id, title_json, release_date, source, created_at, notified_at) VALUES (?, ?, ?, ?, 'watchlist', ?, NULL)
         ON CONFLICT(user_id, title_id) DO NOTHING`,
        user.id, title.id, snapshot(title), title.releaseDate, now(),
      );
    } else {
      await db().run(`DELETE FROM release_reminders WHERE user_id = ? AND title_id = ? AND source = 'watchlist' AND notified_at IS NULL`, user.id, title.id);
    }
  } catch {
    /* reminders are best-effort */
  }
}

/** Removes the automatic reminder when a title leaves the library entirely. Never throws. */
export async function clearWatchlistReminder(userId: string, titleId: string): Promise<void> {
  try {
    await db().run(`DELETE FROM release_reminders WHERE user_id = ? AND title_id = ? AND source = 'watchlist' AND notified_at IS NULL`, userId, titleId);
  } catch { /* best-effort */ }
}

export interface ReminderRunResult {
  checked: number;
  notified: number;
  emailed: number;
  rescheduled: number;
  skippedStale: number;
  cleaned: number;
}

export interface ReminderRunOptions {
  at?: Date;
  limit?: number;
  loadTitle?: (id: string) => Promise<Title>;
  sendEmail?: (to: string, name: string, titles: Array<{ id: string; title: string; poster: string | null; mediaType: string }>) => Promise<unknown>;
}

/**
 * The scheduled job: finds reminders due today (in each member's region), confirms the date,
 * notifies once, and reschedules ones whose date moved. Safe to run often and concurrently:
 * each reminder is claimed with a conditional update before anything is sent.
 */
export async function runReleaseReminders(options: ReminderRunOptions = {}): Promise<ReminderRunResult> {
  const at = options.at ?? new Date();
  const d = db();
  const result: ReminderRunResult = { checked: 0, notified: 0, emailed: 0, rescheduled: 0, skippedStale: 0, cleaned: 0 };
  // Tomorrow in UTC covers every region's "today".
  const cutoff = addDays(at.toISOString().slice(0, 10), 1);
  const rows = (await d.all(
    `SELECT r.user_id, r.title_id, r.title_json, r.release_date, u.region, u.email, u.name, u.display_name,
            COALESCE(p.email_reminders, 0) AS email_reminders
     FROM release_reminders r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN notification_prefs p ON p.user_id = r.user_id
     WHERE r.notified_at IS NULL AND r.release_date <= ?
     ORDER BY r.release_date ASC
     LIMIT ?`,
    cutoff, Math.max(1, Math.min(options.limit ?? 300, 1000)),
  )) as any[];

  const fresh = new Map<string, Title | null>();
  const refresh = async (id: string): Promise<Title | null> => {
    if (!options.loadTitle) return null;
    if (!fresh.has(id)) fresh.set(id, await options.loadTitle(id).catch(() => null));
    return fresh.get(id) ?? null;
  };

  const emails = new Map<string, { to: string; name: string; titles: Array<{ id: string; title: string; poster: string | null; mediaType: string }> }>();

  for (const row of rows) {
    result.checked++;
    const today = regionToday(row.region, at);
    const latest = await refresh(String(row.title_id));
    const releaseDate = latest?.releaseDate && isValidDate(latest.releaseDate) ? latest.releaseDate : String(row.release_date);

    if (releaseDate > today) {
      if (releaseDate !== row.release_date || latest) {
        await d.run('UPDATE release_reminders SET release_date = ?, title_json = ? WHERE user_id = ? AND title_id = ? AND notified_at IS NULL',
          releaseDate, latest ? snapshot(latest) : row.title_json, row.user_id, row.title_id);
        if (releaseDate !== row.release_date) result.rescheduled++;
      }
      continue;
    }

    // Claim it first so two overlapping runs can never notify twice.
    const claim = await d.run('UPDATE release_reminders SET notified_at = ?, release_date = ? WHERE user_id = ? AND title_id = ? AND notified_at IS NULL',
      now(), releaseDate, row.user_id, row.title_id);
    if (!claim.changes) continue;

    if (releaseDate < addDays(today, -STALE_DAYS)) { result.skippedStale++; continue; }

    let t: any = {};
    try { t = latest ?? JSON.parse(row.title_json || '{}'); } catch {}
    await d.run(
      `INSERT INTO notifications (user_id, actor_id, type, target_type, target_id, created_at) VALUES (?, ?, 'release_day', 'title', ?, ?)`,
      row.user_id, row.user_id, row.title_id, now(),
    );
    result.notified++;

    if (Number(row.email_reminders) === 1 && row.email) {
      const entry = emails.get(row.user_id) ?? { to: String(row.email), name: String(row.display_name || row.name || ''), titles: [] };
      entry.titles.push({ id: String(row.title_id), title: String(t.title || row.title_id), poster: typeof t.poster === 'string' ? t.poster : null, mediaType: t.mediaType === 'tv' ? 'tv' : 'movie' });
      emails.set(row.user_id, entry);
    }
  }

  if (options.sendEmail) {
    for (const e of emails.values()) {
      try { await options.sendEmail(e.to, e.name, e.titles); result.emailed++; } catch { /* the in-app alert already went out */ }
    }
  }

  // Sent reminders are kept for a while so the bell can show the title, then tidied up.
  const cleaned = await d.run('DELETE FROM release_reminders WHERE notified_at IS NOT NULL AND notified_at < ?', new Date(at.getTime() - 90 * 86_400_000).toISOString());
  result.cleaned = Number(cleaned.changes || 0);
  return result;
}
