'use client';
import { useEffect, useState } from 'react';
import { Zap, TrendingUp, TrendingDown, Users, Brain, Film, ArrowRight } from 'lucide-react';
import type { ContrarianItem } from '@/lib/contrarian';
import { api } from './client';
import { useApp } from './Context';

export function ContrarianDesk() {
  const { openTitle } = useApp();
  const [items, setItems] = useState<ContrarianItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api<{ contrarian: ContrarianItem[] }>('/contrarian', 'GET', undefined, controller.signal)
      .then(res => {
        setItems(res.contrarian || []);
        setLoading(false);
      })
      .catch(() => {
        setItems([]);
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="contrarian-skeleton glass pad-card">
        <div className="skeleton-line" style={{ width: '40%', height: 20, marginBottom: 12 }} />
        <div className="skeleton-line" style={{ width: '90%', height: 60 }} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="contrarian-empty-card glass pad-card">
        <div className="contrarian-header-row">
          <div className="title-with-icon">
            <Zap size={18} className="amber" />
            <h3>Contrarian Desk</h3>
          </div>
          <span className="mono text-xs text-muted">Divergence ≥ 20%</span>
        </div>
        <p className="muted-text">
          No active theatrical releases currently exceed the 20% divergence threshold between model forecast and community consensus. When model priors and crowd sentiment clash, they are surfaced here.
        </p>
      </div>
    );
  }

  return (
    <div className="contrarian-desk-card glass pad-card">
      <div className="contrarian-header-row">
        <div className="title-with-icon">
          <Zap size={18} className="coral" />
          <h3>Contrarian Desk</h3>
          <span className="contrarian-badge-count mono">{items.length} Active Clashes</span>
        </div>
        <span className="mono text-xs text-muted">
          ABS(Model − Community) ≥ 20%
        </span>
      </div>

      <p className="contrarian-subtitle">
        High-divergence titles where empirical historical priors and collective user sentiment sharply disagree.
      </p>

      <div className="contrarian-grid">
        {items.map(item => {
          const isModelBull = item.contrarianSide === 'model_bull_community_bear';
          const t = item.title;

          return (
            <div
              key={t.id}
              className="contrarian-item-card glass clickable-card"
              onClick={() => openTitle(t.id)}
            >
              <div className="contrarian-item-header">
                <div className="title-info">
                  <h4 className="movie-title">{t.title}</h4>
                  <span className="movie-meta mono text-xs text-muted">
                    {t.releaseDate ? t.releaseDate.slice(0, 4) : 'TBA'}
                    {t.director ? ` · ${t.director}` : ''}
                  </span>
                </div>

                <div className={`divergence-badge ${isModelBull ? 'model-bull' : 'model-bear'}`}>
                  {isModelBull ? (
                    <span>Model Bull · Crowd Skeptic</span>
                  ) : (
                    <span>Crowd Bull · Model Skeptic</span>
                  )}
                </div>
              </div>

              {/* Probabilities Comparison Bar */}
              <div className="contrarian-metrics-row">
                <div className="contrarian-metric-col">
                  <div className="col-label">
                    <Brain size={12} className="mint" />
                    <span>Model Forecast</span>
                  </div>
                  <span className="col-val mono mint">{item.modelHitProbability}% Hit</span>
                </div>

                <div className="delta-center-box mono coral">
                  Δ {item.divergence}%
                </div>

                <div className="contrarian-metric-col right">
                  <div className="col-label">
                    <Users size={12} className="amber" />
                    <span>Community Consensus</span>
                  </div>
                  <span className="col-val mono amber">{item.communityHitProbability}% Hit</span>
                </div>
              </div>

              {/* Explanation & Drivers */}
              <div className="divergence-reason-box">
                <p className="reason-statement">{item.reasoning.divergenceReason}</p>
                <div className="drivers-tag-list">
                  {item.reasoning.modelDrivers.map((driver, dIdx) => (
                    <span key={dIdx} className="driver-tag">
                      {driver}
                    </span>
                  ))}
                </div>
              </div>

              <div className="contrarian-item-footer">
                <span className="open-link mono text-xs">
                  Inspect Title Intelligence <ArrowRight size={12} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
