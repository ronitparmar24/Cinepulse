import { db } from '../db';
import { resolveVisibility } from './visibility';
import { getUserByUsername } from './profile';
import type { TasteMatchResult, MutualWatchlistResult } from '../types';

/**
 * Calculates Pearson Correlation taste match between viewer and target user.
 * Requires minimum 5 co-watched titles with ratings.
 */
export function getTasteMatch(
  viewerId: string | null,
  targetUsername: string
): TasteMatchResult {
  if (!viewerId) {
    return {
      score: null,
      coWatchedCount: 0,
      description: 'Log in to see your taste match percentage with this user.',
    };
  }

  const target = getUserByUsername(targetUsername);
  if (!target) {
    return { score: null, coWatchedCount: 0, description: 'User not found' };
  }

  if (viewerId === target.id) {
    return { score: 100, coWatchedCount: 0, description: '100% — This is your own profile.' };
  }

  // Check ratings visibility
  const vis = resolveVisibility(viewerId, target.id, 'ratings');
  if (!vis.allowed) {
    return { score: null, coWatchedCount: 0, description: 'Ratings are hidden by privacy settings.' };
  }

  const d = db();
  // Find titles rated by both users in library
  const rows = d.prepare(`
    SELECT
      l1.title_id,
      l1.rating as rating1,
      l2.rating as rating2
    FROM library l1
    JOIN library l2 ON l1.title_id = l2.title_id
    WHERE l1.user_id = ? AND l2.user_id = ?
      AND l1.rating IS NOT NULL AND l2.rating IS NOT NULL
  `).all(viewerId, target.id) as Array<{ title_id: string; rating1: number; rating2: number }>;

  const n = rows.length;
  if (n < 5) {
    return {
      score: null,
      coWatchedCount: n,
      description: n === 0
        ? 'No co-rated films yet. Rate 5 films in common to see your taste match.'
        : `Co-rated ${n} film${n === 1 ? '' : 's'}. Rate at least 5 films in common to calculate taste match.`,
    };
  }

  // Calculate Pearson correlation
  let sum1 = 0;
  let sum2 = 0;
  for (const r of rows) {
    sum1 += r.rating1;
    sum2 += r.rating2;
  }
  const mean1 = sum1 / n;
  const mean2 = sum2 / n;

  let num = 0;
  let den1 = 0;
  let den2 = 0;
  let absDiffSum = 0;

  for (const r of rows) {
    const diff1 = r.rating1 - mean1;
    const diff2 = r.rating2 - mean2;
    num += diff1 * diff2;
    den1 += diff1 * diff1;
    den2 += diff2 * diff2;
    absDiffSum += Math.abs(r.rating1 - r.rating2);
  }

  const denominator = Math.sqrt(den1 * den2);
  let percentage: number;

  if (denominator === 0) {
    // If variance is zero (e.g. user rated everything 4 stars), use mean absolute error on 5-star scale
    const maxDiff = n * 4;
    const errorRatio = absDiffSum / maxDiff;
    percentage = Math.round(Math.max(0, Math.min(100, (1 - errorRatio) * 100)));
  } else {
    const r = num / denominator; // r in [-1, 1]
    // Normalized to 0-100%
    percentage = Math.round(Math.max(0, Math.min(100, ((r + 1) / 2) * 100)));
  }

  const targetName = target.display_name || target.username;
  return {
    score: percentage,
    coWatchedCount: n,
    description: `You and @${target.username} agree ${percentage}% of the time across ${n} films.`,
  };
}

/**
 * Mutual watchlist overlap.
 * Gated by resolveVisibility() on target's watchlist.
 */
export function getMutualWatchlist(
  viewerId: string | null,
  targetUsername: string
): MutualWatchlistResult {
  if (!viewerId) {
    return {
      count: 0,
      titles: [],
      description: 'Log in to see mutual watchlist overlap.',
    };
  }

  const target = getUserByUsername(targetUsername);
  if (!target) {
    return { count: 0, titles: [], description: 'User not found' };
  }

  if (viewerId === target.id) {
    return { count: 0, titles: [], description: 'This is your own profile.' };
  }

  // Check watchlist visibility
  const vis = resolveVisibility(viewerId, target.id, 'watchlist');
  if (!vis.allowed) {
    return { count: 0, titles: [], description: 'Watchlist is private.' };
  }

  const d = db();
  const rows = d.prepare(`
    SELECT
      l1.title_id, l1.title_json
    FROM library l1
    JOIN library l2 ON l1.title_id = l2.title_id
    WHERE l1.user_id = ? AND l2.user_id = ?
      AND l1.status = 'watchlist' AND l2.status = 'watchlist'
    ORDER BY l1.updated_at DESC
  `).all(viewerId, target.id) as Array<{ title_id: string; title_json: string }>;

  const titles = rows.map((r) => {
    try {
      const parsed = JSON.parse(r.title_json);
      return {
        id: parsed.id || r.title_id,
        title: parsed.title || 'Untitled',
        poster: parsed.poster || null,
        releaseDate: parsed.releaseDate || null,
        mediaType: parsed.mediaType || 'movie',
      };
    } catch {
      return {
        id: r.title_id,
        title: 'Film',
        poster: null,
        releaseDate: null,
        mediaType: 'movie',
      };
    }
  });

  const count = titles.length;
  const targetName = target.display_name || target.username;

  return {
    count,
    titles,
    description: count > 0
      ? `${count} film${count === 1 ? '' : 's'} you and @${target.username} both want to watch.`
      : `No shared watchlist films with @${target.username} yet.`,
  };
}

/**
 * Suggestions: "Who to follow" based on shared watched films.
 * Simple SQL JOIN on co-watched titles ordered by count.
 */
export function getWhoToFollowSuggestions(
  viewerId: string,
  limit = 5
): Array<{
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  sharedFilmsCount: number;
}> {
  const d = db();
  const rows = d.prepare(`
    SELECT
      u.id, u.username, u.display_name, u.name, u.avatar_url, u.bio,
      COUNT(DISTINCT l2.title_id) as shared_count
    FROM library l1
    JOIN library l2 ON l1.title_id = l2.title_id AND l2.user_id != ?
    JOIN users u ON u.id = l2.user_id
    WHERE l1.user_id = ?
      AND l1.status = 'watched' AND l2.status = 'watched'
      -- Not already following
      AND u.id NOT IN (
        SELECT followee_id FROM follows WHERE follower_id = ?
      )
      -- Not blocked
      AND u.id NOT IN (
        SELECT blocked_id FROM blocks WHERE blocker_id = ?
        UNION
        SELECT blocker_id FROM blocks WHERE blocked_id = ?
      )
      AND u.profile_visibility != 'private'
    GROUP BY u.id
    HAVING shared_count > 0
    ORDER BY shared_count DESC, u.created_at DESC
    LIMIT ?
  `).all(viewerId, viewerId, viewerId, viewerId, viewerId, limit) as any[];

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name || r.name,
    avatarUrl: r.avatar_url,
    bio: r.bio,
    sharedFilmsCount: Number(r.shared_count || 0),
  }));
}
