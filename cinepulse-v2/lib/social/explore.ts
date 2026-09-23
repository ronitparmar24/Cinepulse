import { db } from '../db';
import type { TrendingFilm, TrendingReview, TrendingList, RisingUser, FollowSuggestion } from '../types';

const SEVEN_DAYS_AGO = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
};

/**
 * Trending films: most-watched + rated in last 7 days with velocity boost.
 */
export function getTrendingFilms(limit = 20, viewerId: string | null = null): TrendingFilm[] {
  const d = db();
  const cutoff = SEVEN_DAYS_AGO();

  const rows = d.prepare(`
    SELECT
      ae.target_id as title_id,
      COUNT(*) as event_count,
      AVG(CAST(json_extract(ae.metadata, '$.rating') AS REAL)) as avg_rating,
      MAX(ae.created_at) as latest_at,
      l.title_json
    FROM activity_events ae
    LEFT JOIN (
      SELECT DISTINCT title_id, title_json
      FROM library
      WHERE title_json IS NOT NULL
    ) l ON l.title_id = ae.target_id
    WHERE ae.type IN ('watched', 'rated', 'reviewed')
      AND ae.target_type = 'title'
      AND ae.created_at >= ?
      AND ae.visibility = 'public'
    GROUP BY ae.target_id
    HAVING event_count >= 1
    ORDER BY event_count DESC, avg_rating DESC
    LIMIT ?
  `).all(cutoff, limit) as any[];

  return rows.map((r, i) => {
    let titleData: any = {};
    try { titleData = JSON.parse(r.title_json || '{}'); } catch {}

    return {
      titleId: r.title_id,
      title: titleData.title || r.title_id,
      poster: titleData.poster || null,
      watchesLast7d: Number(r.event_count || 0),
      avgRatingLast7d: r.avg_rating ? Number(Number(r.avg_rating).toFixed(1)) : null,
      velocity: Number(r.event_count || 0),
      trendingRank: i + 1,
      genres: titleData.genres || [],
    };
  });
}

/**
 * Trending reviews: most-liked public reviews in last 7 days.
 */
export function getTrendingReviews(limit = 20, viewerId: string | null = null): TrendingReview[] {
  const d = db();
  const cutoff = SEVEN_DAYS_AGO();

  const rows = d.prepare(`
    SELECT
      r.id, r.user_id, r.title_id, r.title_name, r.body, r.rating, r.spoiler, r.created_at,
      u.username, u.display_name, u.name, u.avatar_url,
      COUNT(DISTINCT l.user_id) as likes_count,
      COUNT(DISTINCT c.id) as comments_count,
      l.title_json as lib_title_json
    FROM reviews r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN likes lk ON lk.target_type = 'review' AND lk.target_id = r.id
    LEFT JOIN comments c ON c.target_type = 'review' AND c.target_id = r.id AND c.deleted_at IS NULL
    LEFT JOIN library lib ON lib.user_id = r.user_id AND lib.title_id = r.title_id
    LEFT JOIN (
      SELECT user_id, id as l_user_id, title_id, title_json FROM library
    ) l ON l.title_id = r.title_id
    WHERE r.created_at >= ?
    GROUP BY r.id
    ORDER BY likes_count DESC, comments_count DESC, r.created_at DESC
    LIMIT ?
  `).all(cutoff, limit) as any[];

  // Deduplicate since the JOIN may explode rows
  const seen = new Set<string>();
  const results: TrendingReview[] = [];

  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);

    // Count likes separately for accuracy
    const likeCount = (d.prepare(`SELECT COUNT(*) as count FROM likes WHERE target_type = 'review' AND target_id = ?`).get(r.id) as any)?.count || 0;
    const commentCount = (d.prepare(`SELECT COUNT(*) as count FROM comments WHERE target_type = 'review' AND target_id = ? AND deleted_at IS NULL`).get(r.id) as any)?.count || 0;

    // Get poster from library
    let poster: string | null = null;
    try {
      const libRow = d.prepare(`SELECT title_json FROM library WHERE title_id = ? AND title_json IS NOT NULL LIMIT 1`).get(r.title_id) as any;
      if (libRow?.title_json) {
        const tj = JSON.parse(libRow.title_json);
        poster = tj.poster || null;
      }
    } catch {}

    const isSpoiler = Boolean(r.spoiler);
    const isAuthor = viewerId === r.user_id;
    const body = isSpoiler && !isAuthor ? '[Spoiler — click to reveal]' : r.body;

    results.push({
      reviewId: String(r.id),
      titleId: r.title_id,
      titleName: r.title_name,
      poster,
      rating: r.rating,
      body,
      spoiler: isSpoiler,
      author: {
        id: r.user_id,
        username: r.username,
        displayName: r.display_name || r.name,
        avatarUrl: r.avatar_url,
      },
      likesCount: Number(likeCount),
      commentsCount: Number(commentCount),
      createdAt: r.created_at,
      velocityScore: Number(likeCount) + Number(commentCount) * 2,
    });

    if (results.length >= limit) break;
  }

  return results.sort((a, b) => b.velocityScore - a.velocityScore);
}

