import { useEffect, useRef, useState } from 'react';
import { Sparkles, Users, Star, TrendingUp, Tv2, AlertCircle } from 'lucide-react';
import type { ScoreCardData } from '@/lib/scoreCard';
import { api } from './client';
import { useReducedMotion } from './hooks/useReducedMotion';

function AnimatedCounter({ target, decimals = 0, suffix = '', duration = 650 }: { target: number; decimals?: number; suffix?: string; duration?: number }) {
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
    let frameId: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      setVal(Number((ease * target).toFixed(decimals)));
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [target, decimals, duration, prefersReduced]);

  return <>{decimals > 0 ? val.toFixed(decimals) : Math.round(val)}{suffix}</>;
}

function AnimatedPulseMeter({ target }: { target: number }) {
  return <span className="metric mono amber"><AnimatedCounter target={target} suffix="%" /></span>;
}

// Client-side in-memory cache for ultra-fast instant modal transitions
interface ClientCacheEntry {
  data: ScoreCardData;
  timestamp: number;
}

const clientScoreCardMemory = new Map<string, ClientCacheEntry>();
const CLIENT_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes in client memory

function getClientCached(titleId: string): ScoreCardData | null {
  const now = Date.now();
  const inMem = clientScoreCardMemory.get(titleId);
  if (inMem && now - inMem.timestamp < CLIENT_CACHE_TTL_MS) {
    return inMem.data;
  }

  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const raw = window.sessionStorage.getItem(`cp_sc_${titleId}`);
      if (raw) {
        const parsed: ClientCacheEntry = JSON.parse(raw);
        if (now - parsed.timestamp < CLIENT_CACHE_TTL_MS) {
          clientScoreCardMemory.set(titleId, parsed);
          return parsed.data;
        }
      }
    } catch {
      // storage quota or serialization error fallback
    }
  }
  return null;
}

function setClientCached(titleId: string, data: ScoreCardData): void {
  const entry: ClientCacheEntry = { data, timestamp: Date.now() };
  clientScoreCardMemory.set(titleId, entry);
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(`cp_sc_${titleId}`, JSON.stringify(entry));
    } catch {
      // ignore
    }
  }
}

