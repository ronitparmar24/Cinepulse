import { getExcludedTitleIds } from '../feedback/rerank';
import { getUserAffinities } from '../feedback/affinity';
import { jsonNumber } from '../db/client';
import { db } from '../db';
import { titleById, titleIdAvailable } from '../catalog';
import { isDummyOrTestEmail } from '../mailer';
import type { TrendingFilm, TrendingReview, TrendingList, RisingUser, FollowSuggestion } from '../types';

const SEVEN_DAYS_AGO = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
};

/**
 * Trending films: most-watched + rated in last 7 days with velocity boost.
 */
export async function getTrendingFilms(limit = 20, viewerId: string | null = null): Promise<TrendingFilm[]> {
  const d = db();
  const cutoff = SEVEN_DAYS_AGO();
  const want = Math.max(1, Math.min(Number(limit) || 20, 50));

  // Aggregate events per title first, then attach one title snapshot per title. (Joining every
  // user's library row before grouping multiplied the counts when several people saved a title.)
  // Over-fetch: titles the current catalog can't open (old demo ids) are dropped below.
  const rows = (await d.all(`
    SELECT a.title_id, a.event_count, a.avg_rating, a.latest_at, l.title_json
    FROM (
      SELECT
        ae.target_id AS title_id,
        COUNT(*) AS event_count,
        AVG(${jsonNumber(d.dialect, 'ae.metadata', 'rating')}) AS avg_rating,
        MAX(ae.created_at) AS latest_at
      FROM activity_events ae
      WHERE ae.type IN ('watched', 'rated', 'reviewed')
        AND ae.target_type = 'title'
        AND ae.created_at >= ?
        AND ae.visibility = 'public'
      GROUP BY ae.target_id
    ) a
    LEFT JOIN (
      SELECT title_id, MAX(title_json) AS title_json
      FROM library
      WHERE title_json IS NOT NULL
      GROUP BY title_id
    ) l ON l.title_id = a.title_id
    ORDER BY a.event_count DESC, COALESCE(a.avg_rating, 0) DESC
    LIMIT ?
  `, cutoff, want * 3)) as any[];

  const resolved = await Promise.all(rows.filter((r) => titleIdAvailable(String(r.title_id))).map(async (r): Promise<TrendingFilm | null> => {
    const titleData = await titleSnapshot(String(r.title_id), r.title_json);
    if (!titleData) return null; // never show a raw id as a film name
    return {
      titleId: String(r.title_id),
      title: titleData.title,
      poster: titleData.poster,
      watchesLast7d: Number(r.event_count || 0),
      avgRatingLast7d: r.avg_rating ? Number(Number(r.avg_rating).toFixed(1)) : null,
      velocity: Number(r.event_count || 0),
      trendingRank: 0,
      genres: titleData.genres,
    };
  }));
  return resolved.filter((f): f is TrendingFilm => Boolean(f)).slice(0, want).map((f, i) => ({ ...f, trendingRank: i + 1 }));
}

/** Title name/poster/genres from a library snapshot, else the (cached) catalogue; null if unknown. */
async function titleSnapshot(titleId: string, json?: string | null): Promise<{ title: string; poster: string | null; genres: string[] } | null> {
  let data: any = {};
  try { data = JSON.parse(json || '{}'); } catch {}
  if (!data.title || !data.poster) {
    try {
      const t = await titleById(titleId);
      data = { title: data.title || t.title, poster: data.poster || t.poster, genres: data.genres?.length ? data.genres : t.genres };
    } catch { /* unknown or unreachable: use what the snapshot has */ }
  }
  if (!data.title || data.title === titleId) return null;
  return { title: String(data.title), poster: cleanPoster(data.poster), genres: Array.isArray(data.genres) ? data.genres : [] };
}

