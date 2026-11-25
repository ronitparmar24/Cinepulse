/**
 * "Add to calendar" for a release date: an all-day event as an .ics file (Apple Calendar,
 * Outlook, most phones) or a prefilled Google Calendar link. Pure functions, no network.
 */
import { isValidDate } from './eligibility';

export interface CalendarTitle {
  id: string;
  title: string;
  mediaType: string;
  releaseDate: string | null | undefined;
  overview?: string | null;
}

const compact = (date: string) => date.replace(/-/g, '');
const nextDay = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** RFC 5545 text escaping. */
export function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

const encoder = new TextEncoder();
const bytes = (s: string) => encoder.encode(s).length;

/** Folds long content lines at 75 octets, as the format requires (works in the browser too). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (bytes(rest) > 75) {
    let cut = 75;
    while (bytes(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

export function eventSummary(t: CalendarTitle): string {
  return t.mediaType === 'tv' ? `${t.title} — series premiere` : `${t.title} — release day`;
}

export function canAddToCalendar(t: Pick<CalendarTitle, 'releaseDate'>): boolean {
  return typeof t.releaseDate === 'string' && isValidDate(t.releaseDate);
}

export function buildIcs(t: CalendarTitle, url: string, stamp: Date = new Date()): string {
  if (!canAddToCalendar(t)) throw new Error('This title has no release date yet.');
  const date = t.releaseDate as string;
  const dtstamp = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const description = `${t.overview ? `${t.overview.slice(0, 300)}\n\n` : ''}Open in CinePulse: ${url}`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CinePulse//Release reminders//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${t.id}-${compact(date)}@cinepulse`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${compact(date)}`,
    `DTEND;VALUE=DATE:${compact(nextDay(date))}`,
    `SUMMARY:${icsEscape(eventSummary(t))}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `URL:${url}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(`${t.title} is out today`)}`,
    'TRIGGER;RELATED=START:PT9H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

export function googleCalendarUrl(t: CalendarTitle, url: string): string {
  if (!canAddToCalendar(t)) throw new Error('This title has no release date yet.');
  const date = t.releaseDate as string;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: eventSummary(t),
    dates: `${compact(date)}/${compact(nextDay(date))}`,
    details: `${t.overview ? `${t.overview.slice(0, 300)}\n\n` : ''}Open in CinePulse: ${url}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** A safe file name like "dune-part-three-release.ics". */
export function icsFileName(t: Pick<CalendarTitle, 'title'>): string {
  const slug = t.title.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 60) || 'cinepulse';
  return `${slug}-release.ics`;
}
