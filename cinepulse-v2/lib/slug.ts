/**
 * Human-readable URLs for titles, Letterboxd-style:
 *   movie-27205 "Inception"        → /film/inception-27205
 *   tv-1399     "Game of Thrones"  → /tv/game-of-thrones-1399
 *   demo-dunes  "Beyond the Dunes" → /film/beyond-the-dunes~demo-dunes
 * The title part is decorative; only the trailing id is used to look the title up.
 */
import type { Title } from './types';

export function kebab(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'title';
}

export function titlePath(t: Pick<Title, 'id' | 'title' | 'mediaType'>): string {
  const base = t.mediaType === 'tv' ? '/tv' : '/film';
  const m = /^(movie|tv)-(\d+)$/.exec(t.id);
  if (m) return `${base}/${kebab(t.title)}-${m[2]}`;
  return `${base}/${kebab(t.title)}~${t.id}`;
}

/** Inverse of titlePath: the catalogue id for a /film or /tv slug, or null if malformed. */
export function idFromSlug(kind: 'film' | 'tv', slug: string): string | null {
  const decoded = decodeURIComponent(slug);
  const tilde = decoded.lastIndexOf('~');
  if (tilde !== -1) {
    const id = decoded.slice(tilde + 1);
    return /^[A-Za-z0-9_-]{1,120}$/.test(id) ? id : null;
  }
  const m = /(?:^|-)(\d{1,10})$/.exec(decoded);
  return m ? `${kind === 'tv' ? 'tv' : 'movie'}-${m[1]}` : null;
}
