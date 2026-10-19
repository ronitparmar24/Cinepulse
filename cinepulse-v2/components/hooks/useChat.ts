'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../client';
import type { PendingAction } from '@/lib/ai/chat/types';

export interface ChatCard {
  type: string; // 'title' | 'forecast' | 'pulse' | 'compare' | 'action' | 'list' | 'accuracy' | 'contrarian'
  data: Record<string, unknown>;
  name?: string;
  summary?: string;
}

export interface PendingActionUI extends PendingAction {
  status: 'pending' | 'confirmed' | 'cancelled';
}

export interface ChatMessageUI {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  cards: ChatCard[];
  suggestions: string[];
  isStreaming?: boolean;
  provider?: string;
  feedback?: 'up' | 'down' | null;
  pendingActions?: PendingActionUI[];
}

export interface ChatThreadUI {
  id: string;
  title: string;
  updatedAt: string;
}

export function useChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [threads, setThreads] = useState<ChatThreadUI[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [titleContext, setTitleContext] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Load user threads when panel opens
  const loadThreads = useCallback(async () => {
    try {
      const res = await api<{ threads: ChatThreadUI[] }>('/ai/chat/threads');
      if (res?.threads) {
        setThreads(res.threads);
      }
    } catch {
      // Ignored for unauthenticated users
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadThreads();
    }
  }, [isOpen, loadThreads]);

  // Load specific thread messages
  const loadThread = useCallback(async (threadId: string) => {
    try {
      setIsLoading(true);
      const res = await api<{ messages: any[] }>(`/ai/chat/threads/${threadId}`);
      if (res?.messages) {
        const uiMsgs: ChatMessageUI[] = res.messages.map((m) => {
          const cards: ChatCard[] = [];
          if (m.toolJson?.cards && Array.isArray(m.toolJson.cards)) {
            for (const c of m.toolJson.cards) {
              cards.push({
                type: c.cardType || 'unknown',
                data: c.data || {},
                name: c.name,
                summary: c.summary,
              });
            }
          }
          return {
            id: m.id,
            role: m.role,
            content: m.content,
            cards,
            suggestions: [],
            feedback: m.feedback,
            isStreaming: false,
          };
        });
        setMessages(uiMsgs);
        setCurrentThreadId(threadId);
      }
    } catch {
      // Best effort
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Delete thread
  const deleteThread = useCallback(
    async (threadId: string) => {
      try {
        await api(`/ai/chat/threads/${threadId}`, 'DELETE');
        setThreads((prev) => prev.filter((t) => t.id !== threadId));
        if (currentThreadId === threadId) {
          setCurrentThreadId(null);
          setMessages([]);
        }
      } catch {}
    },
    [currentThreadId]
  );

  // New Chat session
  const newChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setCurrentThreadId(null);
    setTitleContext(null);
    setIsLoading(false);
    setActiveTool(null);
  }, []);

  // Stop current stream
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setActiveTool(null);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
    );
  }, []);

  // Send message
  const sendMessage = useCallback(
    async (text: string, overrideTitleId?: string) => {
      const clean = text.trim();
      if (!clean) return;

      const userMsgId = `user_${Date.now()}`;
      const assistantMsgId = `asst_${Date.now()}`;
      const effectiveTitleContext = overrideTitleId || titleContext;

      // Add user message & placeholder assistant message
      const userMessage: ChatMessageUI = {
        id: userMsgId,
        role: 'user',
        content: clean,
        cards: [],
        suggestions: [],
      };

      const assistantMessage: ChatMessageUI = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        cards: [],
        suggestions: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);
      setActiveTool(null);

      const abortCtrl = new AbortController();
      abortControllerRef.current = abortCtrl;

      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('cinepulse_token') : null;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // Build ephemeral history for anon
        const history = messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content }));

        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            threadId: currentThreadId || undefined,
            message: clean,
            titleContext: effectiveTitleContext || undefined,
            history,
          }),
          signal: abortCtrl.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData?.error || `Request failed (${response.status})`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('Readable stream not supported');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const lines = part.trim().split('\n');
            let eventType = 'message';
            let dataStr = '';

            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataStr = line.slice(5).trim();
              }
            }

            if (!dataStr) continue;
            let parsedData: any = {};
            try {
              parsedData = JSON.parse(dataStr);
            } catch {
              continue;
            }

            if (eventType === 'token') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: m.content + (parsedData.text || '') } : m
                )
              );
            } else if (eventType === 'tool_start') {
              setActiveTool(parsedData.name || 'Running model check');
            } else if (eventType === 'tool_result') {
              setActiveTool(null);
              const newCard: ChatCard = {
                type: parsedData.cardType || 'generic',
                data: parsedData.data || {},
                name: parsedData.name,
                summary: parsedData.summary,
              };

              // Check if it's an action proposal card
              const pendingActions: PendingActionUI[] = [];
              if (parsedData.cardType === 'action' && parsedData.data?.action) {
                pendingActions.push({
                  ...parsedData.data.action,
                  status: 'pending',
                });
              }

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        cards: [...m.cards, newCard],
                        pendingActions: [...(m.pendingActions || []), ...pendingActions],
                      }
                    : m
                )
              );
            } else if (eventType === 'suggestions') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, suggestions: Array.isArray(parsedData.items) ? parsedData.items : [] }
                    : m
                )
              );
            } else if (eventType === 'done') {
              setActiveTool(null);
              if (parsedData.threadId && !currentThreadId) {
                setCurrentThreadId(parsedData.threadId);
                loadThreads();
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, isStreaming: false, provider: parsedData.provider }
                    : m
                )
              );
            } else if (eventType === 'error') {
              setActiveTool(null);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content: m.content ? `${m.content}\n\n*${parsedData.message}*` : parsedData.message,
                        isStreaming: false,
                      }
                    : m
                )
              );
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: m.content || `Sorry, I encountered an issue: ${err.message}. Please try again.`,
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
        setActiveTool(null);
        abortControllerRef.current = null;
      }
    },
    [titleContext, currentThreadId, messages, loadThreads]
  );

  // Regenerate last assistant turn
  const regenerate = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    sendMessage(lastUser.content);
  }, [messages, sendMessage]);

  // Action confirmation execution
  const confirmAction = useCallback(async (action: PendingAction) => {
    try {
      const res = await api<{ success: boolean; message: string }>('/ai/chat/confirm-action', 'POST', { action });
      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          pendingActions: m.pendingActions?.map((a) =>
            a.id === action.id ? { ...a, status: 'confirmed' } : a
          ),
        }))
      );
      return res;
    } catch (err: any) {
      throw err;
    }
  }, []);

  const cancelAction = useCallback((actionId: string) => {
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        pendingActions: m.pendingActions?.map((a) =>
          a.id === actionId ? { ...a, status: 'cancelled' } : a
        ),
      }))
    );
  }, []);

  // Submit feedback
  const submitFeedback = useCallback(async (messageId: string, feedback: 'up' | 'down') => {
    try {
      await api('/ai/chat/feedback', 'POST', { messageId, feedback });
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, feedback } : m))
      );
    } catch {}
  }, []);

  return {
    isOpen,
    setIsOpen,
    messages,
    threads,
    currentThreadId,
    isLoading,
    activeTool,
    titleContext,
    setTitleContext,
    sendMessage,
    stopGeneration,
    regenerate,
    confirmAction,
    cancelAction,
    submitFeedback,
    newChat,
    loadThreads,
    loadThread,
    deleteThread,
  };
}
