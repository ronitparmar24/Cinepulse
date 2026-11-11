import { db } from './db';
import { titleById, similar, recommended, catalog } from './catalog';
import { rerank } from './feedback/rerank';
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

/**
 * Generates recommendation reasoning for titles related to a specific title,
 * personalized through the reranking engine.
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
    candidates = cat.items.filter((t) => t.id !== titleId);
  }
  if (!candidates || candidates.length === 0) return [];

  // Run through reranking engine
  return rerank(candidates, viewerId || null, {
    referenceTitleId: titleId,
    limit: 8,
  });
}

/**
 * Generates personalized recommendations for a user based on their reviews,
 * interest feedback, library items, and learned affinities (Cold Start friendly).
 */
export async function getUserPersonalizedRecommendations(
  userId: string,
  extraExcludeIds: string[] = []
): Promise<RecommendedMovieWithReason[]> {
  const d = db();
  const seenIds = new Set<string>(extraExcludeIds);
  const candidates: Title[] = [];

  // 1. High ratings (reviews >= 4)
  const topRated = d.prepare(`
    SELECT title_id, rating FROM reviews 
    WHERE user_id = ? AND rating >= 4 
    ORDER BY rating DESC, created_at DESC 
    LIMIT 3
  `).all(userId) as Array<{ title_id: string; rating: number }>;

  for (const ref of topRated) {
    try {
      const recs = (await recommended(ref.title_id)) || (await similar(ref.title_id));
      for (const it of recs || []) {
        if (!seenIds.has(it.id)) {
          seenIds.add(it.id);
          candidates.push(it);
        }
      }
    } catch {}
  }

  // 2. Cold Start: Check 'interested' feedback signals
  if (candidates.length < 15) {
    const interestedTitles = d.prepare(`
      SELECT title_id FROM interest_feedback
      WHERE user_id = ? AND signal = 'interested'
      ORDER BY updated_at DESC LIMIT 5
    `).all(userId) as Array<{ title_id: string }>;

    for (const item of interestedTitles) {
      try {
        const recs = (await recommended(item.title_id)) || (await similar(item.title_id));
        for (const it of recs || []) {
          if (!seenIds.has(it.id)) {
            seenIds.add(it.id);
            candidates.push(it);
          }
        }
      } catch {}
    }
  }

  // 3. Cold Start: Check watchlist / library
  if (candidates.length < 15) {
    const libRows = d.prepare(`
      SELECT title_id FROM library
      WHERE user_id = ? AND status IN ('watchlist', 'watching')
      ORDER BY updated_at DESC LIMIT 5
    `).all(userId) as Array<{ title_id: string }>;

    for (const item of libRows) {
      try {
        const recs = (await recommended(item.title_id)) || (await similar(item.title_id));
        for (const it of recs || []) {
          if (!seenIds.has(it.id)) {
            seenIds.add(it.id);
            candidates.push(it);
          }
        }
      } catch {}
    }
  }

  // 4. Cold Start: Check positive affinities (e.g. from onboarding picks)
  if (candidates.length < 15) {
    const topGenres = d.prepare(`
      SELECT feature_value FROM user_affinity
      WHERE user_id = ? AND feature_type = 'genre' AND weight > 0
      ORDER BY weight DESC LIMIT 3
    `).all(userId) as Array<{ feature_value: string }>;

    for (const g of topGenres) {
      try {
        const genreCat = await catalog({ media: 'all', collection: 'trending', genre: g.feature_value, page: 1 });
        for (const it of genreCat.items || []) {
          if (!seenIds.has(it.id)) {
            seenIds.add(it.id);
            candidates.push(it);
          }
        }
      } catch {}
    }
  }

  // 5. Check if user has ANY signal at all
  const hasAnySignal =
    topRated.length > 0 ||
    Boolean(d.prepare('SELECT 1 FROM interest_feedback WHERE user_id = ? LIMIT 1').get(userId)) ||
    Boolean(d.prepare('SELECT 1 FROM library WHERE user_id = ? LIMIT 1').get(userId)) ||
    Boolean(d.prepare('SELECT 1 FROM user_affinity WHERE user_id = ? LIMIT 1').get(userId));

  if (!hasAnySignal) {
    return [];
  }

  // Fill candidate pool with trending if needed
  if (candidates.length < 15) {
    try {
      const trendingCat = await catalog({ media: 'all', collection: 'trending', page: 1 });
      for (const it of trendingCat.items || []) {
        if (!seenIds.has(it.id)) {
          seenIds.add(it.id);
          candidates.push(it);
        }
      }
    } catch {}
  }

  return rerank(candidates, userId, { limit: 10, excludeIds: extraExcludeIds });
}
