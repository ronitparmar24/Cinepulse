'use client';

/**
 * Cinema Journal — the private screening log in the title modal's sidebar.
 *
 * Compact by design so it fits beside the overview and can stay pinned (sticky) while the
 * left column scrolls: status + rating are always visible, and the longer pickers live in
 * three tabs (Log / Experience / Craft). A ring in the header fills as the entry is completed.
 * Everything except the status, rating and diary entry is stored on this device only.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StarRating } from './StarRating';
import { starText } from '@/lib/rating';
import {
  Award, Bookmark, Camera, Check, ChevronRight, Feather, Film, Lock, Music, PenLine, Play, RotateCcw,
  Sparkles, Ticket, Tv, UserCheck, Volume2, Wand2,
} from 'lucide-react';
import type { Title } from '@/lib/types';

const SCREEN_FORMATS = [
  { id: 'imax', label: 'IMAX 70mm', icon: Film },
  { id: 'dolby', label: 'Dolby Atmos', icon: Volume2 },
  { id: '35mm', label: '35mm Print', icon: Camera },
  { id: 'cinema', label: 'Theatrical', icon: Ticket },
  { id: 'home', label: 'Home Theater', icon: Tv },
  { id: '4k', label: '4K OLED', icon: Sparkles },
];

const VIEWING_SETTINGS = [
  { id: 'opening', label: 'Opening night' },
  { id: 'solo', label: 'Late-night solo' },
  { id: 'friends', label: 'With friends' },
  { id: 'fest', label: 'Film festival' },
];

const CRAFT_ASPECTS = [
  { id: 'directing', label: 'Directing', icon: Wand2 },
  { id: 'cinematography', label: 'Cinematography', icon: Camera },
  { id: 'acting', label: 'Acting', icon: UserCheck },
  { id: 'score', label: 'Original score', icon: Music },
  { id: 'screenplay', label: 'Screenplay', icon: Feather },
  { id: 'vfx', label: 'Visual FX', icon: Sparkles },
];

const RATING_VERDICTS: Record<number, string> = {
  1: 'Not for me',
  2: 'Flawed but watchable',
  3: 'Solid cinema',
  4: 'Outstanding craft',
  5: 'Masterpiece',
};

const REWATCH = [
  { id: 'essential', label: 'Essential', icon: RotateCcw, tone: 'yes' },
  { id: 'vault', label: 'Vault classic', icon: Award, tone: 'vault' },
  { id: 'once', label: 'Once is enough', icon: null, tone: 'no' },
] as const;

type JournalTab = 'log' | 'experience' | 'craft';

export interface CinemaJournalSidebarProps {
  title: Title;
  entry?: { status?: string; rating?: number | null };
  canViewStatus: boolean;
  busy: boolean;
  diarySaving: boolean;
  onUpdateStatus: (status: 'watchlist' | 'watching' | 'watched') => void;
  onUpdateRating: (rating: number) => void;
  onLogDiary: (rating: number | null, note: string, date: string) => Promise<void>;
  onOpenTicketStub: () => void;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function CinemaJournalSidebar({
  title,
  entry,
  canViewStatus,
  busy,
  diarySaving,
  onUpdateStatus,
  onUpdateRating,
  onLogDiary,
  onOpenTicketStub,
}: CinemaJournalSidebarProps) {
  const titleId = title.id;
  const expKey = `cp_jnl_exp_${titleId}`;
  const craftKey = `cp_jnl_craft_${titleId}`;
  const quoteKey = `cp_jnl_quote_${titleId}`;
  const rewatchKey = `cp_jnl_rewatch_${titleId}`;

  const [selectedExp, setSelectedExp] = useState<string[]>(() => readJson(expKey, []));
  const [selectedCraft, setSelectedCraft] = useState<string[]>(() => readJson(craftKey, []));
  const [quote, setQuote] = useState<string>(() => {
    try { return localStorage.getItem(quoteKey) || ''; } catch { return ''; }
  });
  const [rewatch, setRewatch] = useState<string | null>(() => {
    try { return localStorage.getItem(rewatchKey) || null; } catch { return null; }
  });
  const [savedLocal, setSavedLocal] = useState(false);
  const [watchedOn, setWatchedOn] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [tab, setTab] = useState<JournalTab>('log');
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ticketRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
  }, []);

  function toggleChip(list: string[], setList: (l: string[]) => void, key: string, id: string) {
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    setList(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable */ }
  }

  function handleQuoteChange(val: string) {
    setQuote(val);
    try {
      localStorage.setItem(quoteKey, val);
      setSavedLocal(true);
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
      quoteTimer.current = setTimeout(() => setSavedLocal(false), 1800);
    } catch { /* storage unavailable */ }
  }

  function handleRewatchPick(val: string) {
    const next = rewatch === val ? null : val;
    setRewatch(next);
    try {
      if (next) localStorage.setItem(rewatchKey, next);
      else localStorage.removeItem(rewatchKey);
    } catch { /* storage unavailable */ }
  }

  async function handleLogVerdict() {
    // A diary entry needs only a date; the rating and the one-line verdict are optional.
    await onLogDiary(entry?.rating ?? null, quote.trim(), watchedOn);
  }

  // Ticket tilt via CSS variables (no re-render per mouse move).
  function tiltTicket(e: React.MouseEvent<HTMLDivElement>) {
    const el = ticketRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--tx', `${(x * 10).toFixed(2)}deg`);
    el.style.setProperty('--ty', `${(-y * 10).toFixed(2)}deg`);
    el.style.setProperty('--hx', `${((x + 0.5) * 100).toFixed(1)}%`);
  }
  function resetTicket() {
    const el = ticketRef.current;
    if (!el) return;
    el.style.setProperty('--tx', '0deg');
    el.style.setProperty('--ty', '0deg');
  }

  const rating = entry?.rating ?? 0;
  const statuses = [
    { val: 'watchlist' as const, label: 'Watchlist', Icon: Bookmark, locked: false },
    { val: 'watching' as const, label: 'Watching', Icon: Play, locked: !canViewStatus },
    { val: 'watched' as const, label: 'Watched', Icon: Check, locked: !canViewStatus },
  ];
  const statusIndex = statuses.findIndex((s) => s.val === entry?.status);

  // Completion ring: how much of the entry has been filled in.
  const steps = canViewStatus
    ? [Boolean(entry?.status), rating > 0, selectedExp.length > 0, selectedCraft.length > 0, quote.trim().length > 0, Boolean(rewatch)]
    : [Boolean(entry?.status), selectedExp.length > 0, selectedCraft.length > 0, quote.trim().length > 0];
  const done = steps.filter(Boolean).length;
  const pct = done / steps.length;
  const hasLog = done > 0;
  const ringR = 17;
  const ringC = 2 * Math.PI * ringR;

  const tabs: { id: JournalTab; label: string; count: number }[] = [
    { id: 'log', label: 'Log', count: (quote.trim() ? 1 : 0) + (rewatch ? 1 : 0) },
    { id: 'experience', label: 'Experience', count: selectedExp.length },
    { id: 'craft', label: 'Craft', count: selectedCraft.length },
  ];
  const tabIndex = tabs.findIndex((t) => t.id === tab);

  return (
    <aside className="jx ovx-spot" aria-label="Cinema Journal">
      {/* Header */}
      <header className="jx-head">
        <div className="jx-ring" role="img" aria-label={`Journal ${done} of ${steps.length} complete`}>
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle className="jx-ring-track" cx="20" cy="20" r={ringR} />
            <circle className="jx-ring-value" cx="20" cy="20" r={ringR} style={{ strokeDasharray: ringC, strokeDashoffset: ringC * (1 - pct) }} />
          </svg>
          <Film size={14} strokeWidth={2.4} />
        </div>
        <div className="jx-head-text">
          <h4>Cinema Journal</h4>
          <p>{hasLog ? `${done} of ${steps.length} details logged` : 'Your private screening log'}</p>
        </div>
        <span className={`jx-state ${hasLog ? 'is-on' : ''}`}>
          {hasLog ? <><Check size={11} strokeWidth={3} /> Logged</> : 'Unlogged'}
        </span>
      </header>

      {/* Status: segmented control with a sliding thumb */}
      <div
        className={`jx-segment ${statusIndex >= 0 ? 'has-value' : ''}`}
        role="radiogroup"
        aria-label="Watch status"
        style={{ '--idx': Math.max(0, statusIndex) } as React.CSSProperties}
      >
        <span className="jx-segment-thumb" aria-hidden="true" />
        {statuses.map(({ val, label, Icon, locked }) => {
          const active = entry?.status === val;
          return (
            <button
              key={val}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={busy || locked}
              onClick={() => onUpdateStatus(val)}
              className={`jx-segment-btn ${active ? 'is-active' : ''} ${locked ? 'is-locked' : ''}`}
              title={locked ? 'Unlocks on release day' : label}
            >
              {locked ? <Lock size={11} /> : <Icon size={12} strokeWidth={2.4} />}
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Rating */}
      {canViewStatus ? (
        <div className="jx-rating">
          <StarRating
            value={rating}
            onChange={(next) => { if (next > 0) onUpdateRating(next); }}
            disabled={busy}
            allowClear={false}
            label="Your private rating"
            size={24}
          />
          <div className="jx-rating-text" key={rating}>
            <b>{rating > 0 ? rating.toFixed(1) : '–'}<small>/5</small></b>
            <span>{rating > 0 ? `${starText(rating)} · ${RATING_VERDICTS[Math.ceil(rating)] ?? ''}` : 'Tap a star to score'}</span>
          </div>
        </div>
      ) : (
        <p className="jx-note"><Lock size={12} /> Watching, rating and diary unlock on release day.</p>
      )}

      {/* Tabs */}
      <div className="jx-tabs" role="tablist" aria-label="Journal sections" style={{ '--tab': tabIndex } as React.CSSProperties}>
        <span className="jx-tabs-thumb" aria-hidden="true" />
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'is-active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count > 0 && <i>{t.count}</i>}
          </button>
        ))}
      </div>

      <div className="jx-panel" key={tab} role="tabpanel">
        {tab === 'log' && (
          <>
            <div className="jx-quote">
              <PenLine size={13} className="jx-quote-icon" aria-hidden="true" />
              <input
                type="text"
                value={quote}
                onChange={(e) => handleQuoteChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canViewStatus) void handleLogVerdict(); }}
                placeholder="Your one-line verdict…"
                maxLength={140}
                aria-label="Capsule verdict"
              />
              <span className={`jx-quote-meta ${savedLocal ? 'is-saved' : ''}`}>
                {savedLocal ? <><Check size={10} strokeWidth={3} /> Saved</> : `${quote.length}/140`}
              </span>
            </div>
            <div className="jx-log-row">
              {canViewStatus && (
                <label className="jx-date">
                  <span>Watched</span>
                  <input
                    type="date"
                    value={watchedOn}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setWatchedOn(e.target.value)}
                  />
                </label>
              )}
              <button
                type="button"
                disabled={diarySaving || !canViewStatus}
                onClick={handleLogVerdict}
                className="jx-log-btn"
                title={canViewStatus ? 'Add a dated entry to your diary' : 'You can log a film after its release'}
              >
                {diarySaving ? 'Saving…' : 'Log to diary'}
              </button>
            </div>
            {canViewStatus && (
              <div className="jx-rewatch" role="group" aria-label="Rewatch verdict">
                {REWATCH.map(({ id, label, icon: Icon, tone }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleRewatchPick(id)}
                    aria-pressed={rewatch === id}
                    className={`jx-pill tone-${tone} ${rewatch === id ? 'is-active' : ''}`}
                  >
                    {Icon && <Icon size={11} />}
                    {label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'experience' && (
          <>
            <span className="jx-sub">Format</span>
            <div className="jx-chips">
              {SCREEN_FORMATS.map(({ id, label, icon: Icon }, i) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selectedExp.includes(id)}
                  onClick={() => toggleChip(selectedExp, setSelectedExp, expKey, id)}
                  className={`jx-pill ${selectedExp.includes(id) ? 'is-active' : ''}`}
                  style={{ '--i': i } as React.CSSProperties}
                >
                  <Icon size={11} strokeWidth={2.2} />
                  {label}
                </button>
              ))}
            </div>
            <span className="jx-sub">Setting</span>
            <div className="jx-chips">
              {VIEWING_SETTINGS.map(({ id, label }, i) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selectedExp.includes(id)}
                  onClick={() => toggleChip(selectedExp, setSelectedExp, expKey, id)}
                  className={`jx-pill ${selectedExp.includes(id) ? 'is-active' : ''}`}
                  style={{ '--i': i + 6 } as React.CSSProperties}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {tab === 'craft' && (
          <>
            <span className="jx-sub">What stood out?</span>
            <div className="jx-chips">
              {CRAFT_ASPECTS.map(({ id, label, icon: Icon }, i) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selectedCraft.includes(id)}
                  onClick={() => toggleChip(selectedCraft, setSelectedCraft, craftKey, id)}
                  className={`jx-pill ${selectedCraft.includes(id) ? 'is-active' : ''}`}
                  style={{ '--i': i } as React.CSSProperties}
                >
                  <Icon size={11} strokeWidth={2.2} />
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Collectible ticket */}
      <div
        ref={ticketRef}
        className="jx-ticket"
        onMouseMove={tiltTicket}
        onMouseLeave={resetTicket}
        onClick={onOpenTicketStub}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenTicketStub();
          }
        }}
        aria-label={`Open your collectible ticket for ${title.title}`}
      >
        <span className="jx-ticket-holo" aria-hidden="true" />
        <div className="jx-ticket-main">
          <span className="jx-ticket-badge"><Ticket size={10} /> Collectible pass</span>
          <b>{title.title}</b>
          <small>Row E · Seat 12 · Admit one</small>
        </div>
        <div className="jx-ticket-stub">
          <span>#CP-{title.id.slice(-4).toUpperCase()}</span>
          <ChevronRight size={15} />
        </div>
      </div>

      <p className="jx-privacy"><Lock size={11} /> Private to this device unless you share it as a review.</p>
    </aside>
  );
}
