/**
 * CinePulse v10: Personalized Reranking Engine
 * Incorporates User Affinity, Filter Exclusions, Exploration Ratio (15%),
 * Repetition Penalty, and Honest Attribution Reasoning.
 */
import { db } from '../db';
import type { Title } from '../types';
import type { RecommendationReason, RecommendedMovieWithReason } from '../recommendations';
import { calculateTitleTasteMatch } from '../tasteMatch';
import {
  FEEDBACK_CONFIG,
  extractTitleFeatures,
  type TitleFeatureSnapshot,
} from './signals';
import { getUserAffinities, type AffinityRecord } from './affinity';

export interface RerankOptions {
  excludeIds?: string[];
  exploreRatio?: number;
  limit?: number;
  referenceTitleId?: string;
}

/**
 * Returns set of title IDs that must be suppressed for this user.
 */
export function getExcludedTitleIds(userId: string | null, extraExcludeIds: string[] = []): Set<string> {
  const excluded = new Set<string>(extraExcludeIds);
  if (!userId) return excluded;

  const d = db();
  const snoozeCutoff = new Date(Date.now() - FEEDBACK_CONFIG.SNOOZE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // 1. Suppressed by feedback
  const feedbackRows = d.prepare(`
    SELECT title_id, signal, updated_at FROM interest_feedback
    WHERE user_id = ? AND (
      signal IN ('not_interested', 'already_seen')
      OR (signal = 'snooze' AND updated_at >= ?)
    )
  `).all(userId, snoozeCutoff) as Array<{ title_id: string; signal: string; updated_at: string }>;

  for (const r of feedbackRows) {
    excluded.add(r.title_id);
  }

  // 2. Already watched in library
  const watchedRows = d.prepare(`
    SELECT title_id FROM library
    WHERE user_id = ? AND status = 'watched'
  `).all(userId) as Array<{ title_id: string }>;

  for (const r of watchedRows) {
    excluded.add(r.title_id);
  }

  return excluded;
}

/**
 * Derives honest recommendation reason based on real stored user affinities and reference titles.
 */
function deriveReason(
  title: Title,
  snapshot: TitleFeatureSnapshot,
  affinities: AffinityRecord[],
  isExplore: boolean,
  tasteScore: number | null,
  referenceTitle?: { id: string; title: string; rating?: number }
): RecommendationReason {
  if (isExplore) {
    return {
      reasonType: 'contrarian_pick',
      reasonText: 'Outside your usual taste',
      matchScore: tasteScore ?? 70,
      sharedSignals: snapshot.genres.slice(0, 2),
      referencedTitle: referenceTitle,
    };
  }

  if (referenceTitle && referenceTitle.rating && referenceTitle.rating >= 4) {
    return {
      reasonType: 'taste_match',
      reasonText: `Because you liked ${referenceTitle.title}`,
      matchScore: tasteScore ?? 85,
      sharedSignals: snapshot.genres.slice(0, 2),
      referencedTitle: referenceTitle,
    };
  }

  // Check top positive feature match
  const genreAffinities = affinities.filter((a) => a.featureType === 'genre' && a.weight > 0.5);
  const matchedGenre = snapshot.genres.find((g) => genreAffinities.some((ga) => ga.featureValue.toLowerCase() === g.toLowerCase()));
  if (matchedGenre) {
    return {
      reasonType: 'genre_affinity',
      reasonText: `More like the ${matchedGenre.toLowerCase()} you're into`,
      matchScore: tasteScore ?? 82,
      sharedSignals: [matchedGenre],
      referencedTitle: referenceTitle,
    };
  }

  if (snapshot.director) {
    const dirAff = affinities.find((a) => a.featureType === 'director' && a.featureValue.toLowerCase() === snapshot.director?.toLowerCase());
    if (dirAff && dirAff.weight > 0.4) {
      return {
        reasonType: 'director_follow',
        reasonText: `From director ${snapshot.director}`,
        matchScore: tasteScore ?? 80,
        sharedSignals: [snapshot.director],
        referencedTitle: referenceTitle,
      };
    }
  }

  // Check if a suppressed genre was avoided
  const suppressedGenres = affinities.filter((a) => a.featureType === 'genre' && a.weight <= -1.0);
  if (suppressedGenres.length > 0 && snapshot.genres.length > 0) {
    const topSuppressed = suppressedGenres[0]!.featureValue;
    // If this movie does not have the suppressed genre
    if (!snapshot.genres.some((g) => g.toLowerCase() === topSuppressed.toLowerCase())) {
      return {
        reasonType: 'taste_match',
        reasonText: `Fewer ${topSuppressed.toLowerCase()} picks since you said not interested`,
        matchScore: tasteScore ?? 75,
        sharedSignals: snapshot.genres.slice(0, 2),
        referencedTitle: referenceTitle,
      };
    }
  }

  if (snapshot.genres.length > 0) {
    return {
      reasonType: 'genre_affinity',
      reasonText: `Shared aesthetic: ${snapshot.genres.slice(0, 2).join(' & ')}`,
      matchScore: tasteScore ?? 72,
      sharedSignals: snapshot.genres.slice(0, 2),
      referencedTitle: referenceTitle,
    };
  }

  return {
    reasonType: 'box_office_momentum',
    reasonText: 'Trending with high community resonance',
    matchScore: tasteScore ?? 70,
    sharedSignals: [],
    referencedTitle: referenceTitle,
  };
}

/**
 * Reranks candidate titles for a user with affinity weights, exploration share,
 * and repetition penalties.
 */
export async function rerank(
  candidates: Title[],
  userId: string | null,
  options: RerankOptions = {}
): Promise<RecommendedMovieWithReason[]> {
  const limit = options.limit ?? 10;
  const exploreRatio = options.exploreRatio ?? FEEDBACK_CONFIG.EXPLORE_RATIO;
  const extraExcludes = options.excludeIds ?? [];

  const excludedIds = getExcludedTitleIds(userId, extraExcludes);
  if (options.referenceTitleId) {
    excludedIds.add(options.referenceTitleId);
  }

  // Filter out any excluded title
  const filtered = candidates.filter((c) => c && c.id && !excludedIds.has(c.id));
  if (filtered.length === 0) return [];

  // Get user affinities
  const affinities = userId ? getUserAffinities(userId) : [];
  const affinityMap = new Map<string, number>();
  for (const a of affinities) {
    affinityMap.set(`${a.featureType}:${a.featureValue.toLowerCase()}`, a.weight);
  }

  // Check reference title if provided
  let refTitleInfo: { id: string; title: string; rating?: number } | undefined;
  if (userId && options.referenceTitleId) {
    const d = db();
    const rev = d.prepare('SELECT rating FROM reviews WHERE user_id = ? AND title_id = ?').get(userId, options.referenceTitleId) as { rating?: number } | undefined;
    const refCand = candidates.find((c) => c.id === options.referenceTitleId);
    if (refCand) {
      refTitleInfo = { id: refCand.id, title: refCand.title, rating: rev?.rating };
    }
  }

  // Score each candidate
  interface ScoredCandidate {
    title: Title;
    snapshot: TitleFeatureSnapshot;
    tasteScore: number | null;
    affinitySum: number;
    baseScore: number;
    finalScore: number;
    primaryGenre: string;
  }

  const currentYear = new Date().getFullYear();
  const scoredList: ScoredCandidate[] = [];

  for (const item of filtered) {
    const snapshot = extractTitleFeatures(item);
    const taste = calculateTitleTasteMatch(userId, item);
    const tasteScore = taste.available && taste.score !== null ? taste.score : null;

    // Base score (0..10 normalized)
    const baseScore = tasteScore !== null ? tasteScore / 10 : (item.voteAverage ?? 7.0);

    // Sum matching affinities
    let affinitySum = 0;
    for (const g of snapshot.genres) {
      affinitySum += affinityMap.get(`genre:${g.toLowerCase()}`) ?? 0;
    }
    if (snapshot.director) {
      affinitySum += affinityMap.get(`director:${snapshot.director.toLowerCase()}`) ?? 0;
    }
    for (const actor of snapshot.cast) {
      affinitySum += (affinityMap.get(`actor:${actor.toLowerCase()}`) ?? 0) * 0.5;
    }
    if (snapshot.language) {
      affinitySum += (affinityMap.get(`language:${snapshot.language.toLowerCase()}`) ?? 0) * 0.5;
    }
    if (snapshot.decade && snapshot.decade !== 'unknown') {
      affinitySum += (affinityMap.get(`decade:${snapshot.decade.toLowerCase()}`) ?? 0) * 0.3;
    }
    if (snapshot.runtimeBucket && snapshot.runtimeBucket !== 'unknown') {
      affinitySum += (affinityMap.get(`runtime_bucket:${snapshot.runtimeBucket.toLowerCase()}`) ?? 0) * 0.3;
    }

    // Freshness boost
    let freshnessBoost = 0;
    if (snapshot.year && snapshot.year >= currentYear - 1) {
      freshnessBoost = 0.3;
    }

    const finalScore = baseScore + affinitySum + freshnessBoost;
    const primaryGenre = snapshot.genres[0] || 'Unknown';

    scoredList.push({
      title: item,
      snapshot,
      tasteScore,
      affinitySum,
      baseScore,
      finalScore,
      primaryGenre,
    });
  }

  // Sort descending by finalScore
  scoredList.sort((a, b) => b.finalScore - a.finalScore);

  // Exploration pool: candidates with low/neutral affinity outside user's top genres
  const topGenreValues = new Set(
    affinities
      .filter((a) => a.featureType === 'genre' && a.weight >= 1.0)
      .map((a) => a.featureValue.toLowerCase())
  );

  const exploreCandidates = scoredList.filter((s) => {
    const isOutsideTopGenres = !s.snapshot.genres.some((g) => topGenreValues.has(g.toLowerCase()));
    return isOutsideTopGenres && s.affinitySum >= -0.5;
  });

  const targetExploreCount = Math.max(1, Math.round(limit * exploreRatio));
  let explorePicked = 0;

  const results: RecommendedMovieWithReason[] = [];
  const pickedIds = new Set<string>();
  const genreCount = new Map<string, number>();

  // Helper to pick a candidate with repetition penalty
  function pickCandidate(cand: ScoredCandidate, isExplore = false): boolean {
    if (pickedIds.has(cand.title.id)) return false;

    const gCount = genreCount.get(cand.primaryGenre) || 0;
    // Repetition check: if same genre already appears >= 2 times and we have alternatives, skip
    if (gCount >= 2 && results.length < limit - 1) {
      // Look ahead to see if any other genre is available
      const altExists = scoredList.some((s) => !pickedIds.has(s.title.id) && (genreCount.get(s.primaryGenre) || 0) < 2);
      if (altExists) return false;
    }

    pickedIds.add(cand.title.id);
    genreCount.set(cand.primaryGenre, gCount + 1);

    const matchScore = cand.tasteScore ?? Math.round(Math.min(99, Math.max(65, (cand.title.voteAverage ?? 7.0) * 10 + 5)));
    const reason = deriveReason(cand.title, cand.snapshot, affinities, isExplore, matchScore, refTitleInfo);

    results.push({
      title: cand.title,
      reason,
      tasteMatchScore: matchScore,
    });
    return true;
  }

  // Interleave exploration pick at slot ~3 or ~4
  const exploreSlot = Math.min(3, Math.max(1, Math.floor(limit / 3)));

  for (let i = 0; i < scoredList.length && results.length < limit; i++) {
    // If at exploration slot and haven't picked exploration yet
    if (results.length === exploreSlot && explorePicked < targetExploreCount && exploreCandidates.length > 0) {
      const exp = exploreCandidates.find((c) => !pickedIds.has(c.title.id));
      if (exp && pickCandidate(exp, true)) {
        explorePicked++;
        continue;
      }
    }

    const cand = scoredList[i];
    if (cand) {
      pickCandidate(cand, false);
    }
  }

  // If still need items to reach limit, fill from remaining scoredList
  for (const cand of scoredList) {
    if (results.length >= limit) break;
    if (!pickedIds.has(cand.title.id)) {
      pickCandidate(cand, false);
    }
  }

  return results;
}
