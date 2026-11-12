'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  ArrowUp,
  Square,
  Plus,
  History,
  Trash2,
  Film,
  Shuffle,
  BarChart2,
  TrendingUp,
  Scale,
  Search,
  Maximize2,
  Minimize2,
  ArrowDown,
  ArrowRight,
  Award,
  Tv,
  Bookmark,
  Sparkles,
  ArrowLeftRight,
} from 'lucide-react';
import { CinePulseOrb } from './CinePulseOrb';
import { ChatMessage } from './ChatMessage';
import { useApp } from '../Context';
import type { useChat } from '../hooks/useChat';

const TOOL_LABELS: Record<string, string> = {
  get_forecast: 'box-office forecast',
  get_community_pulse: 'community pulse',
  get_title_details: 'film details',
  compare_titles: 'head-to-head comparison',
  add_to_library: 'watchlist action',
  get_contrarian_picks: 'contrarian divergence',
  get_trending: 'trending catalog',
  mood_search: 'mood catalog',
  recommend_for_me: 'Taste DNA picks',
  get_my_accuracy: 'personal accuracy',
  get_model_accuracy: 'model ledger',
  find_where_to_watch: 'streaming links',
  get_critical_consensus: 'critic consensus',
  find_nearby_cinemas: 'nearby cinemas',
  search_titles: 'catalog search',
};

function formatToolLabel(name: string): string {
  return TOOL_LABELS[name] || name.replace(/^get_/, '').replace(/_/g, ' ');
}

