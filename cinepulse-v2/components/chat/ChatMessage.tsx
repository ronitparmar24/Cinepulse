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
} from 'lucide-react';
import { ChatCardDispatcher } from './ChatCards';
import type { ChatMessageUI, PendingActionUI } from '../hooks/useChat';

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

  // Derive citation evidence chips from cards
  const evidenceChips: string[] = [];
  for (const card of message.cards || []) {
    if (card.type === 'pulse' && (card.data as any)?.count) {
      evidenceChips.push(`${(card.data as any).count} Community Calls`);
    } else if (card.type === 'forecast' && (card.data as any)?.confidence) {
      evidenceChips.push(`Model ${(card.data as any).confidence} Confidence`);
    } else if (card.type === 'title') {
      evidenceChips.push('TMDB Verified');
    }
  }

  return (
    <div className={`chat-msg-row ${isUser ? 'chat-msg-row--user' : 'chat-msg-row--assistant'}`}>
      <div className={`chat-bubble ${isUser ? 'chat-bubble--user' : 'chat-bubble--assistant'}`}>
        {!isUser && message.provider === 'rule-based' && (
          <div className="chat-badge chat-badge--lite">
            <Zap size={11} />
            <span>Lite mode</span>
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

        {/* Evidence Chips */}
        {evidenceChips.length > 0 && (
          <div className="chat-evidence-row">
            {evidenceChips.map((chip, i) => (
              <span key={i} className="chat-evidence-chip">
                {chip}
              </span>
            ))}
          </div>
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
