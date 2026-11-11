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
  Film,
  LogIn,
} from 'lucide-react';
import { useApp } from '../Context';
import { money } from '../client';
import type { PendingActionUI } from '../hooks/useChat';

export function ForecastCard({ data }: { data: any }) {
  const { openTitle } = useApp();
  const abstained =
    Boolean(data.abstained) ||
    (Number(data.hitProbability ?? 0) === 0 && Number(data.flopProbability ?? 0) === 0);
  const hitPct = abstained ? 0 : Math.max(0, Math.min(100, Number(data.hitProbability ?? 50)));
  const isBull = !abstained && hitPct >= 50;
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = abstained
    ? circumference
    : circumference - (hitPct / 100) * circumference;

  const metaParts = [
    data.releaseDate ? String(data.releaseDate).slice(0, 4) : null,
    data.runtime ? `${data.runtime}m` : null,
    data.director ? `Dir. ${data.director}` : null,
    typeof data.voteAverage === 'number' && data.voteAverage > 0
      ? `★ ${data.voteAverage.toFixed(1)}`
      : null,
  ].filter(Boolean);

  const p50 = data.p50RevenueUsd ?? data.revenueEstimate ?? null;
  const hasRange =
    Array.isArray(data.revenueRange) &&
    data.revenueRange.length === 2 &&
    Number(data.revenueRange[0]) > 0 &&
    Number(data.revenueRange[1]) > 0;

  const waterfallSteps: Array<{
    name: string;
    deltaUsd?: number;
    deltaMillions?: number;
    impact?: string;
  }> = Array.isArray(data.waterfall) ? data.waterfall : [];

  return (
    <div className="chat-card chat-card--forecast">
      <div className="chat-card__header">
        <div className="chat-card__title-row">
          <Activity size={15} className="chat-card__icon text-accent" />
          <span className="chat-card__heading">
            {data.title ? `${data.title} · Forecast` : 'Algorithmic Forecast'}
          </span>
        </div>
        <span className={`chat-badge chat-badge--${abstained ? 'neutral' : data.confidence || 'medium'}`}>
          {abstained ? 'withheld' : `${data.confidence || 'medium'} confidence`}
        </span>
      </div>

      {metaParts.length > 0 && (
        <div className="chat-card__meta-strip">{metaParts.join(' · ')}</div>
      )}

      <div className="chat-card__forecast-main">
        <div className="chat-card__prob-ring">
          <svg className="chat-prob-svg" viewBox="0 0 76 76" width="76" height="76" aria-hidden="true">
            <circle
              cx="38"
              cy="38"
              r={radius}
              fill="none"
              stroke="rgba(224, 243, 241, 0.1)"
              strokeWidth="4.5"
            />
            {!abstained && (
              <circle
                cx="38"
                cy="38"
                r={radius}
                fill="none"
                stroke={isBull ? '#34d399' : '#fb7185'}
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 38 38)"
              />
            )}
          </svg>
          <div className="chat-prob-inner">
            <span
              className={`chat-card__prob-val chat-forecast-prob ${
                abstained ? 'text-muted' : isBull ? 'text-hit' : 'text-flop'
              }`}
            >
              {abstained ? '—' : `${hitPct}%`}
            </span>
            <span className="chat-card__prob-label">
              {abstained ? 'Withheld' : 'Hit Prob'}
            </span>
          </div>
        </div>

        <div className="chat-card__metrics">
          {abstained ? (
            <>
              <div className="chat-metric">
                <span className="chat-metric__label">Model Status</span>
                <span className="chat-metric__value chat-metric__value--sm">
                  Forecast Withheld
                </span>
              </div>
              <p className="chat-card__disclaimer">
                {Array.isArray(data.abstainReasons) && data.abstainReasons.length > 0
                  ? `Held back due to ${data.abstainReasons.join(', ')}.`
                  : data.disclaimer || 'Insufficient verified pre-release signals to issue a numeric call.'}
              </p>
            </>
          ) : (
            <>
              <div className="chat-metric">
                <span className="chat-metric__label">
                  {p50 ? 'Projected Worldwide (P50)' : 'Revenue Bracket'}
                </span>
                <span className="chat-metric__value">
                  {p50 ? money(p50) : hasRange ? `${money(data.revenueRange[0])} – ${money(data.revenueRange[1])}` : 'Estimating…'}
                </span>
              </div>
              {hasRange && (
                <div className="chat-metric__sub">
                  P10–P90 Bracket: {money(data.revenueRange[0])} – {money(data.revenueRange[1])}
                </div>
              )}
              {data.disclaimer && (
                <p className="chat-card__disclaimer">{data.disclaimer}</p>
              )}
            </>
          )}
        </div>
      </div>

      {!abstained && waterfallSteps.length > 0 ? (
        <div className="chat-card__drivers">
          <span className="chat-card__drivers-label">Signal Attribution</span>
          <div className="chat-waterfall-chips">
            {waterfallSteps.slice(0, 4).map((w, idx) => {
              const delta = Number(w.deltaMillions ?? 0);
              const sign = delta > 0 ? '+' : delta < 0 ? '-' : '';
              const cls =
                w.impact === 'positive'
                  ? 'text-hit'
                  : w.impact === 'negative'
                  ? 'text-flop'
                  : 'text-muted';
              return (
                <span key={idx} className="chat-chip chat-chip--driver">
                  <span>{w.name}</span>
                  {delta !== 0 && (
                    <strong className={`mono ${cls}`}>
                      {sign}${Math.abs(delta)}M
                    </strong>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        data.topDrivers &&
        data.topDrivers.length > 0 && (
          <div className="chat-card__drivers">
            <span className="chat-card__drivers-label">Key Signals</span>
            <div className="chat-chips-wrap">
              {data.topDrivers.slice(0, 3).map((driver: string, idx: number) => (
                <span key={idx} className="chat-chip chat-chip--driver">
                  {driver}
                </span>
              ))}
            </div>
          </div>
        )
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
  const humanCount = typeof data.humanCount === 'number' ? data.humanCount : null;
  const hitShare = data.hitShare ?? 0;
  const flopShare = count > 0 ? 100 - hitShare : 0;

  return (
    <div className="chat-card chat-card--pulse">
      <div className="chat-card__header">
        <div className="chat-card__title-row">
          <Sparkles size={15} className="chat-card__icon text-accent" />
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
            <span>
              {count} Total Calls
              {humanCount !== null && humanCount !== count ? ` (${humanCount} verified human)` : ''}
            </span>
            {data.sampleSizeWarning && (
              <span className="chat-badge chat-badge--warning">
                <AlertTriangle size={11} />
                <span>Small sample (&lt;10)</span>
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="chat-pulse-empty">
          <p>No community predictions yet. Open the Prediction Desk to cast the first call.</p>
        </div>
      )}

      {data.titleId && (
        <button
          type="button"
          className="chat-card__action-link"
          onClick={() => openTitle(data.titleId, 'pulse')}
        >
          <span>Vote in Community Pulse</span>
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
            <Film size={18} />
          </div>
        )}

        <div className="chat-title-info">
          <h4 className="chat-title-heading">{data.title}</h4>
          <div className="chat-title-meta">
            {data.releaseDate && <span>{String(data.releaseDate).slice(0, 4)}</span>}
            {data.runtime && <span>{data.runtime}m</span>}
            {data.director && <span>Dir. {data.director}</span>}
            {typeof data.voteAverage === 'number' && data.voteAverage > 0 && (
              <span className="chat-rating">★ {data.voteAverage.toFixed(1)}</span>
            )}
          </div>
          {Array.isArray(data.genres) && data.genres.length > 0 && (
            <div className="chat-chips-wrap">
              {data.genres.slice(0, 3).map((g: string) => (
                <span key={g} className="chat-chip chat-chip--small">
                  {g}
                </span>
              ))}
            </div>
          )}
          {data.overview && <p className="chat-title-overview">{data.overview}</p>}
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
                tagline: data.tagline || '',
                backdrop: data.backdrop || null,
                source: 'tmdb',
                mediaType: data.mediaType || 'movie',
                runtime: data.runtime || null,
                seasons: data.seasons || null,
                status: data.status || 'released',
                voteAverage: data.voteAverage || null,
                voteCount: data.voteCount || 0,
                popularity: data.popularity || null,
                cast: data.cast || [],
                trailerKey: null,
                director: data.director || null,
                budget: data.budget || null,
                revenue: data.revenue || null,
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

  const renderCol = (item: any) => {
    const abstained =
      Boolean(item.abstained) ||
      (Number(item.hitProbability ?? 0) === 0 && Number(item.flopProbability ?? 0) === 0);
    return (
      <div
        className="chat-compare-col"
        onClick={() => openTitle(item.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') openTitle(item.id);
        }}
      >
        {item.poster && (
          <img src={item.poster} alt={item.title} className="chat-compare-poster" />
        )}
        <span className="chat-compare-name">{item.title}</span>
        {(item.releaseDate || item.runtime) && (
          <span className="chat-compare-meta">
            {[
              item.releaseDate ? String(item.releaseDate).slice(0, 4) : null,
              item.runtime ? `${item.runtime}m` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
        <span
          className={`chat-compare-prob ${
            abstained ? 'text-muted' : item.hitProbability >= 50 ? 'text-hit' : 'text-flop'
          }`}
        >
          {abstained ? 'Forecast withheld' : `${item.hitProbability}% Hit`}
        </span>
        {!abstained && item.revenueEstimate ? (
          <span className="chat-compare-rev">{money(item.revenueEstimate)}</span>
        ) : item.voteAverage ? (
          <span className="chat-compare-rev">TMDB ★ {Number(item.voteAverage).toFixed(1)}</span>
        ) : null}
      </div>
    );
  };

  return (
    <div className="chat-card chat-card--compare">
      <div className="chat-card__header">
        <span className="chat-card__heading">Head-to-Head Comparison</span>
      </div>

      <div className="chat-compare-grid">
        {renderCol(titleA)}
        <div className="chat-compare-divider">
          <span>VS</span>
        </div>
        {renderCol(titleB)}
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
            className="button small secondary"
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
  const { openTitle, showAuth } = useApp();
  const items = data.items || [];
  const cinemas = data.cinemas || [];

  if (data.authRequired) {
    return (
      <div className="chat-card chat-card--list">
        <div className="chat-card__header">
          <div className="chat-card__title-row">
            <Sparkles size={15} className="chat-card__icon text-accent" />
            <span className="chat-card__heading">Personal Recommendations</span>
          </div>
          <span className="chat-badge">Sign in required</span>
        </div>
        <p className="chat-card__disclaimer">
          {data.message || 'Sign in and rate a few films to unlock Taste DNA recommendations.'}
        </p>
        <div>
          <button type="button" className="button small primary" onClick={() => showAuth()}>
            <LogIn size={13} />
            <span>Sign in</span>
          </button>
        </div>
      </div>
    );
  }

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
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') openTitle(item.id);
            }}
          >
            {item.poster ? (
              <img src={item.poster} alt={item.title} className="chat-list-poster" />
            ) : (
              <div className="chat-list-poster chat-list-poster--empty">
                <Film size={14} />
              </div>
            )}
            <div className="chat-list-item-info">
              <span className="chat-list-item-title">{item.title}</span>
              <span className="chat-list-item-meta">
                {item.releaseDate ? String(item.releaseDate).slice(0, 4) : 'TBA'}
                {item.runtime ? ` · ${item.runtime}m` : ''}
                {item.voteAverage ? ` · ★ ${Number(item.voteAverage).toFixed(1)}` : ''}
                {item.director ? ` · ${item.director}` : ''}
              </span>
              {item.reasonText && (
                <span className="chat-list-item-reason">{item.reasonText}</span>
              )}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="chat-card__disclaimer">
            {data.message || 'No matching titles found in the current catalog.'}
          </p>
        )}
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
              {d.name} ({d.type}
              {d.price ? ` · ${d.price}` : ''}) <ExternalLink size={10} />
            </a>
          ))}
        </div>
      )}

      {subs.length > 0 && (
        <div className="chat-card__drivers">
          <span className="chat-card__drivers-label">Included with Subscription</span>
          <div className="chat-chips-wrap">
            {subs.map((name: string, idx: number) => (
              <span key={idx} className="chat-chip chat-chip--small">
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {rentOrBuy.length > 0 && (
        <div className="chat-card__drivers">
          <span className="chat-card__drivers-label">Rent or Buy</span>
          <div className="chat-chips-wrap">
            {rentOrBuy.map((name: string, idx: number) => (
              <span key={idx} className="chat-chip chat-chip--small">
                {name}
              </span>
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
          <Award size={15} className="chat-card__icon text-accent" />
          <span className="chat-card__heading">
            Quad-Consensus · {data.titleName}
          </span>
        </div>
        {data.mpaaRating && <span className="chat-badge">{data.mpaaRating}</span>}
      </div>

      <div className="chat-consensus-grid">
        <div className="chat-metric">
          <span className="chat-metric__label">Rotten Tomatoes</span>
          <span className="chat-metric__value text-accent">
            {data.rottenTomatoes || '—'}
          </span>
        </div>
        <div className="chat-metric">
          <span className="chat-metric__label">IMDb</span>
          <span className="chat-metric__value">{data.imdbRating || '—'}</span>
        </div>
        <div className="chat-metric">
          <span className="chat-metric__label">Metascore</span>
          <span className="chat-metric__value text-hit">
            {data.metascore || '—'}
          </span>
        </div>
        <div className="chat-metric">
          <span className="chat-metric__label">TMDB</span>
          <span className="chat-metric__value">{data.tmdbScore || '—'}</span>
        </div>
      </div>

      {data.awards && (
        <div className="chat-awards-row">
          <Award size={12} className="text-accent" />
          <span>{data.awards}</span>
        </div>
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
  const { showAuth } = useApp();

  if (data.authRequired) {
    return (
      <div className="chat-card chat-card--accuracy">
        <div className="chat-card__header">
          <div className="chat-card__title-row">
            <ShieldCheck size={15} className="chat-card__icon text-accent" />
            <span className="chat-card__heading">Your Accuracy Ledger</span>
          </div>
          <span className="chat-badge">Sign in required</span>
        </div>
        <p className="chat-card__disclaimer">
          {data.message || 'Sign in to view your personal Brier score and prediction accuracy.'}
        </p>
        <div>
          <button type="button" className="button small primary" onClick={() => showAuth()}>
            <LogIn size={13} />
            <span>Sign in</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-card chat-card--accuracy">
      <div className="chat-card__header">
        <div className="chat-card__title-row">
          <ShieldCheck size={15} className="chat-card__icon text-accent" />
          <span className="chat-card__heading">Your Accuracy Ledger</span>
        </div>
        {data.rank && <span className="chat-badge chat-badge--stage">Rank #{data.rank}</span>}
      </div>

      <div className="chat-card__metrics-grid">
        <div className="chat-metric">
          <span className="chat-metric__label">Accuracy Rate</span>
          <span className="chat-metric__value text-hit">
            {data.accuracyRate !== null && data.accuracyRate !== undefined
              ? `${data.accuracyRate}%`
              : 'N/A'}
          </span>
        </div>
        <div className="chat-metric">
          <span className="chat-metric__label">Brier Score</span>
          <span className="chat-metric__value">
            {data.brierScore !== null && data.brierScore !== undefined
              ? Number(data.brierScore).toFixed(3)
              : 'N/A'}
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
  const benchmarks = Array.isArray(data.benchmarks) ? data.benchmarks : [];

  return (
    <div className="chat-card chat-card--accuracy">
      <div className="chat-card__header">
        <div className="chat-card__title-row">
          <ShieldCheck size={15} className="chat-card__icon text-accent" />
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
          No resolved predictions yet — accuracy updates automatically as releases settle.
        </p>
      )}

      {benchmarks.length > 0 && (
        <div className="chat-card__drivers">
          <span className="chat-card__drivers-label">Recent Benchmarks</span>
          <div className="chat-chips-wrap">
            {benchmarks.slice(0, 3).map((b: any, i: number) => (
              <span key={i} className="chat-chip chat-chip--small">
                {b.period || b.modelVersion}: Brier {Number(b.brierScore ?? 0).toFixed(3)}
              </span>
            ))}
          </div>
        </div>
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
          <TrendingUp size={15} className="chat-card__icon text-accent" />
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
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') openTitle(item.titleId);
            }}
          >
            {item.poster ? (
              <img src={item.poster} alt={item.title} className="chat-list-poster" />
            ) : (
              <div className="chat-list-poster chat-list-poster--empty">
                <Film size={14} />
              </div>
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
            <span
              className={`chat-chip chat-chip--small ${
                item.contrarianSide === 'model_bullish' ? 'text-hit' : 'text-flop'
              }`}
            >
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
