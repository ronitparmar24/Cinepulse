/**
 * Letterboxd-style star ratings: ½ to 5 stars in half-star steps (stored as a number, e.g. 3.5).
 */
import { bad } from './errors';

export const RATING_MIN = 0.5;
export const RATING_MAX = 5;

/** Validates a rating from a request body. null/undefined → null (no rating). */
export function parseRating(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(n) || n < RATING_MIN || n > RATING_MAX || Math.round(n * 2) !== n * 2) {
    throw bad('Rating must be between ½ and 5 stars, in half-star steps');
  }
  return n;
}

/** "★★★½" for 3.5; "" for null. */
export function starText(rating: number | null | undefined): string {
  if (!rating) return '';
  const full = Math.floor(rating);
  return '★'.repeat(full) + (rating - full >= 0.5 ? '½' : '');
}

/** "3½ stars" — for screen readers and captions. */
export function ratingLabel(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  if (full === 0) return 'half a star';
  return `${full}${half ? '½' : ''} star${full === 1 && !half ? '' : 's'}`;
}
