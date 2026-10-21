'use client';

import React, { useState, useEffect } from 'react';
import { Radio, Info, TrendingUp, Eye, Play, BarChart2, Flame, ThumbsUp, Bookmark, Sparkles } from 'lucide-react';
import type { HypeRadarData, HypeRadarPoint } from '../lib/cron/snapshotHype';

interface HypeRadarProps {
  titleId: string;
  initialData?: HypeRadarData;
}

function PreReleaseSignals({ data }: { data: HypeRadarData }) {
  const trakt = data.traktStats;
  const yt = data.youtubeTrailer;
  const score = data.momentumScore ?? 50;
  const level = data.momentumLevel ?? 'Steady Climb';

  const scoreColor = score >= 85 ? '#f43f5e' : score >= 70 ? '#38bdf8' : score >= 50 ? '#34d399' : '#94a3b8';

  return (
    <div className="hype-telemetry" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Momentum Progress Bar */}
      <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Flame size={13} style={{ color: scoreColor }} /> Composite Pre-Release Momentum
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor }}>
            {level} · <span className="mono">{score}/100</span>
          </span>
        </div>
        <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <div
            style={{
              width: `${score}%`,
              height: '100%',
              background: `linear-gradient(90deg, #34d399, ${scoreColor})`,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {/* Trakt & YouTube metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: trakt && yt ? '1fr 1fr' : '1fr', gap: 10 }}>
        {trakt && (
          <div style={{ background: 'rgba(237, 28, 36, 0.05)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(237, 28, 36, 0.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#f87171', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Bookmark size={11} /> Trakt Anticipation
              </span>
              {trakt.rankAnticipated && (
                <span className="mono" style={{ fontSize: 9, background: 'rgba(237, 28, 36, 0.2)', color: '#fca5a5', padding: '1px 5px', borderRadius: 4 }}>
                  Rank #{trakt.rankAnticipated}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>
              {trakt.listCount.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8' }}>watchlist adds</span>
            </div>
            {trakt.slope14d !== null && (
              <div style={{ fontSize: 10, color: trakt.slope14d >= 0 ? '#34d399' : '#f87171', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                <TrendingUp size={10} /> +{trakt.slope14d}/day 14d pace
              </div>
            )}
          </div>
        )}

        {yt && (
          <div style={{ background: 'rgba(244, 63, 94, 0.05)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(244, 63, 94, 0.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#fb7185', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Play size={11} /> YouTube Velocity
              </span>
              <span className="mono" style={{ fontSize: 9, background: 'rgba(244, 63, 94, 0.2)', color: '#fda4af', padding: '1px 5px', borderRadius: 4 }}>
                48h telemetry
              </span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>
              +{yt.dailyVelocity.toLocaleString()}/day <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8' }}>velocity</span>
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <ThumbsUp size={10} style={{ color: '#34d399' }} /> {yt.likeRatio}% positive engagement
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function HypeRadar({ titleId, initialData }: HypeRadarProps) {
  const [data, setData] = useState<HypeRadarData | null>(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [activePoint, setActivePoint] = useState<HypeRadarPoint | null>(null);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`/api/hype-radar/${encodeURIComponent(titleId)}`);
        if (!res.ok) throw new Error('Failed to load');
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) {
          setData({
            titleId,
            points: [],
            dateRange: null,
            sources: ['Wikipedia Pageviews', 'YouTube Trailer Views', 'TMDB Popularity'],
            hasEnoughData: false,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [titleId, initialData]);

  if (loading) {
    return (
      <div className="hype-radar-card glass loading" style={{ padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '13px' }}>
          <Radio size={16} className="spin-slow" />
          <span>Polling pre-release hype radar...</span>
        </div>
      </div>
    );
  }

  // Acceptance: Hype Radar renders an empty state when < 3 data points
  if (!data || !data.hasEnoughData || data.points.length < 3) {
    const pointCount = data?.points?.length || 0;
    const hasAuxSignals = Boolean(data?.traktStats || data?.youtubeTrailer);
    return (
      <div
        className="hype-radar-card glass empty"
        data-testid="hype-radar-empty"
        style={{
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(15, 23, 42, 0.4)',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio size={16} style={{ color: '#00e5ff' }} />
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>Pre-Release Hype Radar</h4>
          </div>
          <span style={{ fontSize: '11px', color: '#64748b', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '6px' }}>
            {pointCount} / 3 daily signals
          </span>
        </div>
        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
          Collecting daily point-in-time hype signals from Wikipedia pageviews, YouTube trailer velocity, and TMDB traffic. Full momentum curves appear after 3 days of snapshots.
        </p>
        {hasAuxSignals && data && <PreReleaseSignals data={data} />}
      </div>
    );
  }

  const points = data.points;
  const wikiVals = points.map(p => p.wikiViews ?? 0);
  const ytVals = points.map(p => p.ytViews ?? 0);

  const maxWiki = Math.max(...wikiVals, 100);
  const minWiki = Math.min(...wikiVals, 0);
  const maxYt = Math.max(...ytVals, 100);
  const minYt = Math.min(...ytVals, 0);

  // Sparkline SVG dimensions
  const svgWidth = 280;
  const svgHeight = 44;
  const padding = 4;

  const buildPath = (vals: number[], min: number, max: number) => {
    if (vals.length < 2) return '';
    const span = max - min || 1;
    const stepX = (svgWidth - padding * 2) / (vals.length - 1);
    return vals
      .map((v, i) => {
        const x = padding + i * stepX;
        const y = svgHeight - padding - ((v - min) / span) * (svgHeight - padding * 2);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const wikiPath = buildPath(wikiVals, minWiki, maxWiki);
  const ytPath = buildPath(ytVals, minYt, maxYt);

  const active = activePoint || points[points.length - 1];

  return (
    <div
      className="hype-radar-card glass"
      data-testid="hype-radar-card"
      style={{
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(15, 23, 42, 0.5)',
        marginBottom: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Radio size={16} style={{ color: '#00e5ff' }} />
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>Pre-Release Hype Radar</h4>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontSize: '11px',
              color: '#38bdf8',
              background: 'rgba(56, 189, 248, 0.1)',
              padding: '2px 8px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title={`Sources: ${data.sources.join(', ')} | Range: ${data.dateRange?.start} to ${data.dateRange?.end}`}
          >
            <Info size={11} />
            {data.dateRange ? `${data.dateRange.start} → ${data.dateRange.end}` : `${points.length} snapshots`}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '12px' }}>
        {/* Wikipedia Views Sparkline */}
        <div
          style={{
            background: 'rgba(255,255,255,0.02)',
            padding: '10px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Eye size={12} style={{ color: '#38bdf8' }} /> Wikipedia (7d)
            </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0', fontFamily: 'monospace' }}>
              {active.wikiViews !== null ? active.wikiViews.toLocaleString() : 'N/A'}
            </span>
          </div>
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', height: '36px', overflow: 'visible' }}>
            <path d={wikiPath} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* YouTube Views Sparkline */}
        <div
          style={{
            background: 'rgba(255,255,255,0.02)',
            padding: '10px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Play size={12} style={{ color: '#f43f5e' }} /> Trailer Views
            </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0', fontFamily: 'monospace' }}>
              {active.ytViews !== null ? (active.ytViews > 1e6 ? `${(active.ytViews / 1e6).toFixed(1)}M` : active.ytViews.toLocaleString()) : 'N/A'}
            </span>
          </div>
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', height: '36px', overflow: 'visible' }}>
            <path d={ytPath} fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Date timeline selector / tooltip indicator */}
      <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: '#64748b' }}>
          Date: <strong style={{ color: '#94a3b8' }}>{active.date}</strong>
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {points.map(p => (
            <button
              key={p.date}
              type="button"
              onClick={() => setActivePoint(p)}
              onMouseEnter={() => setActivePoint(p)}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                background: active.date === p.date ? '#00e5ff' : 'rgba(255,255,255,0.2)',
                padding: 0,
                transition: 'all 0.15s ease',
              }}
              title={`${p.date}: Wiki: ${p.wikiViews ?? 'N/A'}, Trailer: ${p.ytViews ?? 'N/A'}`}
            />
          ))}
        </div>
      </div>

      {Boolean(data.traktStats || data.youtubeTrailer) && (
        <PreReleaseSignals data={data} />
      )}
    </div>
  );
}
