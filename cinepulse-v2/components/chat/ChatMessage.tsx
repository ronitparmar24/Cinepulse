'use client';

import React, { useState } from 'react';
import {
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Sparkles,
  Zap,
  Clock,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { CinePulseOrb } from './CinePulseOrb';
import { ChatCardDispatcher } from './ChatCards';
import type { ChatMessageUI, PendingActionUI, ChatCard } from '../hooks/useChat';

function renderSafeMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];

  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: { type: 'ul' | 'ol'; content: string; key: number }[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    const type = listItems[0].type;
    const keyBase = listItems[0].key;
    const children = listItems.map((item) => (
      <li key={item.key} className="chat-markdown-li">
        {renderFormattedSpans(item.content)}
      </li>
    ));
    nodes.push(
      type === 'ol' ? (
        <ol key={`ol_${keyBase}`} className="chat-markdown-ol">
          {children}
        </ol>
      ) : (
        <ul key={`ul_${keyBase}`} className="chat-markdown-ul">
          {children}
        </ul>
      )
    );
    listItems = [];
  };

  lines.forEach((rawLine, lineIdx) => {
    const trimmed = rawLine.trim();

    // Unordered list
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (listItems.length > 0 && listItems[0].type !== 'ul') flushList();
      listItems.push({ type: 'ul', content: trimmed.slice(2), key: lineIdx });
      return;
    }

    // Ordered list
    const olMatch = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (olMatch) {
      if (listItems.length > 0 && listItems[0].type !== 'ol') flushList();
      listItems.push({ type: 'ol', content: olMatch[1], key: lineIdx });
      return;
    }

    flushList();

    if (!trimmed) {
      nodes.push(<div key={`sp_${lineIdx}`} className="chat-markdown-spacer" />);
      return;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      nodes.push(
        <h5 key={lineIdx} className="chat-markdown-h3">
          {renderFormattedSpans(trimmed.slice(4))}
        </h5>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      nodes.push(
        <h4 key={lineIdx} className="chat-markdown-h2">
          {renderFormattedSpans(trimmed.slice(3))}
        </h4>
      );
      return;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      nodes.push(
        <blockquote key={lineIdx} className="chat-markdown-quote">
          {renderFormattedSpans(trimmed.slice(2))}
        </blockquote>
      );
      return;
    }

    nodes.push(
      <p key={lineIdx} className="chat-markdown-p">
        {renderFormattedSpans(rawLine)}
      </p>
    );
  });

  flushList();
  return nodes;
}

function renderFormattedSpans(text: string): React.ReactNode[] {
  // Parse spoiler tags: ||spoiler||
  const parts: React.ReactNode[] = [];
  const spoilerRegex = /\|\|([\s\S]*?)\|\|/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = spoilerRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...parseInlineFormatting(text.slice(lastIndex, match.index)));
    }
    const spoilerContent = match[1];
    parts.push(<SpoilerSpan key={`sp_${match.index}`} text={spoilerContent} />);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(...parseInlineFormatting(text.slice(lastIndex)));
  }

  return parts;
}

function SpoilerSpan({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      className={`spoiler-blur ${revealed ? 'revealed' : ''}`}
      onClick={() => setRevealed(true)}
      title={revealed ? '' : 'Click to reveal spoiler'}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setRevealed(true);
        }
      }}
    >
      {text}
    </span>
  );
}