/** Only absolute https posters or files we actually ship; anything else renders the placeholder. */
function cleanPoster(poster: unknown): string | null {
  if (typeof poster !== 'string' || !poster) return null;
  if (/^https:\/\//.test(poster) || /^\/assets\/[a-z0-9_-]+\.(webp|jpe?g|png)$/i.test(poster)) return poster;
  return null;
}

/**
 * Trending reviews: most-liked public reviews in last 7 days.
 */
export async function getTrendingReviews(limit = 20, viewerId: string | null = null): Promise<TrendingReview[]> {
  const d = db();
  const cutoff = SEVEN_DAYS_AGO();
  const want = Math.max(1, Math.min(Number(limit) || 20, 50));

  // Counts come from correlated subqueries so likes x comments never multiply each other.
  const rows = (await d.all(`
    SELECT
      r.id AS review_id, r.user_id, r.title_id, r.title_name, r.body, r.rating, r.spoiler, r.created_at,
      u.username, u.display_name, u.name, u.avatar_url,
      (SELECT COUNT(*) FROM likes lk WHERE lk.target_type = 'review' AND lk.target_id = r.id) AS likes_count,
      (SELECT COUNT(*) FROM comments c WHERE c.target_type = 'review' AND c.target_id = r.id AND c.deleted_at IS NULL AND c.hidden_at IS NULL) AS comments_count,
      (SELECT title_json FROM library lb WHERE lb.title_id = r.title_id AND lb.title_json IS NOT NULL LIMIT 1) AS title_json
    FROM reviews r
    JOIN users u ON u.id = r.user_id
    WHERE r.created_at >= ? AND r.hidden_at IS NULL
    ORDER BY likes_count DESC, comments_count DESC, r.created_at DESC
    LIMIT ?
  `, cutoff, want * 3)) as any[];

  const liked = new Set<string>();
  if (viewerId && rows.length) {
    const ids = rows.map((r) => String(r.review_id));
    const mine = (await d.all(`SELECT target_id FROM likes WHERE user_id = ? AND target_type = 'review' AND target_id IN (${ids.map(() => '?').join(',')})`, viewerId, ...ids)) as Array<{ target_id: string }>;
    for (const m of mine) liked.add(String(m.target_id));
  }

  const results: TrendingReview[] = [];
  for (const r of rows) {
    if (!titleIdAvailable(String(r.title_id))) continue;
    if (results.length >= want) break;
    const snap = await titleSnapshot(String(r.title_id), r.title_json);
    const isSpoiler = Boolean(r.spoiler);
    const isAuthor = viewerId === r.user_id;
    const likes = Number(r.likes_count || 0);
    const comments = Number(r.comments_count || 0);
    results.push({
      reviewId: String(r.review_id),
      titleId: r.title_id,
      titleName: snap?.title || r.title_name,
      poster: snap?.poster ?? null,
      rating: r.rating === null || r.rating === undefined ? null : Number(r.rating),
      body: isSpoiler && !isAuthor ? '' : r.body,
      spoiler: isSpoiler,
      author: {
        id: r.user_id,
        username: r.username,
        displayName: r.display_name || r.name,
        avatarUrl: r.avatar_url,
      },
      likesCount: likes,
      commentsCount: comments,
      createdAt: r.created_at,
      velocityScore: likes + comments * 2,
      viewerLiked: liked.has(String(r.review_id)),
    });
  }
  return results.sort((a, b) => b.velocityScore - a.velocityScore);
}

/**
 * Trending lists: most-bookmarked + liked public lists.
 */
export async function getTrendingLists(limit = 20, viewerId: string | null = null): Promise<TrendingList[]> {
  const d = db();

  const rows = (await d.all(`
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
    GROUP BY ul.id, u.id
    ORDER BY (COUNT(DISTINCT lb.user_id) * 2 + COUNT(DISTINCT lk.user_id)) DESC, ul.updated_at DESC
    LIMIT ?
  `, limit)) as any[];

  return (await Promise.all(rows.map(async (r) => {
    let titleIds: string[] = [];
    try {
      // Support both title_ids (new) and items_json (legacy)
      const raw = r.title_ids || r.items_json;
      const parsed = JSON.parse(raw || '[]');
      if (Array.isArray(parsed)) {
        titleIds = parsed.map((it: any) => (typeof it === 'string' ? it : it?.titleId)).filter(Boolean);
      }
    } catch {}

    titleIds = titleIds.filter(titleIdAvailable);
    // Cover posters for the first 4 films
    const coverPosters: Array<string | null> = [];
    for (const tid of titleIds.slice(0, 4)) {
      const libRow = (await d.get(`SELECT title_json FROM library WHERE title_id = ? AND title_json IS NOT NULL LIMIT 1`, tid)) as any;
      coverPosters.push((await titleSnapshot(tid, libRow?.title_json))?.poster ?? null);
    }
    const viewerBookmarked = viewerId
      ? Boolean(await d.get('SELECT 1 FROM list_bookmarks WHERE user_id = ? AND list_id = ?', viewerId, r.id))
      : false;

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
      viewerBookmarked,
    };
  })));
}

