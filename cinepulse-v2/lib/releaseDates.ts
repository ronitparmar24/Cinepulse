/** Release-date helpers shared by the server job and the browser (no database imports here). */
import { isValidDate } from './eligibility';

const REGION_TZ: Record<string, string> = { IN: 'Asia/Kolkata', US: 'America/New_York' };

/** YYYY-MM-DD for `at` in the member's region. */
export function regionToday(region: string | null | undefined, at: Date = new Date()): string {
  const timeZone = REGION_TZ[String(region || 'IN').toUpperCase()] || REGION_TZ.IN;
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whether a title can still get a reminder: it has a real date that hasn't arrived in this region. */
export function reminderEligible(releaseDate: string | null | undefined, region?: string | null, at: Date = new Date()): boolean {
  return typeof releaseDate === 'string' && isValidDate(releaseDate) && releaseDate > regionToday(region, at);
}