function parseInlineFormatting(str: string): React.ReactNode[] {
  const segments: React.ReactNode[] = [];
  // Tokenize inline code `...`, bold **...**, italic *...*, link [...](...)
  const regex = /(`[^`]+`|\*\*.*?\*\*|\*.*?\*|\[.*?\]\(.*?\))/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(str)) !== null) {
    if (m.index > last) {
      segments.push(str.slice(last, m.index));
    }
    const token = m[0];

    if (token.startsWith('`') && token.endsWith('`')) {
      segments.push(
        <code key={`c_${m.index}`} className="chat-inline-code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      segments.push(
        <strong key={`b_${m.index}`}>{token.slice(2, -2)}</strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      segments.push(<em key={`i_${m.index}`}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('[')) {
      const linkMatch = /\[(.*?)\]\((.*?)\)/.exec(token);
      if (linkMatch) {
        const href = linkMatch[2];
        const safeHref = /^https?:\/\//i.test(href) || href.startsWith('/') ? href : '#';
        segments.push(
          <a
            key={`a_${m.index}`}
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="chat-link"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        segments.push(token);
      }
    } else {
      segments.push(token);
    }

    last = m.index + token.length;
  }

  if (last < str.length) {
    segments.push(str.slice(last));
  }

  return segments;
}

function formatMessageTime(createdAt?: number, id?: string): string {
  try {
    let ts = createdAt;
    if (!ts && id) {
      const match = /^(?:user|asst)_(\d{10,})$/.exec(id);
      if (match) ts = parseInt(match[1], 10);
    }
    if (!ts || Number.isNaN(ts)) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const TOOL_LABELS: Record<string, string> = {
  get_forecast: 'Box-office forecast',
  get_community_pulse: 'Community pulse',
  compare_titles: 'Film comparison',
  add_to_library: 'Watchlist action',
  get_contrarian_picks: 'Contrarian divergence',
  get_trending: 'Trending catalog',
  mood_search: 'Mood & tone search',
  recommend_for_me: 'Taste DNA picks',
  get_my_accuracy: 'Accuracy ledger',
  get_model_accuracy: 'Model accuracy ledger',
  find_where_to_watch: 'Streaming availability',
  get_critical_consensus: 'Quad-consensus scores',
  find_nearby_cinemas: 'Nearby theaters',
};

function formatToolDisplay(name: string): string {
  return TOOL_LABELS[name] || name.replace(/^get_/, '').replace(/_/g, ' ');
}

function formatAsOf(asOf: string | null | undefined): string {
  if (!asOf) return '';
  try {
    const diff = Date.now() - new Date(asOf).getTime();
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 1) return 'just now';
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

function EvidenceDrawer({
  cards,
  evidenceTools,
}: {
  cards: ChatCard[];
  evidenceTools?: Array<{ name: string; source: string; asOf: string | null }>;
}) {
  const [open, setOpen] = useState(false);

  const items =
    evidenceTools && evidenceTools.length > 0
      ? evidenceTools
      : cards.map((c) => ({
          name: c.name || c.type,
          source: (c as any).source || c.type,
          asOf: (c as any).asOf || null,
        }));

  if (items.length === 0) return null;

  return (
    <div className="chat-evidence-drawer">
      <button
        type="button"
        className="chat-evidence-chip chat-evidence-chip--toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Clock size={11} />
        <span>Sources &amp; Evidence ({items.length})</span>
        <span className="chat-evidence-caret">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="chat-evidence-list" role="list">
          {items.map((item, i) => (
            <div key={i} className="chat-evidence-item" role="listitem">
              <span className="chat-evidence-dot">●</span>
              <span className="chat-evidence-tool-name">
                {formatToolDisplay(item.name)}
              </span>
              <span className="chat-evidence-source">{item.source}</span>
              {item.asOf && (
                <span className="chat-evidence-asof">{formatAsOf(item.asOf)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatMessage({
  message,
  isLast,
  onSuggestionClick,
  onConfirmAction,
  onCancelAction,
  onFeedback,
  onRegenerate,
}: {
  message: ChatMessageUI;
  isLast?: boolean;
  onSuggestionClick?: (suggestion: string) => void;
  onConfirmAction: (action: PendingActionUI) => void | Promise<unknown>;
  onCancelAction: (actionId: string) => void;
  onFeedback?: (messageId: string, feedback: 'up' | 'down') => void;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const timeLabel = formatMessageTime(message.createdAt, message.id);

  const copyText = () => {
    if (!message.content) return;
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`chat-msg-row ${isUser ? 'chat-msg-row--user' : 'chat-msg-row--assistant'}`}>
      {!isUser && (
        <div className="chat-ai-avatar" aria-hidden="true">
          <CinePulseOrb
            state={
              message.isStreaming
                ? message.toolTrace?.some((t) => t.state === 'running')
                  ? 'thinking'
                  : 'streaming'
                : 'idle'
            }
            size="xs"
          />
        </div>
      )}

      <div className="chat-msg-main">
        <div
          className={`chat-bubble ${isUser ? 'chat-bubble--user' : 'chat-bubble--assistant'} ${
            message.isStreaming ? 'chat-bubble--streaming' : ''
          }`}
        >
          {!isUser && message.provider === 'rule-based' && (
            <div className="chat-badge chat-badge--lite">
              <Zap size={11} />
              <span>Lite mode</span>
            </div>
          )}

          {/* Live Evidence Trail while streaming */}
          {!isUser && message.isStreaming && message.toolTrace && message.toolTrace.length > 0 && (
            <div className="chat-tool-trail" aria-live="polite" aria-label="Checking data sources">
              {message.toolTrace.map((tool, i) => (
                <div
                  key={i}
                  className={`chat-trail-item ${
                    tool.state === 'done' ? 'chat-trail-item--done' : 'chat-trail-item--running'
                  }`}
                >
                  <span className="chat-trail-dot">
                    {tool.state === 'done' ? (
                      <CheckCircle2 size={12} />
                    ) : (
                      <Loader2 size={12} className="spin" />
                    )}
                  </span>
                  <span className="chat-trail-name">
                    {formatToolDisplay(tool.name)}
                    {tool.state === 'running' ? '…' : ''}
                  </span>
                  {tool.asOf && tool.state === 'done' && (
                    <span className="chat-trail-asof">{formatAsOf(tool.asOf)}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Streaming typing indicator when empty */}
          {message.isStreaming && !message.content && (
            <div className="chat-typing-indicator" aria-label="CinePulse is thinking">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
              <span className="chat-typing-label">Reading signals…</span>
            </div>
          )}

          {/* Message Content */}
          {message.content && (
            <div className="chat-markdown" aria-live={message.isStreaming ? 'polite' : undefined}>
              {renderSafeMarkdown(message.content)}
              {message.isStreaming && <span className="chat-stream-cursor" aria-hidden="true" />}
            </div>
          )}

          {/* Evidence Drawer */}
          {!isUser && !message.isStreaming && message.cards && message.cards.length > 0 && (
            <EvidenceDrawer cards={message.cards} evidenceTools={message.evidenceTools} />
          )}

          {/* Rich Tool Cards */}
          {message.cards && message.cards.length > 0 && (
            <div className="chat-cards-container">
              {message.cards.map((card, idx) => (
                <ChatCardDispatcher
                  key={idx}
                  card={card}
                  onConfirmAction={onConfirmAction}
                  onCancelAction={onCancelAction}
                />
              ))}
            </div>
          )}

          {/* Assistant Footer Actions + Hover Timestamp */}
          {!isUser && !message.isStreaming && (
            <div className="chat-msg-actions">
              <button
                type="button"
                className="chat-icon-btn"
                onClick={copyText}
                aria-label="Copy message"
                title="Copy"
              >
                {copied ? <Check size={13} className="text-hit" /> : <Copy size={13} />}
              </button>

              {onFeedback && (
                <>
                  <button
                    type="button"
                    className={`chat-icon-btn ${message.feedback === 'up' ? 'active' : ''}`}
                    onClick={() => onFeedback(message.id, 'up')}
                    aria-label="Helpful"
                    title="Helpful"
                  >
                    <ThumbsUp size={13} />
                  </button>
                  <button
                    type="button"
                    className={`chat-icon-btn ${message.feedback === 'down' ? 'active' : ''}`}
                    onClick={() => onFeedback(message.id, 'down')}
                    aria-label="Not helpful"
                    title="Not helpful"
                  >
                    <ThumbsDown size={13} />
                  </button>
                </>
              )}

              {isLast && onRegenerate && (
                <button
                  type="button"
                  className="chat-icon-btn"
                  onClick={onRegenerate}
                  aria-label="Regenerate response"
                  title="Regenerate"
                >
                  <RotateCcw size={13} />
                </button>
              )}

              {timeLabel && (
                <span className="chat-msg-timestamp" aria-label="Message time">
                  {timeLabel}
                </span>
              )}
            </div>
          )}
        </div>

        {/* User hover timestamp */}
        {isUser && timeLabel && (
          <span className="chat-msg-timestamp chat-msg-timestamp--user" aria-label="Message time">
            {timeLabel}
          </span>
        )}

        {/* Follow-up Suggestion Chips neatly aligned below assistant bubble */}
        {!isUser && !message.isStreaming && message.suggestions && message.suggestions.length > 0 && (
          <div className="chat-suggestions-row">
            {message.suggestions.map((suggestion, sIdx) => (
              <button
                type="button"
                key={sIdx}
                className="chat-suggestion-chip"
                onClick={() => onSuggestionClick?.(suggestion)}
              >
                <Sparkles size={11} />
                <span>{suggestion}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
