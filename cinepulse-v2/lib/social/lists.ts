import { db, now } from '../db';
import { resolveVisibility } from './visibility';
import { getUserByUsername } from './profile';
import { logActivityEvent } from './activity';
import type { UserList, VisibilityLevel } from '../types';

export async function createList(
  userId: string,
  input: {
    name: string;
    description?: string;
    isRanked?: boolean;
    visibility?: VisibilityLevel;
    titleIds?: string[];
  }
): Promise<{ success: boolean; list?: UserList; error?: string }> {
  const name = input.name?.trim();
  if (!name) return { success: false, error: 'List name is required' };
  if (name.length > 100) return { success: false, error: 'List name cannot exceed 100 characters' };

  const d = db();
  const stamp = now();
  const listId = `list-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const visibility = input.visibility || 'public';
  const titleIds = Array.isArray(input.titleIds) ? input.titleIds : [];

  (await d.run(`
    INSERT INTO user_lists (id, user_id, title, name, description, is_ranked, visibility, items_json, title_ids, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, listId,
    userId,
    name,
    name,
    input.description?.trim() || null,
    input.isRanked ? 1 : 0,
    visibility,
    JSON.stringify(titleIds),
    JSON.stringify(titleIds),
    stamp,
    stamp));

  (await logActivityEvent(userId, 'created_list', 'list', listId, { listName: name, count: titleIds.length }));

  const list: UserList = {
    id: listId,
    userId,
    name,
    description: input.description?.trim() || null,
    isRanked: Boolean(input.isRanked),
    visibility,
    titleIds,
    createdAt: stamp,
    updatedAt: stamp,
    likesCount: 0,
    isLiked: false,
    itemCount: titleIds.length,
  };

  return { success: true, list };
}

export async function updateList(
  userId: string,
  listId: string,
  updates: {
    name?: string;
    description?: string;
    isRanked?: boolean;
    visibility?: VisibilityLevel;
    titleIds?: string[];
  }
): Promise<{ success: boolean; error?: string }> {
  const d = db();
  const list = (await d.get('SELECT user_id, title_ids, items_json FROM user_lists WHERE id = ?', listId)) as any;
  if (!list) return { success: false, error: 'List not found' };
  if (list.user_id !== userId) return { success: false, error: 'Not authorized' };

  const stamp = now();
  const titleIdsJson = updates.titleIds !== undefined ? JSON.stringify(updates.titleIds) : undefined;

  (await d.run(`
    UPDATE user_lists SET
      title = COALESCE(?, title),
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      is_ranked = COALESCE(?, is_ranked),
      visibility = COALESCE(?, visibility),
      items_json = COALESCE(?, items_json),
      title_ids = COALESCE(?, title_ids),
      updated_at = ?
    WHERE id = ?
  `, updates.name !== undefined ? updates.name.trim() : null,
    updates.name !== undefined ? updates.name.trim() : null,
    updates.description !== undefined ? updates.description.trim() : null,
    updates.isRanked !== undefined ? (updates.isRanked ? 1 : 0) : null,
    updates.visibility !== undefined ? updates.visibility : null,
    titleIdsJson ?? null,
    titleIdsJson ?? null,
    stamp,
    listId));

  return { success: true };
}

export async function deleteList(userId: string, listId: string): Promise<{ success: boolean; error?: string }> {
  const d = db();
  const list = (await d.get('SELECT user_id FROM user_lists WHERE id = ?', listId)) as any;
  if (!list) return { success: false, error: 'List not found' };
  if (list.user_id !== userId) return { success: false, error: 'Not authorized' };

  (await d.run('DELETE FROM user_lists WHERE id = ?', listId));
  (await d.run(`DELETE FROM likes WHERE target_type = 'list' AND target_id = ?`, listId));
  (await d.run(`DELETE FROM comments WHERE target_type = 'list' AND target_id = ?`, listId));

  return { success: true };
}

export async function getUserLists(
  targetUsername: string,
  viewerId: string | null
): Promise<Array<UserList>> {
  const target = (await getUserByUsername(targetUsername));
  if (!target) return [];

  const d = db();
  const rows = (await d.all(`
    SELECT * FROM user_lists WHERE user_id = ? ORDER BY created_at DESC
  `, target.id)) as any[];

  const allowedLists: UserList[] = [];

  for (const r of rows) {
    const listVis = (r.visibility as VisibilityLevel) || 'public';
    const decision = (await resolveVisibility(viewerId, target.id, 'list', listVis));
    if (!decision.allowed) continue;

    let titleIds: string[] = [];
    try {
      titleIds = JSON.parse(r.title_ids || r.items_json || '[]');
    } catch {}

    const likeCount = ((await d.get(`SELECT COUNT(*) as count FROM likes WHERE target_type = 'list' AND target_id = ?`, r.id)) as any)?.count || 0;
    const isLiked = viewerId ? Boolean((await d.get(`SELECT 1 FROM likes WHERE user_id = ? AND target_type = 'list' AND target_id = ?`, viewerId, r.id))) : false;

    allowedLists.push({
      id: r.id,
      userId: r.user_id,
      name: r.name || r.title || '',
      description: r.description,
      isRanked: Boolean(r.is_ranked),
      visibility: listVis,
      titleIds,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      likesCount: likeCount,
      isLiked,
      itemCount: titleIds.length,
    });
  }

  return allowedLists;
}
