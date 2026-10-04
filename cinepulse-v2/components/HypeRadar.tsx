'use client';

import React, { useState, useEffect } from 'react';
import { Radio, Info, TrendingUp, Eye, Play, BarChart2 } from 'lucide-react';
import type { HypeRadarData, HypeRadarPoint } from '../lib/cron/snapshotHype';

interface HypeRadarProps {
  titleId: string;
  initialData?: HypeRadarData;
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
    </div>
  );
}
