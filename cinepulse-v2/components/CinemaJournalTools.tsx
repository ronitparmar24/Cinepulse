'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Bookmark,
  Play,
  Check,
  Star,
  Ticket,
  Sparkles,
  RotateCcw,
  Sliders,
  Tv,
  Volume2,
  Film,
  Camera,
  Music,
  UserCheck,
  Feather,
  Wand2,
  Award,
  ChevronRight,
  Lock,
} from 'lucide-react';
import type { Title } from '@/lib/types';

// ─── Format & Atmosphere Chips ────────────────────────────────────────────────
const SCREEN_FORMATS = [
  { id: 'imax',     label: 'IMAX 70mm',     icon: Film },
  { id: 'dolby',    label: 'Dolby Atmos',   icon: Volume2 },
  { id: '35mm',     label: '35mm Print',    icon: Camera },
  { id: 'cinema',   label: 'Theatrical',    icon: Ticket },
  { id: 'home',     label: 'Home Theater',  icon: Tv },
  { id: '4k',       label: '4K OLED',       icon: Sparkles },
];

const VIEWING_SETTINGS = [
  { id: 'opening',  label: 'Opening Night' },
  { id: 'solo',     label: 'Late Night Solo' },
  { id: 'friends',  label: 'With Friends' },
  { id: 'fest',     label: 'Film Festival' },
];

// ─── Film Superlative / Standout Craft ────────────────────────────────────────
const CRAFT_ASPECTS = [
  { id: 'directing',      label: 'Directing',      icon: Wand2 },
  { id: 'cinematography', label: 'Cinematography', icon: Camera },
  { id: 'acting',         label: 'Acting',         icon: UserCheck },
  { id: 'score',          label: 'Original Score', icon: Music },
  { id: 'screenplay',     label: 'Screenplay',     icon: Feather },
  { id: 'vfx',            label: 'Visual FX',      icon: Sparkles },
];

// ─── Score Labels ─────────────────────────────────────────────────────────────
const RATING_VERDICTS: Record<number, string> = {
  1: '1.0 · Not for me',
  2: '2.0 · Flawed but watchable',
  3: '3.0 · Solid cinema',
  4: '4.0 · Outstanding craft',
  5: '5.0 · Masterpiece Vault',
};

export interface CinemaJournalSidebarProps {
  title: Title;
  entry?: { status?: string; rating?: number | null };
  canViewStatus: boolean;
  busy: boolean;
  diarySaving: boolean;
  onUpdateStatus: (status: 'watchlist' | 'watching' | 'watched') => void;
  onUpdateRating: (rating: number) => void;
  onLogDiary: (rating: number, note: string, date: string) => Promise<void>;
  onOpenTicketStub: () => void;
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

  // Local storage keys
  const expKey = `cp_jnl_exp_${titleId}`;
  const craftKey = `cp_jnl_craft_${titleId}`;
  const quoteKey = `cp_jnl_quote_${titleId}`;
  const rewatchKey = `cp_jnl_rewatch_${titleId}`;

