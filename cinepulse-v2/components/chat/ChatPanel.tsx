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

export function ChatPanel({
  chat,
  onClose,
}: {
  chat: ReturnType<typeof useChat>;
  onClose: () => void;
}) {
  const { user } = useApp();
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTool]);

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
        {/* Header */}
        <header className="chat-header">
          <div className="chat-header__brand">
            <div className="chat-header__icon-glow">
              <Sparkles size={16} className="text-accent" />
            </div>
            <div>
              <h3 className="chat-header__title">Ask CinePulse</h3>
              <span className="chat-header__subtitle">
                Real-time predictions &amp; evidence
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
        <div className="chat-messages" role="log">
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

          <div className="chat-input-wrapper">
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
