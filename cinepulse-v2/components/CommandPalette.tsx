'use client';
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  Search,
  X,
  Compass,
  TrendingUp,
  ShieldCheck,
  Zap,
  Globe,
  Film,
  Tv,
  ArrowRight,
  Clock,
  Trash2,
  Users,
  Trophy,
  Activity,
  Flame,
  CornerDownLeft,
} from 'lucide-react';
import { api } from './client';
import type { UnifiedSearchResult, UnifiedActionItem } from '@/lib/unifiedSearch';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTitle: (titleId: string) => void;
  onNavigate: (view: any) => void;
  region: string;
  onToggleRegion: () => void;
}

const RECENT_SEARCHES_KEY = 'cinepulse_recent_searches_v1';

export function CommandPalette({
  isOpen,
  onClose,
  onOpenTitle,
  onNavigate,
  region,
  onToggleRegion,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnifiedSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  // Answers per query for this session: backspacing or retyping is instant.
  const answers = useRef(new Map<string, UnifiedSearchResult>());
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'titles' | 'actions' | 'receipts'>('all');

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Esc, Cancel and the backdrop play a short fade/scale-out before the palette unmounts.
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  // One highlight slides between rows (measured from the active row) instead of each row
  // switching its own background.
  const [highlight, setHighlight] = useState<{ y: number; h: number } | null>(null);

  const requestClose = useCallback(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      onClose();
      return;
    }
    setClosing(true);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(onClose, 150);
  }, [onClose]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored).slice(0, 5));
      }
    } catch {
      // LocalStorage access non-fatal
    }
  }, []);

  // Save a search term to recents
  const saveRecent = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches(prev => {
      const next = [trimmed, ...prev.filter(x => x.toLowerCase() !== trimmed.toLowerCase())].slice(0, 5);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Clear recents
  const clearRecents = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      // ignore
    }
  };

  // Focus input when opened & lock scroll
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  // Fetch search results (debounced)
  useEffect(() => {
    if (!isOpen) return;

    const key = query.trim().toLowerCase();
    const known = answers.current.get(key);
    if (known) { setResults(known); setLoading(false); setFailed(false); setActiveIndex(0); return; }

    let canceled = false;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);

    // Wait for a short pause in typing, then ask once; a newer keystroke cancels the older request.
    const timer = setTimeout(() => {
      api<UnifiedSearchResult>(`/search/unified?q=${encodeURIComponent(query.trim())}&limit=8`, 'GET', undefined, controller.signal)
        .then(res => {
          if (canceled) return;
          answers.current.set(key, res);
          if (answers.current.size > 60) answers.current.delete(answers.current.keys().next().value as string);
          setResults(res);
          setActiveIndex(0);
        })
        .catch((e) => {
          // Keep whatever is on screen; only say so when nothing could be shown.
          if (!canceled && (e as Error)?.name !== 'AbortError') setFailed(true);
        })
        .finally(() => {
          if (!canceled) setLoading(false);
        });
    }, query ? 260 : 0);

    return () => {
      canceled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, isOpen, retry]);

  // Compute flattened navigable list based on active filter tab
  const flattenedItems = useCallback(() => {
    if (!results) return [];
    const items: Array<{
      type: 'action' | 'title' | 'receipt';
      item: any;
      id: string;
    }> = [];

    if (filterTab === 'all' || filterTab === 'actions') {
      for (const act of results.actions || []) {
        items.push({ type: 'action', item: act, id: `act-${act.id}` });
      }
    }

    if (filterTab === 'all' || filterTab === 'titles') {
      for (const t of results.titles || []) {
        items.push({ type: 'title', item: t, id: `title-${t.id}` });
      }
    }

    if (filterTab === 'all' || filterTab === 'receipts') {
      for (const r of results.receipts || []) {
        items.push({ type: 'receipt', item: r, id: `receipt-${r.id}` });
      }
    }

    return items;
  }, [results, filterTab]);

  const items = flattenedItems();

  // Selection handler
  const handleSelect = (entry: { type: 'action' | 'title' | 'receipt'; item: any }) => {
    if (query.trim()) {
      saveRecent(query.trim());
    }

    if (entry.type === 'title') {
      onOpenTitle(entry.item.id);
      onClose();
    } else if (entry.type === 'receipt') {
      if (entry.item.titleId) {
        onOpenTitle(entry.item.titleId);
      } else {
        onNavigate('receipts');
      }
      onClose();
    } else if (entry.type === 'action') {
      const act = entry.item as UnifiedActionItem;
      if (act.actionType === 'toggle-region') {
        onToggleRegion();
      } else if (act.actionType === 'navigate') {
        onNavigate(act.target);
      }
      onClose();
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      requestClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (items.length > 0 ? (prev + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (items.length > 0 ? (prev - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[activeIndex]) {
        handleSelect(items[activeIndex]);
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(`[data-palette-index="${activeIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const itemKey = items.map((entry) => entry.id).join('|');
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-palette-index="${activeIndex}"]`);
    setHighlight(el ? { y: el.offsetTop, h: el.offsetHeight } : null);
  }, [activeIndex, itemKey, query, recentSearches.length]);

  if (!isOpen) return null;
  const activeId = items[activeIndex] ? `cp-option-${activeIndex}` : undefined;

  return (
    <div
      className={`command-palette-backdrop${closing ? ' is-closing' : ''}`}
      onClick={e => {
        if (e.target === e.currentTarget) requestClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(3, 7, 12, 0.78)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '80px 16px 24px',
      }}
    >
      <div
        className="command-palette-card glass"
        role="dialog"
        aria-modal="true"
        aria-label="Search CinePulse"
        onKeyDown={handleKeyDown}
        style={{
          width: '100%',
          maxWidth: 640,
          background: '#0d131a',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '18px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(16, 185, 129, 0.12)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 120px)',
        }}
      >
        {/* Search Input Bar */}
        <div
          className="cp-search-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <Search size={20} style={{ color: 'var(--mint, #10b981)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search movies, series, receipts, or type an action…"
            role="combobox"
            aria-label="Search movies, series, receipts and actions"
            aria-expanded={items.length > 0}
            aria-controls="cp-results"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f8fafc',
              fontSize: '16px',
              fontFamily: 'inherit',
            }}
          />
          {loading && (
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                border: '2px solid rgba(16, 185, 129, 0.2)',
                borderTopColor: '#10b981',
                animation: 'spin 0.6s linear infinite',
              }}
            />
          )}
          {query ? (
            <button
              onClick={() => setQuery('')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: 4,
              }}
              aria-label="Clear query"
            >
              <X size={16} />
            </button>
          ) : (
            <kbd
              className="cp-esc"
              style={{
                fontSize: '12px',
                padding: '3px 7px',
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                color: '#94a3b8',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              ESC
            </kbd>
          )}
          <button type="button" className="cp-cancel" onClick={requestClose}>
            Cancel
          </button>
        </div>

        {/* Filter Pills */}
        <div
          className="cp-filters"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            background: 'rgba(0, 0, 0, 0.2)',
            fontSize: '12px',
          }}
        >
          {(['all', 'titles', 'actions', 'receipts'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              className={`cp-filter${filterTab === tab ? ' is-on' : ''}`}
              aria-pressed={filterTab === tab}
              onClick={() => {
                setFilterTab(tab);
                setActiveIndex(0);
              }}
              style={{
                padding: '4px 10px',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                background: filterTab === tab ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                color: filterTab === tab ? 'var(--mint, #10b981)' : '#94a3b8',
                fontWeight: filterTab === tab ? 600 : 400,
                transition: 'all 0.15s ease',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}

          {/* Region Indicator Pill */}
          <div className="cp-region" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: '#64748b' }}>
            <Globe size={12} />
            <span>Region: {region}</span>
          </div>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          id="cp-results"
          role="listbox"
          aria-label="Results"
          className="cp-list"
          style={{
            position: 'relative',
            overflowY: 'auto',
            padding: '8px 12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <span
            className={`cp-highlight${highlight ? ' is-on' : ''}`}
            style={highlight ? { transform: `translateY(${highlight.y}px)`, height: highlight.h } : undefined}
            aria-hidden="true"
          />
          {/* Recent Searches (when query is empty) */}
          {!query && recentSearches.length > 0 && (
            <div className="cp-recent" role="presentation" style={{ marginBottom: 12, padding: '4px 8px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', fontWeight: 600 }}>
                  Recent Searches
                </span>
                <button
                  type="button"
                  onClick={clearRecents}
                  aria-label="Clear recent searches"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Trash2 size={11} /> Clear
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {recentSearches.map((term, i) => (
                  <button
                    key={term}
                    type="button"
                    className="cp-recent-chip"
                    onClick={() => {
                      setQuery(term);
                      inputRef.current?.focus();
                    }}
                    style={{
                      '--i': i,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#cbd5e1',
                      fontSize: '12px',
                      cursor: 'pointer',
                    } as React.CSSProperties}
                  >
                    <Clock size={12} style={{ color: '#94a3b8' }} />
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Render Items */}
          {items.map((entry, idx) => {
            const isSelected = idx === activeIndex;

            if (entry.type === 'action') {
              const act = entry.item as UnifiedActionItem;
              return (
                <div
                  key={entry.id}
                  id={`cp-option-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  className={`cp-row${isSelected ? ' is-active' : ''}`}
                  data-palette-index={idx}
                  onClick={() => handleSelect(entry)}
                  onMouseMove={() => { if (!isSelected) setActiveIndex(idx); }}
                  style={{
                    '--i': Math.min(idx, 12),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid transparent',
                    cursor: 'pointer',
                  } as React.CSSProperties}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '8px',
                        background: isSelected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isSelected ? 'var(--mint, #10b981)' : '#94a3b8',
                      }}
                    >
                      {act.actionType === 'toggle-region' ? <Globe size={16} /> : <Compass size={16} />}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: isSelected ? '#ffffff' : '#f1f5f9' }}>
                        {act.label}
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>{act.description}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      className="cp-category"
                      style={{
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        color: '#94a3b8',
                      }}
                    >
                      {act.category}
                    </span>
                    {isSelected && <CornerDownLeft size={14} style={{ color: 'var(--mint, #10b981)' }} />}
                  </div>
                </div>
              );
            }

            if (entry.type === 'title') {
              const t = entry.item;
              return (
                <div
                  key={entry.id}
                  id={`cp-option-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  className={`cp-row${isSelected ? ' is-active' : ''}`}
                  data-palette-index={idx}
                  onClick={() => handleSelect(entry)}
                  onMouseMove={() => { if (!isSelected) setActiveIndex(idx); }}
                  style={{
                    '--i': Math.min(idx, 12),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid transparent',
                    cursor: 'pointer',
                  } as React.CSSProperties}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    {t.poster ? (
                      <img
                        src={t.poster}
                        alt={t.title}
                        style={{
                          width: 32,
                          height: 48,
                          objectFit: 'cover',
                          borderRadius: '6px',
                          background: '#1e293b',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 32,
                          height: 48,
                          borderRadius: '6px',
                          background: '#1e293b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          color: '#64748b',
                        }}
                      >
                        {t.mediaType === 'tv' ? <Tv size={16} /> : <Film size={16} />}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: isSelected ? '#ffffff' : '#f1f5f9',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {t.title}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#94a3b8',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span style={{ textTransform: 'capitalize' }}>{t.mediaType}</span>
                        {t.releaseDate && <span>· {t.releaseDate.slice(0, 4)}</span>}
                        {t.rating ? <span>· ★ {t.rating.toFixed(1)}</span> : null}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {isSelected && <CornerDownLeft size={14} style={{ color: 'var(--mint, #10b981)' }} />}
                  </div>
                </div>
              );
            }

            if (entry.type === 'receipt') {
              const r = entry.item;
              return (
                <div
                  key={entry.id}
                  id={`cp-option-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  className={`cp-row${isSelected ? ' is-active' : ''}`}
                  data-palette-index={idx}
                  onClick={() => handleSelect(entry)}
                  onMouseMove={() => { if (!isSelected) setActiveIndex(idx); }}
                  style={{
                    '--i': Math.min(idx, 12),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid transparent',
                    cursor: 'pointer',
                  } as React.CSSProperties}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '8px',
                        background: r.verdict === 'called' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: r.verdict === 'called' ? '#10b981' : '#f43f5e',
                      }}
                    >
                      <ShieldCheck size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: isSelected ? '#ffffff' : '#f1f5f9' }}>
                        {r.titleName}
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                        Verdict: {r.verdict.toUpperCase()} · Predicted {(r.predictedProbability * 100).toFixed(0)}%
                        {r.actualRevenue ? ` · $${Math.round(r.actualRevenue / 1_000_000)}M Actual` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      className="cp-category"
                      style={{
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: r.verdict === 'called' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                        color: r.verdict === 'called' ? '#10b981' : '#f43f5e',
                        fontWeight: 600,
                      }}
                    >
                      {r.verdict}
                    </span>
                    {isSelected && <CornerDownLeft size={14} style={{ color: 'var(--mint, #10b981)' }} />}
                  </div>
                </div>
              );
            }

            return null;
          })}

          {items.length === 0 && loading && (
            <div className="cp-searching" role="status" style={{ padding: '28px 20px', textAlign: 'center', color: '#8fa39b', fontSize: 13.5 }}>
              Searching films, series and receipts…
            </div>
          )}

          {failed && items.length === 0 && !loading && (
            <div role="alert" style={{ padding: '30px 20px', textAlign: 'center', color: '#fca5a5' }}>
              <p style={{ fontSize: '14px', margin: 0 }}>Couldn&apos;t search right now.</p>
              <button type="button" className="text-link" style={{ marginTop: 8 }} onClick={() => { answers.current.delete(query.trim().toLowerCase()); setRetry((n) => n + 1); }}>Try again</button>
            </div>
          )}

          {items.length === 0 && !loading && !failed && (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: '#64748b' }}>
              <p style={{ fontSize: '14px', margin: 0 }}>No matching cinema or actions found for "{query}"</p>
              <p style={{ fontSize: '12px', marginTop: 6, color: '#475569' }}>
                Try searching for movie titles, box office predictions, or actions like "switch region"
              </p>
            </div>
          )}
        </div>

        {/* Footer Hints */}
        <div
          className="cp-footer"
          style={{
            padding: '10px 18px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#64748b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span>
              <kbd style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '2px 5px', borderRadius: 4, color: '#cbd5e1' }}>↑↓</kbd> navigate
            </span>
            <span>
              <kbd style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '2px 5px', borderRadius: 4, color: '#cbd5e1' }}>↵</kbd> select
            </span>
            <span>
              <kbd style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '2px 5px', borderRadius: 4, color: '#cbd5e1' }}>esc</kbd> close
            </span>
          </div>
          <div>
            <span>CinePulse Command Palette</span>
          </div>
        </div>
      </div>
    </div>
  );
}
