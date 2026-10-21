'use client';
import { Radio, Zap, Sparkles, TrendingUp, ShieldAlert, Film } from 'lucide-react';

interface MarqueeItem {
  id: string;
  icon: typeof Zap;
  iconColor: string;
  badge: string;
  headline: string;
  sub: string;
  titleId?: string;
}

const DEFAULT_MARQUEE_ITEMS: MarqueeItem[] = [
  {
    id: 'm1',
    icon: Sparkles,
    iconColor: '#b3f3d5',
    badge: 'TRAKT RADAR #1',
    headline: 'Avengers: Doomsday',
    sub: '18,450 Global Watchlists · Rising Momentum',
    titleId: 'movie-1003596',
  },
  {
    id: 'm2',
    icon: TrendingUp,
    iconColor: '#38bdf8',
    badge: 'TRAILER VELOCITY',
    headline: 'The Penguin',
    sub: '+410,000 views/24h · 98.4% Positive Like Ratio',
    titleId: 'tv-331641',
  },
  {
    id: 'm3',
    icon: Zap,
    iconColor: '#fbbf24',
    badge: 'BO PROJECTION',
    headline: 'Pushpa 2: The Rule',
    sub: '₹175 Cr Day-1 Net Domestic Model Projection',
    titleId: 'movie-1774065',
  },
  {
    id: 'm4',
    icon: ShieldAlert,
    iconColor: '#f43f5e',
    badge: 'CONTRARIAN CLASH',
    headline: 'The End of Oak Street',
    sub: 'ABS(Model − Crowd) ≥ 20% Spread Detected',
    titleId: 'movie-1101383',
  },
  {
    id: 'm5',
    icon: Film,
    iconColor: '#b3f3d5',
    badge: '2.5X BREAKEVEN',
    headline: 'Box Office Multiverse',
    sub: 'Theatrical Breakeven = 2.5x Production Budget',
    titleId: 'movie-693134',
  },
  {
    id: 'm6',
    icon: TrendingUp,
    iconColor: '#a78bfa',
    badge: 'STREAMING PULSE',
    headline: 'Severance (Season 2)',
    sub: '965,700 views · Daily velocity +32,190/d',
    titleId: 'tv-334888',
  },
];

export function LiveTickerMarquee({ onOpenTitle }: { onOpenTitle?: (titleId: string) => void }) {
  // We duplicate items to create a seamless infinite marquee loop
  const loopItems = [...DEFAULT_MARQUEE_ITEMS, ...DEFAULT_MARQUEE_ITEMS];

  return (
    <div className="live-marquee-container" aria-label="Live box office and velocity marquee">
      <div className="live-marquee-badge">
        <Radio size={13} style={{ animation: 'spin 4s linear infinite' }} />
        <span>Live CinePulse Telemetry</span>
      </div>
      <div className="live-marquee-track">
        {loopItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={`${item.id}-${idx}`}
              type="button"
              className="live-marquee-item"
              onClick={() => {
                if (item.titleId && onOpenTitle) {
                  onOpenTitle(item.titleId);
                }
              }}
              title={item.titleId ? `Inspect ${item.headline}` : undefined}
            >
              <Icon size={12} style={{ color: item.iconColor }} />
              <span style={{ fontWeight: 800, fontSize: 9, letterSpacing: '0.06em', color: item.iconColor }}>
                {item.badge}
              </span>
              <strong style={{ color: '#f8fafc', fontWeight: 650 }}>{item.headline}</strong>
              <span style={{ color: '#94a3b8', fontSize: 10 }}>({item.sub})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
