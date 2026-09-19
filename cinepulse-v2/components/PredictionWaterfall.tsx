'use client';
import { TrendingUp, TrendingDown, Minus, Info, ShieldCheck } from 'lucide-react';
import type { Prediction } from '@/lib/types';
import { money } from './client';

export function PredictionWaterfall({ prediction }: { prediction: Prediction }) {
  const explanation = prediction.explanation;
  if (!explanation || !explanation.waterfall || explanation.waterfall.length === 0) {
    return (
      <div className="waterfall-container glass">
        <p className="muted-text">Waterfall signal attribution is calculating for this release footprint.</p>
      </div>
    );
  }

  const maxAbsDelta = Math.max(
    ...explanation.waterfall.map(w => Math.abs(w.deltaUsd)),
    10_000_000
  );

  return (
    <div className="waterfall-attribution-card glass">
      <div className="waterfall-header">
        <div className="waterfall-title-group">
          <ShieldCheck size={16} className="mint" />
          <h4>Model Signal Decomposition</h4>
        </div>
        <span className="mono text-muted text-xs">
          Baseline Anchor: {money(explanation.baseUsd)}
        </span>
      </div>

      <p className="waterfall-subtitle">
        CinePulse forecast attributions step-by-step from theatrical baseline to median outcome.
      </p>

      <div className="waterfall-steps-list">
        {explanation.waterfall.map((step, idx) => {
          const isPositive = step.impact === 'positive';
          const isNegative = step.impact === 'negative';
          const isNeutral = step.impact === 'neutral';

          const pctWidth = Math.min(100, Math.max(12, Math.round((Math.abs(step.deltaUsd) / maxAbsDelta) * 100)));
          const sign = isPositive ? '+' : isNegative ? '-' : '';

          return (
            <div key={idx} className="waterfall-step-row">
              <div className="step-meta">
                <span className="step-name">{step.name}</span>
                <span className={`step-delta mono ${isPositive ? 'mint' : isNegative ? 'coral' : 'amber'}`}>
                  {isNeutral ? money(step.deltaUsd) : `${sign}${money(Math.abs(step.deltaUsd))}`}
                </span>
              </div>

              <div className="step-bar-track">
                <div
                  className={`step-bar-fill ${isPositive ? 'fill-mint' : isNegative ? 'fill-coral' : 'fill-neutral'}`}
                  style={{ width: `${pctWidth}%` }}
                />
              </div>

              <div className="step-footer">
                <span className="step-expl">{step.explanation}</span>
                <span className="step-cumulative mono text-xs text-muted">
                  Subtotal: {money(step.cumulativeUsd)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="waterfall-final-summary">
        <div className="final-label">Final Data-Backed Forecast (P50)</div>
        <div className="final-value mono mint">{money(explanation.finalP50Usd)}</div>
      </div>
    </div>
  );
}

export function TitlePredictionHistory({
  prediction,
  actualRevenue,
  releaseStatus
}: {
  prediction: Prediction;
  actualRevenue: number | null;
  releaseStatus: string;
}) {
  const isReleased = releaseStatus === 'released';
  const p10 = prediction.p10RevenueUsd ?? (prediction.revenueRange ? prediction.revenueRange[0] : null);
  const p90 = prediction.p90RevenueUsd ?? (prediction.revenueRange ? prediction.revenueRange[1] : null);
  const p50 = prediction.p50RevenueUsd ?? prediction.revenueEstimate ?? 0;

  return (
    <div className="prediction-history-card glass">
      <div className="history-header">
        <span className="eyebrow">FORECAST TRACKING & ADJUDICATION</span>
        <h4>Pre-Release Forecast vs Theatrical Reality</h4>
      </div>

      <div className="history-grid">
        <div className="history-metric-box">
          <span className="box-title">Pre-Release Forecast (Frozen)</span>
          <span className="box-val mono">{money(p50)}</span>
          <span className="box-sub mono text-xs">
            P10–P90 Range: {p10 && p90 ? `${money(p10)} – ${money(p90)}` : 'Estimating'}
          </span>
        </div>

        <div className="history-metric-box">
          <span className="box-title">Actual Theatrical Gross</span>
          {isReleased && actualRevenue && actualRevenue > 0 ? (
            <>
              <span className="box-val mono mint">{money(actualRevenue)}</span>
              <span className="box-sub mono text-xs">
                {p10 && p90 && actualRevenue >= p10 && actualRevenue <= p90
                  ? '✓ Verified within 80% confidence interval'
                  : 'Reported box-office total'}
              </span>
            </>
          ) : (
            <>
              <span className="box-val mono muted-text">In Theaters / Pending</span>
              <span className="box-sub text-xs muted-text">
                Actuals update weekly post-opening
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
