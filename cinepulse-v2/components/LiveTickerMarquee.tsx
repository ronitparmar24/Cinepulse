'use client';
import { useState } from 'react';
import { Radio, Zap, Sparkles, TrendingUp, ShieldAlert, Film, ShieldCheck, Flame, Pause, Play } from 'lucide-react';
import { useReducedMotion } from './hooks/useReducedMotion';

interface MarqueeItem {
  id: string;
  icon: typeof Zap;
  iconColor: string;
  badge: string;
  headline: string;
  sub: string;
  titleId?: string;
}

const TELEMETRY_ITEMS: MarqueeItem[] = [
  {
    id: 't1',
    icon: Sparkles,
    iconColor: '#10b981',
    badge: 'TRAKT RADAR #1',
    headline: 'Avengers: Doomsday',
    sub: '18,450 Global Watchlists · Momentum 94/100',
    titleId: 'movie-1003596',
  },
  {
    id: 't2',
    icon: TrendingUp,
    iconColor: '#38bdf8',
    badge: '48H TRAILER VELOCITY',
    headline: 'The Penguin',
    sub: '+410,000 views/24h · 98.4% Like Ratio',
    titleId: 'tv-331641',
  },
  {
    id: 't3',
    icon: Zap,
    iconColor: '#fbbf24',
    badge: 'DAY-1 BO PROJECTION',
    headline: 'Pushpa 2: The Rule',
    sub: '₹175 Cr Day-1 Net Theatrical Estimate',
    titleId: 'movie-1774065',
  },
  {
    id: 't4',
    icon: ShieldCheck,
    iconColor: '#34d399',
    badge: 'AUDITED RECEIPT',
    headline: 'Dune: Part Two',
    sub: '$714M Actual vs $680M Model (96% Accuracy)',
    titleId: 'movie-693134',
  },
  {
    id: 't5',
    icon: ShieldAlert,
    iconColor: '#f43f5e',
    badge: 'CONTRARIAN CLASH',
    headline: 'The End of Oak Street',
    sub: '28% Spread (Model Bull vs Crowd Skeptic)',
    titleId: 'movie-1101383',
  },
  {
    id: 't6',
    icon: Film,
    iconColor: '#c084fc',
    badge: '2.5X BREAKEVEN',
    headline: 'Theatrical Economics',
    sub: 'Theatrical Breakeven = 2.5× Production Budget',
    titleId: 'movie-693134',
  },
  {
    id: 't7',
    icon: Flame,
    iconColor: '#fb923c',
    badge: 'FESTIVAL RADAR',
    headline: 'Chhaava',
    sub: '+35% Diwali Clash Box Office Lift Window',
    titleId: 'movie-1785395',
  },
  {
    id: 't8',
    icon: TrendingUp,
    iconColor: '#06b6d4',
    badge: 'STREAMING PULSE',
    headline: 'Severance (Season 2)',
    sub: '965,700 views · Daily velocity +32,190/d',
    titleId: 'tv-334888',
  },
];

export function LiveTickerMarquee({ onOpenTitle }: { onOpenTitle?: (titleId: string) => void }) {
  const [isPaused, setIsPaused] = useState(false);
  const prefersReduced = useReducedMotion();

  // Seamless infinite loop: duplicate items twice to ensure full runway across wide monitors
  const loopItems = [...TELEMETRY_ITEMS, ...TELEMETRY_ITEMS];

  return (
    <div className="live-telemetry-bar" aria-label="Live box office and velocity telemetry ticker">
      {/* 1. Left Opaque Anchor Badge (Never overlapped by scrolling track) */}
      <div className="live-telemetry-badge-box">
        <div className="live-pulse-indicator" aria-hidden="true">
          <span className="live-pulse-dot" />
          <span className="live-pulse-ring" />
        </div>
        <Radio size={12} className="spin-slow mint" aria-hidden="true" />
        <div className="live-telemetry-label-col">
          <span className="live-telemetry-title">LIVE TELEMETRY</span>
          <span className="live-telemetry-sub">REAL-TIME FEEDS</span>
        </div>
      </div>

      {/* 2. Center Scrolling Viewport with Dual Edge Masks */}
      <div className="live-telemetry-viewport">
        <div className={`live-telemetry-track ${isPaused || prefersReduced ? 'is-paused' : ''}`}>
          {loopItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={`${item.id}-${idx}`}
                type="button"
                className="live-telemetry-chip"
                onClick={() => {
                  if (item.titleId && onOpenTitle) {
                    onOpenTitle(item.titleId);
                  }
                }}
                title={item.titleId ? `Click to inspect ${item.headline}` : undefined}
              >
                <span
                  className="telemetry-pill-tag"
                  style={{
                    color: item.iconColor,
                    backgroundColor: `${item.iconColor}16`,
                    borderColor: `${item.iconColor}38`,
                  }}
                >
                  <Icon size={11} style={{ color: item.iconColor }} />
                  {item.badge}
                </span>
                <strong className="telemetry-headline">{item.headline}</strong>
                <span className="telemetry-sub">{item.sub}</span>
                <span className="telemetry-bullet" aria-hidden="true">·</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Right Interactive Pause / Resume Control */}
      <button
        type="button"
        className="live-telemetry-toggle-btn"
        onClick={() => setIsPaused((prev) => !prev)}
        title={isPaused ? 'Resume live ticker scroll' : 'Pause live ticker scroll'}
        aria-label={isPaused ? 'Resume live ticker scroll' : 'Pause live ticker scroll'}
      >
        {isPaused ? <Play size={10} /> : <Pause size={10} />}
        <span className="mono">{isPaused ? 'PLAY' : 'PAUSE'}</span>
      </button>
    </div>
  );
}