/**
 * Trending lists: most-bookmarked + liked public lists.
 */
export function getTrendingLists(limit = 20): TrendingList[] {
  const d = db();

  const rows = d.prepare(`
    SELECT
      ul.id, ul.user_id, ul.title as list_name, ul.description, ul.updated_at, ul.title_ids, ul.items_json,
      u.username, u.display_name, u.name, u.avatar_url,
      COUNT(DISTINCT lb.user_id) as bookmarks_count,
      COUNT(DISTINCT lk.user_id) as likes_count
    FROM user_lists ul
    JOIN users u ON u.id = ul.user_id
    LEFT JOIN list_bookmarks lb ON lb.list_id = ul.id
    LEFT JOIN likes lk ON lk.target_type = 'list' AND lk.target_id = ul.id
    WHERE ul.visibility = 'public'
    GROUP BY ul.id
    ORDER BY (bookmarks_count * 2 + likes_count) DESC, ul.updated_at DESC
    LIMIT ?
  `).all(limit) as any[];

  return rows.map((r) => {
    let titleIds: string[] = [];
    try {
      // Support both title_ids (new) and items_json (legacy)
      const raw = r.title_ids || r.items_json;
      const parsed = JSON.parse(raw || '[]');
      if (Array.isArray(parsed)) {
        titleIds = parsed.map((it: any) => (typeof it === 'string' ? it : it?.titleId)).filter(Boolean);
      }
    } catch {}

    // Get cover posters for first 4 films
    const coverPosters: Array<string | null> = [];
    for (const tid of titleIds.slice(0, 4)) {
      try {
        const libRow = d.prepare(`SELECT title_json FROM library WHERE title_id = ? AND title_json IS NOT NULL LIMIT 1`).get(tid) as any;
        if (libRow?.title_json) {
          const tj = JSON.parse(libRow.title_json);
          coverPosters.push(tj.poster || null);
        } else {
          coverPosters.push(null);
        }
      } catch {
        coverPosters.push(null);
      }
    }

    return {
      listId: r.id,
      name: r.list_name,
      description: r.description,
      owner: {
        id: r.user_id,
        username: r.username,
        displayName: r.display_name || r.name,
        avatarUrl: r.avatar_url,
      },
      filmCount: titleIds.length,
      coverPosters,
      likesCount: Number(r.likes_count || 0),
      bookmarksCount: Number(r.bookmarks_count || 0),
      updatedAt: r.updated_at,
    };
  });
}

/**
 * Rising users: users with most follower growth in last 7 days.
 */
export function getRisingUsers(limit = 10, viewerId: string | null = null): RisingUser[] {
  const d = db();
  const cutoff = SEVEN_DAYS_AGO();

  const rows = d.prepare(`
    SELECT
      u.id, u.username, u.display_name, u.name, u.avatar_url, u.bio,
      COUNT(f.follower_id) as follower_growth,
      (SELECT COUNT(*) FROM follows WHERE followee_id = u.id AND status = 'accepted') as total_followers
    FROM users u
    LEFT JOIN follows f ON f.followee_id = u.id AND f.status = 'accepted' AND f.created_at >= ?
    WHERE u.profile_visibility != 'private'
    GROUP BY u.id
    ORDER BY follower_growth DESC, total_followers DESC
    LIMIT ?
  `).all(cutoff, limit) as any[];

  return rows.map((r) => {
    let isFollowing = false;
    if (viewerId) {
      const fw = d.prepare(`SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ? AND status = 'accepted'`).get(viewerId, r.id);
      isFollowing = Boolean(fw);
    }

    return {
      id: r.id,
      username: r.username,
      displayName: r.display_name || r.name,
      avatarUrl: r.avatar_url,
      bio: r.bio,
      followerCount: Number(r.total_followers || 0),
      followerGrowth: Number(r.follower_growth || 0),
      tasteMatch: null,
      isFollowing,
    };
  });
}

/**
 * Popular public lists sorted by bookmark + like count.
 */
export function getPopularLists(limit = 20): TrendingList[] {
  return getTrendingLists(limit);
}

/**
 * Personalized "For You" explore feed.
 * Mix: trending films + taste-match reviews + popular lists.
 */
export function getForYouFeed(userId: string, limit = 30): {
  trendingFilms: TrendingFilm[];
  suggestedReviews: TrendingReview[];
  popularLists: TrendingList[];
  risingUsers: RisingUser[];
} {
  const trendingFilms = getTrendingFilms(10, userId);
  const suggestedReviews = getTrendingReviews(10, userId);
  const popularLists = getTrendingLists(8);
  const risingUsers = getRisingUsers(6, userId);

  return { trendingFilms, suggestedReviews, popularLists, risingUsers };
}

/**
 * Unified social search: users, lists, reviews.
 * Films are searched via the catalog API (client-side).
 */