export function CinePulseScoreCard({ titleId }: { titleId: string }) {
  const cached = getClientCached(titleId);
  const [data, setData] = useState<ScoreCardData | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const prefersReduced = useReducedMotion();

  const LOADING_STEPS = [
    'Querying TMDB verified catalog & live telemetry…',
    'Calibrating P10–P90 Box-Office predictive models…',
    'Aggregating community forecast telemetry & consensus…',
    'Scanning regional streaming & theatrical availability…',
  ];

  useEffect(() => {
    if (!loading || prefersReduced) return;
    const interval = setInterval(() => {
      setStepIndex(prev => (prev + 1) % LOADING_STEPS.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [loading, prefersReduced]);

  const loadData = () => {
    const existing = getClientCached(titleId);
    if (existing) {
      setData(existing);
      setLoading(false);
      // If cached entry is fresh (< 2 mins old), skip background network call completely
      const memEntry = clientScoreCardMemory.get(titleId);
      if (memEntry && Date.now() - memEntry.timestamp < 2 * 60 * 1000) {
        return () => {};
      }
    } else {
      setLoading(true);
    }

    const controller = new AbortController();
    setError(null);
    api<ScoreCardData>(`/score-card/${titleId}`, 'GET', undefined, controller.signal)
      .then(res => {
        setData(res);
        setClientCached(titleId, res);
        setLoading(false);
      })
      .catch((err: any) => {
        if (err?.name === 'AbortError') return;
        if (!existing) {
          setError(err?.message || 'Failed to sync score card telemetry');
        }
        setLoading(false);
      });
    return () => controller.abort();
  };

  useEffect(() => {
    return loadData();
  }, [titleId]);

  if (loading) {
    return (
      <div className="cinepulse-score-card-container score-card-loading-container" role="status" aria-live="polite" aria-busy="true">
        <div className="score-card-skeleton glass">
          {/* Dynamic Live Status Bar */}
          <div className="score-card-skel-header">
            <div className="skel-header-left">
              <span className="skel-live-radar" aria-hidden="true">
                <span className="skel-radar-ring" />
                <span className="skel-radar-dot" />
              </span>
              <span className="skel-header-title">CALIBRATING CINEPULSE INTELLIGENCE</span>
              <span className="skel-divider" aria-hidden="true">·</span>
              <span className="skel-header-step" key={stepIndex}>
                {LOADING_STEPS[stepIndex]}
              </span>
            </div>
            <div className="skel-header-right">
              <Sparkles size={12} className="skel-sparkle mint" />
              <span className="skel-badge">TMDB &amp; BOX OFFICE ML</span>
            </div>
          </div>

          {/* Structured Skeleton Pills Grid */}
          <div className="score-card-skel-grid">
            {/* 1. Box Office Forecast */}
            <div className="score-pill score-pill-skeleton">
              <div className="score-pill-header">
                <TrendingUp size={13} className="pill-icon mint pulse-subtle" />
                <span className="pill-label">BOX-OFFICE FORECAST</span>
              </div>
              <div className="score-pill-val">
                <div className="skel-bar skel-metric-bar shimmer" style={{ width: '110px' }} />
              </div>
              <div className="skel-bar skel-sub-bar shimmer" style={{ width: '80%' }} />
            </div>

            {/* 2. Community Pulse */}
            <div className="score-pill score-pill-skeleton">
              <div className="score-pill-header">
                <Users size={13} className="pill-icon amber pulse-subtle" />
                <span className="pill-label">COMMUNITY PULSE</span>
              </div>
              <div className="score-pill-val">
                <div className="skel-bar skel-metric-bar shimmer" style={{ width: '64px' }} />
                <div className="skel-tag-placeholder shimmer" />
              </div>
              <div className="skel-bar skel-sub-bar shimmer" style={{ width: '70%' }} />
            </div>

            {/* 3. TMDB Rating */}
            <div className="score-pill score-pill-skeleton">
              <div className="score-pill-header">
                <Star size={13} className="pill-icon coral pulse-subtle" />
                <span className="pill-label">TMDB RATING</span>
              </div>
              <div className="score-pill-val">
                <div className="skel-bar skel-metric-bar shimmer" style={{ width: '58px' }} />
                <span className="skel-sub-text mono">/ 10</span>
              </div>
              <div className="skel-bar skel-sub-bar shimmer" style={{ width: '60%' }} />
            </div>

            {/* 4. Where to Stream */}
            <div className="score-pill score-pill-skeleton">
              <div className="score-pill-header">
                <Tv2 size={13} className="pill-icon text-muted pulse-subtle" />
                <span className="pill-label">WHERE TO STREAM</span>
              </div>
              <div className="streaming-provider-list">
                <div className="skel-stream-badge shimmer" />
                <div className="skel-stream-badge shimmer" />
                <div className="skel-stream-badge shimmer" />
              </div>
              <div className="skel-bar skel-sub-bar shimmer" style={{ width: '65%' }} />
            </div>
          </div>

          {/* Bottom Laser Scanner Track */}
          <div className="skel-scan-track" aria-hidden="true">
            <div className="skel-scan-beam" />
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="cinepulse-score-card-container">
        <div className="score-card-error-state glass">
          <div className="score-card-error-content">
            <AlertCircle size={15} className="coral" />
            <span>TMDB and Box-Office intelligence temporarily unavailable.</span>
          </div>
          <button type="button" className="button secondary small health-retry" onClick={loadData}>
            Retry Calibration
          </button>
        </div>
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
          <div className="score-pill taste-match-pill ovx-spot" style={{ '--i': 0 } as React.CSSProperties}>
            <div className="score-pill-header">
              <Sparkles size={13} className="pill-icon mint" />
              <span className="pill-label">YOUR TASTE MATCH</span>
            </div>
            <div className="score-pill-val">
              <span className="metric mono mint"><AnimatedCounter target={tasteMatch.matchScore} suffix="%" /></span>
            </div>
            <span className="pill-sub">Calibrated to your {tasteMatch.sampleSize} ratings</span>
          </div>
        )}

        {/* 2. Box-Office Forecast: always predicted range, never single-point */}
        <div className="score-pill box-office-pill ovx-spot" style={{ '--i': 1 } as React.CSSProperties}>
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
        <div className="score-pill community-pulse-pill ovx-spot" style={{ '--i': 2 } as React.CSSProperties}>
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
          <div className="score-pill rt-pill ovx-spot" style={{ '--i': 3 } as React.CSSProperties}>
            <div className="score-pill-header">
              <span style={{ fontSize: 13, lineHeight: 1 }}>🍅</span>
              <span className="pill-label">ROTTEN TOMATOES</span>
            </div>
            <div className="score-pill-val">
              <span className="metric mono" style={{ color: rtScore >= 60 ? '#f43f5e' : '#10b981' }}><AnimatedCounter target={rtScore} suffix="%" /></span>
              <span className="hit-tag" style={{ background: rtScore >= 75 ? 'rgba(244,63,94,0.18)' : 'rgba(255,255,255,0.08)', color: rtScore >= 60 ? '#f43f5e' : '#94a3b8' }}>
                {rtScore >= 75 ? 'CERTIFIED' : rtScore >= 60 ? 'FRESH' : 'ROTTEN'}
              </span>
            </div>
            <span className="pill-sub">Verified Tomatometer</span>
          </div>
        ) : null}

        {/* 5. IMDb Rating (OMDb Verified) */}
        {imdbScore !== null && imdbScore !== undefined ? (
          <div className="score-pill imdb-pill ovx-spot" style={{ '--i': 4 } as React.CSSProperties}>
            <div className="score-pill-header">
              <Star size={13} className="pill-icon" style={{ color: '#f5c518' }} />
              <span className="pill-label">IMDb RATING</span>
            </div>
            <div className="score-pill-val">
              <span className="metric mono" style={{ color: '#f5c518' }}><AnimatedCounter target={imdbScore} decimals={1} /></span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>/ 10</span>
            </div>
            <span className="pill-sub">Global Audience Benchmark</span>
          </div>
        ) : null}

        {/* 6. Metascore (OMDb Verified) */}
        {metaScore !== null && metaScore !== undefined ? (
          <div className="score-pill meta-pill ovx-spot" style={{ '--i': 5 } as React.CSSProperties}>
            <div className="score-pill-header">
              <span style={{ fontSize: 12, fontWeight: 900, background: metaScore >= 60 ? '#10b981' : metaScore >= 40 ? '#f59e0b' : '#ef4444', color: '#000', padding: '0 4px', borderRadius: 2 }}>M</span>
              <span className="pill-label">METASCORE</span>
            </div>
            <div className="score-pill-val">
              <span className="metric mono" style={{ color: metaScore >= 60 ? '#10b981' : metaScore >= 40 ? '#f59e0b' : '#ef4444' }}><AnimatedCounter target={metaScore} /></span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>/ 100</span>
            </div>
            <span className="pill-sub">Critical Metacritic Score</span>
          </div>
        ) : null}

        {/* 7. TMDB Users Score */}
        <div className="score-pill critics-pill ovx-spot" style={{ '--i': 6 } as React.CSSProperties}>
          <div className="score-pill-header">
            <Star size={13} className="pill-icon coral" />
            <span className="pill-label">TMDB RATING</span>
          </div>
          <div className="score-pill-val">
            {criticsTmdb.voteCount > 0 ? (
              <span className="metric mono">{criticsTmdb.formattedScore}</span>
            ) : (
              <span className="metric mono muted-text" style={{ fontSize: 13 }}>Not rated yet</span>
            )}
          </div>
          <span className="pill-sub">
            {criticsTmdb.voteCount > 0 ? `${criticsTmdb.voteCount.toLocaleString()} votes` : 'Opens to ratings on release'}
          </span>
        </div>

        {/* 8. Streaming Providers */}
        <div className="score-pill streaming-pill ovx-spot" style={{ '--i': 7 } as React.CSSProperties}>
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
