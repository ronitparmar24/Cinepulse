import { useEffect, useRef, useState } from 'react';
import { Sparkles, Users, Star, TrendingUp, Tv2, AlertCircle } from 'lucide-react';
import type { ScoreCardData } from '@/lib/scoreCard';
import { api } from './client';
import { useReducedMotion } from './hooks/useReducedMotion';

function AnimatedPulseMeter({ target }: { target: number }) {
  const prefersReduced = useReducedMotion();
  const [val, setVal] = useState(prefersReduced ? target : 0);
  const animatedRef = useRef(false);

  useEffect(() => {
    if (prefersReduced) {
      setVal(target);
      return;
    }
    if (animatedRef.current) return;
    animatedRef.current = true;

    const start = performance.now();
    const duration = 600;
    let frameId: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(ease * target));
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [target, prefersReduced]);

  return <span className="metric mono amber">{val}%</span>;
}

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

  const { tasteMatch, communityPulse, criticsTmdb, omdb, boxOfficeForecast, streaming } = data;

  const rtScore = omdb?.rottenTomatoesPct;
  const imdbScore = omdb?.imdbRating;
  const metaScore = omdb?.metascore;

  return (
    <div className="cinepulse-score-card-container">
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

        {/* 2. Box-Office Forecast: always predicted range, never single-point */}
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

        {/* 3. Community Pulse: percentage only if >= 10 calls, else 'Not enough calls yet' */}
        <div className="score-pill community-pulse-pill">
          <div className="score-pill-header">
            <Users size={13} className="pill-icon amber" />
            <span className="pill-label">COMMUNITY PULSE</span>
          </div>
          <div className="score-pill-val">
            {communityPulse.available && communityPulse.hitPercentage !== null ? (
              <div className="pulse-meter-container">
                <AnimatedPulseMeter target={communityPulse.hitPercentage} />
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

        {/* 4. Rotten Tomatoes (OMDb Verified) */}
        {rtScore !== null && rtScore !== undefined ? (
          <div className="score-pill rt-pill">
            <div className="score-pill-header">
              <span style={{ fontSize: 13, lineHeight: 1 }}>🍅</span>
              <span className="pill-label">ROTTEN TOMATOES</span>
            </div>
            <div className="score-pill-val">
              <span className="metric mono" style={{ color: rtScore >= 60 ? '#f43f5e' : '#10b981' }}>{rtScore}%</span>
              <span className="hit-tag" style={{ background: rtScore >= 75 ? 'rgba(244,63,94,0.18)' : 'rgba(255,255,255,0.08)', color: rtScore >= 60 ? '#f43f5e' : '#94a3b8' }}>
                {rtScore >= 75 ? 'CERTIFIED' : rtScore >= 60 ? 'FRESH' : 'ROTTEN'}
              </span>
            </div>
            <span className="pill-sub">Verified Tomatometer</span>
          </div>
        ) : null}

        {/* 5. IMDb Rating (OMDb Verified) */}
        {imdbScore !== null && imdbScore !== undefined ? (
          <div className="score-pill imdb-pill">
            <div className="score-pill-header">
              <Star size={13} className="pill-icon" style={{ color: '#f5c518' }} />
              <span className="pill-label">IMDb RATING</span>
            </div>
            <div className="score-pill-val">
              <span className="metric mono" style={{ color: '#f5c518' }}>{imdbScore.toFixed(1)}</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>/ 10</span>
            </div>
            <span className="pill-sub">Global Audience Benchmark</span>
          </div>
        ) : null}

        {/* 6. Metascore (OMDb Verified) */}
        {metaScore !== null && metaScore !== undefined ? (
          <div className="score-pill meta-pill">
            <div className="score-pill-header">
              <span style={{ fontSize: 11, fontWeight: 900, background: metaScore >= 60 ? '#10b981' : metaScore >= 40 ? '#f59e0b' : '#ef4444', color: '#000', padding: '0 4px', borderRadius: 2 }}>M</span>
              <span className="pill-label">METASCORE</span>
            </div>
            <div className="score-pill-val">
              <span className="metric mono" style={{ color: metaScore >= 60 ? '#10b981' : metaScore >= 40 ? '#f59e0b' : '#ef4444' }}>{metaScore}</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>/ 100</span>
            </div>
            <span className="pill-sub">Critical Metacritic Score</span>
          </div>
        ) : null}

        {/* 7. TMDB Users Score */}
        <div className="score-pill critics-pill">
          <div className="score-pill-header">
            <Star size={13} className="pill-icon coral" />
            <span className="pill-label">TMDB RATING</span>
          </div>
          <div className="score-pill-val">
            <span className="metric mono">{criticsTmdb.formattedScore}</span>
          </div>
          <span className="pill-sub">
            {criticsTmdb.voteCount > 0 ? `${criticsTmdb.voteCount.toLocaleString()} votes` : 'Unrated catalog entry'}
          </span>
        </div>

        {/* 8. Streaming Providers */}
        <div className="score-pill streaming-pill">
          <div className="score-pill-header">
            <Tv2 size={13} className="pill-icon" />
            <span className="pill-label">WHERE TO STREAM</span>
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

      {/* Auxiliary Badges: Parental Rating & Accolades/Awards */}
      {(omdb?.rated || omdb?.awards) && (
        <div className="score-card-aux-row">
          {omdb.rated && omdb.rated !== 'N/A' && (
            <span className="aux-tag aux-rated" title="Content Maturity Rating">
              <strong>CERTIFICATION</strong> {omdb.rated}
            </span>
          )}
          {omdb.awards && omdb.awards !== 'N/A' && (
            <span className="aux-tag aux-awards" title={omdb.awards}>
              🏆 {omdb.awards}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
