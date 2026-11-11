'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Send,
  Square,
  Plus,
  History,
  Trash2,
  Film,
  Zap,
  Shuffle,
  BarChart2,
  Flame,
  Scale,
  Search,
  Maximize2,
  Minimize2,
  ArrowDown,
} from 'lucide-react';
import { CinePulseOrb } from './CinePulseOrb';
import { ChatMessage } from './ChatMessage';
import { useApp } from '../Context';
import type { useChat } from '../hooks/useChat';

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

  const autoResizeTextarea = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
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
    ? `Scanning ${activeTool.replace(/_/g, ' ')}…`
    : isLoading
    ? 'Synthesizing cinema signal…'
    : titleContext
    ? titleContextLabel
      ? `Discussing ${titleContextLabel}`
      : 'Film context active · Spoiler-free'
    : 'Forecasts · Evidence · Cinema AI';

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

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Esc key closes history drawer or panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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

  // Mood-based contextual starter chips
  const emptyChips = titleContext
    ? [
        { icon: '🎯', tag: 'Forecast', text: 'Will this film be a hit?' },
        { icon: '🏆', tag: 'Consensus', text: 'What are critics and audiences saying about it?' },
        { icon: '📺', tag: 'Streaming', text: 'Where can I watch this right now?' },
        { icon: '🔖', tag: 'Watchlist', text: 'Add to my watchlist' },
      ]
    : [
        { icon: '🔥', tag: 'Box Office', text: "What's trending in theaters right now?" },
        { icon: '😌', tag: 'Mood Match', text: 'Something feel-good under 2 hours' },
        { icon: '🔮', tag: 'Contrarian', text: 'Which call is most contrarian?' },
        { icon: '⚔️', tag: 'Face-Off', text: 'Compare Dune 2 vs Oppenheimer' },
      ];

  return (
    <div className="chat-panel-backdrop" onClick={onClose}>
      <aside
        ref={panelRef}
        className={`chat-panel glass ${isWide ? 'chat-panel--wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Ask CinePulse AI Assistant"
      >
        <style>{`
          @property --chat-angle {
            syntax: "<angle>";
            initial-value: 0deg;
            inherits: false;
          }
          @keyframes chat-spin { to { --chat-angle: 360deg; } }
          @media (prefers-reduced-motion: reduce) { .chat-composer::before { animation: none; } }
        `}</style>

        {/* Header */}
        <header className="chat-header">
          <div className="chat-header__brand">
            <div className="chat-header__icon-glow">
              <CinePulseOrb state={orbState} size="sm" />
            </div>
            <div>
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
                title="Chat History"
                aria-label="Toggle history"
              >
                <History size={16} />
              </button>
            )}

            <button
              type="button"
              className="chat-icon-btn chat-expand-btn"
              onClick={() => setIsWide((w) => !w)}
              title={isWide ? 'Compact drawer' : 'Expand drawer'}
              aria-label={isWide ? 'Compact drawer' : 'Expand drawer'}
            >
              {isWide ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>

            <button
              type="button"
              className="chat-icon-btn"
              onClick={newChat}
              title="New Chat"
              aria-label="New chat"
            >
              <Plus size={16} />
            </button>

            <button
              type="button"
              className="chat-icon-btn chat-panel-close"
              onClick={onClose}
              title="Close Chat (Esc)"
              aria-label="Close CinePulse Assistant"
            >
              <X size={17} />
            </button>
          </div>
        </header>

        {/* History Drawer Overlay */}
        {showHistory && (
          <div className="chat-history-drawer glass">
            <div className="chat-history-header">
              <h4>Conversation History</h4>
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
                placeholder="Search past chats…"
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
                      : 'No previous conversations recorded.'}
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
              <div className="chat-empty-logo-wrap">
                <div className="chat-empty-logo-ring" />
                <div className="chat-empty-logo-ring" />
                <div className="chat-empty-spark">
                  <CinePulseOrb state={orbState} size="lg" />
                </div>
              </div>
              <h4>Welcome to Ask CinePulse</h4>
              <p>
                Your sharp, spoiler-free film critic with live access to box-office
                forecasts, streaming links, and community accuracy ledgers.
              </p>

              {titleContext && (
                <div className="chat-context-pill">
                  <Film size={12} />
                  <span>{titleContextLabel ? `Film: ${titleContextLabel}` : 'Preloaded film context active'}</span>
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

              <div className="chat-empty-chips">
                <span className="chat-chips-label">Try asking</span>
                {emptyChips.map((chip, idx) => (
                  <button
                    type="button"
                    key={idx}
                    className="chat-chip chat-chip--suggest"
                    style={{ animationDelay: `${idx * 55}ms` }}
                    onClick={() => sendMessage(chip.text)}
                  >
                    <span className="chat-chip--suggest-icon">{chip.icon}</span>
                    <span className="chat-chip--suggest-body">
                      <span className="chat-chip--suggest-tag">{chip.tag}</span>
                      <span className="chat-chip--suggest-text">{chip.text}</span>
                    </span>
                    <span className="chat-chip--suggest-arrow">→</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m, idx) => (
                <ChatMessage
                  key={m.id || idx}
                  message={m}
                  isLast={idx === messages.length - 1}
                  onSuggestionClick={(s) => sendMessage(s)}
                  onConfirmAction={confirmAction}
                  onCancelAction={cancelAction}
                  onFeedback={submitFeedback}
                  onRegenerate={regenerate}
                />
              ))}

              {activeTool && (
                <div className="chat-active-tool-banner">
                  <Zap size={13} className="text-gold spin" />
                  <span>Checking {activeTool.replace(/_/g, ' ')}…</span>
                </div>
              )}

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
                  <span>Jump to latest</span>
                </button>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Bar */}
        <div className="chat-input-container">
          {titleContext && messages.length > 0 && (
            <div className="chat-context-pill chat-context-pill--bar">
              <Film size={11} />
              <span>{titleContextLabel ? `Discussing ${titleContextLabel}` : 'Discussing preloaded film'}</span>
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

          <div className="chat-input-wrapper chat-composer">
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder="Ask about any film, forecast, streaming, or mood…"
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
                title="Stop response"
                aria-label="Stop generating response"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="chat-send-btn"
                onClick={handleSend}
                disabled={!input.trim()}
                title="Send message (Enter)"
                aria-label="Send message"
              >
                <Send size={15} />
              </button>
            )}
          </div>

          <div className="chat-quick-actions-row">
            <div className="chat-quick-actions">
              <button
                type="button"
                className="chat-quick-btn"
                onClick={() => sendMessage('Surprise me with a hidden gem film')}
                disabled={isLoading}
                title="Random hidden gem recommendation"
              >
                <Shuffle size={11} />
                <span>Surprise me</span>
              </button>
              <button
                type="button"
                className="chat-quick-btn"
                onClick={() => sendMessage('What is trending in theaters right now?')}
                disabled={isLoading}
                title="Trending in theaters"
              >
                <Flame size={11} />
                <span>Trending</span>
              </button>
              <button
                type="button"
                className="chat-quick-btn"
                onClick={() => sendMessage('Which upcoming call is most contrarian?')}
                disabled={isLoading}
                title="Most contrarian calls"
              >
                <Scale size={11} />
                <span>Contrarian</span>
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
                title="Accuracy ledger"
              >
                <BarChart2 size={11} />
                <span>{user?.id ? 'My stats' : 'Accuracy'}</span>
              </button>
            </div>
            <span className="chat-shortcut-hint" aria-hidden="true">
              ↵ Send · ⇧↵ Line · Esc Close
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}
