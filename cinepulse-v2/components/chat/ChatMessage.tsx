'use client';

import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../Context';
import {
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  FileText,
  ShieldCheck,
  ShieldAlert,
  Database,
} from 'lucide-react';
import { CinePulseOrb } from './CinePulseOrb';
import { ChatCardDispatcher } from './ChatCards';
import type { ChatMessageUI, PendingActionUI, ChatCard } from '../hooks/useChat';

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|') && !trimmed.includes('-')) return false;
  const cells = splitTableRow(trimmed);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

export interface TitleLinks { names: Array<{ title: string; id: string }>; used: Set<string>; open?: (id: string) => void }

function renderSafeMarkdown(rawText: string, titles?: TitleLinks): React.ReactNode[] {
  if (!rawText) return [];
  // While streaming, an opening ** may not have its partner yet: close it so no raw asterisks flash.
  const text = (rawText.match(/\*\*/g) || []).length % 2 ? `${rawText}**` : rawText;
  const renderFormattedSpans = (t: string) => renderFormattedSpansWith(t, titles);

  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: { type: 'ul' | 'ol'; content: string; key: number; start?: number }[] = [];
  let i = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    const type = listItems[0].type;
    const keyBase = listItems[0].key;
    const start = listItems[0].start;
    const children = listItems.map((item) => (
      <li key={item.key} className="chat-markdown-li">
        {renderFormattedSpans(item.content)}
      </li>
    ));
    nodes.push(
      type === 'ol' ? (
        <ol key={`ol_${keyBase}`} className="chat-markdown-ol" start={start && start > 1 ? start : undefined}>
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

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Markdown table block detection: header row + separator row + >= 1 body rows
    if (
      trimmed.startsWith('|') &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      flushList();
      const headers = splitTableRow(trimmed);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().includes('|')) {
        rows.push(splitTableRow(lines[j]));
        j++;
      }
      nodes.push(
        <div key={`tbl_${i}`} className="chat-markdown-table-wrap">
          <table className="chat-markdown-table">
            <thead>
              <tr>
                {headers.map((h, hIdx) => (
                  <th key={hIdx}>{renderFormattedSpans(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {headers.map((_, cIdx) => (
                    <td key={cIdx}>{renderFormattedSpans(row[cIdx] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      i = j;
      continue;
    }

    // Unordered list
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (listItems.length > 0 && listItems[0].type !== 'ul') flushList();
      listItems.push({ type: 'ul', content: trimmed.slice(2), key: i });
      i++;
      continue;
    }

    // Ordered list
    const olMatch = /^(\d+)\.\s+(.*)$/.exec(trimmed);
    if (olMatch) {
      if (listItems.length > 0 && listItems[0].type !== 'ol') flushList();
      listItems.push({ type: 'ol', content: olMatch[2], key: i, start: Number(olMatch[1]) });
      i++;
      continue;
    }

    // A blank line between items of the same list keeps the list (and its numbering) going.
    if (!trimmed && listItems.length > 0) {
      let k = i + 1;
      while (k < lines.length && !lines[k].trim()) k++;
      const next = (lines[k] || '').trim();
      const sameList = listItems[0].type === 'ol' ? /^\d+\.\s+/.test(next) : next.startsWith('- ') || next.startsWith('* ');
      if (sameList) { i = k; continue; }
    }

    flushList();

    if (!trimmed) {
      nodes.push(<div key={`sp_${i}`} className="chat-markdown-spacer" />);
      i++;
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      nodes.push(<hr key={`hr_${i}`} className="chat-markdown-hr" />);
      i++;
      continue;
    }

    if (trimmed.startsWith('### ')) {
      nodes.push(
        <h4 key={i} className="chat-markdown-h3">
          {renderFormattedSpans(trimmed.slice(4))}
        </h4>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      nodes.push(
        <h4 key={i} className="chat-markdown-h2">
          {renderFormattedSpans(trimmed.slice(3))}
        </h4>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      nodes.push(
        <h4 key={i} className="chat-markdown-h2">
          {renderFormattedSpans(trimmed.slice(2))}
        </h4>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('> ')) {
      nodes.push(
        <blockquote key={i} className="chat-markdown-quote">
          {renderFormattedSpans(trimmed.slice(2))}
        </blockquote>
      );
      i++;
      continue;
    }

    nodes.push(
      <p key={i} className="chat-markdown-p">
        {renderFormattedSpans(rawLine)}
      </p>
    );
    i++;
  }

  flushList();
  return nodes;
}

function renderFormattedSpansWith(text: string, titles?: TitleLinks): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const spoilerRegex = /\|\|([\s\S]*?)\|\|/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = spoilerRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...parseInlineFormatting(text.slice(lastIndex, match.index), titles));
    }
    const spoilerContent = match[1];
    parts.push(<SpoilerSpan key={`sp_${match.index}`} text={spoilerContent} />);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(...parseInlineFormatting(text.slice(lastIndex), titles));
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

function parseInlineFormatting(str: string, titles?: TitleLinks): React.ReactNode[] {
  const segments: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*.*?\*\*|\*[^*]+?\*|\[.*?\]\(.*?\))/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(str)) !== null) {
    if (m.index > last) {
      segments.push(...linkTitles(str.slice(last, m.index), titles, `t${m.index}`));
    }
    const token = m[0];

    if (token.startsWith('`') && token.endsWith('`')) {
      segments.push(
        <code key={`c_${m.index}`} className="chat-inline-code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      segments.push(<strong key={`b_${m.index}`}>{linkTitles(token.slice(2, -2), titles, `bt${m.index}`)}</strong>);
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
    segments.push(...linkTitles(str.slice(last), titles, `te${last}`));
  }

  return segments;
}

/** The first mention of each film from this answer's data becomes a link that opens it. */
function linkTitles(text: string, titles: TitleLinks | undefined, keyBase: string): React.ReactNode[] {
  if (!titles || !titles.names.length || !text) return [text];
  const pending = titles.names.filter((t) => !titles.used.has(t.id) && t.title.length >= 2);
  if (!pending.length) return [text];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${pending.map((t) => esc(t.title)).sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}\\p{N}])`, 'u');
  const out: React.ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest) {
    const m = re.exec(rest);
    if (!m) { out.push(rest); break; }
    const hit = pending.find((t) => t.title === m[1] && !titles.used.has(t.id));
    if (!hit) { out.push(rest); break; }
    titles.used.add(hit.id);
    if (m.index > 0) out.push(rest.slice(0, m.index));
    out.push(
      <a
        key={`${keyBase}_${n++}`}
        className="chat-title-link"
        href={`/?title=${encodeURIComponent(hit.id)}`}
        onClick={(e) => { if (titles.open) { e.preventDefault(); titles.open(hit.id); } }}
      >
        {m[1]}
      </a>
    );
    rest = rest.slice(m.index + m[1].length);
  }
  return out;
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
  get_title_details: 'Title details',
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
  search_titles: 'Catalog search',
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

const CARD_PRIORITY: Record<string, number> = {
  action: 0, compare: 1, forecast: 2, title: 3, pulse: 4, details: 5, contrarian: 6, model_accuracy: 6, accuracy: 6, list: 8,
};

/** Empty evidence (a pulse with no calls, a search with no hits) sinks to the end. */
function cardRank(card: ChatCard): number {
  const d = card.data as Record<string, any>;
  const empty =
    (card.type === 'pulse' && !Number(d.count)) ||
    (card.type === 'list' && Array.isArray(d.items) && d.items.length === 0);
  return empty ? 20 : CARD_PRIORITY[card.type] ?? 7;
}

function cardTitleKey(card: ChatCard): string {
  const d = card.data as Record<string, any>;
  return String(d.titleId ?? d.id ?? d.titleName ?? d.title ?? d.query ?? '');
}

/**
 * Cards are evidence, not the answer: keep one per (kind, title), drop search "lookup" lists whose
 * titles are already shown in richer cards, and order by usefulness.
 */
function curateCards(cards: ChatCard[]): ChatCard[] {
  const seen = new Set<string>();
  const unique: ChatCard[] = [];
  for (const card of cards) {
    if (card.type === 'error' || (card.data as any)?.error) continue;
    const kind = card.type === 'details'
      ? ('directLinks' in card.data || 'subscription' in card.data ? 'watch' : 'consensus')
      : card.type;
    const key = `${kind}:${cardTitleKey(card)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(card);
  }
  const shownIds = new Set(unique.filter((c) => c.type !== 'list').map(cardTitleKey));
  const filtered = unique.filter((c) => {
    if (c.type !== 'list' || c.name !== 'search_titles') return true;
    const items = ((c.data as any)?.items || []) as Array<{ id?: string }>;
    return !(items.length > 0 && items.every((it) => it.id && shownIds.has(it.id)));
  });
  return filtered
    .map((c, i) => ({ c, i }))
    .sort((a, b) => cardRank(a.c) - cardRank(b.c) || a.i - b.i)
    .map(({ c }) => c);
}

function CardStack({
  cards,
  onConfirmAction,
  onCancelAction,
}: {
  cards: ChatCard[];
  onConfirmAction: (action: PendingActionUI) => void | Promise<unknown>;
  onCancelAction: (actionId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const curated = curateCards(cards);
  if (curated.length === 0) return null;
  const VISIBLE = 2;
  const visible = expanded ? curated : curated.slice(0, VISIBLE);
  const hidden = curated.length - visible.length;
  return (
    <div className="chat-cards-container">
      {visible.map((card, idx) => (
        <div key={idx} className="chat-card-enter" style={{ '--i': idx } as React.CSSProperties}>
          <ChatCardDispatcher card={card} onConfirmAction={onConfirmAction} onCancelAction={onCancelAction} />
        </div>
      ))}
      {hidden > 0 && (
        <button type="button" className="chat-cards-more" onClick={() => setExpanded(true)}>
          <ChevronDown size={13} /> Show {hidden} more data card{hidden === 1 ? '' : 's'}
        </button>
      )}
      {expanded && curated.length > VISIBLE && (
        <button type="button" className="chat-cards-more" onClick={() => setExpanded(false)}>
          <ChevronUp size={13} /> Show fewer
        </button>
      )}
    </div>
  );
}

function modelLabel(provider?: string, model?: string): string | null {
  if (provider === 'rule-based') return 'CinePulse data engine';
  if (!model) return provider ? provider[0].toUpperCase() + provider.slice(1) : null;
  return model
    .replace(/^openai\//, '')
    .replace(/-preview$/, '')
    .replace(/^gemini-/, 'Gemini ')
    .replace(/-flash/, ' Flash')
    .replace(/^gpt-oss-/, 'GPT-OSS ');
}

/**
 * The trust strip under every answer: whether its figures match CinePulse data, which sources
 * were consulted (and how fresh they are), which engine wrote it, and how long it took.
 */
function TrustBar({ message }: { message: ChatMessageUI }) {
  const [open, setOpen] = useState(false);
  const v = message.verification;
  const sources =
    message.evidenceTools && message.evidenceTools.length > 0
      ? message.evidenceTools
      : message.cards.map((c) => ({ name: c.name || c.type, source: c.source || c.type, asOf: c.asOf || null }));
  // One row per distinct source.
  const uniqueSources = sources.filter((s, i) => sources.findIndex((x) => x.name === s.name) === i);
  const engine = modelLabel(message.provider, message.model);
  const seconds = message.elapsedMs ? (message.elapsedMs / 1000).toFixed(1) : null;

  let badge: React.ReactNode = null;
  if (v && v.checked > 0 && v.unmatched.length === 0 && v.grounded) {
    badge = (
      <span className="chat-trust-badge is-verified" title="Every figure in this answer matches the data CinePulse returned">
        <ShieldCheck size={12} /> {v.matched}/{v.checked} figures verified
      </span>
    );
  } else if (v && v.checked > 0 && (v.unmatched.length > 0 || !v.grounded)) {
    badge = (
      <span className="chat-trust-badge is-warning" title={`Could not match: ${v.unmatched.join(', ')}`}>
        <ShieldAlert size={12} /> {v.grounded ? `${v.unmatched.length} figure${v.unmatched.length === 1 ? '' : 's'} not in source data` : 'Not backed by CinePulse data'}
      </span>
    );
  } else if (uniqueSources.length > 0) {
    badge = (
      <span className="chat-trust-badge is-neutral">
        <Database size={12} /> Grounded in CinePulse data
      </span>
    );
  }

  if (!badge && !engine) return null;

  return (
    <div className="chat-trust">
      <div className="chat-trust-row">
        {badge}
        {uniqueSources.length > 0 && (
          <button type="button" className="chat-trust-sources" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <FileText size={11} /> {uniqueSources.length} source{uniqueSources.length === 1 ? '' : 's'}
            {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        )}
        <span className="chat-trust-meta">
          {engine && <span>{engine}</span>}
          {message.synthesized && <span title="The model returned no prose; this reply was assembled directly from the data">auto-summary</span>}
          {seconds && <span>{seconds}s</span>}
        </span>
      </div>
      {v && v.unmatched.length > 0 && (
        <p className="chat-trust-note">
          Treat with care: {v.unmatched.map((u) => `“${u}”`).join(', ')} {v.unmatched.length === 1 ? 'was' : 'were'} not found in the data behind this answer.
        </p>
      )}
      {open && (
        <ul className="chat-trust-list">
          {uniqueSources.map((item, i) => (
            <li key={i} style={{ '--i': i } as React.CSSProperties}>
              <span className="chat-trust-dot" aria-hidden="true" />
              <b>{formatToolDisplay(item.name)}</b>
              <span>{item.source.replace(/_/g, ' ')}</span>
              {item.asOf && <time dateTime={item.asOf}>{formatAsOf(item.asOf)}</time>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ChatMessage({
  message,
  isLast,
  isBusy,
  onSuggestionClick,
  onConfirmAction,
  onCancelAction,
  onFeedback,
  onRegenerate,
}: {
  message: ChatMessageUI;
  isLast?: boolean;
  isBusy?: boolean;
  onSuggestionClick?: (suggestion: string) => void;
  onConfirmAction: (action: PendingActionUI) => void | Promise<unknown>;
  onCancelAction: (actionId: string) => void;
  onFeedback?: (messageId: string, feedback: 'up' | 'down') => void;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const timeLabel = formatMessageTime(message.createdAt, message.id);
  const app = useContext(AppContext);

  // Films this answer's tools returned: their names in the text become links that open them.
  const titleNames = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of message.cards || []) {
      const d = (c.data || {}) as any;
      const add = (id: unknown, title: unknown) => { if (typeof id === 'string' && typeof title === 'string' && title.trim() && !seen.has(id)) seen.set(id, title.trim()); };
      add(d.id ?? d.titleId, d.title ?? d.titleName);
      if (Array.isArray(d.items)) for (const it of d.items.slice(0, 8)) add(it?.id, it?.title);
      if (d.a && d.b) { add(d.a.id, d.a.title); add(d.b.id, d.b.title); }
    }
    return [...seen.entries()].map(([id, title]) => ({ id, title }));
  }, [message.cards]);
  // Re-parsed only when the text or the films change (not on every unrelated re-render).
  const markdown = useMemo(
    () => renderSafeMarkdown(message.content, { names: titleNames, used: new Set(), open: app?.openTitle ? (id: string) => app.openTitle(id) : undefined }),
    [message.content, titleNames, app]
  );

  const copyText = () => {
    if (!message.content) return;
    void navigator.clipboard.writeText(message.content).then(() => {
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
          {/* Live Evidence Trail while streaming */}
          {!isUser && message.isStreaming && message.toolTrace && message.toolTrace.length > 0 && (
            <div className="chat-tool-trail" aria-label="Checking data sources">
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
              <span className="chat-typing-label">
                {message.toolTrace?.length ? 'Reading the results…' : 'Understanding your question…'}
              </span>
            </div>
          )}

          {/* Message Content */}
          {message.content && (
            <div className="chat-markdown">
              {markdown}
              {message.isStreaming && <span className="chat-stream-cursor" aria-hidden="true" />}
            </div>
          )}

          {!isUser && !message.isStreaming && message.toolTrace && message.toolTrace.length > 0 && (
            <details className="chat-trail-done">
              <summary>How I got this · {message.toolTrace.length} {message.toolTrace.length === 1 ? 'source' : 'sources'} checked</summary>
              <ul>
                {message.toolTrace.map((tool, i) => (
                  <li key={i}><CheckCircle2 size={11} /> {formatToolDisplay(tool.name)}{tool.asOf ? <span> · {formatAsOf(tool.asOf)}</span> : null}</li>
                ))}
              </ul>
            </details>
          )}

          {message.error && (
            <div className="chat-error" role="alert">
              <span>{message.error}</span>
              {message.retryable && isLast && onRegenerate && (
                <button type="button" onClick={onRegenerate}>Retry</button>
              )}
            </div>
          )}

          {/* Rich Tool Cards */}
          {message.cards && message.cards.length > 0 && (
            <CardStack cards={message.cards} onConfirmAction={onConfirmAction} onCancelAction={onCancelAction} />
          )}

          {/* Trust strip: fact check, sources, engine, latency */}
          {!isUser && !message.isStreaming && message.content && <TrustBar message={message} />}

          {/* Assistant Footer Actions */}
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

        {/* Follow-up Suggestion Chips */}
        {!isUser && !message.isStreaming && message.suggestions && message.suggestions.length > 0 && (
          <div className="chat-suggestions-row">
            {message.suggestions.map((suggestion, sIdx) => (
              <button
                type="button"
                key={sIdx}
                className="chat-suggestion-chip"
                disabled={isBusy}
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
