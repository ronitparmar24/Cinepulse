import { useEffect, useState } from 'react';
import { Dna, Award, Sparkles, Film, Clock, Compass, Shield, Flame, CheckCircle2, Lock } from 'lucide-react';
import type { TasteDna } from '@/lib/tasteDna';
import { api } from './client';
import { useReducedMotion } from './hooks/useReducedMotion';

export function TasteDnaView({
  username,
  compact = false,
  userRatingCount = 0
}: {
  username: string;
  compact?: boolean;
  userRatingCount?: number;
}) {
  const [dna, setDna] = useState<TasteDna | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const prefersReduced = useReducedMotion();
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (prefersReduced) {
      setAnimated(true);
      return;
    }
    const t = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(t);
  }, [dna, prefersReduced]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api<{ tasteDna: TasteDna }>(`/user/${username}/taste-dna`, 'GET', undefined, controller.signal)
      .then(res => {
        setDna(res.tasteDna);
        setLoading(false);
      })
      .catch(err => {
        // May fail if user has < 5 ratings or user doesn't exist
        setDna(null);
        setLoading(false);
      });
    return () => controller.abort();
  }, [username]);

  if (loading) {
    return (
      <div className="taste-dna-skeleton glass pad-card">
        <div className="skeleton-line" style={{ width: '50%', height: 24, marginBottom: 16 }} />
        <div className="skeleton-line" style={{ width: '80%', height: 16, marginBottom: 8 }} />
        <div className="skeleton-line" style={{ width: '60%', height: 16 }} />
      </div>
    );
  }

  // Sample-Size Gate Locked State (< 5 ratings)
  if (!dna) {
    const needed = Math.max(1, 5 - userRatingCount);
    const progressPct = Math.min(100, Math.round((userRatingCount / 5) * 100));

    return (
      <div className="taste-dna-locked-card glass pad-card">
        <div className="locked-icon-wrap">
          <Dna size={28} className="amber" />
        </div>
        <div className="locked-content">
          <span className="eyebrow amber">SAMPLE-SIZE GATE ACTIVE</span>
          <h3>Rate {needed} more {needed === 1 ? 'film' : 'films'} to unlock your Taste DNA</h3>
          <p className="muted-text">
            To prevent premature or misleading profiles, CinePulse activates your cinematic archetype, tendencies, and Bayesian creator affinities once you have rated 5 movies.
          </p>
          <div className="dna-unlock-progress-bar">
            <div className="dna-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="mono text-xs text-muted">
            {userRatingCount} of 5 ratings completed
          </span>
        </div>
      </div>
    );
  }

  // Compact View (for profile preview)
  if (compact) {
    return (
      <div className="taste-dna-compact-card glass">
        <div className="compact-header">
          <div className="archetype-badge-pill">
            <Dna size={14} className="mint" />
            <span className="archetype-name">{dna.archetype.name}</span>
          </div>
          <span className="mono text-xs text-muted">{dna.sampleSize} ratings</span>
        </div>
        <p className="compact-tagline">"{dna.archetype.tagline}"</p>
        <div className="compact-keywords">
          {dna.archetype.signatureKeywords.slice(0, 3).map((kw, i) => (
            <span key={i} className="kw-badge">{kw}</span>
          ))}
        </div>
      </div>
    );
  }

  // Full View
  return (
    <div className="taste-dna-full-container">
      {/* Hero: Archetype Spotlight */}
      <div className="dna-archetype-hero glass pad-card">
        <div className="archetype-meta-top">
          <div className="dna-icon-pill">
            <Dna size={18} className="mint" />
            <span>CINEMATIC ARCHETYPE</span>
          </div>
          <span className="mono text-xs text-muted">
            Calibrated on {dna.sampleSize} verified user ratings
          </span>
        </div>

        <h2 className="archetype-title">{dna.archetype.name}</h2>
        <p className="archetype-tagline">"{dna.archetype.tagline}"</p>
        <p className="archetype-desc">{dna.archetype.description}</p>

        <div className="archetype-keywords-row">
          {dna.archetype.signatureKeywords.map((kw, i) => (
            <span key={i} className="archetype-kw-pill">
              #{kw}
            </span>
          ))}
        </div>
      </div>

      <div className="dna-grid-two-col">
        {/* Left: Key Empirical Statistical Tendencies */}
        <div className="dna-column glass pad-card">
          <div className="column-header">
            <Compass size={16} className="mint" />
            <h4>Empirical Tendencies</h4>
          </div>
          <ul className="dna-tendencies-list">
            {dna.tendencies.statements.map((stmt, idx) => (
              <li key={idx} className="tendency-item">
                <span className="tendency-bullet mint">▸</span>
                <span>{stmt}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right: Bayesian Creator Affinities */}
        <div className="dna-column glass pad-card">
          <div className="column-header">
            <Film size={16} className="mint" />
            <h4>Top Directors (Bayesian Weighted)</h4>
          </div>
          <div className="creator-ranking-list">
            {dna.topCreators.directors.length > 0 ? (
              dna.topCreators.directors.map((dir, idx) => (
                <div key={idx} className="creator-rank-row">
                  <span className="rank-num mono">#{idx + 1}</span>
                  <div className="creator-info">
                    <span className="creator-name">{dir.name}</span>
                    <span className="creator-stats mono text-xs text-muted">
                      {dir.count} logged · Avg {dir.avgRating}★ (Score: {dir.bayesianScore})
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted-text">Log more films by favorite directors to rank affinities.</p>
            )}
          </div>
        </div>
      </div>

      {/* Genre & Era Spread */}
      <div className="dna-grid-two-col">
        <div className="dna-column glass pad-card">
          <div className="column-header">
            <Flame size={16} className="amber" />
            <h4>Genre Distribution</h4>
          </div>
          <div className="dna-distribution-bars">
            {dna.genreDistribution.map(g => (
              <div key={g.genre} className="dist-row">
                <div className="dist-label-row">
                  <span>{g.genre}</span>
                  <span className="mono text-xs">{g.pct}% ({g.count})</span>
                </div>
                <div className="dist-track">
                  <div className="dist-fill fill-mint" style={{ width: `${g.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="dna-column glass pad-card">
          <div className="column-header">
            <Clock size={16} className="amber" />
            <h4>Era Spread</h4>
          </div>
          <div className="dna-distribution-bars">
            {dna.eraDistribution.map(e => (
              <div key={e.decade} className="dist-row">
                <div className="dist-label-row">
                  <span>{e.decade}</span>
                  <span className="mono text-xs">{e.pct}% ({e.count})</span>
                </div>
                <div className="dist-track">
                  <div className="dist-fill fill-amber" style={{ width: `${e.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Badges Grid */}
      <div className="dna-badges-card glass pad-card">
        <div className="column-header">
          <Award size={16} className="mint" />
          <h4>Taste & Community Badges</h4>
        </div>
        <div className="badges-grid">
          {dna.badges.map(b => (
            <div key={b.id} className={`badge-item ${b.unlocked ? 'unlocked' : 'locked'}`}>
              <div className="badge-icon-box">{b.icon}</div>
              <div className="badge-meta">
                <div className="badge-name-row">
                  <span className="badge-name">{b.name}</span>
                  {b.unlocked ? (
                    <CheckCircle2 size={13} className="mint" />
                  ) : (
                    <Lock size={12} className="muted-text" />
                  )}
                </div>
                <span className="badge-desc">{b.description}</span>
                {b.progress && <span className="badge-progress mono">{b.progress}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
