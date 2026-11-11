'use client';

import React from 'react';
import {
  Activity,
  Check,
  X,
  TrendingUp,
  AlertTriangle,
  Bookmark,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  Tv,
  Award,
  MapPin,
} from 'lucide-react';
import { useApp } from '../Context';
import { money } from '../client';
import type { PendingActionUI } from '../hooks/useChat';

export function ForecastCard({ data }: { data: any }) {
  const { openTitle } = useApp();
  const hitPct = Math.max(0, Math.min(100, Number(data.hitProbability ?? 50)));
  const isBull = hitPct >= 50;
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (hitPct / 100) * circumference;

  return (
    <div className="chat-card chat-card--forecast">
      <div className="chat-card__header">
        <div className="chat-card__title-row">
          <Activity size={16} className="chat-card__icon text-accent" />
          <span className="chat-card__heading">
            {data.title ? `${data.title} · Forecast` : 'Algorithmic Forecast'}
          </span>
        </div>
        <span className={`chat-badge chat-badge--${data.confidence || 'medium'}`}>
          {data.confidence || 'medium'} confidence
        </span>
      </div>

      <div className="chat-card__forecast-main">
        <div className="chat-card__prob-ring">
          <svg className="chat-prob-svg" viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              stroke="rgba(245, 166, 35, 0.14)"
              strokeWidth="5"
            />
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              stroke={isBull ? '#34d399' : '#fb7185'}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 40 40)"
            />
          </svg>
          <div className="chat-prob-inner">
            <span className={`chat-card__prob-val chat-forecast-prob ${isBull ? 'text-hit' : 'text-flop'}`}>
              {hitPct}%
            </span>
            <span className="chat-card__prob-label">Hit Prob</span>
          </div>
        </div>

        <div className="chat-card__metrics">
          <div className="chat-metric">
            <span className="chat-metric__label">Revenue Bracket</span>
            <span className="chat-metric__value">
              {data.revenueRange
                ? `${money(data.revenueRange[0])} – ${money(data.revenueRange[1])}`
                : data.revenueEstimate
                ? money(data.revenueEstimate)
                : 'Estimating…'}
            </span>
          </div>
          {data.disclaimer && (
            <p className="chat-card__disclaimer">{data.disclaimer}</p>
          )}
        </div>
      </div>

      {data.topDrivers && data.topDrivers.length > 0 && (
        <div className="chat-card__drivers">
          <span className="chat-card__drivers-label">Key Signal Drivers:</span>
          <div className="chat-chips-wrap">
            {data.topDrivers.slice(0, 3).map((driver: string, idx: number) => (
              <span key={idx} className="chat-chip chat-chip--driver">
                {driver}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.titleId && (
        <button
          type="button"
          className="chat-card__action-link"
          onClick={() => openTitle(data.titleId, 'pulse')}
        >
          <span>Open Full Prediction Waterfall</span>
          <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}

export function PulseCard({ data }: { data: any }) {
  const { openTitle } = useApp();
  const count = data.count ?? 0;
  const hitShare = data.hitShare ?? 0;
  const flopShare = count > 0 ? 100 - hitShare : 0;

  return (
    <div className="chat-card chat-card--pulse">
      <div className="chat-card__header">
        <div className="chat-card__title-row">
          <Sparkles size={16} className="chat-card__icon text-gold" />
          <span className="chat-card__heading">Community Pulse</span>
        </div>
        <span className="chat-badge chat-badge--stage">
          {data.stage || (count >= 10 ? 'Established' : 'Early')}
        </span>
      </div>

      {count > 0 ? (
        <>
          <div className="chat-pulse-bar">
            <div
              className="chat-pulse-bar__hit"
              style={{ width: `${Math.max(5, hitShare)}%` }}
            >
              <span>{hitShare}% Hit</span>
            </div>
            <div
              className="chat-pulse-bar__flop"
              style={{ width: `${Math.max(5, flopShare)}%` }}
            >
              <span>{flopShare}% Flop</span>
            </div>
          </div>

          <div className="chat-pulse-stats">
            <span>{count} Total Community Calls</span>
            {data.sampleSizeWarning && (
              <span className="chat-badge chat-badge--warning">
                <AlertTriangle size={11} />
                <span>Small sample size (&lt;10 calls)</span>
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="chat-pulse-empty">
          <p>No community predictions submitted yet. Be the first to make a call!</p>
        </div>
      )}

      {data.titleId && (
        <button
          type="button"
          className="chat-card__action-link"
          onClick={() => openTitle(data.titleId, 'pulse')}
        >
          <span>Vote in the Community Pulse</span>
          <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}

export function TitleCard({ data }: { data: any }) {
  const { openTitle, save } = useApp();

  return (
    <div className="chat-card chat-card--title">
      <div className="chat-title-content">
        {data.poster ? (
          <img
            src={data.poster}
            alt={data.title}
            className="chat-title-poster"
            loading="lazy"
          />
        ) : (
          <div className="chat-title-poster chat-title-poster--empty">
            <span>🎬</span>
          </div>
        )}

        <div className="chat-title-info">
          <h4 className="chat-title-heading">{data.title}</h4>
          <div className="chat-title-meta">
            {data.releaseDate && <span>{data.releaseDate.slice(0, 4)}</span>}
            {data.runtime && <span>{data.runtime}m</span>}
            {data.voteAverage && (
              <span className="chat-rating">★ {data.voteAverage.toFixed(1)}</span>
            )}
          </div>
          {data.genres && (
            <div className="chat-chips-wrap">
              {data.genres.slice(0, 3).map((g: string) => (
                <span key={g} className="chat-chip chat-chip--small">
                  {g}
                </span>
              ))}
            </div>
          )}
          {data.overview && (
            <p className="chat-title-overview">{data.overview}</p>
          )}
        </div>
      </div>

      <div className="chat-card__actions-row">
        {data.id && (
          <button
            type="button"
            className="button small secondary"
            onClick={() => openTitle(data.id, 'overview')}
          >
            <span>View Details</span>
            <ExternalLink size={12} />
          </button>
        )}
        {data.id && (
          <button
            type="button"
            className="button small primary"
            onClick={() =>
              save({
                id: data.id,
                title: data.title,
                poster: data.poster,
                releaseDate: data.releaseDate,
                genres: data.genres || [],
                overview: data.overview || '',
                tagline: '',
                backdrop: null,
                source: 'tmdb',
                mediaType: data.mediaType || 'movie',
                runtime: data.runtime || null,
                seasons: null,
                status: 'released',
                voteAverage: data.voteAverage || null,
                voteCount: 0,
                popularity: null,
                cast: [],
                trailerKey: null,
                director: null,
                budget: null,
                revenue: null,
              })
            }
          >
            <Bookmark size={12} />
            <span>Watchlist</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function CompareCard({ data }: { data: any }) {
  const { openTitle } = useApp();
  const { titleA, titleB, verdict } = data;

  if (!titleA || !titleB) return null;

  return (
    <div className="chat-card chat-card--compare">
      <div className="chat-card__header">
        <span className="chat-card__heading">Head-to-Head Comparison</span>
      </div>

      <div className="chat-compare-grid">
        <div
          className="chat-compare-col"
          onClick={() => openTitle(titleA.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openTitle(titleA.id); }}
        >
          {titleA.poster && (
            <img src={titleA.poster} alt={titleA.title} className="chat-compare-poster" />
          )}
          <span className="chat-compare-name">{titleA.title}</span>
          <span className={`chat-compare-prob ${titleA.hitProbability >= 50 ? 'text-hit' : 'text-flop'}`}>
            {titleA.hitProbability}% Hit
          </span>
          {titleA.revenueEstimate && (
            <span className="chat-compare-rev">{money(titleA.revenueEstimate)}</span>
          )}
        </div>

        <div className="chat-compare-divider">
          <span>VS</span>
        </div>

        <div
          className="chat-compare-col"
          onClick={() => openTitle(titleB.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openTitle(titleB.id); }}
        >
          {titleB.poster && (
            <img src={titleB.poster} alt={titleB.title} className="chat-compare-poster" />
          )}
          <span className="chat-compare-name">{titleB.title}</span>
          <span className={`chat-compare-prob ${titleB.hitProbability >= 50 ? 'text-hit' : 'text-flop'}`}>
            {titleB.hitProbability}% Hit
          </span>
          {titleB.revenueEstimate && (
            <span className="chat-compare-rev">{money(titleB.revenueEstimate)}</span>
          )}
        </div>
      </div>

      {verdict && <p className="chat-compare-verdict">{verdict}</p>}
    </div>
  );
}

export function ActionConfirmCard({
  action,
  onConfirm,
  onCancel,
}: {
  action: PendingActionUI;
  onConfirm: (action: PendingActionUI) => void | Promise<unknown>;
  onCancel: (actionId: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const isConfirmed = action.status === 'confirmed';
  const isCancelled = action.status === 'cancelled';

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(action);
    } catch (err: any) {
      setError(err?.message || 'Sign in required to execute this action.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`chat-card chat-card--action ${
        isConfirmed ? 'chat-card--action-confirmed' : ''
      }`}
    >
      <div className="chat-card__header">
        <div className="chat-card__title-row">
          <Bookmark size={15} className="chat-card__icon text-accent" />
          <span className="chat-card__heading">Confirm Action</span>
        </div>
      </div>

      <p className="chat-action-desc">{action.description}</p>

      {error && (
        <p className="chat-card__disclaimer text-flop" role="alert">
          {error}
        </p>
      )}

      {isConfirmed ? (
        <div className="chat-action-status text-hit">
          <Check size={16} />
          <span>Action Confirmed &amp; Executed</span>
        </div>
      ) : isCancelled ? (
        <div className="chat-action-status text-muted">
          <X size={16} />
          <span>Action Cancelled</span>
        </div>
      ) : (
        <div className="chat-card__actions-row">
          <button
            type="button"
            className="button small danger outline"
            disabled={busy}
            onClick={() => onCancel(action.id)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button small primary"
            disabled={busy}
            onClick={handleConfirm}
          >
            <Check size={13} />
            <span>{busy ? 'Saving…' : 'Confirm'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function ListCard({ data }: { data: any }) {
  const { openTitle } = useApp();
  const items = data.items || [];
  const cinemas = data.cinemas || [];

  if (cinemas.length > 0) {
    return (
      <div className="chat-card chat-card--list">
        <div className="chat-card__header">
          <div className="chat-card__title-row">
            <MapPin size={15} className="chat-card__icon text-accent" />
            <span className="chat-card__heading">
              Cinemas in {data.city || 'Your Area'}
            </span>
          </div>
          <span className="chat-badge chat-badge--stage">{cinemas.length} halls</span>
        </div>
        <div className="chat-list-scroll">
          {cinemas.map((cinema: any, i: number) => (
            <div key={i} className="chat-list-item chat-list-item--cinema">
              <div className="chat-list-item-info">
                <span className="chat-list-item-title">{cinema.name}</span>
                <span className="chat-list-item-meta">
                  {cinema.brand}
                  {cinema.distanceKm != null ? ` · ${cinema.distanceKm} km` : ''}
                </span>
                {cinema.address && (
                  <span className="chat-list-item-reason">{cinema.address}</span>
                )}
              </div>
              {cinema.bookingUrl && (
                <a
                  href={cinema.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chat-badge chat-badge--medium"
                >
                  Tickets <ExternalLink size={10} />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-card chat-card--list">
      <div className="chat-list-scroll">
        {items.map((item: any) => (
          <div
            key={item.id}
            className="chat-list-item"
            onClick={() => openTitle(item.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openTitle(item.id); }}
          >
            {item.poster ? (
              <img src={item.poster} alt={item.title} className="chat-list-poster" />
            ) : (
              <div className="chat-list-poster chat-list-poster--empty">🎬</div>
            )}
            <div className="chat-list-item-info">
              <span className="chat-list-item-title">{item.title}</span>
              <span className="chat-list-item-meta">
                {item.releaseDate ? item.releaseDate.slice(0, 4) : 'TBA'}
                {item.voteAverage ? ` • ★ ${item.voteAverage.toFixed(1)}` : ''}
              </span>
              {item.reasonText && (
                <span className="chat-list-item-reason">{item.reasonText}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WhereToWatchCard({ data }: { data: any }) {
  const { openTitle } = useApp();
  const directLinks = data.directLinks || [];
  const subs = data.subscription || [];
  const rentOrBuy = data.rentOrBuy || [];

  return (
    <div className="chat-card chat-card--details">
      <div className="chat-card__header">
        <div className="chat-card__title-row">
          <Tv size={15} className="chat-card__icon text-accent" />
          <span className="chat-card__heading">
            Where to Watch · {data.titleName}
          </span>
        </div>
        {data.region && <span className="chat-badge chat-badge--stage">{data.region}</span>}
      </div>

      {directLinks.length > 0 && (
        <div className="chat-chips-wrap">
          {directLinks.map((d: any, idx: number) => (
            <a
              key={idx}
              href={d.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="chat-chip chat-chip--driver"
            >
              {d.name} ({d.type}{d.price ? ` · ${d.price}` : ''}) <ExternalLink size={10} />
            </a>
          ))}
        </div>
      )}

      {subs.length > 0 && (
        <div className="chat-card__drivers">
          <span className="chat-card__drivers-label">Included with Subscription:</span>
          <div className="chat-chips-wrap">
            {subs.map((name: string, idx: number) => (
              <span key={idx} className="chat-chip chat-chip--small">{name}</span>
            ))}
          </div>
        </div>
      )}

      {rentOrBuy.length > 0 && (
        <div className="chat-card__drivers">
          <span className="chat-card__drivers-label">Rent or Buy:</span>
          <div className="chat-chips-wrap">
            {rentOrBuy.map((name: string, idx: number) => (
              <span key={idx} className="chat-chip chat-chip--small">{name}</span>
            ))}
          </div>
        </div>
      )}

      {directLinks.length === 0 && subs.length === 0 && rentOrBuy.length === 0 && (
        <p className="chat-card__disclaimer">
          No active digital streaming links found in {data.region || 'this region'} yet.
        </p>
      )}

      {data.titleId && (
        <button
          type="button"
          className="chat-card__action-link"
          onClick={() => openTitle(data.titleId, 'overview')}
        >
          <span>Open Availability Details</span>
          <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}

export function CriticalConsensusCard({ data }: { data: any }) {
  const { openTitle } = useApp();

  return (
    <div className="chat-card chat-card--details">
      <div className="chat-card__header">
        <div className="chat-card__title-row">
          <Award size={15} className="chat-card__icon text-gold" />
          <span className="chat-card__heading">
            Quad-Consensus · {data.titleName}
          </span>
        </div>
        {data.mpaaRating && <span className="chat-badge">{data.mpaaRating}</span>}
      </div>

      <div className="chat-consensus-grid">
        <div className="chat-metric">
          <span className="chat-metric__label">Rotten Tomatoes</span>
          <span className="chat-metric__value text-gold">
            {data.rottenTomatoes || '—'}
          </span>
        </div>
        <div className="chat-metric">
          <span className="chat-metric__label">IMDb</span>
          <span className="chat-metric__value">
            {data.imdbRating || '—'}
          </span>
        </div>
        <div className="chat-metric">
          <span className="chat-metric__label">Metascore</span>
          <span className="chat-metric__value text-hit">
            {data.metascore || '—'}
          </span>
        </div>
        <div className="chat-metric">
          <span className="chat-metric__label">TMDB</span>
          <span className="chat-metric__value">
            {data.tmdbScore || '—'}
          </span>
        </div>
      </div>

      {data.awards && (
        <p className="chat-card__disclaimer">🏆 {data.awards}</p>
      )}

      {data.titleId && (
        <button
          type="button"
          className="chat-card__action-link"
          onClick={() => openTitle(data.titleId, 'reviews')}
        >
          <span>Explore Critic &amp; Fan Reviews</span>
          <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}

export function AccuracyCard({ data }: { data: any }) {
  return (
    <div className="chat-card chat-card--accuracy">
      <div className="chat-card__header">
        <div className="chat-card__title-row">
          <ShieldCheck size={16} className="chat-card__icon text-accent" />
          <span className="chat-card__heading">Your Accuracy Ledger</span>
        </div>
        {data.rank && <span className="chat-badge chat-badge--stage">Rank #{data.rank}</span>}
      </div>

      <div className="chat-card__metrics-grid">
        <div className="chat-metric">
          <span className="chat-metric__label">Accuracy Rate</span>
          <span className="chat-metric__value text-hit">
            {data.accuracyRate !== null ? `${data.accuracyRate}%` : 'N/A'}
          </span>
        </div>
        <div className="chat-metric">
          <span className="chat-metric__label">Brier Score</span>
          <span className="chat-metric__value">
            {data.brierScore !== null ? Number(data.brierScore).toFixed(3) : 'N/A'}
          </span>
        </div>
        <div className="chat-metric">
          <span className="chat-metric__label">Total Calls</span>
          <span className="chat-metric__value">{data.totalCalls || 0}</span>
        </div>
      </div>
    </div>
  );
}

export function ModelAccuracyCard({ data }: { data: any }) {
  const brier = data.overallBrierScore;
  const baseline = data.baselineBrierScore;
  const hitRate = data.hitAccuracyRate;
  const total = data.totalResolved;

  return (
    <div className="chat-card chat-card--accuracy">
      <div className="chat-card__header">
        <div className="chat-card__title-row">
          <ShieldCheck size={16} className="chat-card__icon text-accent" />
          <span className="chat-card__heading">Model Accuracy Ledger</span>
        </div>
        {data.modelVersion && (
          <span className="chat-badge chat-badge--stage">{data.modelVersion}</span>
        )}
      </div>

      {brier !== null && brier !== undefined ? (
        <div className="chat-card__metrics-grid">
          <div className="chat-metric">
            <span className="chat-metric__label">Brier Score</span>
            <span className="chat-metric__value text-hit">
              {Number(brier).toFixed(3)}
            </span>
          </div>
          {baseline !== null && baseline !== undefined && (
            <div className="chat-metric">
              <span className="chat-metric__label">Baseline</span>
              <span className="chat-metric__value text-muted">
                {Number(baseline).toFixed(3)}
              </span>
            </div>
          )}
          {hitRate !== null && hitRate !== undefined && (
            <div className="chat-metric">
              <span className="chat-metric__label">Hit Accuracy</span>
              <span className="chat-metric__value">{hitRate}%</span>
            </div>
          )}
          {total !== undefined && (
            <div className="chat-metric">
              <span className="chat-metric__label">Resolved Calls</span>
              <span className="chat-metric__value">{total}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="chat-card__disclaimer">
          No resolved predictions yet — accuracy builds as forecasts resolve.
        </p>
      )}
    </div>
  );
}

export function ContrarianCard({ data }: { data: any }) {
  const { openTitle } = useApp();
  const items = data.items || [];

  return (
    <div className="chat-card chat-card--list">
      <div className="chat-card__header">
        <div className="chat-card__title-row">
          <TrendingUp size={16} className="chat-card__icon text-accent" />
          <span className="chat-card__heading">Contrarian Picks</span>
        </div>
        <span className="chat-badge chat-badge--stage">{items.length} divergent</span>
      </div>
      <div className="chat-list-scroll">
        {items.map((item: any, i: number) => (
          <div
            key={item.titleId || i}
            className="chat-list-item"
            onClick={() => openTitle(item.titleId)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openTitle(item.titleId); }}
          >
            {item.poster ? (
              <img src={item.poster} alt={item.title} className="chat-list-poster" />
            ) : (
              <div className="chat-list-poster chat-list-poster--empty">🎬</div>
            )}
            <div className="chat-list-item-info">
              <span className="chat-list-item-title">{item.title}</span>
              <span className="chat-list-item-meta">
                Model {item.modelHitProbability}% · Community {item.communityHitProbability}%
              </span>
              {item.reasoning && (
                <span className="chat-list-item-reason">{item.reasoning}</span>
              )}
            </div>
            <span className={`chat-chip chat-chip--small ${item.contrarianSide === 'model_bullish' ? 'text-hit' : 'text-flop'}`}>
              {item.divergence}% gap
            </span>
          </div>
        ))}
        {items.length === 0 && (
          <p className="chat-card__disclaimer">No high-divergence contrarian picks currently.</p>
        )}
      </div>
    </div>
  );
}

export function ChatCardDispatcher({
  card,
  onConfirmAction,
  onCancelAction,
}: {
  card: { type: string; data: Record<string, unknown> };
  onConfirmAction: (action: PendingActionUI) => void | Promise<unknown>;
  onCancelAction: (actionId: string) => void;
}) {
  switch (card.type) {
    case 'forecast':
      return <ForecastCard data={card.data} />;
    case 'pulse':
      return <PulseCard data={card.data} />;
    case 'title':
      return <TitleCard data={card.data} />;
    case 'compare':
      return <CompareCard data={card.data} />;
    case 'details':
      if ('directLinks' in card.data || 'subscription' in card.data || 'rentOrBuy' in card.data) {
        return <WhereToWatchCard data={card.data} />;
      }
      if ('rottenTomatoes' in card.data || 'imdbRating' in card.data || 'metascore' in card.data) {
        return <CriticalConsensusCard data={card.data} />;
      }
      return null;
    case 'action':
      if (card.data?.action) {
        return (
          <ActionConfirmCard
            action={card.data.action as any}
            onConfirm={onConfirmAction}
            onCancel={onCancelAction}
          />
        );
      }
      return null;
    case 'list':
      return <ListCard data={card.data} />;
    case 'accuracy':
      return <AccuracyCard data={card.data} />;
    case 'model_accuracy':
      return <ModelAccuracyCard data={card.data} />;
    case 'contrarian':
      return <ContrarianCard data={card.data} />;
    default:
      return null;
  }
}
