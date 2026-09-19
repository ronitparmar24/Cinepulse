'use client';
import { useEffect, useState } from 'react';
import { Sparkles, Users, Star, TrendingUp, Tv2, AlertCircle } from 'lucide-react';
import type { ScoreCardData } from '@/lib/scoreCard';
import { api } from './client';

export function CinePulseScoreCard({ titleId }: { titleId: string }) {
  const [data, setData] = useState<ScoreCardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api<ScoreCardData>(`/score-card/${titleId}`, 'GET', undefined, controller.signal)
      .then(res => {
        setData(res);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
    return () => controller.abort();
  }, [titleId]);

  if (loading) {
    return (
      <div className="score-card-skeleton glass">
        <div className="skeleton-pill" />
        <div className="skeleton-pill" />
        <div className="skeleton-pill" />
      </div>
    );
  }

  if (!data) return null;

  const { tasteMatch, communityPulse, criticsTmdb, boxOfficeForecast, streaming } = data;

  return (
    <div className="cinepulse-score-card glass">
      {/* 1. Taste Match: strictly hidden if < 5 ratings */}
      {tasteMatch.available && tasteMatch.matchScore !== null && (
        <div className="score-pill taste-match-pill">
          <div className="score-pill-header">
            <Sparkles size={13} className="pill-icon mint" />
            <span className="pill-label">YOUR TASTE MATCH</span>
          </div>
          <div className="score-pill-val">
            <span className="metric mono mint">{tasteMatch.matchScore}%</span>
          </div>
          <span className="pill-sub">Calibrated to your {tasteMatch.sampleSize} ratings</span>
        </div>
      )}

      {/* 2. Community Pulse: percentage only if >= 10 calls, else 'Not enough calls yet' */}
      <div className="score-pill community-pulse-pill">
        <div className="score-pill-header">
          <Users size={13} className="pill-icon amber" />
          <span className="pill-label">COMMUNITY PULSE</span>
        </div>
        <div className="score-pill-val">
          {communityPulse.available && communityPulse.hitPercentage !== null ? (
            <div className="pulse-meter-container">
              <span className="metric mono amber">{communityPulse.hitPercentage}%</span>
              <span className="hit-tag">HIT</span>
            </div>
          ) : (
            <span className="metric mono muted-text" style={{ fontSize: 13 }}>
              {communityPulse.statusText}
            </span>
          )}
        </div>
        <span className="pill-sub">
          {communityPulse.totalCalls > 0
            ? `${communityPulse.totalCalls} community calls`
            : 'Be the first to forecast'}
        </span>
      </div>

      {/* 3. Critics / TMDB Audience Score */}
      <div className="score-pill critics-pill">
        <div className="score-pill-header">
          <Star size={13} className="pill-icon coral" />
          <span className="pill-label">CRITICS / TMDB</span>
        </div>
        <div className="score-pill-val">
          <span className="metric mono">{criticsTmdb.formattedScore}</span>
        </div>
        <span className="pill-sub">
          {criticsTmdb.voteCount > 0 ? `${criticsTmdb.voteCount.toLocaleString()} verified ratings` : 'Unrated catalog entry'}
        </span>
      </div>

      {/* 4. Box-Office Forecast: always predicted range, never single-point */}
      <div className="score-pill box-office-pill">
        <div className="score-pill-header">
          <TrendingUp size={13} className="pill-icon mint" />
          <span className="pill-label">BOX-OFFICE FORECAST</span>
        </div>
        <div className="score-pill-val">
          <span className="metric mono">{boxOfficeForecast.predictedGrossRange}</span>
        </div>
        <span className="pill-sub mono">
          P10–P90 Range · {boxOfficeForecast.confidenceLevel}
        </span>
      </div>

      {/* 5. Streaming Providers */}
      <div className="score-pill streaming-pill">
        <div className="score-pill-header">
          <Tv2 size={13} className="pill-icon" />
          <span className="pill-label">STREAMING</span>
        </div>
        <div className="streaming-provider-list">
          {streaming.flatrate && streaming.flatrate.length > 0 ? (
            streaming.flatrate.slice(0, 3).map(p => (
              <div key={p.providerId} className="stream-badge-mini" title={p.providerName}>
                {p.logoPath ? (
                  <img src={p.logoPath} alt={p.providerName} loading="lazy" />
                ) : (
                  <span>{p.providerName.slice(0, 3)}</span>
                )}
              </div>
            ))
          ) : (
            <span className="metric mono muted-text" style={{ fontSize: 12 }}>Theatrical / TBA</span>
          )}
        </div>
        <span className="pill-sub">
          {streaming.flatrate.length > 0 ? `${streaming.flatrate[0].providerName}` : 'Check options'}
        </span>
      </div>
    </div>
  );
}