/**
 * Rising users / Community people: all public cinephiles & critics from the database.
 */
export async function getRisingUsers(limit = 50, viewerId: string | null = null): Promise<RisingUser[]> {
  const d = db();
  const cutoff = SEVEN_DAYS_AGO();

  const rows = (await d.all(`
    SELECT
      u.id,
      u.username, u.email, u.is_ai,
      COALESCE(NULLIF(u.display_name, ''), u.name, 'Cinephile') AS display_name,
      u.name, u.avatar_url, u.bio,
      COUNT(f.follower_id) AS follower_growth,
      (SELECT COUNT(*) FROM follows WHERE followee_id = u.id AND status = 'accepted') AS total_followers
    FROM users u
    LEFT JOIN follows f ON f.followee_id = u.id AND f.status = 'accepted' AND f.created_at >= ?
    WHERE (u.profile_visibility IS NULL OR u.profile_visibility != 'private')
      AND u.username IS NOT NULL AND u.username != ''
      AND u.id != ?
    GROUP BY u.id
    ORDER BY follower_growth DESC, total_followers DESC, u.created_at DESC
    LIMIT ?
  `, cutoff, viewerId ?? '', Math.max(1, Math.min(Number(limit) || 50, 100)) * 2)) as any[];

  const people = rows.filter((r) => r.is_ai || !isDummyOrTestEmail(String(r.email || ''))).slice(0, Math.max(1, Math.min(Number(limit) || 50, 100)));
  return (await Promise.all(people.map(async (r) => {
    let isFollowing = false;
    if (viewerId) {
      const fw = (await d.get(`SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ? AND status = 'accepted'`, viewerId, r.id));
      isFollowing = Boolean(fw);
    }

    const cleanUsername = String(r.username);
    const cleanDisplayName = r.display_name || r.name || cleanUsername;

    return {
      id: r.id,
      username: cleanUsername,
      displayName: cleanDisplayName,
      avatarUrl: r.avatar_url || null,
      bio: r.bio || '',
      followerCount: Number(r.total_followers || 0),
      followerGrowth: Number(r.follower_growth || 0),
      tasteMatch: null,
      isFollowing,
    };
  })));
}

/**
 * Popular public lists sorted by bookmark + like count.
 */
export async function getPopularLists(limit = 20, viewerId: string | null = null): Promise<TrendingList[]> {
  return getTrendingLists(limit, viewerId);
}

/**
 * Personalized "For You" explore feed.
 * Mix: trending films + taste-match reviews + popular lists.
 */
