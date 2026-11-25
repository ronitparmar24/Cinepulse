/** Small client helpers for Wrapped, kept apart from the story UI so entry points stay light. */

export const OPEN_WRAPPED_EVENT = 'cinepulse:open-wrapped';

/** In January people are still sharing last year, so Wrapped shows the previous year then. */
export function wrappedYear(now = new Date()): number {
  return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
}

/** Wrapped is promoted on the home page from 15 November to the end of January. */
export function wrappedSeason(now = new Date()): boolean {
  const m = now.getMonth();
  return m === 0 || m === 11 || (m === 10 && now.getDate() >= 15);
}

export function openWrapped(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN_WRAPPED_EVENT));
}
