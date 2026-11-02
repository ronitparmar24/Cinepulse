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
} from 'lucide-react';
import { ChatCardDispatcher } from './ChatCards';
import type { ChatMessageUI, PendingActionUI, ChatCard } from '../hooks/useChat';

function renderSafeMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];

  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    // Bullet points
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const content = line.trim().slice(2);
      return (
        <li key={lineIdx} className="chat-markdown-li">
          {renderFormattedSpans(content)}
        </li>
      );
    }

    return (
      <p key={lineIdx} className="chat-markdown-p">
        {renderFormattedSpans(line)}
      </p>
    );
  });
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
        if (e.key === 'Enter' || e.key === ' ') setRevealed(true);
      }}
    >
      {text}
    </span>
  );
}

function parseInlineFormatting(str: string): React.ReactNode[] {
  const segments: React.ReactNode[] = [];
  // Tokenize bold **...**, italic *...*, link [...](...) 
  const regex = /(\*\*.*?\*\*|\*.*?\*|\[.*?\]\(.*?\))/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(str)) !== null) {
    if (m.index > last) {
      segments.push(str.slice(last, m.index));
    }
    const token = m[0];

    if (token.startsWith('**') && token.endsWith('**')) {
      segments.push(
        <strong key={`b_${m.index}`}>{token.slice(2, -2)}</strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      segments.push(<em key={`i_${m.index}`}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('[')) {
      const linkMatch = /\[(.*?)\]\((.*?)\)/.exec(token);
      if (linkMatch) {
        segments.push(
          <a
            key={`a_${m.index}`}
            href={linkMatch[2]}
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

  // Build evidence list: prefer evidenceTools from SSE, fall back to card data
  const items = evidenceTools && evidenceTools.length > 0
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
        className="chat-evidence-chip chat-evidence-chip--toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Clock size={11} />
        <span>Evidence ({items.length})</span>
        <span className="chat-evidence-caret">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="chat-evidence-list" role="list">
          {items.map((item, i) => (
            <div key={i} className="chat-evidence-item" role="listitem">
              <span className="chat-evidence-dot">●</span>
              <span className="chat-evidence-tool-name">
                {item.name.replace(/_/g, ' ')}
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
  onConfirmAction: (action: PendingActionUI) => void;
  onCancelAction: (actionId: string) => void;
  onFeedback?: (messageId: string, feedback: 'up' | 'down') => void;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const copyText = () => {
    if (!message.content) return;
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`chat-msg-row ${isUser ? 'chat-msg-row--user' : 'chat-msg-row--assistant'}`}>
      <div className={`chat-bubble ${isUser ? 'chat-bubble--user' : 'chat-bubble--assistant'}`}>
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
              <div key={i} className={`chat-trail-item ${tool.state === 'done' ? 'chat-trail-item--done' : 'chat-trail-item--running'}`}>
                <span className="chat-trail-dot">{tool.state === 'done' ? '✓' : '○'}</span>
                <span className="chat-trail-name">{tool.name.replace(/_/g, ' ')}…</span>
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
          </div>
        )}

        {/* Message Content */}
        {message.content && (
          <div className="chat-markdown" aria-live={message.isStreaming ? 'polite' : undefined}>
            {renderSafeMarkdown(message.content)}
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

        {/* Assistant Footer Actions */}
        {!isUser && !message.isStreaming && (
          <div className="chat-msg-actions">
            <button
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
                  className={`chat-icon-btn ${message.feedback === 'up' ? 'active' : ''}`}
                  onClick={() => onFeedback(message.id, 'up')}
                  aria-label="Helpful"
                  title="Helpful"
                >
                  <ThumbsUp size={13} />
                </button>
                <button
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
                className="chat-icon-btn"
                onClick={onRegenerate}
                aria-label="Regenerate response"
                title="Regenerate"
              >
                <RotateCcw size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Follow-up Suggestion Chips below assistant message */}
      {!isUser && message.suggestions && message.suggestions.length > 0 && (
        <div className="chat-suggestions-row">
          {message.suggestions.map((suggestion, sIdx) => (
            <button
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
  );
}
