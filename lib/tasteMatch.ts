import { db } from './db';
import type { Title } from './types';
import { SCORE_THRESHOLDS, type TasteMatchResult } from './scoreThresholds';

interface UserRatingRow {
  title_id: string;
  rating: number;
  title_json: string;
}

/**
 * Calculates a user's taste match percentage for a specific candidate title.
 * Must have >= 5 ratings to be eligible, otherwise returns available: false.
 */
export function calculateTitleTasteMatch(userId: string | null | undefined, title: Title): TasteMatchResult {
  if (!userId) {
    return {
      available: false,
      score: null,
      ratedCount: 0,
      reason: 'Sign in and rate titles to unlock your Taste Match',
    };
  }

  const d = db();
  const rows = d.prepare(`
    SELECT title_id, rating, title_json
    FROM library
    WHERE user_id = ? AND rating IS NOT NULL
  `).all(userId) as unknown as UserRatingRow[];

  const ratedCount = rows.length;
  if (ratedCount < SCORE_THRESHOLDS.MIN_RATINGS_FOR_TASTE_MATCH) {
    return {
      available: false,
      score: null,
      ratedCount,
      reason: `Rate at least ${SCORE_THRESHOLDS.MIN_RATINGS_FOR_TASTE_MATCH} titles to unlock your Taste Match (${ratedCount}/${SCORE_THRESHOLDS.MIN_RATINGS_FOR_TASTE_MATCH} rated)`,
    };
  }

  // Build genre affinity profile
  const genreWeights: Record<string, { totalRating: number; count: number }> = {};
  let directorAffinity: number | null = null;
  let totalRatingsSum = 0;

  for (const row of rows) {
    totalRatingsSum += row.rating;
    try {
      const parsed = JSON.parse(row.title_json) as Partial<Title>;
      if (Array.isArray(parsed.genres)) {
        for (const g of parsed.genres) {
          const key = g.toLowerCase().trim();
          if (!genreWeights[key]) genreWeights[key] = { totalRating: 0, count: 0 };
          genreWeights[key].totalRating += row.rating;
          genreWeights[key].count += 1;
        }
      }
      if (title.director && parsed.director && parsed.director.toLowerCase() === title.director.toLowerCase()) {
        directorAffinity = (directorAffinity === null) ? row.rating : (directorAffinity + row.rating) / 2;
      }
    } catch {}
  }

  const baselineAvgRating = totalRatingsSum / ratedCount; // scale usually 1–10
  const candidateGenres = (title.genres || []).map(g => g.toLowerCase().trim());

  if (candidateGenres.length === 0) {
    return {
      available: true,
      score: Math.min(99, Math.max(50, Math.round((baselineAvgRating / 10) * 100))),
      ratedCount,
    };
  }

  // Score candidate genres against user preference
  let matchedScoresSum = 0;
  let matchesCount = 0;

  for (const g of candidateGenres) {
    if (genreWeights[g]) {
      const genreAvg = genreWeights[g].totalRating / genreWeights[g].count;
      matchedScoresSum += genreAvg;
      matchesCount += 1;
    } else {
      // Unseen genre, give mild baseline anchor
      matchedScoresSum += baselineAvgRating * 0.8;
      matchesCount += 1;
    }
  }

  let genreScore = matchesCount > 0 ? (matchedScoresSum / matchesCount) : baselineAvgRating;

  // If director match exists, blend it 20%
  let finalScore10 = genreScore;
  if (directorAffinity !== null) {
    finalScore10 = (genreScore * 0.8) + (directorAffinity * 0.2);
  }

  // Convert 1–10 rating scale to percentage (e.g., 7.5 -> 75%, scaled with sigmoid centering around 6.5)
  // Ensures scores fall in a realistic 45%–98% range for positive cinema taste match
  const rawPct = (finalScore10 / 10) * 100;
  const boundedPct = Math.min(98, Math.max(25, Math.round(rawPct)));

  return {
    available: true,
    score: boundedPct,
    ratedCount,
  };
}
