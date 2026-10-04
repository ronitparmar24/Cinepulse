'use client';
import { useState, useMemo } from 'react';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Share2,
  RotateCcw,
  Check,
  ShieldAlert,
  Flame,
  Film,
  Zap,
  Award,
  Swords,
  Sliders,
  Percent,
} from 'lucide-react';
import type { Title } from '@/lib/types';
import {
  MULTIVERSE_PRESETS,
  simulateMultiverseTrajectory,
  type MultiverseTimelineId,
  type MultiverseScenarioParams,
} from '@/lib/multiverse';
import { formatInrCrores } from '@/lib/currencyFormat';
import { money } from './client';

export function MultiverseLab({
  title,
  onClose,
}: {
  title: Title;
  onClose?: () => void;
}) {
  const baseBudget = title.budget && title.budget > 5_000_000 ? title.budget : 65_000_000;

  const [activeTimeline, setActiveTimeline] = useState<MultiverseTimelineId>('prime');
  const [copied, setCopied] = useState(false);
  const [hoveredWeek, setHoveredWeek] = useState<number | null>(null);

  // Custom scenario params state initialized from prime preset
  const [customParams, setCustomParams] = useState<MultiverseScenarioParams>(() => {
    const prime = MULTIVERSE_PRESETS.find(p => p.id === 'prime')!;
    return prime.params(baseBudget);
  });

  // Calculate current effective params
  const currentParams = useMemo(() => {
    if (activeTimeline === 'custom') {
      return customParams;
    }
    const preset = MULTIVERSE_PRESETS.find(p => p.id === activeTimeline);
    return preset ? preset.params(baseBudget) : customParams;
  }, [activeTimeline, customParams, baseBudget]);

  // Run the simulation
  const simulation = useMemo(() => {
    return simulateMultiverseTrajectory(title, currentParams, activeTimeline);
  }, [title, currentParams, activeTimeline]);

  const handlePresetSelect = (id: MultiverseTimelineId) => {
    setActiveTimeline(id);
    if (id !== 'custom') {
      const preset = MULTIVERSE_PRESETS.find(p => p.id === id);
      if (preset) {
        setCustomParams(preset.params(baseBudget));
      }
    }
  };

  const updateParam = <K extends keyof MultiverseScenarioParams>(
    key: K,
    value: MultiverseScenarioParams[K]
  ) => {
    setActiveTimeline('custom');
    setCustomParams(prev => ({ ...prev, [key]: value }));
  };

  const handleCopyDossier = () => {
    const text = [
      `🌌 [CinePulse Multiverse Dossier] ${title.title}`,
      `Timeline: ${simulation.timelineName} (${simulation.tagline})`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `• Projected Worldwide Gross: $${Math.round(simulation.worldwideGross / 1_000_000)}M (Range: $${Math.round(simulation.p10 / 1_000_000)}M - $${Math.round(simulation.p90 / 1_000_000)}M)`,
      `• Production Budget: $${Math.round(simulation.params.budget / 1_000_000)}M`,
      `• Theatrical Break-Even: $${Math.round(simulation.breakEvenThreshold / 1_000_000)}M (2.5x Multiple)`,
      `• Hit Probability: ${simulation.hitProbability}%`,
      `• Net Studio ROI: ${simulation.netRoiPercent > 0 ? '+' : ''}${simulation.netRoiPercent}%`,
      `• Executive Verdict: ${simulation.verdictLabel}`,
      `• Key Recommendation: ${simulation.executiveBrief.headline}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `Simulated on CinePulse Multiverse Engine (https://cinepulse-kohl.vercel.app)`,
    ].join('\n');

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    }
  };

  // Trajectory SVG coordinates calculation
  const svgWidth = 840;
  const svgHeight = 240;
  const padLeft = 60;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 35;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const maxVal = Math.max(
    simulation.worldwideGross * 1.15,
    simulation.breakEvenThreshold * 1.25,
    100_000_000
  );

  const points = simulation.trajectory.map((pt, idx) => {
    const x = padLeft + (idx / (simulation.trajectory.length - 1)) * chartW;
    const y = padTop + chartH - (pt.cumulativeGross / maxVal) * chartH;
    return { ...pt, x, y };
  });

  const breakEvenY = padTop + chartH - (simulation.breakEvenThreshold / maxVal) * chartH;

  const pathD = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = points[i - 1];
    const cx1 = prev.x + (p.x - prev.x) / 2;
    const cy1 = prev.y;
    const cx2 = prev.x + (p.x - prev.x) / 2;
    const cy2 = p.y;
    return `${acc} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p.x} ${p.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${padTop + chartH} L ${points[0].x} ${padTop + chartH} Z`;

  const inrBreakdown = formatInrCrores(simulation.params.budget, 83.5, '2026-10-04');

  const verdictColor =
    simulation.verdict === 'phenomenon'
      ? '#c084fc' // purple-400
      : simulation.verdict === 'profitable_hit'
      ? '#34d399' // emerald-400
      : simulation.verdict === 'marginal_survivor'
      ? '#fbbf24' // amber-400
      : '#f87171'; // red-400

  return (
    <div className="multiverse-container" style={{ padding: '4px 0 24px' }}>
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
          padding: '16px 24px',
          background: 'radial-gradient(ellipse at 85% 0%, rgba(168, 85, 247, 0.14), transparent 60%), #13191f',
          borderRadius: 16,
          border: '1px solid rgba(168, 85, 247, 0.25)',
          marginBottom: 20,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 2,
                color: '#c084fc',
                background: 'rgba(168, 85, 247, 0.15)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                padding: '3px 8px',
                borderRadius: 6,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Sparkles size={11} /> BOX OFFICE MULTIVERSE
            </span>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>• Studio Scenario Lab & Trajectory Engine</span>
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: '4px 0 2px', letterSpacing: -0.5 }}>
            {title.title}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            Simulate alternate theatrical realities, live studio greenlight levers, and 10-week box-office trajectories.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="button secondary small"
            onClick={() => handlePresetSelect('prime')}
            title="Reset to Prime Timeline baseline"
            style={{ fontSize: 11, padding: '7px 12px' }}
          >
            <RotateCcw size={13} /> Reset Baseline
          </button>
          <button
            type="button"
            className="button primary small"
            onClick={handleCopyDossier}
            style={{
              fontSize: 11,
              padding: '7px 14px',
              background: 'linear-gradient(135deg, #a855f7, #6366f1)',
              color: '#fff',
              border: 0,
            }}
          >
            {copied ? <Check size={13} /> : <Share2 size={13} />}
            {copied ? 'Dossier Copied!' : 'Export Dossier'}
          </button>
        </div>
      </div>

      {/* Multiverse Reality Presets (Dimensions) */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span className="eyebrow" style={{ color: '#c084fc' }}>
            <Zap size={12} /> SELECT TIMELINE DIMENSION
          </span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            Active: <strong style={{ color: '#f4f6f5' }}>{simulation.timelineName}</strong>
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 10,
          }}
        >
          {MULTIVERSE_PRESETS.map(preset => {
            const isSelected = activeTimeline === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetSelect(preset.id)}
                style={{
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: isSelected
                    ? `radial-gradient(circle at top left, ${preset.color}22, rgba(255,255,255,0.03))`
                    : 'rgba(255, 255, 255, 0.02)',
                  border: isSelected ? `1.5px solid ${preset.color}` : '1px solid var(--border)',
                  boxShadow: isSelected ? `0 0 16px ${preset.color}25` : 'none',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 18 }}>{preset.icon}</span>
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      color: isSelected ? preset.color : 'var(--muted)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {preset.id === 'prime' ? 'BASE' : 'TIMELINE'}
                  </span>
                </div>
                <strong style={{ fontSize: 12, color: isSelected ? '#fff' : '#cbd5e1' }}>
                  {preset.shortLabel}
                </strong>
                <span
                  style={{
                    fontSize: 9,
                    color: 'var(--muted)',
                    lineHeight: 1.3,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {preset.tagline}
                </span>
              </button>
            );
          })}

          {/* Sandbox Button */}
          <button
            type="button"
            onClick={() => setActiveTimeline('custom')}
            style={{
              textAlign: 'left',
              padding: '12px 14px',
              borderRadius: 12,
              background:
                activeTimeline === 'custom'
                  ? 'radial-gradient(circle at top left, rgba(6, 182, 212, 0.22), rgba(255,255,255,0.03))'
                  : 'rgba(255, 255, 255, 0.02)',
              border:
                activeTimeline === 'custom'
                  ? '1.5px solid #06b6d4'
                  : '1px solid var(--border)',
              boxShadow: activeTimeline === 'custom' ? '0 0 16px rgba(6, 182, 212, 0.25)' : 'none',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 18 }}>🎛️</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: '#06b6d4' }}>STUDIO</span>
            </div>
            <strong style={{ fontSize: 12, color: activeTimeline === 'custom' ? '#fff' : '#cbd5e1' }}>
              Custom Sandbox
            </strong>
            <span style={{ fontSize: 9, color: 'var(--muted)', lineHeight: 1.3 }}>
              Tune all budget & corridor levers manually
            </span>
          </button>
        </div>
      </div>

      {/* Main Simulation Deck: Interactive Chart & Live Stat Summary */}
      <div
        style={{
          background: 'rgba(18, 23, 28, 0.85)',
          borderRadius: 18,
          border: '1px solid var(--border)',
          padding: '20px 22px',
          marginBottom: 20,
        }}
      >
        {/* Top Summary Banner */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
            borderBottom: '1px solid var(--border)',
            paddingBottom: 16,
            marginBottom: 16,
          }}
        >
          <div>
            <span style={{ fontSize: 10, letterSpacing: 1.5, color: 'var(--muted)', textTransform: 'uppercase' }}>
              PROJECTED WORLDWIDE GROSS
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
              <strong style={{ fontSize: 32, letterSpacing: -1, color: '#fff' }}>
                ${(simulation.worldwideGross / 1_000_000).toFixed(1)}M
              </strong>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                Range: ${(simulation.p10 / 1_000_000).toFixed(0)}M (P10) – ${(simulation.p90 / 1_000_000).toFixed(0)}M (P90)
              </span>
            </div>
          </div>

          {/* Verdict Chip */}
          <div style={{ textAlign: 'right' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 20,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.8,
                background: `${verdictColor}18`,
                border: `1px solid ${verdictColor}45`,
                color: verdictColor,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: verdictColor }} />
              {simulation.verdictLabel}
            </span>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              Break-Even: ${(simulation.breakEvenThreshold / 1_000_000).toFixed(0)}M (2.5x Rule) •{' '}
              {simulation.breakEvenWeek ? (
                <span style={{ color: '#34d399' }}>Reached in Week {simulation.breakEvenWeek}</span>
              ) : (
                <span style={{ color: '#f87171' }}>Unreached</span>
              )}
            </div>
          </div>
        </div>

        {/* 10-Week Trajectory Curve SVG */}
        <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ width: '100%', height: 'auto', display: 'block', minWidth: 640 }}
          >
            <defs>
              <linearGradient id="curveGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="50%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>

              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
              </linearGradient>

              <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Grid Lines */}
            {[0.25, 0.5, 0.75, 1.0].map((ratio, i) => {
              const y = padTop + chartH - ratio * chartH;
              const valM = Math.round((ratio * maxVal) / 1_000_000);
              return (
                <g key={i}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={svgWidth - padRight}
                    y2={y}
                    stroke="rgba(255,255,255,0.06)"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="9"
                    fontFamily="sans-serif"
                  >
                    ${valM}M
                  </text>
                </g>
              );
            })}

            {/* Break-Even Threshold Line */}
            {breakEvenY >= padTop && breakEvenY <= padTop + chartH && (
              <g>
                <line
                  x1={padLeft}
                  y1={breakEvenY}
                  x2={svgWidth - padRight}
                  y2={breakEvenY}
                  stroke="#fbbf24"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                  opacity="0.85"
                />
                <text
                  x={svgWidth - padRight}
                  y={breakEvenY - 6}
                  textAnchor="end"
                  fill="#fbbf24"
                  fontSize="9"
                  fontWeight="600"
                  fontFamily="sans-serif"
                >
                  ⚡ Break-Even Threshold (${Math.round(simulation.breakEvenThreshold / 1_000_000)}M)
                </text>
              </g>
            )}

            {/* Area under curve */}
            <path d={areaD} fill="url(#areaGradient)" />

            {/* Trajectory Main Curve */}
            <path
              d={pathD}
              fill="none"
              stroke="url(#curveGradient)"
              strokeWidth="3.5"
              filter="url(#neonGlow)"
            />

            {/* Week Data Points */}
            {points.map((pt, idx) => {
              const isHovered = hoveredWeek === pt.week;
              return (
                <g
                  key={pt.week}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredWeek(pt.week)}
                  onMouseLeave={() => setHoveredWeek(null)}
                >
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isHovered ? 7 : 4}
                    fill={isHovered ? '#fff' : '#a855f7'}
                    stroke="#0b0e12"
                    strokeWidth="2"
                    style={{ transition: 'r 0.15s ease' }}
                  />
                  {/* X Axis Label */}
                  <text
                    x={pt.x}
                    y={padTop + chartH + 18}
                    textAnchor="middle"
                    fill={isHovered ? '#fff' : '#8d989f'}
                    fontSize="10"
                    fontWeight={isHovered ? '700' : '400'}
                  >
                    W{pt.week}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Interactive Week Tooltip */}
          {hoveredWeek !== null && (
            <div
              style={{
                position: 'absolute',
                top: 10,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(11, 14, 18, 0.95)',
                border: '1px solid rgba(168, 85, 247, 0.4)',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 11,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                display: 'flex',
                gap: 16,
                pointerEvents: 'none',
              }}
            >
              <span>
                <strong>Week {hoveredWeek}:</strong>
              </span>
              <span>
                Weekend: <strong style={{ color: '#38bdf8' }}>${(simulation.trajectory[hoveredWeek - 1].weekendGross / 1_000_000).toFixed(1)}M</strong>
              </span>
              <span>
                Drop: <strong style={{ color: simulation.trajectory[hoveredWeek - 1].dropPercent > 55 ? '#f87171' : '#34d399' }}>
                  {hoveredWeek === 1 ? 'Opening' : `-${simulation.trajectory[hoveredWeek - 1].dropPercent}%`}
                </strong>
              </span>
              <span>
                Total WW: <strong style={{ color: '#c084fc' }}>${(simulation.trajectory[hoveredWeek - 1].cumulativeGross / 1_000_000).toFixed(1)}M</strong>
              </span>
            </div>
          )}
        </div>

        {/* 4 Financial Pulse Metric Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 12,
            marginTop: 18,
            borderTop: '1px solid var(--border)',
            paddingTop: 16,
          }}
        >
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
              HIT PROBABILITY
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <strong style={{ fontSize: 22, color: simulation.hitProbability >= 60 ? '#34d399' : '#f87171' }}>
                {simulation.hitProbability}%
              </strong>
              <small style={{ color: 'var(--muted)', fontSize: 10 }}>Platt-scaled</small>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
              NET STUDIO ROI
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <strong style={{ fontSize: 22, color: simulation.netRoiPercent > 0 ? '#34d399' : '#f87171' }}>
                {simulation.netRoiPercent > 0 ? `+${simulation.netRoiPercent}%` : `${simulation.netRoiPercent}%`}
              </strong>
              <small style={{ color: 'var(--muted)', fontSize: 10 }}>over break-even</small>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
              PRODUCTION BUDGET
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <strong style={{ fontSize: 22, color: '#fff' }}>
                ${Math.round(simulation.params.budget / 1_000_000)}M
              </strong>
            </div>
            {inrBreakdown && (
              <small style={{ color: '#8d989f', fontSize: 9, display: 'block', marginTop: 2 }}>
                {inrBreakdown}
              </small>
            )}
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
              MULTIPLE OVER BUDGET
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <strong style={{ fontSize: 22, color: simulation.worldwideGross / simulation.params.budget >= 2.5 ? '#34d399' : '#f87171' }}>
                {(simulation.worldwideGross / simulation.params.budget).toFixed(2)}x
              </strong>
              <small style={{ color: 'var(--muted)', fontSize: 10 }}>Target: 2.5x</small>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Studio Levers (Executive Control Sandbox) */}
      <div
        style={{
          background: 'rgba(18, 23, 28, 0.6)',
          borderRadius: 18,
          border: '1px solid var(--border)',
          padding: '20px 22px',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Sliders size={14} style={{ color: '#38bdf8' }} />
          <span className="eyebrow" style={{ color: '#38bdf8' }}>
            STUDIO GREENLIGHT CONTROLS (WHAT-IF LEVERS)
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20,
          }}
        >
          {/* Production Budget Slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
              <span style={{ color: '#cbd5e1' }}>Production Budget:</span>
              <strong style={{ color: '#38bdf8' }}>${Math.round(currentParams.budget / 1_000_000)}M USD</strong>
            </div>
            <input
              type="range"
              min={10_000_000}
              max={250_000_000}
              step={5_000_000}
              value={currentParams.budget}
              onChange={e => updateParam('budget', Number(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>
              <span>$10M (Micro/Indie)</span>
              <span>$100M (Mid-Tier)</span>
              <span>$250M (Mega-Tentpole)</span>
            </div>
          </div>

          {/* Rotten Tomatoes Critical Consensus */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
              <span style={{ color: '#cbd5e1' }}>Critical Consensus (Rotten Tomatoes):</span>
              <strong style={{ color: currentParams.criticalScore >= 75 ? '#34d399' : currentParams.criticalScore >= 60 ? '#fbbf24' : '#f87171' }}>
                {currentParams.criticalScore}% {currentParams.criticalScore >= 75 ? '🍅 Fresh' : '🍿 Mixed'}
              </strong>
            </div>
            <input
              type="range"
              min={25}
              max={98}
              step={1}
              value={currentParams.criticalScore}
              onChange={e => updateParam('criticalScore', Number(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>
              <span>25% (Rotten)</span>
              <span>60% (Mixed)</span>
              <span>98% (Masterpiece)</span>
            </div>
          </div>

          {/* Release Corridor Selector */}
          <div>
            <div style={{ fontSize: 11, color: '#cbd5e1', marginBottom: 8 }}>Release Corridor Window:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                { id: 'summer', label: '☀️ Summer', sub: 'May - Jul' },
                { id: 'holiday', label: '🎄 Holiday', sub: 'Nov - Dec' },
                { id: 'fall_awards', label: '🍂 Fall Awards', sub: 'Sep - Oct' },
                { id: 'spring', label: '🌸 Spring', sub: 'Mar - Apr' },
                { id: 'winter_dump', label: '❄️ Dump Window', sub: 'Jan - Feb' },
              ].map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => updateParam('releaseCorridor', c.id as any)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    fontSize: 10,
                    background: currentParams.releaseCorridor === c.id ? '#38bdf822' : 'rgba(255,255,255,0.03)',
                    border: currentParams.releaseCorridor === c.id ? '1px solid #38bdf8' : '1px solid var(--border)',
                    color: currentParams.releaseCorridor === c.id ? '#38bdf8' : '#cbd5e1',
                    cursor: 'pointer',
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Marketing Firepower & Theatrical Exclusivity */}
          <div>
            <div style={{ fontSize: 11, color: '#cbd5e1', marginBottom: 8 }}>Theatrical Exclusivity Window:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                { days: 17, label: '17-Day PVOD' },
                { days: 30, label: '30-Day Stream' },
                { days: 45, label: '45-Day Standard' },
                { days: 90, label: '90-Day Traditional' },
              ].map(w => (
                <button
                  key={w.days}
                  type="button"
                  onClick={() => updateParam('theatricalWindow', w.days as any)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    fontSize: 10,
                    background: currentParams.theatricalWindow === w.days ? '#a855f722' : 'rgba(255,255,255,0.03)',
                    border: currentParams.theatricalWindow === w.days ? '1px solid #a855f7' : '1px solid var(--border)',
                    color: currentParams.theatricalWindow === w.days ? '#c084fc' : '#cbd5e1',
                    cursor: 'pointer',
                  }}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Greenlight Intelligence Memo (Executive Strategic Briefing) */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01))',
          borderRadius: 18,
          border: '1px solid var(--border)',
          padding: '20px 22px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Award size={14} style={{ color: '#fbbf24' }} />
          <span className="eyebrow" style={{ color: '#fbbf24' }}>
            GREENLIGHT COMMITTEE STRATEGIC DIRECTIVE
          </span>
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f4f6f5', margin: '0 0 6px' }}>
          {simulation.executiveBrief.headline}
        </h3>
        <p style={{ fontSize: 12, color: '#a0afb5', lineHeight: 1.65, margin: '0 0 16px' }}>
          {simulation.executiveBrief.summary}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {simulation.executiveBrief.tactics.map((t, i) => (
            <div
              key={i}
              style={{
                background: 'rgba(0, 0, 0, 0.25)',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <strong style={{ fontSize: 11, color: '#e2e8f0', display: 'block', marginBottom: 4 }}>
                {t.title}
              </strong>
              <p style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
                {t.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
