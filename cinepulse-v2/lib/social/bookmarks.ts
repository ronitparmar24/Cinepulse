import { db, now } from '../db';
import type { TrendingList } from '../types';

export async function bookmarkList(
  userId: string,
  listId: string
): Promise<{ success: boolean; bookmarked: boolean; bookmarksCount: number; error?: string; httpStatus?: number }> {
  const d = db();

  const list = (await d.get(`SELECT id, user_id, visibility FROM user_lists WHERE id = ?`, listId)) as any;
  if (!list) return { success: false, bookmarked: false, bookmarksCount: 0, error: 'List not found', httpStatus: 404 };
  if (list.visibility !== 'public') {
    return { success: false, bookmarked: false, bookmarksCount: 0, error: 'Cannot bookmark a private list', httpStatus: 403 };
  }

  const stamp = now();
  (await d.run(`INSERT INTO list_bookmarks (user_id, list_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`, userId, listId, stamp));

  const count = ((await d.get(`SELECT COUNT(*) as count FROM list_bookmarks WHERE list_id = ?`, listId)) as any)?.count || 0;
  return { success: true, bookmarked: true, bookmarksCount: Number(count) };
}

export async function unbookmarkList(
  userId: string,
  listId: string
): Promise<{ success: boolean; bookmarked: boolean; bookmarksCount: number; error?: string; httpStatus?: number }> {
  const d = db();
  (await d.run(`DELETE FROM list_bookmarks WHERE user_id = ? AND list_id = ?`, userId, listId));
  const count = ((await d.get(`SELECT COUNT(*) as count FROM list_bookmarks WHERE list_id = ?`, listId)) as any)?.count || 0;
  return { success: true, bookmarked: false, bookmarksCount: Number(count) };
}

export async function getBookmarkedLists(userId: string): Promise<TrendingList[]> {
  const d = db();

  const rows = (await d.all(`
    SELECT
      ul.id, ul.title as list_name, ul.description, ul.updated_at, ul.title_ids, ul.items_json, ul.visibility,
      u.id as owner_id, u.username, u.display_name, u.name, u.avatar_url
    FROM list_bookmarks lb
    JOIN user_lists ul ON ul.id = lb.list_id
    JOIN users u ON u.id = ul.user_id
    WHERE lb.user_id = ?
      AND ul.visibility = 'public'
    ORDER BY lb.created_at DESC
  `, userId)) as any[];

  return (await Promise.all(rows.map(async (r) => {
    let filmCount = 0;
    const coverPosters: Array<string | null> = [];

    try {
      const raw = r.title_ids || r.items_json;
      const parsed = JSON.parse(raw || '[]');
      const titleIds: string[] = Array.isArray(parsed)
        ? parsed.map((it: any) => (typeof it === 'string' ? it : it?.titleId)).filter(Boolean)
        : [];
      filmCount = titleIds.length;

      for (const tid of titleIds.slice(0, 4)) {
        try {
          const libRow = (await d.get(`SELECT title_json FROM library WHERE title_id = ? AND title_json IS NOT NULL LIMIT 1`, tid)) as any;
          let poster: string | null = null;
          if (libRow?.title_json) poster = JSON.parse(libRow.title_json).poster || null;
          coverPosters.push(poster);
        } catch { coverPosters.push(null); }
      }
    } catch {}

    const likeCount = ((await d.get(`SELECT COUNT(*) as count FROM likes WHERE target_type = 'list' AND target_id = ?`, r.id)) as any)?.count || 0;
    const bookmarkCount = ((await d.get(`SELECT COUNT(*) as count FROM list_bookmarks WHERE list_id = ?`, r.id)) as any)?.count || 0;

    return {
      listId: r.id,
      name: r.list_name,
      description: r.description,
      owner: { id: r.owner_id, username: r.username, displayName: r.display_name || r.name, avatarUrl: r.avatar_url },
      filmCount,
      coverPosters,
      likesCount: Number(likeCount),
      bookmarksCount: Number(bookmarkCount),
      updatedAt: r.updated_at,
    };
  })));
}

export async function getListById(
  listId: string,
  viewerId: string | null
): Promise<{
  allowed: boolean;
  error?: string;
  httpStatus?: number;
  list?: any;
}> {
  const d = db();

  const row = (await d.get(`
    SELECT ul.*, u.username, u.display_name, u.name, u.avatar_url, u.bio
    FROM user_lists ul
    JOIN users u ON u.id = ul.user_id
    WHERE ul.id = ?
  `, listId)) as any;

  if (!row) return { allowed: false, error: 'List not found', httpStatus: 404 };

  // Visibility check
  const isOwner = viewerId === row.user_id;
  if (row.visibility === 'private' && !isOwner) {
    return { allowed: false, error: 'This list is private', httpStatus: 403 };
  }

  let titleIds: string[] = [];
  try {
    const raw = row.title_ids || row.items_json;
    const parsed = JSON.parse(raw || '[]');
    titleIds = Array.isArray(parsed)
      ? parsed.map((it: any) => (typeof it === 'string' ? it : it?.titleId)).filter(Boolean)
      : [];
  } catch {}

  // Resolve film details for all titles in list (skipping ids the current catalogue can't open)
  const { titleIdAvailable } = await import('../catalog');
  titleIds = titleIds.filter(titleIdAvailable);
  const films = (await Promise.all(titleIds.map(async (tid, index) => {
    let titleData: any = {};
    try {
      const libRow = (await d.get(`SELECT title_json FROM library WHERE title_id = ? AND title_json IS NOT NULL LIMIT 1`, tid)) as any;
      if (libRow?.title_json) titleData = JSON.parse(libRow.title_json);
    } catch {}
    return {
      titleId: tid,
      title: titleData.title || tid,
      poster: titleData.poster || null,
      releaseDate: titleData.releaseDate || null,
      mediaType: titleData.mediaType || 'movie',
      rank: index + 1,
    };
  })));

  const likeCount = ((await d.get(`SELECT COUNT(*) as count FROM likes WHERE target_type = 'list' AND target_id = ?`, listId)) as any)?.count || 0;
  const isLiked = viewerId
    ? Boolean((await d.get(`SELECT 1 FROM likes WHERE user_id = ? AND target_type = 'list' AND target_id = ?`, viewerId, listId)))
    : false;
  const bookmarkCount = ((await d.get(`SELECT COUNT(*) as count FROM list_bookmarks WHERE list_id = ?`, listId)) as any)?.count || 0;
  const isBookmarked = viewerId
    ? Boolean((await d.get(`SELECT 1 FROM list_bookmarks WHERE user_id = ? AND list_id = ?`, viewerId, listId)))
    : false;

  return {
    allowed: true,
    list: {
      id: row.id,
      name: row.title || row.name,
      description: row.description,
      isRanked: Boolean(row.is_ranked),
      visibility: row.visibility,
      owner: {
        id: row.user_id,
        username: row.username,
        displayName: row.display_name || row.name,
        avatarUrl: row.avatar_url,
        bio: row.bio,
      },
      films,
      filmCount: films.length,
      likesCount: Number(likeCount),
      isLiked,
      bookmarksCount: Number(bookmarkCount),
      isBookmarked,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isOwner,
    },
  };
}

export async function isListBookmarked(userId: string, listId: string): Promise<boolean> {
  const d = db();
  return Boolean((await d.get(`SELECT 1 FROM list_bookmarks WHERE user_id = ? AND list_id = ?`, userId, listId)));
}
