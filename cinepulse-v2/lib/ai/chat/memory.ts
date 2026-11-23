import { db, now } from '../../db';
import { randomUUID } from 'node:crypto';
import type { ChatThread, ChatMessage, ChatRole } from './types';


export async function createThread(userId: string, title = 'New Conversation'): Promise<ChatThread> {
  const d = db();
  const threadId = `th_${randomUUID()}`;
  const timestamp = now();

  (await d.run(`
    INSERT INTO chat_threads (id, user_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `, threadId, userId, title, timestamp, timestamp));

  return {
    id: threadId,
    userId,
    title,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function getThread(threadId: string, userId: string): Promise<ChatThread | null> {
  const d = db();
  const row = (await d.get(`
    SELECT id, user_id as "userId", title, created_at as "createdAt", updated_at as "updatedAt"
    FROM chat_threads
    WHERE id = ? AND user_id = ?
  `, threadId, userId)) as any;

  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listThreads(userId: string, limit = 20): Promise<ChatThread[]> {
  const d = db();
  const rows = (await d.all(`
    SELECT id, user_id as "userId", title, created_at as "createdAt", updated_at as "updatedAt"
    FROM chat_threads
    WHERE user_id = ?
    ORDER BY updated_at DESC
    LIMIT ?
  `, userId, limit)) as any[];

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    title: r.title,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function deleteThread(threadId: string, userId: string): Promise<boolean> {
  const d = db();
  const res = (await d.run('DELETE FROM chat_threads WHERE id = ? AND user_id = ?', threadId, userId));
  return (res.changes || 0) > 0;
}

export async function updateThreadTitle(threadId: string, title: string): Promise<void> {
  const d = db();
  (await d.run('UPDATE chat_threads SET title = ?, updated_at = ? WHERE id = ?', title.slice(0, 100), now(), threadId));
}

export async function addMessage(
  threadId: string,
  role: ChatRole,
  content: string,
  toolJson?: Record<string, unknown> | null,
  feedback: 'up' | 'down' | null = null
): Promise<ChatMessage> {
  const d = db();
  const messageId = `msg_${randomUUID()}`;
  const timestamp = now();
  const jsonStr = toolJson ? JSON.stringify(toolJson) : null;

  (await d.run(`
    INSERT INTO chat_messages (id, thread_id, role, content, tool_json, created_at, feedback)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, messageId, threadId, role, content, jsonStr, timestamp, feedback));

  (await d.run('UPDATE chat_threads SET updated_at = ? WHERE id = ?', timestamp, threadId));

  return {
    id: messageId,
    threadId,
    role,
    content,
    toolJson: toolJson || null,
    createdAt: timestamp,
    feedback,
  };
}

export async function getThreadMessages(threadId: string, userId?: string | null): Promise<ChatMessage[]> {
  const d = db();
  if (userId) {
    const thread = (await getThread(threadId, userId));
    if (!thread) return [];
  }

  const rows = (await d.all(`
    SELECT id, thread_id as "threadId", role, content, tool_json as "toolJson", created_at as "createdAt", feedback
    FROM chat_messages
    WHERE thread_id = ?
    ORDER BY created_at ASC
  `, threadId)) as any[];

  return rows.map((r) => ({
    id: r.id,
    threadId: r.threadId,
    role: r.role as ChatRole,
    content: r.content,
    toolJson: r.toolJson ? JSON.parse(r.toolJson) : null,
    createdAt: r.createdAt,
    feedback: r.feedback as 'up' | 'down' | null,
  }));
}

export async function updateMessageFeedback(messageId: string, userId: string, feedback: 'up' | 'down'): Promise<boolean> {
  const d = db();
  // Ensure message belongs to a thread owned by this user
  const res = (await d.run(`
    UPDATE chat_messages
    SET feedback = ?
    WHERE id = ? AND thread_id IN (SELECT id FROM chat_threads WHERE user_id = ?)
  `, feedback, messageId, userId));

  return (res.changes || 0) > 0;
}

/**
 * Returns the last 8 turns (16 messages) plus a rolling summary of older turns
 * for feeding into the LLM context window.
 */
export async function getContextWindow(
  threadId: string,
  userId?: string | null
): Promise<{ messages: Array<{ role: 'user' | 'assistant'; content: string }>; summary?: string }> {
  const allMessages = (await getThreadMessages(threadId, userId));
  if (allMessages.length === 0) {
    return { messages: [] };
  }

  // Filter only user & assistant messages for context window
  const conversation = allMessages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const RECENT_TURNS_COUNT = 8;
  const RECENT_MESSAGES_COUNT = RECENT_TURNS_COUNT * 2; // 16 messages

  if (conversation.length <= RECENT_MESSAGES_COUNT) {
    return { messages: conversation };
  }

  const olderMessages = conversation.slice(0, conversation.length - RECENT_MESSAGES_COUNT);
  const recentMessages = conversation.slice(conversation.length - RECENT_MESSAGES_COUNT);

  // Generate compact rolling summary from older messages
  const summarySnippets = olderMessages
    .slice(0, 10)
    .map((m) => `${m.role === 'user' ? 'User' : 'Bot'}: ${m.content.slice(0, 80).replace(/\n/g, ' ')}`)
    .join('\n');

  const summary = `Earlier conversation summary (${olderMessages.length} older messages):\n${summarySnippets}`;
  return {
    messages: recentMessages,
    summary,
  };
}