export function ChatPanel({
  chat,
  onClose,
}: {
  chat: ReturnType<typeof useChat>;
  onClose: () => void;
}) {
  const { user } = useApp();
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollPill, setShowScrollPill] = useState(false);
  const userScrolledUpRef = useRef(false);
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const [isWide, setIsWide] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDialogElement>(null);

  const autoResizeTextarea = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 128) + 'px';
  }, []);

  const {
    messages,
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
    threads,
    currentThreadId,
    loadThread,
    deleteThread,
  } = chat;

  const orbState: 'idle' | 'thinking' | 'streaming' =
    activeTool ? 'thinking' : isLoading ? 'streaming' : 'idle';

  const statusSubtitle = activeTool
    ? `Checking ${formatToolLabel(activeTool)}…`
    : isLoading
    ? 'Synthesizing answer…'
    : titleContext
    ? titleContextLabel
      ? `Context: ${titleContextLabel}`
      : 'Film context active'
    : 'Forecasts · Consensus · Streaming';

  const filteredThreads = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => t.title.toLowerCase().includes(q));
  }, [threads, historyQuery]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else if (isLoading) {
      setShowScrollPill(true);
    }
  }, [messages, activeTool, isLoading]);

  // Promote chat drawer into top-layer modal stack above any open <dialog showModal()> (e.g. TitleDetail)
  useEffect(() => {
    const el = backdropRef.current;
    if (!el) return;
    const prevOverflow = document.body.style.overflow;
    const promote = () => {
      try {
        if (el.open) el.close();
        el.showModal?.();
      } catch {
        // Fallback when showModal() is unavailable in limited test DOMs
      }
      inputRef.current?.focus();
    };
    promote();
    document.body.style.overflow = 'hidden';
    window.addEventListener('cinepulse:open-chat', promote);
    return () => {
      window.removeEventListener('cinepulse:open-chat', promote);
      try {
        if (el.open) el.close();
      } catch {}
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Fallback Esc handler only if browser did not open native top-layer dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !backdropRef.current?.open) {
        if (showHistory) {
          setShowHistory(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showHistory]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    userScrolledUpRef.current = false;
    setShowScrollPill(false);
    sendMessage(text);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const emptyStarters = titleContext
    ? [
        { icon: TrendingUp, text: 'Will this film be a hit at the box office?' },
        { icon: Award, text: 'What are critics, IMDb, and audiences saying?' },
        { icon: Tv, text: 'Where can I stream or rent this right now?' },
        { icon: Bookmark, text: 'Add this film to my watchlist' },
      ]
    : [
        { icon: TrendingUp, text: 'What movies are trending right now?' },
        { icon: Sparkles, text: 'Find a feel-good movie under 2 hours' },
        { icon: Scale, text: 'Which upcoming call shows the sharpest contrarian gap?' },
        { icon: ArrowLeftRight, text: 'Compare trending movies side by side' },
      ];

  return (
    <dialog
      ref={backdropRef}
      className="chat-panel-backdrop"
      aria-label="Ask CinePulse AI Assistant"
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (showHistory) {
          setShowHistory(false);
        } else {
          onClose();
        }
      }}
      onClick={onClose}
    >
      <aside
        ref={panelRef}
        className={`chat-panel ${isWide ? 'chat-panel--wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Minimalist Header */}
        <header className="chat-header">
          <div className="chat-header__brand">
            <CinePulseOrb state={orbState} size="sm" />
            <div className="chat-header__meta">
              <div className="chat-header__title-row">
                <h3 className="chat-header__title">Ask CinePulse</h3>
                <span className={`chat-status-dot chat-status-dot--${orbState}`} aria-hidden="true" />
              </div>
              <span className="chat-header__subtitle">{statusSubtitle}</span>
            </div>
          </div>

          <div className="chat-header__actions">
            {user?.id && (
              <button
                type="button"
                className={`chat-icon-btn ${showHistory ? 'active' : ''}`}
                onClick={() => setShowHistory(!showHistory)}
                title="History"
                aria-label="Toggle history"
              >
                <History size={16} />
              </button>
            )}

            <button
              type="button"
              className="chat-icon-btn chat-expand-btn"
              onClick={() => setIsWide((w) => !w)}
              title={isWide ? 'Compact width' : 'Expand width'}
              aria-label={isWide ? 'Compact drawer' : 'Expand drawer'}
            >
              {isWide ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>

            <button
              type="button"
              className="chat-icon-btn"
              onClick={newChat}
              title="New conversation"
              aria-label="New chat"
            >
              <Plus size={16} />
            </button>

            <button
              type="button"
              className="chat-icon-btn chat-panel-close"
              onClick={onClose}
              title="Close (Esc)"
              aria-label="Close CinePulse Assistant"
            >
              <X size={17} />
            </button>
          </div>
        </header>

        {/* History Drawer Overlay */}
        {showHistory && (
          <div className="chat-history-drawer">
            <div className="chat-history-header">
              <h4>Conversations</h4>
              <button
                type="button"
                className="chat-icon-btn"
                onClick={() => setShowHistory(false)}
                aria-label="Close history"
              >
                <X size={14} />
              </button>
            </div>

            <div className="chat-history-search-wrap">
              <Search size={13} className="chat-history-search-icon" />
              <input
                type="text"
                className="chat-history-search"
                placeholder="Search threads…"
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                aria-label="Search past chats"
              />
            </div>

            <div className="chat-history-list">
              {filteredThreads.length > 0 ? (
                filteredThreads.map((t) => (
                  <div
                    key={t.id}
                    className={`chat-history-item ${
                      t.id === currentThreadId ? 'active' : ''
                    }`}
                  >
                    <Film size={14} className="chat-history-reel-icon" />
                    <button
                      type="button"
                      className="chat-history-item-btn"
                      onClick={() => {
                        loadThread(t.id);
                        setShowHistory(false);
                      }}
                    >
                      <span className="chat-history-title">{t.title}</span>
                      <span className="chat-history-date">
                        {new Date(t.updatedAt).toLocaleDateString()}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="chat-history-del"
                      onClick={() => deleteThread(t.id)}
                      title="Delete thread"
                      aria-label="Delete thread"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="chat-history-empty">
                  <p>
                    {historyQuery
                      ? 'No matching conversations found.'
                      : 'No saved conversations yet.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Messages Body */}
        <div
          className="chat-messages"
          role="log"
          aria-live="polite"
          ref={messagesContainerRef}
          onScroll={() => {
            const el = messagesContainerRef.current;
            if (!el) return;
            const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            userScrolledUpRef.current = !isNearBottom;
            if (isNearBottom) setShowScrollPill(false);
          }}
        >
          {messages.length === 0 ? (
            <div className="chat-empty-state">
              <div className="chat-empty-emblem">
                <CinePulseOrb state={orbState} size="md" />
              </div>

              <h4>
                {titleContext && titleContextLabel
                  ? titleContextLabel
                  : 'Ask CinePulse'}
              </h4>
              <p>
                Grounded answers on box-office forecasts, critical scores, streaming
                availability, and model accuracy.
              </p>

              {titleContext && (
                <div className="chat-context-pill">
                  <Film size={12} />
                  <span>{titleContextLabel ? `Focused on ${titleContextLabel}` : 'Film context pinned'}</span>
                  <button
                    type="button"
                    onClick={() => setTitleContext(null)}
                    title="Clear title context"
                    aria-label="Clear title context"
                  >
                    <X size={11} />
                  </button>
                </div>
              )}

              <div className="chat-empty-starters">
                {emptyStarters.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      type="button"
                      key={idx}
                      className="chat-starter-row"
                      style={{ animationDelay: `${idx * 45}ms` }}
                      onClick={() => sendMessage(item.text)}
                    >
                      <span className="chat-starter-row__icon">
                        <Icon size={15} />
                      </span>
                      <span className="chat-starter-row__text">{item.text}</span>
                      <ArrowRight size={13} className="chat-starter-row__arrow" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m, idx) => (
                <ChatMessage
                  key={m.id || idx}
                  message={m}
                  isLast={idx === messages.length - 1}
                  isBusy={isLoading}
                  onSuggestionClick={(s) => sendMessage(s)}
                  onConfirmAction={confirmAction}
                  onCancelAction={cancelAction}
                  onFeedback={submitFeedback}
                  onRegenerate={regenerate}
                />
              ))}

              {showScrollPill && (
                <button
                  type="button"
                  className="chat-scroll-pill"
                  onClick={() => {
                    userScrolledUpRef.current = false;
                    setShowScrollPill(false);
                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <ArrowDown size={13} />
                  <span>Latest</span>
                </button>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Minimalist Unified Composer */}
        <div className="chat-input-container">
          {titleContext && messages.length > 0 && (
            <div className="chat-context-pill chat-context-pill--bar">
              <Film size={11} />
              <span>{titleContextLabel ? `Focused on ${titleContextLabel}` : 'Film context pinned'}</span>
              <button
                type="button"
                onClick={() => setTitleContext(null)}
                title="Remove film context"
                aria-label="Remove film context"
              >
                <X size={10} />
              </button>
            </div>
          )}

          <div className="chat-input-wrapper">
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder="Ask about a film, forecast, streaming, or mood…"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoResizeTextarea();
              }}
              onKeyDown={handleTextareaKeyDown}
              disabled={isLoading}
              maxLength={1000}
              rows={1}
              aria-label="Chat input message"
            />

            {input.length > 800 && (
              <span className={`chat-char-counter ${input.length > 950 ? 'warning' : ''}`}>
                {1000 - input.length}
              </span>
            )}

            {isLoading ? (
              <button
                type="button"
                className="chat-send-btn chat-send-btn--stop"
                onClick={stopGeneration}
                title="Stop generating"
                aria-label="Stop generating response"
              >
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                className="chat-send-btn"
                onClick={handleSend}
                disabled={!input.trim()}
                title="Send (Enter)"
                aria-label="Send message"
              >
                <ArrowUp size={16} strokeWidth={2.4} />
              </button>
            )}
          </div>

          <div className="chat-quick-actions">
            <button
              type="button"
              className="chat-quick-btn"
              onClick={() => sendMessage('What is trending in theaters right now?')}
              disabled={isLoading}
            >
              <TrendingUp size={11} />
              <span>Trending</span>
            </button>
            <button
              type="button"
              className="chat-quick-btn"
              onClick={() => sendMessage('Which upcoming call shows the sharpest contrarian gap?')}
              disabled={isLoading}
            >
              <Scale size={11} />
              <span>Contrarian</span>
            </button>
            <button
              type="button"
              className="chat-quick-btn"
              onClick={() => sendMessage('Surprise me with a standout film')}
              disabled={isLoading}
            >
              <Shuffle size={11} />
              <span>Surprise me</span>
            </button>
            <button
              type="button"
              className="chat-quick-btn"
              onClick={() =>
                sendMessage(
                  user?.id ? 'Show my prediction accuracy stats' : 'Show model accuracy stats'
                )
              }
              disabled={isLoading}
            >
              <BarChart2 size={11} />
              <span>{user?.id ? 'My stats' : 'Accuracy'}</span>
            </button>
          </div>
        </div>
      </aside>
    </dialog>
  );
}
