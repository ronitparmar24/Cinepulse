/** Release-calendar helpers: day maths on 'YYYY-MM-DD' dates, without time-zone drift. */

const DAY_MS = 86_400_000;

/** A calendar date as a UTC-midnight timestamp, or null when the string is not 'YYYY-MM-DD'. */
export function dayStamp(iso: string | null | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

/** Today's local date as 'YYYY-MM-DD'. */
export function localTodayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole days from `todayIso` to `iso` (negative when it is in the past), or null if undated. */
export function daysUntil(iso: string | null | undefined, todayIso: string = localTodayIso()): number | null {
  const target = dayStamp(iso);
  const today = dayStamp(todayIso);
  if (target === null || today === null) return null;
  return Math.round((target - today) / DAY_MS);
}

export interface Countdown { label: string; tone: 'today' | 'soon' | 'later' | 'out' }

/** A short chip label: "Today", "Tomorrow", "in 5 days", "in 3 wks", "in 4 mos", "Out now". */
export function countdownLabel(iso: string | null | undefined, todayIso: string = localTodayIso()): Countdown | null {
  const days = daysUntil(iso, todayIso);
  if (days === null) return null;
  if (days < 0) return days >= -30 ? { label: 'Out now', tone: 'out' } : null;
  if (days === 0) return { label: 'Today', tone: 'today' };
  if (days === 1) return { label: 'Tomorrow', tone: 'soon' };
  if (days < 14) return { label: `in ${days} days`, tone: days <= 7 ? 'soon' : 'later' };
  if (days < 61) return { label: `in ${Math.round(days / 7)} wks`, tone: 'later' };
  const months = Math.round(days / 30.44);
  if (months < 12) return { label: `in ${months} mos`, tone: 'later' };
  const years = Math.max(1, Math.round(days / 365));
  return { label: `in ${years} yr${years > 1 ? 's' : ''}`, tone: 'later' };
}

/** 'YYYY-MM' of a 'YYYY-MM-DD' date. */
export const monthKeyOf = (iso: string) => iso.slice(0, 7);

/** Shifts a 'YYYY-MM' key by `delta` months. */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * The cells of a Monday-first month grid: `null` for the blanks before the 1st, then each day
 * as 'YYYY-MM-DD'. Trailing blanks pad the last week to 7 cells.
 */
export function monthGrid(key: string): Array<string | null> {
  const [y, m] = key.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: Array<string | null> = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${key}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** "Week of 1 Dec – 7 Dec 2026" for a release date (Monday to Sunday), or 'TBA'. */
export function releaseWeekLabel(iso: string | null | undefined): string {
  const t = dayStamp(iso);
  if (t === null) return 'TBA';
  const d = new Date(t);
  const day = d.getUTCDay();
  const monday = new Date(t + ((day === 0 ? -6 : 1) - day) * DAY_MS);
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  const mFmt = monday.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const sFmt = sunday.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `Week of ${mFmt} – ${sFmt}`;
}