export async function getForYouFeed(userId: string, limit = 30): Promise<{
  trendingFilms: TrendingFilm[];
  suggestedReviews: TrendingReview[];
  popularLists: TrendingList[];
  risingUsers: RisingUser[];
}> {
  const d = db();
  const excludedIds = (await getExcludedTitleIds(userId));
  const affinities = (await getUserAffinities(userId));
  const genreWeights = new Map<string, number>();
  for (const a of affinities) {
    if (a.featureType === 'genre') genreWeights.set(a.featureValue.toLowerCase(), a.weight);
  }

  // Get interested title IDs for boosting
  const interestedRows = (await d.all(`
    SELECT title_id FROM interest_feedback WHERE user_id = ? AND signal = 'interested'
  `, userId)) as Array<{ title_id: string }>;
  const interestedTitleIds = new Set(interestedRows.map(r => r.title_id));

  // Get followed user IDs
  const followedRows = (await d.all(`
    SELECT followee_id FROM follows WHERE follower_id = ? AND status = 'accepted'
  `, userId)) as Array<{ followee_id: string }>;
  const followedUserIds = new Set(followedRows.map(r => r.followee_id));

  // 1. Trending films: exclude not_interested, boost matched genres and interested titles
  const rawFilms = (await getTrendingFilms(30, userId));
  const trendingFilms = rawFilms
    .filter(f => !excludedIds.has(f.titleId))
    .map(f => {
      let score = f.watchesLast7d + (f.avgRatingLast7d ?? 5.0);
      if (interestedTitleIds.has(f.titleId)) score += 5;
      for (const g of f.genres || []) {
        score += (genreWeights.get(g.toLowerCase()) ?? 0) * 2;
      }
      return { film: f, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(x => x.film);

  // 2. Suggested reviews: exclude reviews of suppressed films, boost interested films and followed users
  const rawReviews = (await getTrendingReviews(30, userId));
  const suggestedReviews = rawReviews
    .filter(r => !excludedIds.has(r.titleId))
    .map(r => {
      let score = r.likesCount * 2 + (r.rating ? r.rating * 2 : 10);
      if (interestedTitleIds.has(r.titleId)) score += 10;
      if (followedUserIds.has(r.author.id)) score += 15;
      return { review: r, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(x => x.review);

  const popularLists = (await getTrendingLists(8, userId));
  const risingUsers = (await getRisingUsers(6, userId));

  return { trendingFilms, suggestedReviews, popularLists, risingUsers };
}

/**
 * Unified social search: users, lists, reviews.
 * Films are searched via the catalog API (client-side).
 */
export async function searchSocial(
  query: string,
  type: 'users' | 'lists' | 'reviews' | 'all',
  limit = 20,
  viewerId: string | null = null
): Promise<{ users: any[]; lists: any[]; reviews: any[] }> {
  if (!query?.trim()) return { users: [], lists: [], reviews: [] };

  const d = db();
  const q = `%${query.trim()}%`;
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  const users: any[] = [];
  const lists: any[] = [];
  const reviews: any[] = [];

  if (type === 'users' || type === 'all') {
    const rows = (await d.all(`
      SELECT u.id, u.username, u.display_name, u.name, u.avatar_url, u.bio, u.profile_visibility,
             COUNT(DISTINCT f.follower_id) as follower_count
      FROM users u
      LEFT JOIN follows f ON f.followee_id = u.id AND f.status = 'accepted'
      WHERE (LOWER(u.username) LIKE LOWER(?) OR LOWER(u.display_name) LIKE LOWER(?) OR LOWER(u.name) LIKE LOWER(?))
        AND u.profile_visibility != 'private'
      GROUP BY u.id
      ORDER BY follower_count DESC
      LIMIT ?
    `, q, q, q, safeLimit)) as any[];

    for (const r of rows) {
      let isFollowing = false;
      if (viewerId) {
        const fw = (await d.get(`SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ? AND status = 'accepted'`, viewerId, r.id));
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
    const rows = (await d.all(`
      SELECT ul.id, ul.title as list_name, ul.description, ul.updated_at, ul.title_ids, ul.items_json,
             u.id as owner_id, u.username, u.display_name, u.name, u.avatar_url
      FROM user_lists ul
      JOIN users u ON u.id = ul.user_id
      WHERE ul.visibility = 'public'
        AND (LOWER(ul.title) LIKE LOWER(?) OR LOWER(ul.description) LIKE LOWER(?))
      ORDER BY ul.updated_at DESC
      LIMIT ?
    `, q, q, safeLimit)) as any[];

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
          const libRow = (await d.get(`SELECT title_json FROM library WHERE title_id = ? AND title_json IS NOT NULL LIMIT 1`, tid)) as any;
          let poster: string | null = null;
          if (libRow?.title_json) {
            try { poster = JSON.parse(libRow.title_json).poster || null; } catch {}
          }
          coverPosters.push(poster);
        }
      } catch {}

      const likeCount = ((await d.get(`SELECT COUNT(*) as count FROM likes WHERE target_type = 'list' AND target_id = ?`, r.id)) as any)?.count || 0;
      const bookmarkCount = ((await d.get(`SELECT COUNT(*) as count FROM list_bookmarks WHERE list_id = ?`, r.id)) as any)?.count || 0;

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
    const rows = (await d.all(`
      SELECT r.id, r.user_id, r.title_id, r.title_name, r.body, r.rating, r.spoiler, r.created_at,
             u.username, u.display_name, u.name, u.avatar_url
      FROM reviews r
      JOIN users u ON u.id = r.user_id
      WHERE (LOWER(r.title_name) LIKE LOWER(?)
        OR LOWER(r.body) LIKE LOWER(?)) AND r.hidden_at IS NULL
      ORDER BY r.created_at DESC
      LIMIT ?
    `, q, q, safeLimit)) as any[];

    for (const r of rows) {
      const likeCount = ((await d.get(`SELECT COUNT(*) as count FROM likes WHERE target_type = 'review' AND target_id = ?`, r.id)) as any)?.count || 0;
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