export function searchSocial(
  query: string,
  type: 'users' | 'lists' | 'reviews' | 'all',
  limit = 20,
  viewerId: string | null = null
): { users: any[]; lists: any[]; reviews: any[] } {
  if (!query?.trim()) return { users: [], lists: [], reviews: [] };

  const d = db();
  const q = `%${query.trim()}%`;
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  const users: any[] = [];
  const lists: any[] = [];
  const reviews: any[] = [];

  if (type === 'users' || type === 'all') {
    const rows = d.prepare(`
      SELECT u.id, u.username, u.display_name, u.name, u.avatar_url, u.bio, u.profile_visibility,
             COUNT(DISTINCT f.follower_id) as follower_count
      FROM users u
      LEFT JOIN follows f ON f.followee_id = u.id AND f.status = 'accepted'
      WHERE (u.username LIKE ? OR u.display_name LIKE ? OR u.name LIKE ?)
        AND u.profile_visibility != 'private'
      GROUP BY u.id
      ORDER BY follower_count DESC
      LIMIT ?
    `).all(q, q, q, safeLimit) as any[];

    for (const r of rows) {
      let isFollowing = false;
      if (viewerId) {
        const fw = d.prepare(`SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ? AND status = 'accepted'`).get(viewerId, r.id);
        isFollowing = Boolean(fw);
      }
      users.push({
        id: r.id,
        username: r.username,
        displayName: r.display_name || r.name,
        avatarUrl: r.avatar_url,
        bio: r.bio,
        followerCount: Number(r.follower_count || 0),
        isFollowing,
      });
    }
  }

  if (type === 'lists' || type === 'all') {
    const rows = d.prepare(`
      SELECT ul.id, ul.title as list_name, ul.description, ul.updated_at, ul.title_ids, ul.items_json,
             u.id as owner_id, u.username, u.display_name, u.name, u.avatar_url
      FROM user_lists ul
      JOIN users u ON u.id = ul.user_id
      WHERE ul.visibility = 'public'
        AND (ul.title LIKE ? OR ul.description LIKE ?)
      ORDER BY ul.updated_at DESC
      LIMIT ?
    `).all(q, q, safeLimit) as any[];

    for (const r of rows) {
      let filmCount = 0;
      let coverPosters: Array<string | null> = [];
      try {
        const raw = r.title_ids || r.items_json;
        const parsed = JSON.parse(raw || '[]');
        const titleIds: string[] = Array.isArray(parsed)
          ? parsed.map((it: any) => (typeof it === 'string' ? it : it?.titleId)).filter(Boolean)
          : [];
        filmCount = titleIds.length;
        for (const tid of titleIds.slice(0, 4)) {
          const libRow = d.prepare(`SELECT title_json FROM library WHERE title_id = ? AND title_json IS NOT NULL LIMIT 1`).get(tid) as any;
          let poster: string | null = null;
          if (libRow?.title_json) {
            try { poster = JSON.parse(libRow.title_json).poster || null; } catch {}
          }
          coverPosters.push(poster);
        }
      } catch {}

      const likeCount = (d.prepare(`SELECT COUNT(*) as count FROM likes WHERE target_type = 'list' AND target_id = ?`).get(r.id) as any)?.count || 0;
      const bookmarkCount = (d.prepare(`SELECT COUNT(*) as count FROM list_bookmarks WHERE list_id = ?`).get(r.id) as any)?.count || 0;

      lists.push({
        listId: r.id,
        name: r.list_name,
        description: r.description,
        owner: { id: r.owner_id, username: r.username, displayName: r.display_name || r.name, avatarUrl: r.avatar_url },
        filmCount,
        coverPosters,
        likesCount: Number(likeCount),
        bookmarksCount: Number(bookmarkCount),
        updatedAt: r.updated_at,
      });
    }
  }

  if (type === 'reviews' || type === 'all') {
    const rows = d.prepare(`
      SELECT r.id, r.user_id, r.title_id, r.title_name, r.body, r.rating, r.spoiler, r.created_at,
             u.username, u.display_name, u.name, u.avatar_url
      FROM reviews r
      JOIN users u ON u.id = r.user_id
      WHERE r.title_name LIKE ?
        OR r.body LIKE ?
      ORDER BY r.created_at DESC
      LIMIT ?
    `).all(q, q, safeLimit) as any[];

    for (const r of rows) {
      const likeCount = (d.prepare(`SELECT COUNT(*) as count FROM likes WHERE target_type = 'review' AND target_id = ?`).get(r.id) as any)?.count || 0;
      const isAuthor = viewerId === r.user_id;
      reviews.push({
        reviewId: String(r.id),
        titleId: r.title_id,
        titleName: r.title_name,
        rating: r.rating,
        body: (r.spoiler && !isAuthor) ? '[Spoiler]' : r.body,
        spoiler: Boolean(r.spoiler),
        author: { id: r.user_id, username: r.username, displayName: r.display_name || r.name, avatarUrl: r.avatar_url },
        likesCount: Number(likeCount),
        createdAt: r.created_at,
      });
    }
  }

  return { users, lists, reviews };
}
