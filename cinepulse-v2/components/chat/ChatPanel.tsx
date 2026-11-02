'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Send,
  Square,
  Sparkles,
  Plus,
  History,
  Trash2,
  Film,
  Zap,
} from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { useApp } from '../Context';
import type { useChat } from '../hooks/useChat';

function PulseOrb({ state }: { state: 'idle' | 'thinking' | 'streaming' }) {
  return (
    <div
      className={`chat-pulse-orb chat-pulse-orb--${state}`}
      aria-hidden="true"
    />
  );
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const {
    messages,
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
    threads,
    currentThreadId,
    loadThread,
    deleteThread,
  } = chat;

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

  // Esc key closes panel & focus trap
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
    sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  // Contextual empty-state suggestion chips
  const emptyChips = titleContext
    ? [
        'Will this film be a hit?',
        'What are audiences saying about it?',
        'Spoiler-free synopsis',
        'Add to my watchlist',
      ]
    : [
        'What is trending in theaters right now?',
        'Something under 2 hours, feel-good',
        'Which call is most contrarian?',
        'Compare Dune 2 vs Oppenheimer',
      ];

  return (
    <div className="chat-panel-backdrop" onClick={onClose}>
      <aside
        ref={panelRef}
        className="chat-panel glass"
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
          .chat-composer { position: relative; border-radius: 12px; }
          .chat-composer::before {
            content: "";
            position: absolute;
            inset: -1px;
            border-radius: inherit;
            padding: 1px;
            background: conic-gradient(from var(--chat-angle), transparent 0 70%, #6366f1 85%, transparent 100%);
            -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            opacity: 0;
            transition: opacity .25s;
          }
          .chat-composer:focus-within::before { opacity: 1; animation: chat-spin 3.5s linear infinite; }
          @keyframes chat-spin { to { --chat-angle: 360deg; } }
          @media (prefers-reduced-motion: reduce) { .chat-composer::before { animation: none; } }

          .chat-pulse-orb {
            width: 18px; height: 18px; border-radius: 50%;
            background: radial-gradient(circle at 40% 40%, #818cf8, #6366f1 60%, #4f46e5);
            box-shadow: 0 0 8px 2px rgba(99,102,241,0.4);
            transition: box-shadow 0.3s;
          }
          .chat-pulse-orb--idle {
            animation: orb-breathe 4s ease-in-out infinite;
          }
          .chat-pulse-orb--thinking {
            box-shadow: 0 0 14px 4px rgba(99,102,241,0.7);
            animation: orb-think 1.2s ease-in-out infinite;
          }
          .chat-pulse-orb--streaming {
            box-shadow: 0 0 20px 6px rgba(99,102,241,0.9);
            animation: orb-stream 0.6s ease-in-out infinite;
          }
          @keyframes orb-breathe {
            0%, 100% { transform: scale(1); box-shadow: 0 0 8px 2px rgba(99,102,241,0.4); }
            50% { transform: scale(1.06); box-shadow: 0 0 14px 4px rgba(99,102,241,0.6); }
          }
          @keyframes orb-think {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
          }
          @keyframes orb-stream {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.15); box-shadow: 0 0 24px 8px rgba(99,102,241,1); }
          }
          @media (prefers-reduced-motion: reduce) {
            .chat-pulse-orb--idle,
            .chat-pulse-orb--thinking,
            .chat-pulse-orb--streaming { animation: none; }
          }

          .chat-tool-trail {
            display: flex; flex-direction: column; gap: 3px;
            padding: 6px 0; margin-bottom: 6px;
            font-size: 11px; color: rgba(255,255,255,0.5);
          }
          .chat-trail-item { display: flex; align-items: center; gap: 6px; }
          .chat-trail-dot { width: 14px; text-align: center; }
          .chat-trail-item--done .chat-trail-dot { color: #22c55e; }
          .chat-trail-item--running .chat-trail-dot { color: #6366f1; opacity: 0.7; }
          .chat-trail-name { flex: 1; }
          .chat-trail-asof { color: rgba(255,255,255,0.3); font-size: 10px; }

          .chat-evidence-drawer { margin-top: 6px; }
          .chat-evidence-chip--toggle {
            display: inline-flex; align-items: center; gap: 4px;
            background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.25);
            border-radius: 20px; padding: 3px 10px;
            font-size: 11px; color: rgba(255,255,255,0.6);
            cursor: pointer; transition: background 0.2s;
          }
          .chat-evidence-chip--toggle:hover { background: rgba(99,102,241,0.22); }
          .chat-evidence-caret { font-size: 9px; margin-left: 2px; }
          .chat-evidence-list {
            margin-top: 6px; display: flex; flex-direction: column; gap: 3px;
            background: rgba(0,0,0,0.2); border-radius: 8px; padding: 8px 10px;
          }
          .chat-evidence-item {
            display: flex; align-items: center; gap: 6px;
            font-size: 11px; color: rgba(255,255,255,0.5);
          }
          .chat-evidence-dot { color: #6366f1; font-size: 8px; }
          .chat-evidence-tool-name { flex: 1; text-transform: capitalize; }
          .chat-evidence-source { color: rgba(255,255,255,0.3); font-size: 10px; font-family: monospace; }
          .chat-evidence-asof { color: rgba(255,255,255,0.25); font-size: 10px; margin-left: auto; }

          .chat-scroll-pill {
            position: sticky; bottom: 8px; left: 50%; transform: translateX(-50%);
            background: rgba(99,102,241,0.9); color: white; border: none;
            border-radius: 20px; padding: 4px 14px; font-size: 12px;
            cursor: pointer; z-index: 10; margin: 0 auto; display: block;
          }
        `}</style>
        {/* Header */}
        <header className="chat-header">
          <div className="chat-header__brand">
            <div className="chat-header__icon-glow">
              <PulseOrb state={orbState} />
            </div>
            <div>
              <h3 className="chat-header__title">Ask CinePulse</h3>
              <span className="chat-header__subtitle">
                Forecasts &amp; evidence
              </span>
            </div>
          </div>

          <div className="chat-header__actions">
            {user?.id && (
              <button
                className={`chat-icon-btn ${showHistory ? 'active' : ''}`}
                onClick={() => setShowHistory(!showHistory)}
                title="Chat History"
                aria-label="Toggle history"
              >
                <History size={16} />
              </button>
            )}

            <button
              className="chat-icon-btn"
              onClick={newChat}
              title="New Chat"
              aria-label="New chat"
            >
              <Plus size={16} />
            </button>

            <button
              className="chat-icon-btn"
              onClick={onClose}
              title="Close Chat"
              aria-label="Close"
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
                className="chat-icon-btn"
                onClick={() => setShowHistory(false)}
                aria-label="Close history"
              >
                <X size={14} />
              </button>
            </div>
            <div className="chat-history-list">
              {threads.length > 0 ? (
                threads.map((t) => (
                  <div
                    key={t.id}
                    className={`chat-history-item ${
                      t.id === currentThreadId ? 'active' : ''
                    }`}
                  >
                    <button
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
                  <p>No previous conversations recorded.</p>
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
              <div className="chat-empty-spark">
                <Sparkles size={28} className="text-accent" />
              </div>
              <h4>Welcome to Ask CinePulse</h4>
              <p>
                Your sharp, spoiler-free film nerd friend with direct access to
                box-office forecasts and community accuracy ledgers.
              </p>

              {titleContext && (
                <div className="chat-context-pill">
                  <Film size={12} />
                  <span>Preloaded film context active</span>
                  <button
                    onClick={() => setTitleContext(null)}
                    title="Clear title context"
                  >
                    <X size={11} />
                  </button>
                </div>
              )}

              <div className="chat-empty-chips">
                <span className="chat-chips-label">Try asking:</span>
                {emptyChips.map((chip, idx) => (
                  <button
                    key={idx}
                    className="chat-chip chat-chip--suggest"
                    onClick={() => sendMessage(chip)}
                  >
                    <span>{chip}</span>
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
                  className="chat-scroll-pill"
                  onClick={() => {
                    userScrolledUpRef.current = false;
                    setShowScrollPill(false);
                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  ↓ New message
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
              <span>Discussing preloaded film</span>
              <button
                onClick={() => setTitleContext(null)}
                title="Remove film context"
              >
                <X size={10} />
              </button>
            </div>
          )}

          <div className="chat-input-wrapper chat-composer">
            <input
              ref={inputRef}
              type="text"
              className="chat-input"
              placeholder="Ask about any film, forecast, or mood…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              maxLength={1000}
              aria-label="Chat input message"
            />

            {isLoading ? (
              <button
                className="chat-send-btn chat-send-btn--stop"
                onClick={stopGeneration}
                title="Stop response"
                aria-label="Stop generating response"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                className="chat-send-btn"
                onClick={handleSend}
                disabled={!input.trim()}
                title="Send message"
                aria-label="Send message"
              >
                <Send size={15} />
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