  // State
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [selectedExp, setSelectedExp] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(expKey) || '[]'); } catch { return []; }
  });
  const [selectedCraft, setSelectedCraft] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(craftKey) || '[]'); } catch { return []; }
  });
  const [quote, setQuote] = useState<string>(() => {
    try { return localStorage.getItem(quoteKey) || ''; } catch { return ''; }
  });
  const [rewatch, setRewatch] = useState<string | null>(() => {
    try { return localStorage.getItem(rewatchKey) || null; } catch { return null; }
  });
  const [savedLocal, setSavedLocal] = useState<boolean>(false);
  const quoteTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync helpers
  function toggleChip(list: string[], setList: (l: string[]) => void, key: string, id: string) {
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    setList(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
  }

  function handleQuoteChange(val: string) {
    setQuote(val);
    try {
      localStorage.setItem(quoteKey, val);
      setSavedLocal(true);
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
      quoteTimerRef.current = setTimeout(() => setSavedLocal(false), 2000);
    } catch { /* ignore */ }
  }

  function handleRewatchPick(val: string) {
    const next = rewatch === val ? null : val;
    setRewatch(next);
    try {
      if (next) localStorage.setItem(rewatchKey, next);
      else localStorage.removeItem(rewatchKey);
    } catch { /* ignore */ }
  }

  async function handleLogVerdict() {
    if (!quote.trim()) return;
    const currentRating = entry?.rating ?? 4;
    await onLogDiary(currentRating, quote.trim(), new Date().toISOString().slice(0, 10));
  }

  const effectiveRating = hoverRating !== null ? hoverRating : (entry?.rating ?? 0);
  const hasLog = Boolean(entry?.status || entry?.rating || quote || selectedExp.length > 0);

  return (
    <aside className="cinema-journal-card">
      {/* ── 1. Header ── */}
      <div className="cj-header">
        <div className="cj-title-wrap">
          <div className="cj-icon-orb">
            <Film size={16} strokeWidth={2.5} />
          </div>
          <div>
            <h4 className="cj-title">Cinema Journal</h4>
            <p className="cj-subtitle">Private cinephile screening log</p>
          </div>
        </div>
        <span className="cj-entry-counter">
          {hasLog ? 'Logged ✓' : 'Unlogged'}
        </span>
      </div>

      {/* ── 2. Watch Status (Segmented Tabs) ── */}
      <div className="cj-block">
        <span className="cj-label">Watch Status</span>
        <div className="cj-status-bar">
          {(
            [
              { val: 'watchlist' as const, label: 'Want to Watch', Icon: Bookmark, locked: false },
              { val: 'watching'  as const, label: 'Watching',      Icon: Play,     locked: !canViewStatus },
              { val: 'watched'   as const, label: 'Watched',       Icon: Check,    locked: !canViewStatus },
            ]
          ).map(({ val, label, Icon, locked }) => {
            const isActive = entry?.status === val;
            return (
              <button
                key={val}
                type="button"
                disabled={busy || locked}
                onClick={() => onUpdateStatus(val)}
                className={`cj-status-btn${isActive ? ' active' : ''}${locked ? ' locked' : ''}`}
                title={locked ? 'Unlocks after release' : label}
              >
                <Icon size={12} strokeWidth={2.5} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 3. Interactive Star Rating & Live Verdict ── */}
      {canViewStatus && (
        <div className="cj-block">
          <span className="cj-label">Your Private Rating</span>
          <div className="cj-rating-strip">
            <div
              className="cj-stars-flex"
              onMouseLeave={() => setHoverRating(null)}
            >
              {[1, 2, 3, 4, 5].map((star) => {
                const isLit = effectiveRating >= star;
                const isMasterpiece = effectiveRating === 5 && isLit;
                return (
                  <button
                    key={star}
                    type="button"
                    disabled={busy}
                    onClick={() => onUpdateRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    className={`cj-star-button${isLit ? ' lit' : ''}${isMasterpiece ? ' masterpiece' : ''}`}
                    aria-label={`Rate ${star} star`}
                  >
                    ★
                  </button>
                );
              })}
            </div>

            <div className="cj-rating-text-wrap">
              <div className="cj-rating-score">
                {effectiveRating > 0 ? `${effectiveRating}.0 / 5.0` : 'Not Rated'}
              </div>
              <div className="cj-rating-verdict">
                {RATING_VERDICTS[effectiveRating] || 'Tap to score'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. Screening Experience (Format & Setting) ── */}
      <div className="cj-block">
        <span className="cj-label">Screening Experience</span>
        <div className="cj-chips-grid">
          {SCREEN_FORMATS.map((fmt) => {
            const Icon = fmt.icon;
            const isSelected = selectedExp.includes(fmt.id);
            return (
              <button
                key={fmt.id}
                type="button"
                onClick={() => toggleChip(selectedExp, setSelectedExp, expKey, fmt.id)}
                className={`cj-chip${isSelected ? ' active' : ''}`}
              >
                <Icon size={11} strokeWidth={2.2} />
                <span>{fmt.label}</span>
              </button>
            );
          })}
          {VIEWING_SETTINGS.map((set) => {
            const isSelected = selectedExp.includes(set.id);
            return (
              <button
                key={set.id}
                type="button"
                onClick={() => toggleChip(selectedExp, setSelectedExp, expKey, set.id)}
                className={`cj-chip${isSelected ? ' active' : ''}`}
              >
                <span>{set.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 5. Standout Craft Superlative ── */}
      <div className="cj-block">
        <span className="cj-label">Standout Craft</span>
        <div className="cj-chips-grid">
          {CRAFT_ASPECTS.map((craft) => {
            const Icon = craft.icon;
            const isSelected = selectedCraft.includes(craft.id);
            return (
              <button
                key={craft.id}
                type="button"
                onClick={() => toggleChip(selectedCraft, setSelectedCraft, craftKey, craft.id)}
                className={`cj-chip${isSelected ? ' active' : ''}`}
              >
                <Icon size={11} strokeWidth={2.2} />
                <span>{craft.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 6. The Golden Line / One-Sentence Takeaway ── */}
      <div className="cj-block">
        <div className="cj-block-header">
          <span className="cj-label">Capsule Verdict</span>
          {savedLocal && (
            <span className="cj-saved-tag">
              <Check size={10} strokeWidth={3} /> Saved locally
            </span>
          )}
        </div>
        <div className="cj-quote-card">
          <div className="cj-quote-input-row">
            <span className="cj-quote-mark">“</span>
            <input
              type="text"
              value={quote}
              onChange={(e) => handleQuoteChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLogVerdict();
              }}
              placeholder="One line capturing the film's essence…"
              maxLength={140}
              className="cj-quote-input"
            />
          </div>
          <div className="cj-quote-footer">
            <span className="cj-char-count">{quote.length}/140</span>
            <button
              type="button"
              disabled={diarySaving || !quote.trim()}
              onClick={handleLogVerdict}
              className="cj-log-pill-btn"
            >
              {diarySaving ? 'Saving…' : 'Log to Diary'}
            </button>
          </div>
        </div>
      </div>

      {/* ── 7. Rewatch Verdict ── */}
      {canViewStatus && (
        <div className="cj-block">
          <span className="cj-label">Rewatch Verdict</span>
          <div className="cj-rewatch-row">
            <button
              type="button"
              onClick={() => handleRewatchPick('essential')}
              className={`cj-rewatch-btn yes${rewatch === 'essential' ? ' active' : ''}`}
            >
              <RotateCcw size={10} />
              <span>Essential</span>
            </button>
            <button
              type="button"
              onClick={() => handleRewatchPick('vault')}
              className={`cj-rewatch-btn vault${rewatch === 'vault' ? ' active' : ''}`}
            >
              <Award size={10} />
              <span>Vault Classic</span>
            </button>
            <button
              type="button"
              onClick={() => handleRewatchPick('once')}
              className={`cj-rewatch-btn no${rewatch === 'once' ? ' active' : ''}`}
            >
              <span>Once Enough</span>
            </button>
          </div>
        </div>
      )}

      {/* ── 8. Holographic Collectible Ticket Pass ── */}
      <div
        className="cj-ticket-pass"
        onClick={onOpenTicketStub}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenTicketStub(); }}
        title="Click to view full high-res collectible ticket stub"
      >
        <div className="cj-ticket-pass-top">
          <span className="cj-ticket-badge">
            <Ticket size={10} /> COLLECTIBLE PASS
          </span>
          <span className="cj-ticket-serial">#CP-{(title.id.slice(-4)).toUpperCase()}</span>
        </div>
        <div className="cj-ticket-body">
          <div>
            <div className="cj-ticket-film-title">{title.title}</div>
            <div className="cj-ticket-seat">ROW E · SEAT 12 · ADMIT ONE</div>
          </div>
          <span className="cj-ticket-inspect-callout">
            <span>Inspect</span>
            <ChevronRight size={13} />
          </span>
        </div>
      </div>

      {/* ── 9. Privacy Disclaimer ── */}
      <div className="cj-hint-text">
        🔒 Private to your device. Public only when shared as a review.
      </div>
    </aside>
  );
}
