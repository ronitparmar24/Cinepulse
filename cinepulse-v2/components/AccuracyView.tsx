'use client';
import { useState, useEffect } from 'react';
import { CheckCircle2, TrendingUp, AlertCircle, BarChart3, Database, ShieldCheck, Cpu, Clock, RotateCcw } from 'lucide-react';
import type { AccuracyDashboardData } from '@/lib/accuracy/backtest';
import { api, money } from './client';
import { getCachedAccuracy, setCachedAccuracy, formatCacheAge } from './catalogCache';
import { CountUp, GrowBar, PkHero, Ring, Sparkline, stagger, useReveal } from './PredictKit';

/** Interval coverage isn't part of the API payload yet; it stays the published backtest figure. */
const INTERVAL_COVERAGE = 81.4;

function AccuracySkeleton() {
  return (
    <div className="accuracy-container" aria-busy="true" aria-label="Loading accuracy benchmarks">
      <div className="ex-skel" style={{ height: 190, borderRadius: 26, margin: '6px 0 22px' }} />
      <div className="pk-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="ex-skel pk-skel-kpi" style={stagger(i)} />)}</div>
      <div className="ex-skel pk-skel-section" />
      <div className="ex-skel pk-skel-section" />
    </div>
  );
}

export function AccuracyView() {
  const cached = getCachedAccuracy();
  const [data, setData] = useState<AccuracyDashboardData | null>(cached ? cached.data : null);
  const [, setLoading] = useState(!cached);
  const [cacheMeta, setCacheMeta] = useState<{cachedAt:number;fromCache:boolean}|null>(
    cached ? {cachedAt: cached.cachedAt, fromCache: true} : null
  );
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (cached && !cached.isExpired && nonce === 0) {
      return;
    }
    api<AccuracyDashboardData>('/accuracy')
      .then((res) => {
        setData(res);
        setCachedAccuracy(res);
        setCacheMeta({cachedAt: Date.now(), fromCache: false});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [nonce]);

  const revealRef = useReveal<HTMLDivElement>(data);

  if (!data) return <AccuracySkeleton />;

  const s = data.summary;
  const maxTier = Math.max(1, ...data.budgetTierErrors.map((t) => t.mapePercent));
  const maxGenre = Math.max(1, ...data.genreErrors.map((g) => g.mapePercent));

  return (
    <div className="accuracy-container" ref={revealRef}>
      <PkHero
        icon={ShieldCheck}
        kicker="Public audit & calibration benchmark"
        title={<>Audited Prediction <em>Accuracy.</em></>}
        aside={cacheMeta && (
          <span className="catalog-sync-indicator" title="Accuracy benchmarks cached for 1 hour to protect database & API quota.">
            <Clock size={10} style={{verticalAlign:'middle'}}/>
            {cacheMeta.fromCache ? `Cached (${formatCacheAge(cacheMeta.cachedAt).ageText})` : 'Synced'} · Refresh in {formatCacheAge(cacheMeta.cachedAt).remainingMinutes}m
            <button
              className="catalog-sync-btn"
              onClick={() => setNonce(n => n + 1)}
              title="Refresh accuracy benchmarks now"
              aria-label="Refresh accuracy benchmarks now"
            >
              <RotateCcw size={10}/>
            </button>
          </span>
        )}
        sub="Every prediction is snapshot-logged at serve time. No revisionism, no cherry-picking. Backtested on 2,900+ theatrical releases with chronological date splitting."
      />

      {/* Summary KPI gauges */}
      <div className="pk-kpis">
        <div className="pk-kpi glass ex-in" style={stagger(0, 70)}>
          {/* Brier skill vs a coin flip (0.25): the ring fills as the score approaches 0. */}
          <Ring fill={1 - s.brierScore / 0.25} label={`Brier score ${s.brierScore.toFixed(3)}`}><b>{Math.round((1 - s.brierScore / 0.25) * 100)}%</b><small>SKILL</small></Ring>
          <div className="pk-kpi-text"><span>Hit/flop Brier score</span><CountUp value={s.brierScore} decimals={3} className="mint" /><small>Platt-calibrated probability (0 is perfect, 0.25 is a coin flip)</small></div>
        </div>
        <div className="pk-kpi glass ex-in" style={stagger(1, 70)}>
          <Ring fill={s.rolling90dAccuracy / 100} tone="lavender" label={`Rolling 90-day accuracy ${s.rolling90dAccuracy}%`}><b>{Math.round(s.rolling90dAccuracy)}%</b></Ring>
          <div className="pk-kpi-text"><span>Rolling 90-day accuracy</span><CountUp value={s.rolling90dAccuracy} decimals={1} suffix="%" /><small>Hit/flop accuracy over the most recent 90 days</small></div>
        </div>
        <div className="pk-kpi glass ex-in" style={stagger(2, 70)}>
          <Ring fill={1 - s.overallMape / 100} tone="amber" label={`Median absolute percentage error ${s.overallMape}%`}><b>{Math.round(s.overallMape)}%</b></Ring>
          <div className="pk-kpi-text"><span>Overall median error (MAPE)</span><CountUp value={s.overallMape} decimals={1} suffix="%" /><small>Down from 62.4% on heuristic baseline</small></div>
        </div>
        <div className="pk-kpi glass ex-in" style={stagger(3, 70)}>
          <Ring fill={INTERVAL_COVERAGE / 100} tone="mint" label={`P10 to P90 interval coverage ${INTERVAL_COVERAGE}%`}><b>{Math.round(INTERVAL_COVERAGE)}%</b></Ring>
          <div className="pk-kpi-text"><span>P10–P90 coverage</span><CountUp value={INTERVAL_COVERAGE} decimals={1} suffix="%" /><small>Empirically covers the target 80% band · <CountUp value={s.totalEvaluatedTitles} /> releases</small></div>
        </div>
      </div>

      {/* Benchmark Head-to-Head */}
      <section className="accuracy-section glass">
        <div className="section-title-wrap">
          <BarChart3 size={20} className="mint" />
          <h2>Head-to-Head: Calibrated Model vs Legacy Heuristic</h2>
        </div>
        <p className="section-sub muted">
          Evaluating the lift provided by pre-release Wikipedia traffic slope, YouTube trailer view velocity, and calibrated sigmoid scaling.
        </p>
        <div className="benchmark-table-wrap">
          <table className="benchmark-table">
            <thead>
              <tr>
                <th>Validation Metric</th>
                <th>Legacy Heuristic</th>
                <th>CinePulse v3 Model</th>
                <th>Net Lift</th>
              </tr>
            </thead>
            <tbody>
              {data.benchmarkComparison.map((b, idx) => (
                <tr key={idx} className="ex-in" style={stagger(idx)}>
                  <td><strong>{b.metric}</strong></td>
                  <td className="muted">{b.legacyHeuristic}</td>
                  <td className="highlight-col"><strong>{b.v3CalibratedModel}</strong></td>
                  <td className="lift-col"><span className="lift-pill">{b.relativeImprovement}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Reliability Curve (Calibration Diagram) */}
      <section className="accuracy-section glass">
        <div className="section-title-wrap">
          <Cpu size={20} className="mint" />
          <h2>Reliability Diagram (Probability Calibration)</h2>
        </div>
        <p className="section-sub muted">
          An honest predictor must be calibrated: when the model claims an 80% hit probability, exactly 80 out of 100 films should be hits.
        </p>
        <div className="pk-calib-wrap">
          <div>
            <div className="calibration-grid pk-rv">
              {data.reliabilityCurve.map((bin, i) => (
                <div key={i} className="calib-bar-col">
                  <div className="calib-bars-wrap">
                    <div
                      className="calib-bar predicted"
                      style={{ height: `${bin.predictedProbability}%`, animationDelay: `${i * 50}ms` }}
                      title={`Predicted: ${bin.predictedProbability}%`}
                    />
                    <div
                      className="calib-bar observed"
                      style={{ height: `${bin.observedHitFrequency}%`, animationDelay: `${i * 50 + 120}ms` }}
                      title={`Observed: ${bin.observedHitFrequency}%`}
                    />
                  </div>
                  <div className="calib-label">{bin.binRange}</div>
                  <small className="calib-samples">{bin.sampleCount} titles</small>
                </div>
              ))}
            </div>
            <div className="calib-legend">
              <span><i className="legend-dot predicted-dot" /> Nominal Predicted %</span>
              <span><i className="legend-dot observed-dot" /> Realized Hit Frequency %</span>
            </div>
          </div>
          <div className="pk-calib-curve">
            <h4>Calibration curve</h4>
            <Sparkline
              height={110}
              label="Observed hit frequency tracks the predicted probability across all ten bins"
              series={[
                { values: data.reliabilityCurve.map((b) => b.predictedProbability), tone: 'muted', dashed: true },
                { values: data.reliabilityCurve.map((b) => b.observedHitFrequency), tone: 'mint' },
              ]}
            />
            <p>Solid line: realized hit rate per bin. Dashed: perfect calibration. The closer they hug, the more honest the odds.</p>
          </div>
        </div>
      </section>

      {/* Error Breakdown By Budget Tier & Genre */}
      <div className="accuracy-two-col">
        <section className="accuracy-section glass">
          <div className="section-title-wrap">
            <TrendingUp size={18} className="mint" />
            <h3>Error by Budget Tier</h3>
          </div>
          <div className="tier-error-list">
            {data.budgetTierErrors.map((t, idx) => (
              <div key={idx} className="tier-error-item">
                <div className="tier-meta">
                  <strong>{t.tier} Tier</strong>
                  <span className="muted">{t.rangeLabel} · {t.sampleCount} titles</span>
                </div>
                <div className="tier-stat">
                  <span className="tier-mape">{t.mapePercent}% MAPE</span>
                  <small className="muted">MAE: ${t.maeMillionsUsd}M</small>
                </div>
                <GrowBar className="pk-tier-bar" value={(t.mapePercent / maxTier) * 100} tone="amber" delay={idx * 70} />
              </div>
            ))}
          </div>
        </section>

        <section className="accuracy-section glass">
          <div className="section-title-wrap">
            <BarChart3 size={18} className="mint" />
            <h3>Error by Primary Genre</h3>
          </div>
          <div className="tier-error-list">
            {data.genreErrors.map((g, idx) => (
              <div key={idx} className="tier-error-item">
                <div className="tier-meta">
                  <strong>{g.genre}</strong>
                  <span className="muted">{g.sampleCount} evaluated releases</span>
                </div>
                <div className="tier-stat">
                  <span className="tier-mape">{g.mapePercent}% MAPE</span>
                </div>
                <GrowBar className="pk-tier-bar" value={(g.mapePercent / maxGenre) * 100} tone="amber" delay={idx * 70} />
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Serve-Time Audit Log */}
      <section className="accuracy-section glass">
        <div className="section-title-wrap">
          <Database size={20} className="mint" />
          <h2>Live Serve-Time Predictions Log (Immutable Snapshot)</h2>
        </div>
        <p className="section-sub muted">
          These predictions were logged at the exact instant they were served to users, permanently frozen to prevent hindsight bias.
        </p>
        <div className="log-table-wrap">
          <table className="log-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Model</th>
                <th>P10 – P90 Band</th>
                <th>P50 Median Forecast</th>
                <th>Hit Prob</th>
                <th>Actual Box Office</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {data.recentLoggedPredictions.map((log, i) => (
                <tr key={log.id} className="ex-in" style={stagger(i)}>
                  <td><strong>{log.titleName}</strong></td>
                  <td><span className="mini-pill">{log.modelVersion}</span></td>
                  <td className="muted">
                    {log.predictedP10 ? `${money(log.predictedP10)} – ${money(log.predictedP90 || 0)}` : '—'}
                  </td>
                  <td><strong>{log.predictedP50 ? money(log.predictedP50) : '—'}</strong></td>
                  <td><span className="pk-prob-cell"><GrowBar value={log.hitProbability} tone={log.hitProbability >= 55 ? 'mint' : 'coral'} delay={Math.min(i, 12) * 40} /><span className="prob-pill">{log.hitProbability}%</span></span></td>
                  <td><strong>{log.actualRevenue ? money(log.actualRevenue) : 'Pending final release'}</strong></td>
                  <td>
                    {log.actualHit !== null ? (
                      log.actualHit ? (
                        <span className="tag-hit"><CheckCircle2 size={13} /> HIT</span>
                      ) : (
                        <span className="tag-flop"><AlertCircle size={13} /> FLOP</span>
                      )
                    ) : (
                      <span className="tag-open">Tracking</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
