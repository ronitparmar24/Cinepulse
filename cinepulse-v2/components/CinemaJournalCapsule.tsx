'use client';

import React, { useState, useEffect } from 'react';
import {
  Clapperboard,
  Sparkles,
  Quote,
  Ticket,
  Scissors,
  Coffee,
  Film,
  RotateCcw,
  Check,
  Edit3,
  Bookmark,
  Share2,
} from 'lucide-react';
import type { Title, LibraryEntry } from '@/lib/types';
import { useToast } from './hooks/useToast';

export interface CinemaJournalCapsuleProps {
  title: Title;
  entry?: LibraryEntry | null;
  onOpenTicketStub: (customData?: { format?: string; seat?: string }) => void;
}

interface CapsuleStoredData {
  format?: string;
  afterglow?: string;
  quote?: string;
  rewatch?: 'once' | 'rewatch' | 'timeless';
  seat?: string;
}

const FORMAT_OPTIONS = [
  { id: 'imax', label: 'IMAX 70mm', icon: '🎟️' },
  { id: 'dolby', label: 'Dolby Atmos', icon: '🔊' },
  { id: 'classic', label: 'Indie Cinema', icon: '🏛️' },
  { id: 'home', label: 'Home Cinema 4K', icon: '🛋️' },
  { id: 'midnight', label: 'Midnight Solo', icon: '🌙' },
  { id: 'flight', label: 'In-Flight', icon: '✈️' },
];

const AFTERGLOW_OPTIONS = [
  { id: 'mindblown', label: 'Mind-Bent', emoji: '🤯' },
  { id: 'adrenaline', label: 'Adrenaline', emoji: '⚡' },
  { id: 'devastating', label: 'Heartbroken', emoji: '💔' },
  { id: 'comfort', label: 'Warm Comfort', emoji: '☕' },
  { id: 'haunting', label: 'Haunting', emoji: '🕯️' },
  { id: 'euphoric', label: 'Pure Wonder', emoji: '✨' },
];

function getCinephilePairing(genres: string[]): {
  doubleBill: string;
  label: string;
  ritual: string;
  snack: string;
} {
  const g = genres.map((s) => s.toLowerCase());
  if (g.some((x) => x.includes('horror') || x.includes('thriller'))) {
    return {
      doubleBill: '28 Days Later (2002) or Train to Busan',
      label: 'Survival Double-Feature',
      ritual: 'Lights completely off, closed-back headphones or surround',
      snack: 'Espresso tonic & spicy truffle popcorn',
    };
  }
  if (g.some((x) => x.includes('sci-fi') || x.includes('science fiction'))) {
    return {
      doubleBill: 'Blade Runner 2049 or Children of Men',
      label: 'Dystopian Double-Bill',
      ritual: 'Pitch-black room, calibrated OLED screen',
      snack: 'Cold brew & dark chocolate sea salt',
    };
  }
  if (g.some((x) => x.includes('action') || x.includes('crime') || x.includes('adventure'))) {
    return {
      doubleBill: 'Drive (2011) or The Raid',
      label: 'High-Velocity Double-Bill',
      ritual: 'Subwoofer engaged, high-volume Friday watch',
      snack: 'Smoky loaded nachos & ginger beer',
    };
  }
  if (g.some((x) => x.includes('drama') || x.includes('romance'))) {
    return {
      doubleBill: 'Before Sunrise or In the Mood for Love',
      label: 'Intimate Double-Bill',
      ritual: 'Quiet evening, warm ambient lighting',
      snack: 'Red wine or chamomile tea & warm pastry',
    };
  }
  if (g.some((x) => x.includes('comedy') || x.includes('animation') || x.includes('family'))) {
    return {
      doubleBill: 'The Grand Budapest Hotel or Fantastic Mr. Fox',
      label: 'Whimsical Double-Bill',
      ritual: 'Lazy weekend afternoon, friends or family crowd',
      snack: 'Caramel crunch popcorn & iced soda',
    };
  }
  return {
    doubleBill: 'Cinema Paradiso or Sunset Boulevard',
    doubleBillYear: 'Cinema Lover Double-Bill',
    ritual: 'Quiet late evening, uninterrupted immersion',
    snack: 'Classic warm buttered popcorn & soda',
  } as any;
}

