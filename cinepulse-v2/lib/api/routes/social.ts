/**
 * /api/user, /api/users, /api/profile, /api/follows, /api/likes, /api/comments, /api/blocks, /api/feed, /api/notifications, /api/privacy, /api/lists, /api/suggestions, /api/explore, /api/search, /api/mutes
 * Moved verbatim from the former catch-all route; returns null when no branch matches.
 */

import { currentUser, requireUser } from '../../auth';
import { bad } from '../../errors';
import { getFollowedFeed, getGlobalFeed } from '../../social/activity';
import { bookmarkList, getBookmarkedLists, getListById, unbookmarkList } from '../../social/bookmarks';
import { getMutualWatchlist, getTasteMatch, getWhoToFollowSuggestions } from '../../social/differentiators';
import {
  getForYouFeed,
  getPopularLists,
  getRisingUsers,
  getTrendingFilms,
  getTrendingLists,
  getTrendingReviews,
  searchSocial,
} from '../../social/explore';
import {
  acceptFollowRequest,
  declineFollowRequest,
  followUser,
  getFollowers,
  getFollowing,
  getPendingFollowRequests,
  unfollowUser,
} from '../../social/follows';
import {
  addComment,
  blockUser,
  deleteComment,
  getComments,
  getMutedUsers,
  muteUser,
  toggleLike,
  unblockUser,
  unmuteUser,
} from '../../social/interactions';
import { createList, deleteList, getUserLists, updateList } from '../../social/lists';
import { getGroupedNotifications, getNotifications, getUnreadCount, markNotificationsAsRead } from '../../social/notifications';
import {
  checkUsernameAvailability,
  computeTasteTags,
  getPinnedLists,
  getPredictionSummarySetting,
  getUsernameStatus,
  getPublicProfile,
  getYearInReview,
  pinList,
  redactPredictionSummary,
  setPredictionSummarySetting,
  setProfileFavourites,
  unpinList,
  updateUserProfile,
} from '../../social/profile';
import { getUserDiary, getUserPredictions, getUserReviews, getUserWatchlist } from '../../social/subresources';
import { getPrivacySettings, updatePrivacySettings } from '../../social/visibility';
import { computeTasteDna } from '../../tasteDna';
import { searchUnified } from '../../unifiedSearch';
import type { ApiContext } from '../http';
import { body, json, param } from '../http';

