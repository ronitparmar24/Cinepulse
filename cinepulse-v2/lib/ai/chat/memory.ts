import { db, now } from '../../db';
import { randomUUID } from 'node:crypto';
import type { ChatThread, ChatMessage, ChatRole } from './types';

// Ensure tables exist on demand (also handled via migration v12)
export function ensureChatTables(): void {
  const d = db();
  d.exec(`
    CREATE TABLE IF NOT EXISTS chat_threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE INDEX IF NOT EXISTS idx_chat_threads_user ON chat_threads(user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_json TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      feedback TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, created_at ASC);
  `);
}

export function createThread(userId: string, title = 'New Conversation'): ChatThread {
  ensureChatTables();
  const d = db();
  const threadId = `th_${randomUUID()}`;
  const timestamp = now();

  d.prepare(`
    INSERT INTO chat_threads (id, user_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(threadId, userId, title, timestamp, timestamp);

  return {
    id: threadId,
    userId,
    title,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function getThread(threadId: string, userId: string): ChatThread | null {
  ensureChatTables();
  const d = db();
  const row = d.prepare(`
    SELECT id, user_id as userId, title, created_at as createdAt, updated_at as updatedAt
    FROM chat_threads
    WHERE id = ? AND user_id = ?
  `).get(threadId, userId) as any;

  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listThreads(userId: string, limit = 20): ChatThread[] {
  ensureChatTables();
  const d = db();
  const rows = d.prepare(`
    SELECT id, user_id as userId, title, created_at as createdAt, updated_at as updatedAt
    FROM chat_threads
    WHERE user_id = ?
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(userId, limit) as any[];

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    title: r.title,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export function deleteThread(threadId: string, userId: string): boolean {
  ensureChatTables();
  const d = db();
  const res = d.prepare('DELETE FROM chat_threads WHERE id = ? AND user_id = ?').run(threadId, userId);
  return (res.changes || 0) > 0;
}

export function updateThreadTitle(threadId: string, title: string): void {
  ensureChatTables();
  const d = db();
  d.prepare('UPDATE chat_threads SET title = ?, updated_at = ? WHERE id = ?').run(title.slice(0, 100), now(), threadId);
}

export function addMessage(
  threadId: string,
  role: ChatRole,
  content: string,
  toolJson?: Record<string, unknown> | null,
  feedback: 'up' | 'down' | null = null
): ChatMessage {
  ensureChatTables();
  const d = db();
  const messageId = `msg_${randomUUID()}`;
  const timestamp = now();
  const jsonStr = toolJson ? JSON.stringify(toolJson) : null;

  d.prepare(`
    INSERT INTO chat_messages (id, thread_id, role, content, tool_json, created_at, feedback)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(messageId, threadId, role, content, jsonStr, timestamp, feedback);

  d.prepare('UPDATE chat_threads SET updated_at = ? WHERE id = ?').run(timestamp, threadId);

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

export function getThreadMessages(threadId: string, userId?: string | null): ChatMessage[] {
  ensureChatTables();
  const d = db();
  if (userId) {
    const thread = getThread(threadId, userId);
    if (!thread) return [];
  }

  const rows = d.prepare(`
    SELECT id, thread_id as threadId, role, content, tool_json as toolJson, created_at as createdAt, feedback
    FROM chat_messages
    WHERE thread_id = ?
    ORDER BY created_at ASC
  `).all(threadId) as any[];

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

export function updateMessageFeedback(messageId: string, userId: string, feedback: 'up' | 'down'): boolean {
  ensureChatTables();
  const d = db();
  // Ensure message belongs to a thread owned by this user
  const res = d.prepare(`
    UPDATE chat_messages
    SET feedback = ?
    WHERE id = ? AND thread_id IN (SELECT id FROM chat_threads WHERE user_id = ?)
  `).run(feedback, messageId, userId);

  return (res.changes || 0) > 0;
}

/**
 * Returns the last 8 turns (16 messages) plus a rolling summary of older turns
 * for feeding into the LLM context window.
 */
export function getContextWindow(
  threadId: string,
  userId?: string | null
): { messages: Array<{ role: 'user' | 'assistant'; content: string }>; summary?: string } {
  const allMessages = getThreadMessages(threadId, userId);
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
    .slice(0, 8)
    .map((m) => `${m.role === 'user' ? 'User' : 'CinePulse'}: ${m.content.slice(0, 60)}…`)
    .join(' | ');

  const summary = `Earlier conversation summary: ${summarySnippets}`;
  return {
    messages: recentMessages,
    summary,
  };
}
