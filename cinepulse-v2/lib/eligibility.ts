/**
 * Returns true only for a real, calendar-valid ISO date in YYYY-MM-DD form.
 *
 * Date.parse accepts values that are not dates in this contract (and can
 * normalise impossible calendar dates), so release/catalog data must pass this
 * check before it is used for eligibility decisions.
 */
export function isValidDate(date: string): boolean {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;

  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year
    && value.getUTCMonth() === month - 1
    && value.getUTCDate() === day;
}

/**
 * Whether a title's known release date has arrived.
 *
 * `now` is an epoch-millisecond timestamp so callers and tests can make the
 * policy deterministic. Unknown or malformed dates are deliberately not
 * treated as released.
 */
export function isReleased(releaseDate: string | null | undefined, now = Date.now()): boolean {
  if (releaseDate == null || !isValidDate(releaseDate) || !Number.isFinite(now)) return false;
  const current = new Date(now);
  if (Number.isNaN(current.getTime())) return false;
  const today = [
    current.getUTCFullYear().toString().padStart(4, '0'),
    (current.getUTCMonth() + 1).toString().padStart(2, '0'),
    current.getUTCDate().toString().padStart(2, '0'),
  ].join('-');
  return releaseDate <= today;
}