export async function handleSocial({ request, parts, method, query }: ApiContext): Promise<Response | null> {
  if (parts[0] === 'user' && parts.length === 3 && parts[2] === 'taste-dna' && method === 'GET') {
    const username = param(parts, 1, 'username');
    const dna = await computeTasteDna(username);
    if (!dna) return json({ error: 'User not found' }, 404);
    return json({ tasteDna: dna });
  }

  // ─── Social Layer Routes ───────────────────────────────────────────────────

  // Users public profile and sub-resources
  if (parts[0] === 'users' && parts.length >= 2 && method === 'GET') {
    const username = param(parts, 1, 'username');
    const viewer = await currentUser(request);
    const viewerId = viewer?.id || null;

    if (parts.length === 2) {
      const res = await getPublicProfile(username, viewerId);
      if (res.error && res.status) return json({ error: res.error }, res.status);
      return json(res.profile);
    }
    if (parts[2] === 'watchlist') {
      const res = await getUserWatchlist(username, viewerId, Number(query.get('limit')) || 20, query.get('cursor'));
      if (!res.allowed) return json({ error: res.reason || 'Forbidden' }, 403);
      return json(res);
    }
    if (parts[2] === 'diary') {
      const res = await getUserDiary(username, viewerId, Number(query.get('limit')) || 20, query.get('cursor'));
      if (!res.allowed) return json({ error: res.reason || 'Forbidden' }, 403);
      return json(res);
    }
    if (parts[2] === 'reviews') {
      const res = await getUserReviews(username, viewerId, Number(query.get('limit')) || 20, query.get('cursor'));
      if (!res.allowed) return json({ error: res.reason || 'Forbidden' }, 403);
      return json(res);
    }
    if (parts[2] === 'lists') {
      return json({ lists: await getUserLists(username, viewerId) });
    }
    if (parts[2] === 'predictions') {
      const res = await getUserPredictions(username, viewerId);
      if (!res.allowed) return json({ error: res.reason || 'Forbidden' }, 403);
      // The owner can hide the summary numbers (not the calls) from everyone else.
      return json(await redactPredictionSummary(username, viewerId, res));
    }
    if (parts[2] === 'followers') {
      const res = await getFollowers(username, viewerId, Number(query.get('limit')) || 20, query.get('cursor'));
      if (res.error && res.httpStatus) return json({ error: res.error }, res.httpStatus);
      return json(res);
    }
    if (parts[2] === 'following') {
      const res = await getFollowing(username, viewerId, Number(query.get('limit')) || 20, query.get('cursor'));
      if (res.error && res.httpStatus) return json({ error: res.error }, res.httpStatus);
      return json(res);
    }
    if (parts[2] === 'match') {
      return json(await getTasteMatch(viewerId, username));
    }
    if (parts[2] === 'overlap') {
      return json(await getMutualWatchlist(viewerId, username));
    }
    if (parts[2] === 'taste-dna') {
      const dna = await computeTasteDna(username);
      if (!dna) return json({ error: 'User not found' }, 404);
      return json({ tasteDna: dna });
    }
  }

  // Profile update (display name, username with a 14-day cooldown, bio, visibility, region)
  if (parts[0] === 'profile' && parts.length === 1 && method === 'POST') {
    const user = await requireUser(request);
    const b = (await body(request)) as any;
    const res = await updateUserProfile(user.id, b);
    if (!res.success) {
      return json({ error: res.error, code: res.code, nextChangeAt: res.nextChangeAt, suggestions: res.suggestions }, res.status || 400);
    }
    return json({ ok: true, username: res.username, nextChangeAt: res.nextChangeAt ?? null });
  }

  // Live username check while typing: GET /api/profile/username-available?u=name
  if (parts[0] === 'profile' && parts.length === 2 && parts[1] === 'username-available' && method === 'GET') {
    const viewer = await currentUser(request);
    const raw = (query.get('u') || '').slice(0, 64);
    return json(await checkUsernameAvailability(raw, viewer?.id || null));
  }

  // The member's username and when they may next change it: GET /api/profile/username
  if (parts[0] === 'profile' && parts.length === 2 && parts[1] === 'username' && method === 'GET') {
    const user = await requireUser(request);
    return json(await getUsernameStatus(user.id));
  }

  // Favourite four + banner: PUT /api/profile/favourites { titleIds?: string[], banner?: url | titleId | null }
  if (parts[0] === 'profile' && parts.length === 2 && parts[1] === 'favourites' && method === 'PUT') {
    const user = await requireUser(request);
    return json(await setProfileFavourites(user.id, await body(request, 4 * 1024)));
  }

  // "Show prediction summary on my profile": GET|PUT /api/profile/prediction-summary { show: boolean }
  if (parts[0] === 'profile' && parts.length === 2 && parts[1] === 'prediction-summary' && (method === 'GET' || method === 'PUT')) {
    const user = await requireUser(request);
    if (method === 'GET') return json({ show: await getPredictionSummarySetting(user.id) });
    const b = (await body(request, 1024)) as { show?: unknown };
    return json({ show: await setPredictionSummarySetting(user.id, b?.show) });
  }

  // Follows
  if (parts[0] === 'follows' && parts[1] === 'requests' && method === 'GET') {
    const user = await requireUser(request);
    return json({ requests: await getPendingFollowRequests(user.id) });
  }

  if (parts[0] === 'follows' && parts[1] === 'requests' && parts.length === 4 && method === 'POST') {
    const user = await requireUser(request);
    const followerId = param(parts, 2, 'id');
    const action = parts[3];
    if (action === 'accept') {
      const res = await acceptFollowRequest(user.id, followerId);
      if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
      return json({ ok: true });
    }
    if (action === 'decline') {
      const res = await declineFollowRequest(user.id, followerId);
      if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
      return json({ ok: true });
    }
  }

  if (parts[0] === 'follows' && parts.length === 2 && method === 'POST') {
    const user = await requireUser(request);
    const username = param(parts, 1, 'username');
    const res = await followUser(user.id, username);
    if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
    return json(res);
  }

  if (parts[0] === 'follows' && parts.length === 2 && method === 'DELETE') {
    const user = await requireUser(request);
    const username = param(parts, 1, 'username');
    const res = await unfollowUser(user.id, username);
    if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
    return json({ ok: true });
  }

  // Likes
  if (parts[0] === 'likes' && method === 'POST') {
    const user = await requireUser(request);
    const b = (await body(request)) as any;
    if (!b.targetType || !b.targetId) throw bad('targetType and targetId are required');
    return json(await toggleLike(user.id, b.targetType, String(b.targetId), true));
  }

  if (parts[0] === 'likes' && method === 'DELETE') {
    const user = await requireUser(request);
    const targetType = query.get('targetType');
    const targetId = query.get('targetId');
    let b: any = {};
    if (!targetType || !targetId) {
      try {
        b = await body(request);
      } catch {}
    }
    const tType = (targetType || b.targetType) as any;
    const tId = String(targetId || b.targetId);
    if (!tType || !tId) throw bad('targetType and targetId are required');
    return json(await toggleLike(user.id, tType, tId, false));
  }

  // Comments
  if (parts[0] === 'comments' && method === 'GET') {
    const targetType = query.get('targetType') as any;
    const targetId = query.get('targetId');
    if (!targetType || !targetId) throw bad('targetType and targetId are required');
    const viewer = await currentUser(request);
    return json({ comments: await getComments(targetType, targetId, viewer?.id || null) });
  }

  if (parts[0] === 'comments' && method === 'POST') {
    const user = await requireUser(request);
    const b = (await body(request)) as any;
    const res = await addComment(user.id, b.targetType, String(b.targetId), b.body, undefined, { parentId: b.parentId ?? null });
    if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
    return json({ comment: res.comment });
  }

  if (parts[0] === 'comments' && parts.length === 2 && method === 'DELETE') {
    const user = await requireUser(request);
    const commentId = Number(param(parts, 1, 'id'));
    const res = await deleteComment(commentId, user.id);
    if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
    return json({ ok: true });
  }

  // Blocks
  if (parts[0] === 'blocks' && parts.length === 2 && method === 'POST') {
    const user = await requireUser(request);
    const username = param(parts, 1, 'username');
    const res = await blockUser(user.id, username);
    if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
    return json({ ok: true });
  }

  if (parts[0] === 'blocks' && parts.length === 2 && method === 'DELETE') {
    const user = await requireUser(request);
    const username = param(parts, 1, 'username');
    const res = await unblockUser(user.id, username);
    if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
    return json({ ok: true });
  }

  // Activity feeds
  if (parts[0] === 'feed' && parts.length === 1 && method === 'GET') {
    const user = await requireUser(request);
    return json(await getFollowedFeed(user.id, Number(query.get('limit')) || 20, query.get('cursor')));
  }

  if (parts[0] === 'feed' && parts[1] === 'global' && method === 'GET') {
    const viewer = await currentUser(request);
    return json(await getGlobalFeed(viewer?.id || null, Number(query.get('limit')) || 20, query.get('cursor')));
  }

  // Notifications
  if (parts[0] === 'notifications' && parts.length === 1 && method === 'GET') {
    const user = await requireUser(request);
    return json(await getNotifications(user.id, Number(query.get('limit')) || 20, query.get('cursor')));
  }

  if (parts[0] === 'notifications' && parts[1] === 'unread-count' && method === 'GET') {
    const user = await requireUser(request);
    return json({ count: await getUnreadCount(user.id) });
  }

  if (parts[0] === 'notifications' && parts[1] === 'read' && method === 'POST') {
    const user = await requireUser(request);
    let ids: number[] | undefined;
    try {
      const b = await body(request);
      if (Array.isArray(b.ids)) ids = b.ids.map(Number);
    } catch {}
    await markNotificationsAsRead(user.id, ids);
    return json({ ok: true });
  }

  // Privacy Settings
  if (parts[0] === 'privacy' && parts[1] === 'settings' && method === 'GET') {
    const user = await requireUser(request);
    return json({ settings: await getPrivacySettings(user.id) });
  }

  if (parts[0] === 'privacy' && parts[1] === 'settings' && method === 'PUT') {
    const user = await requireUser(request);
    const b = (await body(request)) as any;
    const next = await updatePrivacySettings(user.id, b);
    return json({ settings: next });
  }

  // User lists
  if (parts[0] === 'lists' && parts.length === 1 && method === 'POST') {
    const user = await requireUser(request);
    const b = (await body(request)) as any;
    const res = await createList(user.id, b);
    if (!res.success) return json({ error: res.error }, 400);
    return json({ list: res.list });
  }

  if (parts[0] === 'lists' && parts.length === 2 && method === 'PUT') {
    const user = await requireUser(request);
    const listId = param(parts, 1, 'id');
    const b = (await body(request)) as any;
    const res = await updateList(user.id, listId, b);
    if (!res.success) return json({ error: res.error }, 400);
    return json({ ok: true });
  }

  if (parts[0] === 'lists' && parts.length === 2 && method === 'DELETE') {
    const user = await requireUser(request);
    const listId = param(parts, 1, 'id');
    const res = await deleteList(user.id, listId);
    if (!res.success) return json({ error: res.error }, 400);
    return json({ ok: true });
  }

  // Users bookmarks, taste-tags, year-in-review, pinned-lists
  if (parts[0] === 'users' && parts.length === 3) {
    const username = param(parts, 1, 'username');
    const viewer = await currentUser(request);
    if (parts[2] === 'bookmarks' && method === 'GET') {
      const user = await requireUser(request);
      // Only allow user to see their own bookmarks unless it's public
      return json({ lists: await getBookmarkedLists(user.id) });
    }
    if (parts[2] === 'taste-tags' && method === 'GET') {
      const { getUserByUsername: getUser } = await import('../../social/profile');
      const target = await getUser(username);
      if (!target) return json({ error: 'User not found' }, 404);
      return json({ tags: await computeTasteTags(target.id) });
    }
    if (parts[2] === 'year-in-review' && method === 'GET') {
      const { getUserByUsername: getUser } = await import('../../social/profile');
      const target = await getUser(username);
      if (!target) return json({ error: 'User not found' }, 404);
      const year = Number(query.get('year')) || new Date().getFullYear();
      return json({ review: await getYearInReview(target.id, year) });
    }
    if (parts[2] === 'pinned-lists' && method === 'GET') {
      const { getUserByUsername: getUser } = await import('../../social/profile');
      const target = await getUser(username);
      if (!target) return json({ error: 'User not found' }, 404);
      return json({ lists: await getPinnedLists(target.id, viewer?.id || null) });
    }
  }

  // Follow suggestions
  if (parts[0] === 'suggestions' && parts[1] === 'who-to-follow' && method === 'GET') {
    const viewer = await currentUser(request);
    return json({ suggestions: await getWhoToFollowSuggestions(viewer?.id || null, Number(query.get('limit')) || 5) });
  }

  // ─── Explore / Trending ─────────────────────────────────────────────────────
  if (parts[0] === 'explore') {
    const viewer = await currentUser(request);
    if (parts[1] === 'trending-films' && method === 'GET') {
      return json({ films: await getTrendingFilms(Number(query.get('limit')) || 20, viewer?.id || null) });
    }
    if (parts[1] === 'trending-reviews' && method === 'GET') {
      return json({ reviews: await getTrendingReviews(Number(query.get('limit')) || 20, viewer?.id || null) });
    }
    if (parts[1] === 'trending-lists' && method === 'GET') {
      return json({ lists: await getTrendingLists(Number(query.get('limit')) || 20, viewer?.id || null) });
    }
    if (parts[1] === 'rising-users' && method === 'GET') {
      return json({ users: await getRisingUsers(Number(query.get('limit')) || 50, viewer?.id || null) });
    }
    if (parts[1] === 'popular-lists' && method === 'GET') {
      return json({ lists: await getPopularLists(Number(query.get('limit')) || 20, viewer?.id || null) });
    }
    if (parts[1] === 'for-you' && method === 'GET') {
      const user = await requireUser(request);
      return json(await getForYouFeed(user.id));
    }
  }

  // ─── Unified & Social Search ──────────────────────────────────────────────────
  if (parts[0] === 'search' && parts[1] === 'unified' && method === 'GET') {
    const q = query.get('q') || '';
    const limit = Math.min(Math.max(Number(query.get('limit')) || 8, 1), 20);
    const result = await searchUnified(q.slice(0, 80), limit);
    // Not personal (titles, public receipts, menu actions), so a full answer can sit at the edge for a few
    // minutes. An unfinished one (slow cold start) or one with no titles must never be kept: a cached empty
    // answer would show "no matches" to everyone for that query.
    const keep = !result.partial && result.titles.length > 0;
    return json(result, 200, { 'Cache-Control': keep ? 'public, max-age=30, s-maxage=300, stale-while-revalidate=3600' : 'no-store' });
  }

  if (parts[0] === 'search' && parts.length === 1 && method === 'GET') {
    const q = query.get('q') || '';
    const type = (query.get('type') || 'all') as any;
    if (type === 'unified') {
      const limit = Number(query.get('limit')) || 8;
      return json(await searchUnified(q, limit));
    }
    const viewer = await currentUser(request);
    return json(await searchSocial(q, type, Number(query.get('limit')) || 20, viewer?.id || null));
  }

  // ─── List Detail & Bookmarks ────────────────────────────────────────────────
  if (parts[0] === 'lists' && parts.length === 2 && method === 'GET') {
    const viewer = await currentUser(request);
    const listId = param(parts, 1, 'id');
    const res = await getListById(listId, viewer?.id || null);
    if (!res.allowed) return json({ error: res.error }, res.httpStatus || 403);
    return json({ list: res.list });
  }

  if (parts[0] === 'lists' && parts.length === 3 && parts[2] === 'bookmark' && method === 'POST') {
    const user = await requireUser(request);
    const listId = param(parts, 1, 'id');
    const res = await bookmarkList(user.id, listId);
    if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
    return json(res);
  }

  if (parts[0] === 'lists' && parts.length === 3 && parts[2] === 'bookmark' && method === 'DELETE') {
    const user = await requireUser(request);
    const listId = param(parts, 1, 'id');
    const res = await unbookmarkList(user.id, listId);
    return json(res);
  }

  // ─── Mutes ──────────────────────────────────────────────────────────────────
  if (parts[0] === 'mutes' && parts.length === 1 && method === 'GET') {
    const user = await requireUser(request);
    return json({ mutes: await getMutedUsers(user.id) });
  }

  if (parts[0] === 'mutes' && parts.length === 2 && method === 'POST') {
    const user = await requireUser(request);
    const res = await muteUser(user.id, param(parts, 1, 'username'));
    if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
    return json({ ok: true });
  }

  if (parts[0] === 'mutes' && parts.length === 2 && method === 'DELETE') {
    const user = await requireUser(request);
    const res = await unmuteUser(user.id, param(parts, 1, 'username'));
    if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
    return json({ ok: true });
  }

  // ─── Grouped Notifications ──────────────────────────────────────────────────
  if (parts[0] === 'notifications' && parts[1] === 'grouped' && method === 'GET') {
    const user = await requireUser(request);
    return json({ notifications: await getGroupedNotifications(user.id, Number(query.get('limit')) || 20) });
  }

  // ─── Pinned Lists ────────────────────────────────────────────────────────────
  if (parts[0] === 'lists' && parts.length === 3 && parts[2] === 'pin' && method === 'POST') {
    const user = await requireUser(request);
    const res = await pinList(user.id, param(parts, 1, 'id'));
    if (!res.success) return json({ error: res.error }, 400);
    return json({ ok: true });
  }

  if (parts[0] === 'lists' && parts.length === 3 && parts[2] === 'pin' && method === 'DELETE') {
    const user = await requireUser(request);
    const res = await unpinList(user.id, param(parts, 1, 'id'));
    if (!res.success) return json({ error: res.error }, 400);
    return json({ ok: true });
  }
  return null;
}