export function CinemaJournalCapsule({
  title,
  entry,
  onOpenTicketStub,
}: CinemaJournalCapsuleProps) {
  const { toast } = useToast();
  const storageKey = `cinepulse_capsule_${title.id}`;

  const [data, setData] = useState<CapsuleStoredData>({
    format: 'home',
    afterglow: '',
    quote: '',
    rewatch: undefined,
    seat: 'ROW D · SEAT 14',
  });

  const [isEditingQuote, setIsEditingQuote] = useState(false);
  const [quoteInput, setQuoteInput] = useState('');

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setData(parsed);
        if (parsed.quote) setQuoteInput(parsed.quote);
      }
    } catch {}
  }, [storageKey]);

  // Persist to localStorage on change
  function updateData(partial: Partial<CapsuleStoredData>) {
    setData((prev) => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function handleSaveQuote() {
    updateData({ quote: quoteInput.trim() });
    setIsEditingQuote(false);
    toast('Saved memorable line to your cinema journal!');
  }

  const pairing = getCinephilePairing(title.genres || []);
  const activeFormatObj = FORMAT_OPTIONS.find((f) => f.id === data.format) || FORMAT_OPTIONS[0];
  const ticketSerial = `CP-${title.id.replace(/[^0-9]/g, '').slice(-5) || '92410'}`;

  const ratingStars = entry?.rating ? '★'.repeat(entry.rating) : null;
  const statusStamp =
    entry?.status === 'watched'
      ? `VERIFIED ADMIT${ratingStars ? ` · ${ratingStars}` : ''}`
      : entry?.status === 'watching'
      ? 'CURRENTLY SCREENING'
      : entry?.status === 'watchlist'
      ? 'RESERVED ADMISSION'
      : 'OPEN ADMIT';

  return (
    <div className="cinema-journal-capsule">
      <div className="capsule-divider" />

      {/* ─── 1. Mini Perforated Ticket Stub Preview ─────────────────── */}
      <div
        className="mini-ticket-stub"
        onClick={() =>
          onOpenTicketStub({
            format: activeFormatObj.label.toUpperCase(),
            seat: data.seat || 'ROW D · SEAT 14',
          })
        }
        role="button"
        tabIndex={0}
        title="Click to expand full physical ticket stub"
      >
        <div className="mini-ticket-notch-left" />
        <div className="mini-ticket-notch-right" />

        <div className="mini-ticket-head">
          <span className="mini-ticket-logo">CINEPULSE CINEMA</span>
          <span className="mini-ticket-serial">NO. {ticketSerial}</span>
        </div>

        <div className="mini-ticket-body">
          <div className="mini-ticket-title-row">
            <span className="mini-ticket-film-name">{title.title}</span>
            <span className="mini-ticket-year">
              {title.releaseDate ? title.releaseDate.slice(0, 4) : 'FEATURE'}
            </span>
          </div>

          <div className="mini-ticket-specs-row">
            <div className="mini-ticket-spec">
              <span className="spec-label">SCREEN</span>
              <span className="spec-val">HALL 04</span>
            </div>
            <div className="mini-ticket-spec">
              <span className="spec-label">FORMAT</span>
              <span className="spec-val">{activeFormatObj.label}</span>
            </div>
            <div className="mini-ticket-spec">
              <span className="spec-label">SEAT</span>
              <span className="spec-val">{data.seat || 'ROW D · 14'}</span>
            </div>
          </div>

          <div className="mini-ticket-stamp-row">
            <span className={`mini-ticket-stamp ${entry?.status === 'watched' ? 'stamp--watched' : ''}`}>
              {statusStamp}
            </span>
            <div className="mini-ticket-barcode" aria-hidden="true">
              ||| | || |||| | | ||| || |||
            </div>
          </div>
        </div>

        <div className="mini-ticket-tear-bar">
          <Scissors size={11} className="tear-icon" />
          <span className="tear-text">Tap to tear &amp; view full collectible stub</span>
        </div>
      </div>

      {/* ─── 2. Screening Atmosphere & Venue ───────────────────────── */}
      <div className="capsule-section">
        <div className="capsule-section-header">
          <Clapperboard size={12} className="mint" />
          <span>SCREENING ATMOSPHERE</span>
        </div>
        <div className="capsule-pills-row">
          {FORMAT_OPTIONS.map((fmt) => {
            const isActive = data.format === fmt.id;
            return (
              <button
                key={fmt.id}
                type="button"
                className={`capsule-pill ${isActive ? 'capsule-pill--active' : ''}`}
                onClick={() => updateData({ format: fmt.id })}
              >
                <span>{fmt.icon}</span>
                <span>{fmt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── 3. The "Afterglow" Resonance ───────────────────────────── */}
      <div className="capsule-section">
        <div className="capsule-section-header">
          <Sparkles size={12} className="mint" />
          <span>POST-CREDITS AFTERGLOW</span>
        </div>
        <div className="capsule-pills-row">
          {AFTERGLOW_OPTIONS.map((mood) => {
            const isActive = data.afterglow === mood.id;
            return (
              <button
                key={mood.id}
                type="button"
                className={`capsule-pill ${isActive ? 'capsule-pill--active' : ''}`}
                onClick={() =>
                  updateData({ afterglow: isActive ? '' : mood.id })
                }
              >
                <span>{mood.emoji}</span>
                <span>{mood.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── 4. Standout Scene or Quote Capsule ──────────────────────── */}
      <div className="capsule-section">
        <div className="capsule-section-header">
          <Quote size={12} className="mint" />
          <span>STANDOUT SCENE OR QUOTE</span>
          {!isEditingQuote && data.quote && (
            <button
              type="button"
              className="capsule-icon-action"
              onClick={() => setIsEditingQuote(true)}
              title="Edit quote"
              aria-label="Edit quote"
            >
              <Edit3 size={11} />
            </button>
          )}
        </div>

        {isEditingQuote || !data.quote ? (
          <div className="capsule-quote-editor">
            <input
              type="text"
              className="capsule-quote-input"
              placeholder="e.g. The highway chase at dusk, or iconic line…"
              value={quoteInput}
              onChange={(e) => setQuoteInput(e.target.value)}
              maxLength={120}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveQuote();
                }
              }}
            />
            <button
              type="button"
              className="button primary small capsule-quote-btn"
              onClick={handleSaveQuote}
            >
              <Check size={11} />
              <span>Pin</span>
            </button>
          </div>
        ) : (
          <div
            className="capsule-quote-card"
            onClick={() => setIsEditingQuote(true)}
            role="button"
            tabIndex={0}
            title="Click to edit line"
          >
            <span className="capsule-quote-mark">“</span>
            <p className="capsule-quote-text">{data.quote}</p>
            <span className="capsule-quote-mark">”</span>
          </div>
        )}
      </div>

      {/* ─── 5. Cinephile Pairing & Double-Bill ──────────────────────── */}
      <div className="capsule-pairing-card">
        <div className="capsule-pairing-head">
          <Film size={12} className="mint" />
          <span className="pairing-label">CURATED DOUBLE-FEATURE</span>
        </div>
        <p className="pairing-film">{pairing.doubleBill}</p>
        <div className="pairing-ritual">
          <Coffee size={11} className="muted" />
          <span>{pairing.ritual}</span>
        </div>
        <div className="pairing-snack">
          <span>🍿 Pairing: {pairing.snack}</span>
        </div>
      </div>

      {/* ─── 6. Rewatch Affinity ─────────────────────────────────────── */}
      <div className="capsule-rewatch-row">
        <span className="rewatch-label">REWATCH AFFINITY</span>
        <div className="rewatch-pills">
          <button
            type="button"
            className={`rewatch-pill ${data.rewatch === 'once' ? 'rewatch-pill--active' : ''}`}
            onClick={() => updateData({ rewatch: 'once' })}
          >
            1x Experience
          </button>
          <button
            type="button"
            className={`rewatch-pill ${data.rewatch === 'rewatch' ? 'rewatch-pill--active' : ''}`}
            onClick={() => updateData({ rewatch: 'rewatch' })}
          >
            🔄 Worth Rewatching
          </button>
          <button
            type="button"
            className={`rewatch-pill ${data.rewatch === 'timeless' ? 'rewatch-pill--active' : ''}`}
            onClick={() => updateData({ rewatch: 'timeless' })}
          >
            👑 Timeless Staple
          </button>
        </div>
      </div>

      {/* Scoped CSS styling */}
      <style>{`
        .cinema-journal-capsule {
          display: flex;
          flex-direction: column;
          gap: 14px;
          margin-top: 14px;
        }

        .capsule-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
          margin: 4px 0 2px;
        }

        /* ── Mini Ticket Stub ── */
        .mini-ticket-stub {
          position: relative;
          background: linear-gradient(135deg, #151d22 0%, #0d1216 100%);
          border: 1px solid rgba(179, 243, 213, 0.22);
          border-radius: 12px;
          padding: 12px 14px;
          cursor: pointer;
          transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }
        .mini-ticket-stub:hover {
          transform: translateY(-2px);
          border-color: rgba(179, 243, 213, 0.45);
          box-shadow: 0 12px 28px rgba(0,0,0,0.6), 0 0 16px rgba(179,243,213,0.12);
        }

        .mini-ticket-notch-left,
        .mini-ticket-notch-right {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 10px;
          height: 16px;
          background: #11171c; /* matches aside bg */
          border: 1px solid rgba(179, 243, 213, 0.22);
          z-index: 2;
        }
        .mini-ticket-notch-left {
          left: -1px;
          border-left: none;
          border-radius: 0 10px 10px 0;
        }
        .mini-ticket-notch-right {
          right: -1px;
          border-right: none;
          border-radius: 10px 0 0 10px;
        }

        .mini-ticket-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 8px;
          letter-spacing: 1.5px;
          font-weight: 750;
          color: rgba(179, 243, 213, 0.7);
          margin-bottom: 6px;
          padding-bottom: 4px;
          border-bottom: 1px dashed rgba(255,255,255,0.08);
        }
        .mini-ticket-serial {
          font-family: monospace;
          color: rgba(255,255,255,0.4);
        }

        .mini-ticket-title-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 6px;
          margin-bottom: 8px;
        }
        .mini-ticket-film-name {
          font-weight: 750;
          font-size: 13px;
          letter-spacing: -0.3px;
          color: #fff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mini-ticket-year {
          font-size: 9px;
          font-weight: 700;
          color: var(--muted);
          flex-shrink: 0;
        }

        .mini-ticket-specs-row {
          display: flex;
          justify-content: space-between;
          background: rgba(0,0,0,0.3);
          border-radius: 6px;
          padding: 6px 8px;
          margin-bottom: 8px;
        }
        .mini-ticket-spec {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .spec-label {
          font-size: 7px;
          letter-spacing: 0.8px;
          color: rgba(255,255,255,0.4);
          font-weight: 700;
        }
        .spec-val {
          font-size: 10px;
          font-weight: 750;
          color: #e2e8f0;
        }

        .mini-ticket-stamp-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .mini-ticket-stamp {
          display: inline-block;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 1px;
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid rgba(179, 243, 213, 0.4);
          color: var(--mint);
          background: rgba(179, 243, 213, 0.08);
          text-transform: uppercase;
        }
        .stamp--watched {
          border-color: #22c55e;
          color: #22c55e;
          background: rgba(34, 197, 94, 0.1);
        }
        .mini-ticket-barcode {
          font-family: monospace;
          font-size: 9px;
          letter-spacing: 2px;
          color: rgba(255,255,255,0.3);
        }

        .mini-ticket-tear-bar {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          margin-top: 8px;
          padding-top: 6px;
          border-top: 1px dashed rgba(255,255,255,0.1);
          font-size: 9px;
          color: rgba(179, 243, 213, 0.8);
          font-weight: 600;
        }
        .tear-icon {
          color: var(--mint);
        }

        /* ── Capsule Sections ── */
        .capsule-section {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .capsule-section-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 9px;
          font-weight: 750;
          letter-spacing: 1.2px;
          color: #94a3b8;
        }
        .capsule-icon-action {
          margin-left: auto;
          color: var(--muted);
          padding: 2px;
          display: flex;
          align-items: center;
          transition: color 0.15s;
        }
        .capsule-icon-action:hover {
          color: var(--mint);
        }

        .capsule-pills-row {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }
        .capsule-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 8px;
          border-radius: 8px;
          font-size: 10px;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
          cursor: pointer;
          transition: all 0.15s;
        }
        .capsule-pill:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.16);
          color: #fff;
        }
        .capsule-pill--active {
          background: rgba(179, 243, 213, 0.12) !important;
          border-color: var(--mint) !important;
          color: var(--mint) !important;
          box-shadow: 0 0 10px rgba(179, 243, 213, 0.15);
        }

        /* ── Quote Capsule ── */
        .capsule-quote-editor {
          display: flex;
          gap: 6px;
        }
        .capsule-quote-input {
          flex: 1;
          padding: 6px 9px;
          font-size: 10px;
          background: #0f161a;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 8px;
        }
        .capsule-quote-btn {
          min-height: unset;
          padding: 6px 10px;
          font-size: 10px;
          gap: 4px;
        }
        .capsule-quote-card {
          display: flex;
          align-items: baseline;
          gap: 4px;
          background: rgba(15, 23, 42, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-left: 2px solid var(--mint);
          border-radius: 6px;
          padding: 7px 10px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .capsule-quote-card:hover {
          background: rgba(15, 23, 42, 0.65);
        }
        .capsule-quote-mark {
          font-size: 13px;
          font-family: serif;
          color: var(--mint);
          opacity: 0.7;
          line-height: 1;
        }
        .capsule-quote-text {
          font-size: 10px;
          font-style: italic;
          color: #e2e8f0;
          line-height: 1.4;
          margin: 0;
          word-break: break-word;
        }

        /* ── Pairing Card ── */
        .capsule-pairing-card {
          background: linear-gradient(135deg, rgba(179, 243, 213, 0.04), rgba(255, 255, 255, 0.02));
          border: 1px solid rgba(179, 243, 213, 0.14);
          border-radius: 10px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .capsule-pairing-head {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .pairing-label {
          font-size: 8px;
          font-weight: 750;
          letter-spacing: 1px;
          color: var(--mint);
        }
        .pairing-film {
          font-size: 11px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0;
        }
        .pairing-ritual,
        .pairing-snack {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 9px;
          color: #94a3b8;
          line-height: 1.4;
        }

        /* ── Rewatch Row ── */
        .capsule-rewatch-row {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .rewatch-label {
          font-size: 8px;
          font-weight: 750;
          letter-spacing: 1px;
          color: #94a3b8;
        }
        .rewatch-pills {
          display: flex;
          gap: 4px;
        }
        .rewatch-pill {
          flex: 1;
          padding: 5px 6px;
          border-radius: 6px;
          font-size: 9px;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.07);
          color: #94a3b8;
          text-align: center;
          cursor: pointer;
          transition: all 0.15s;
        }
        .rewatch-pill:hover {
          background: rgba(255, 255, 255, 0.07);
          color: #e2e8f0;
        }
        .rewatch-pill--active {
          background: rgba(179, 243, 213, 0.1) !important;
          border-color: rgba(179, 243, 213, 0.35) !important;
          color: var(--mint) !important;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}

