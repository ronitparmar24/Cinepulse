import { db } from './db';
import { titleById, similar, recommended, catalog } from './catalog';
import { calculateTitleTasteMatch } from './tasteMatch';
import type { Title } from './types';

export interface RecommendationReason {
  reasonType: 'taste_match' | 'director_follow' | 'genre_affinity' | 'contrarian_pick' | 'box_office_momentum';
  reasonText: string;
  matchScore: number;
  sharedSignals: string[];
  referencedTitle?: { id: string; title: string; rating?: number };
}

export interface RecommendedMovieWithReason {
  title: Title;
  reason: RecommendationReason;
  tasteMatchScore?: number;
}

function parseYear(t: Title): number {
  if (t.releaseDate) {
    const y = parseInt(t.releaseDate.slice(0, 4), 10);
    if (!isNaN(y)) return y;
  }
  return 2024;
}

/**
 * Derives shared signals between two titles (common genres, high ratings, eras).
 */
function deriveSharedSignals(base: Title, candidate: Title): string[] {
  const signals: string[] = [];
  const baseGenres = new Set(base.genres || []);
  for (const g of candidate.genres || []) {
    if (baseGenres.has(g)) {
      signals.push(g);
    }
  }

  if (base.director && candidate.director && base.director === candidate.director) {
    signals.push(candidate.director);
  }

  const avg = candidate.voteAverage ?? 0;
  if (avg >= 8.0) {
    signals.push('Acclaimed');
  } else if (avg >= 7.0) {
    signals.push('High Audience Score');
  }

  const baseDecade = Math.floor(parseYear(base) / 10) * 10;
  const candDecade = Math.floor(parseYear(candidate) / 10) * 10;
  if (baseDecade === candDecade) {
    signals.push(`${baseDecade}s Era`);
  }

  return Array.from(new Set(signals)).slice(0, 4);
}

/**
 * Generates recommendation reasoning for titles related to a specific title.
 */
export async function getRecommendationsForTitle(
  titleId: string,
  viewerId?: string | null
): Promise<RecommendedMovieWithReason[]> {
  const base = await titleById(titleId);
  if (!base) return [];

  // Fetch recommendations or similar
  let candidates = await recommended(titleId);
  if (!candidates || candidates.length === 0) {
    candidates = await similar(titleId);
  }
  if (!candidates || candidates.length === 0) {
    const cat = await catalog({ media: 'all', collection: 'trending', page: 1 });
    candidates = cat.items.filter(t => t.id !== titleId);
  }
  if (!candidates || candidates.length === 0) return [];

  // Check viewer's history if logged in
  const d = db();
  let userRefRating: number | null = null;
  if (viewerId) {
    const row = d.prepare('SELECT rating FROM reviews WHERE user_id = ? AND title_id = ?').get(viewerId, titleId) as { rating: number } | undefined;
    if (row && typeof row.rating === 'number') {
      userRefRating = row.rating;
    }
  }

  const results: RecommendedMovieWithReason[] = [];

  for (const candidate of candidates.slice(0, 8)) {
    const taste = calculateTitleTasteMatch(viewerId || null, candidate);

    const sharedSignals = deriveSharedSignals(base, candidate);
    let reasonType: RecommendationReason['reasonType'] = 'taste_match';
    let reasonText = '';

    if (userRefRating && userRefRating >= 4) {
      reasonType = 'taste_match';
      reasonText = `Because you rated ${base.title} ${userRefRating}★`;
    } else if (base.director && candidate.director && base.director === candidate.director) {
      reasonType = 'director_follow';
      reasonText = `From director ${candidate.director}`;
    } else if (sharedSignals.length > 0) {
      reasonType = 'genre_affinity';
      reasonText = `Shared aesthetic: ${sharedSignals.slice(0, 2).join(' & ')}`;
    } else {
      reasonType = 'box_office_momentum';
      reasonText = `Trending with high community resonance`;
    }

    const matchScore = taste.available && taste.score !== null
      ? taste.score
      : Math.round(Math.min(99, Math.max(65, (candidate.voteAverage ?? 7.0) * 10 + 5)));

    results.push({
      title: candidate,
      reason: {
        reasonType,
        reasonText,
        matchScore,
        sharedSignals,
        referencedTitle: {
          id: base.id,
          title: base.title,
          rating: userRefRating ?? undefined,
        },
      },
      tasteMatchScore: taste.available && taste.score !== null ? taste.score : undefined,
    });
  }

  return results;
}

/**
 * Generates personalized recommendations for a user based on their rated catalog.
 */
export async function getUserPersonalizedRecommendations(
  userId: string
): Promise<RecommendedMovieWithReason[]> {
  const d = db();
  const topRated = d.prepare(`
    SELECT title_id, rating FROM reviews 
    WHERE user_id = ? AND rating >= 4 
    ORDER BY rating DESC, created_at DESC 
    LIMIT 3
  `).all(userId) as unknown as Array<{ title_id: string; rating: number }>;

  if (!topRated || topRated.length === 0) {
    return [];
  }

  const seenIds = new Set<string>();
  const collected: RecommendedMovieWithReason[] = [];

  for (const ref of topRated) {
    try {
      const recs = await getRecommendationsForTitle(ref.title_id, userId);
      for (const item of recs) {
        if (!seenIds.has(item.title.id) && item.title.id !== ref.title_id) {
          seenIds.add(item.title.id);
          collected.push(item);
        }
      }
    } catch {
      // Ignore individual failures
    }
    if (collected.length >= 10) break;
  }

  return collected.slice(0, 10);
}
