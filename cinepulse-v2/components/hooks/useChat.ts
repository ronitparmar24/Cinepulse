'use client';

import { useState, useCallback, useRef, useEffect, useContext } from 'react';
import { api } from '../client';
import { AppContext } from '../Context';
import type { PendingAction } from '@/lib/ai/chat/types';

export interface ChatCard {
  type: string; // 'title' | 'forecast' | 'pulse' | 'compare' | 'action' | 'list' | 'accuracy' | 'contrarian'
  data: Record<string, unknown>;
  name?: string;
  summary?: string;
  asOf?: string;
  source?: string;
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
  createdAt?: number;
  isStreaming?: boolean;
  provider?: string;
  feedback?: 'up' | 'down' | null;
  pendingActions?: PendingActionUI[];
  toolTrace: Array<{ name: string; state: 'running' | 'done'; ms?: number; source?: string; asOf?: string }>;
  evidenceTools?: Array<{ name: string; source: string; asOf: string | null }>;
}

export interface ChatThreadUI {
  id: string;
  title: string;
  updatedAt: string;
}

export function useChat() {
  const appCtx = useContext(AppContext);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [threads, setThreads] = useState<ChatThreadUI[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [titleContext, setTitleContextState] = useState<string | null>(null);
  const [titleContextLabel, setTitleContextLabel] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const setTitleContext = useCallback((id: string | null, label?: string | null) => {
    setTitleContextState(id);
    setTitleContextLabel(id ? (label ?? null) : null);
  }, []);

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
          const pendingActions: PendingActionUI[] = [];
          if (m.toolJson?.cards && Array.isArray(m.toolJson.cards)) {
            for (const c of m.toolJson.cards) {
              cards.push({
                type: c.cardType || 'unknown',
                data: c.data || {},
                name: c.name,
                summary: c.summary,
                asOf: c.asOf,
                source: c.source,
              });
              if (c.cardType === 'action' && c.data?.action) {
                pendingActions.push({
                  ...c.data.action,
                  status: c.data.action.status || 'pending',
                });
              }
            }
          }
          const evidenceTools = Array.isArray(m.toolJson?.evidence)
            ? m.toolJson.evidence
            : undefined;
          return {
            id: m.id,
            role: m.role,
            content: m.content,
            cards,
            suggestions: [],
            createdAt: m.createdAt ? new Date(m.createdAt).getTime() : undefined,
            feedback: m.feedback,
            isStreaming: false,
            pendingActions: pendingActions.length > 0 ? pendingActions : undefined,
            toolTrace: [],
            evidenceTools,
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
  }, [setTitleContext]);

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

  // Core streaming turn runner (supports new send & clean in-place regenerate)
  const runChatTurn = useCallback(
    async (
      clean: string,
      opts: {
        overrideTitleId?: string;
        baseMessages: ChatMessageUI[];
        appendUserMessage: boolean;
      }
    ) => {
      const nowTs = Date.now();
      const userMsgId = `user_${nowTs}`;
      const assistantMsgId = `asst_${nowTs}`;
      const effectiveTitleContext = opts.overrideTitleId || titleContext;

      const userMessage: ChatMessageUI = {
        id: userMsgId,
        role: 'user',
        content: clean,
        cards: [],
        suggestions: [],
        createdAt: nowTs,
        toolTrace: [],
      };

      const assistantMessage: ChatMessageUI = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        cards: [],
        suggestions: [],
        createdAt: nowTs,
        isStreaming: true,
        toolTrace: [],
      };

      setMessages(
        opts.appendUserMessage
          ? [...opts.baseMessages, userMessage, assistantMessage]
          : [...opts.baseMessages, assistantMessage]
      );
      setIsLoading(true);
      setActiveTool(null);

      const abortCtrl = new AbortController();
      abortControllerRef.current = abortCtrl;

      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('cinepulse_token') : null;
        const activeRegion =
          appCtx?.region ||
          (typeof window !== 'undefined' ? localStorage.getItem('cinepulse_region') : null) ||
          undefined;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // Build ephemeral history prior to the prompt being sent
        const historyPrior = opts.appendUserMessage
          ? opts.baseMessages
          : opts.baseMessages.slice(0, -1);
        const history = historyPrior
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
            region: activeRegion,
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
          if (value) {
            buffer += decoder.decode(value, { stream: !done });
          } else if (done) {
            buffer += decoder.decode();
          }

          const parts = buffer.split('\n\n');
          buffer = done ? '' : parts.pop() || '';

          for (const part of parts) {
            if (!part.trim()) continue;
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
              const toolName = parsedData.name || 'Running model check';
              setActiveTool(toolName);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        toolTrace: [
                          ...m.toolTrace,
                          { name: toolName, state: 'running' as const },
                        ],
                      }
                    : m
                )
              );
            } else if (eventType === 'tool_result') {
              setActiveTool(null);
              const newCard: ChatCard = {
                type: parsedData.cardType || 'generic',
                data: parsedData.data || {},
                name: parsedData.name,
                summary: parsedData.summary,
                asOf: parsedData.asOf,
                source: parsedData.source,
              };

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
                        toolTrace: m.toolTrace.map((t) =>
                          t.name === parsedData.name && t.state === 'running'
                            ? { ...t, state: 'done' as const, asOf: parsedData.asOf, source: parsedData.source }
                            : t
                        ),
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
            } else if (eventType === 'evidence') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, evidenceTools: parsedData.tools || [] }
                    : m
                )
              );
            } else if (eventType === 'status') {
              // Status events are informational — isStreaming already shows the indicator
            }
          }

          if (done) break;
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
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId && m.isStreaming ? { ...m, isStreaming: false } : m
          )
        );
      }
    },
    [titleContext, currentThreadId, appCtx?.region, loadThreads]
  );

  // Send message
  const sendMessage = useCallback(
    async (text: string, overrideTitleId?: string) => {
      const clean = text.trim();
      if (!clean || isLoading) return;
      await runChatTurn(clean, {
        overrideTitleId,
        baseMessages: messages,
        appendUserMessage: true,
      });
    },
    [isLoading, messages, runChatTurn]
  );

  // Regenerate last assistant turn without duplicating user prompt
  const regenerate = useCallback(() => {
    if (isLoading) return;
    const lastUserIdx = [...messages].reverse().findIndex((m) => m.role === 'user');
    if (lastUserIdx === -1) return;
    const actualUserIdx = messages.length - 1 - lastUserIdx;
    const lastUser = messages[actualUserIdx];
    const baseMessages = messages.slice(0, actualUserIdx + 1);
    runChatTurn(lastUser.content, {
      baseMessages,
      appendUserMessage: false,
    });
  }, [isLoading, messages, runChatTurn]);

  // Action confirmation execution
  const confirmAction = useCallback(async (action: PendingAction) => {
    const res = await api<{ success: boolean; message: string }>('/ai/chat/confirm-action', 'POST', { action });
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        pendingActions: m.pendingActions?.map((a) =>
          a.id === action.id ? { ...a, status: 'confirmed' } : a
        ),
        cards: m.cards.map((c) => {
          const cardAction = (c.data as any)?.action;
          if (c.type === 'action' && cardAction?.id === action.id) {
            return {
              ...c,
              data: {
                ...c.data,
                action: { ...cardAction, status: 'confirmed' },
              },
            };
          }
          return c;
        }),
      }))
    );
    return res;
  }, []);

  const cancelAction = useCallback((actionId: string) => {
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        pendingActions: m.pendingActions?.map((a) =>
          a.id === actionId ? { ...a, status: 'cancelled' } : a
        ),
        cards: m.cards.map((c) => {
          const cardAction = (c.data as any)?.action;
          if (c.type === 'action' && cardAction?.id === actionId) {
            return {
              ...c,
              data: {
                ...c.data,
                action: { ...cardAction, status: 'cancelled' },
              },
            };
          }
          return c;
        }),
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
    titleContextLabel,
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
