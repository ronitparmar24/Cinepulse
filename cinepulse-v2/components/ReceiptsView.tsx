'use client';
import { useState, useEffect } from 'react';
import { ShieldAlert, ShieldCheck, CheckCircle2, XCircle, Share2, Users, Cpu, Trophy, Ticket, ListChecks } from 'lucide-react';
import type { ReceiptsData, ReceiptItem, MissReceipt } from '@/lib/receipts';
import { api, money } from './client';
import { useToast } from './hooks/useToast';
import { TicketStubModal, type TicketStubData } from './TicketStubModal';
import { CountUp, GrowBar, PkHero, PkTabs, Ring, stagger, useReveal } from './PredictKit';

type ReceiptFilter = 'all' | 'called' | 'missed';
const PAGE = 24;

function TicketPerforation() {
  return (
    <div className="ticket-perforation">
      <div className="ticket-notch ticket-notch-l" />
      <div className="ticket-perforation-line" />
      <div className="ticket-notch ticket-notch-r" />
    </div>
  );
}

/**
 * Predicted vs actual, animated in. With a P50 revenue call we compare dollars on a shared scale;
 * otherwise we compare the hit probability with the outcome (100% = hit, 0% = flop).
 */
function CallVsActual({ predictedProbability, predictedP50, actualRevenue, actualHit, good }: {
  predictedProbability: number; predictedP50: number | null; actualRevenue: number; actualHit: boolean; good: boolean;
}) {
  if (predictedP50 && actualRevenue > 0) {
    const max = Math.max(predictedP50, actualRevenue);
    return (
      <div className="pk-compare">
        <div className="pk-compare-row"><span>Called</span><GrowBar value={(predictedP50 / max) * 100} tone="muted" delay={250} /><strong>{money(predictedP50)}</strong></div>
        <div className="pk-compare-row"><span>Actual</span><GrowBar value={(actualRevenue / max) * 100} tone={good ? 'mint' : 'coral'} delay={420} /><strong className={good ? 'is-hit' : 'is-miss'}>{money(actualRevenue)}</strong></div>
        <div className="pk-compare-row"><span>Hit odds</span><GrowBar value={predictedProbability} tone="lavender" delay={560} /><strong>{predictedProbability}% → {actualHit ? 'Hit' : 'Flop'}</strong></div>
      </div>
    );
  }
  return (
    <div className="pk-compare">
      <div className="pk-compare-row"><span>Called</span><GrowBar value={predictedProbability} tone="lavender" delay={250} /><strong>{predictedProbability}% hit</strong></div>
      <div className="pk-compare-row"><span>Outcome</span><GrowBar value={actualHit ? 100 : 4} tone={good ? 'mint' : 'coral'} delay={420} /><strong className={good ? 'is-hit' : 'is-miss'}>{actualHit ? 'Hit' : 'Flop'}</strong></div>
      <div className="pk-compare-row"><span>Box office</span><span /><strong>{money(actualRevenue)}</strong></div>
    </div>
  );
}

function ReceiptsSkeleton() {
  return (
    <div className="pad-page pk-receipts" style={{ maxWidth: 1100, margin: '0 auto' }} aria-busy="true" aria-label="Loading receipts">
      <div className="ex-skel" style={{ height: 200, borderRadius: 26, margin: '6px 0 22px' }} />
      <div className="pk-tracks">{[0, 1, 2].map((i) => <div key={i} className="ex-skel pk-skel-track" style={stagger(i)} />)}</div>
      <div className="pk-tickets">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="ex-skel pk-skel-ticket" style={stagger(i)} />)}</div>
    </div>
  );
}

export function ReceiptsView({ onOpenTitle }: { onOpenTitle?: (titleId: string) => void }) {
  const [data, setData] = useState<ReceiptsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspectTicket, setInspectTicket] = useState<TicketStubData | null>(null);
  const [filter, setFilter] = useState<ReceiptFilter>('all');
  const [limit, setLimit] = useState(PAGE);
  const { toast } = useToast();

  useEffect(() => {
    api<ReceiptsData>('/receipts')
      .then(res => setData(res))
      .catch(err => setError(err.message || 'Failed to load receipts'))
      .finally(() => setLoading(false));
  }, []);

  const receipts = data?.receipts ?? [];
  const filtered = filter === 'all' ? receipts : receipts.filter(r => r.verdict === filter);
  const visible = filtered.slice(0, limit);
  const revealRef = useReveal<HTMLDivElement>(`${!!data}:${filter}:${visible.length}`);

  function handleShare(receipt: ReceiptItem | MissReceipt) {
    const url = `${window.location.origin}/receipts/${receipt.id}`;
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(url);
      toast(`Copied receipt permalink for ${receipt.titleName}!`);
    }
  }

  if (loading) return <ReceiptsSkeleton />;
  if (error || !data) return <div className="pad-page error-box"><p>{error || 'Receipts unavailable'}</p></div>;

  const calledCount = receipts.filter(r => r.verdict === 'called').length;
  const tracks = [
    { icon: Cpu, iconClass: 'mint', title: 'Model Engine Track', pill: 'v3 ML + Platt', tone: 'mint' as const, brier: data.modelTrack.brierScore, brierLabel: 'Brier Score (lower is better)', rate: data.modelTrack.hitRate, rateLabel: `Hit Rate (${data.modelTrack.correctCalls}/${data.modelTrack.totalResolved})`, note: 'Strict Ridge regression log-revenue model calibrated via Platt scaling over temporal theatrical splits.' },
    { icon: Users, iconClass: 'amber', title: 'Community Crowd Track', pill: 'Consensus', tone: 'amber' as const, brier: data.communityTrack.brierScore, brierLabel: 'Brier Score', rate: data.communityTrack.hitRate, rateLabel: `Hit Rate (${data.communityTrack.correctCalls}/${data.communityTrack.totalResolved})`, note: 'Aggregated crowd sentiment scored 30 days post-theatrical window. Seed persona accounts excluded from rankings.' },
    { icon: Trophy, iconClass: 'mint', title: 'Top Forecasters (≥ 10 Calls)', pill: 'Audited', tone: 'lavender' as const, brier: data.topForecastersTrack.averageBrierScore, brierLabel: 'Top 10 Avg Brier', rate: data.topForecastersTrack.averageHitRate, rateLabel: 'Top 10 Avg Hit Rate', note: 'Ranked community forecasters who have logged and resolved at least 10 official calls.' },
  ];

  return (
    <div className="pad-page receipts-container pk-receipts" style={{ maxWidth: 1100, margin: '0 auto' }} ref={revealRef}>
      <PkHero
        icon={ShieldCheck}
        kicker="Public track record & verifiable receipts"
        title={<>Called It or Missed It.<br /><em>Every Single Forecast Published.</em></>}
        sub="Most prediction platforms hide their misses and highlight only lucky hits. CinePulse publishes every model call and community forecast permanently frozen at serve time."
      >
        <div className="pk-stats">
          <span className="pk-stat"><ListChecks size={14} /><b><CountUp value={receipts.length} /></b> calls settled</span>
          <span className="pk-stat"><CheckCircle2 size={14} /><b><CountUp value={calledCount} /></b> called right</span>
          <span className="pk-stat"><XCircle size={14} /><b><CountUp value={receipts.length - calledCount} /></b> missed, shown anyway</span>
        </div>
      </PkHero>

      {/* 3 tracks side-by-side */}
      <div className="pk-tracks">
        {tracks.map((t, i) => (
          <div key={t.title} className="glass pk-track ex-in" style={stagger(i, 70)}>
            <div className="pk-track-head">
              <h3><t.icon size={18} className={t.iconClass} />{t.title}</h3>
              <span className="mini-pill">{t.pill}</span>
            </div>
            <div className="pk-track-body">
              <Ring fill={t.rate / 100} tone={t.tone} label={`${t.rate}% hit rate`}>
                <b><CountUp value={t.rate} suffix="%" /></b><small>HIT RATE</small>
              </Ring>
              <div className="pk-track-figs">
                <div><CountUp value={t.brier} decimals={3} /><small>{t.brierLabel}</small></div>
                <small>{t.rateLabel}</small>
              </div>
            </div>
            <p>{t.note}</p>
          </div>
        ))}
      </div>

      {/* "We Were Wrong About…" (Biggest Misses Section) */}
      <section style={{ marginBottom: 44 }}>
        <div className="pk-sec-head">
          <h2><ShieldAlert size={20} className="amber" /> We Were Wrong About… (Our Biggest Misses)</h2>
        </div>
        <p className="pk-sec-sub">
          Prediction science requires radical transparency. Below are the titles where our model missed hardest, paired with the exact statistical post-mortem identifying the largest misleading feature.
        </p>

        {data.biggestMisses.length === 0 ? (
          <div className="glass pad-card muted text-center">No major model misses recorded yet.</div>
        ) : (
          <div className="pk-tickets">
            {data.biggestMisses.map((miss, i) => {
              const ticketSerial = `CP-${miss.id.slice(0, 8).toUpperCase()}`;
              return (
                <div key={miss.id} className="cinema-ticket receipt-card-miss pk-ticket is-miss pk-rv ex-in" style={stagger(i % 4, 70)}>
                  <div className="ticket-header-strip">
                    <span className="ticket-serial">AUDITED TICKET #{ticketSerial}</span>
                    <span className="mono text-xs text-muted" style={{ fontSize: 12 }}>v3 ENGINE POST-MORTEM</span>
                  </div>

                  <div className="ticket-body">
                    <div className="pk-ticket-title">
                      <div>
                        <h4>{onOpenTitle ? <button type="button" onClick={() => onOpenTitle(miss.titleId)}>{miss.titleName}</button> : miss.titleName}</h4>
                        <span className="mono">Model: {miss.modelVersion}</span>
                      </div>
                      <span className="pk-stamp is-miss"><XCircle size={13} /> MISS</span>
                    </div>

                    <TicketPerforation />
                    <CallVsActual predictedProbability={miss.predictedProbability} predictedP50={miss.predictedP50} actualRevenue={miss.actualRevenue} actualHit={miss.actualHit} good={false} />

                    <div className="pk-reason"><span>DIVERGENCE ROOT CAUSE</span>{miss.errorReason}</div>
                  </div>

                  <div className="ticket-barcode-wrap">
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="ticket-barcode">||| | |||| | ||||| | |||</span>
                      <span className="mono text-xs text-muted" style={{ fontSize: 12 }}>Resolved {miss.resolvedAt?.slice(0, 10)}</span>
                    </div>
                    <div className="pk-ticket-actions">
                      <button
                        className="button primary small"
                        onClick={() => setInspectTicket({
                          titleName: miss.titleName,
                          serialNumber: `CP-MISS-${miss.id.slice(0, 6).toUpperCase()}`,
                          verdict: 'missed',
                          stats: [
                            { label: 'MODEL PREDICTION', value: `${miss.predictedProbability}% Hit` },
                            { label: 'OUTCOME', value: miss.actualHit ? 'Hit' : 'Flop' },
                            { label: 'ACTUAL BO', value: money(miss.actualRevenue) }
                          ]
                        })}
                      >
                        <Ticket size={12} /> Inspect Stub
                      </button>
                      <button className="button glass small" onClick={() => handleShare(miss)}>
                        <Share2 size={12} /> Share
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Chronological audited receipts (equal visual weight for hits and misses) */}
      <section>
        <div className="pk-sec-head">
          <h2><CheckCircle2 size={20} className="mint" /> All Audited Receipts</h2>
          <span className="muted mono text-xs">{receipts.length} total calls verified</span>
        </div>
        <div className="pk-toolbar">
          <PkTabs<ReceiptFilter>
            label="Filter receipts"
            size="sm"
            value={filter}
            onChange={(f) => { setFilter(f); setLimit(PAGE); }}
            tabs={[
              { id: 'all', label: 'All', count: receipts.length },
              { id: 'called', label: 'Called it', icon: CheckCircle2, count: calledCount },
              { id: 'missed', label: 'Missed', icon: XCircle, count: receipts.length - calledCount },
            ]}
          />
        </div>

        <div className="pk-tickets" key={filter}>
          {visible.map((r, i) => {
            const isHit = r.verdict === 'called';
            const ticketSerial = `CP-${r.id.slice(0, 8).toUpperCase()}`;

            return (
              <div key={r.id} className={`cinema-ticket receipt-card pk-ticket ${isHit ? 'is-hit' : 'is-miss'} pk-rv ex-in`} style={stagger(i % 4, 70)}>
                <div className="ticket-header-strip">
                  <span className="ticket-serial">ADMIT: FORECAST AUDIT #{ticketSerial}</span>
                  <span className="mono text-xs text-muted" style={{ fontSize: 12 }}>v3 ML ENGINE</span>
                </div>

                <div className="ticket-body">
                  <div className="pk-ticket-title">
                    <div>
                      <h4>{onOpenTitle ? <button type="button" onClick={() => onOpenTitle(r.titleId)}>{r.titleName}</button> : r.titleName}</h4>
                      <span className="mono">Model: {r.modelVersion}</span>
                    </div>
                    <span className={`pk-stamp ${isHit ? 'is-hit' : 'is-miss'}`}>
                      {isHit ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                      {isHit ? 'HIT' : 'MISS'}
                    </span>
                  </div>

                  <TicketPerforation />
                  <CallVsActual predictedProbability={r.predictedProbability} predictedP50={r.predictedP50} actualRevenue={r.actualRevenue} actualHit={r.actualHit} good={isHit} />
                </div>

                <div className="ticket-barcode-wrap">
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="ticket-barcode">||| | |||| | ||||| | |||</span>
                    <span className="mono text-xs text-muted" style={{ fontSize: 12 }}>Settled {r.resolvedAt?.slice(0, 10)}</span>
                  </div>
                  <div className="pk-ticket-actions">
                    <button
                      className="button primary small"
                      onClick={() => setInspectTicket({
                        titleName: r.titleName,
                        serialNumber: ticketSerial,
                        verdict: isHit ? 'called' : 'missed',
                        stats: [
                          { label: 'PREDICTED P50', value: r.predictedP50 ? money(r.predictedP50) : `${r.predictedProbability}%` },
                          { label: 'VERDICT', value: isHit ? 'Called Hit' : 'Missed' },
                          { label: 'ACTUAL REVENUE', value: money(r.actualRevenue) }
                        ]
                      })}
                    >
                      <Ticket size={12} /> Inspect Stub
                    </button>
                    <button className="button glass small" onClick={() => handleShare(r)}>
                      <Share2 size={12} /> Share
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {filtered.length === 0 && <div className="glass pad-card muted text-center">No receipts in this view yet.</div>}
        {filtered.length > visible.length && (
          <div className="pk-more">
            <button type="button" className="button secondary" onClick={() => setLimit(l => l + PAGE)}>
              Show {Math.min(PAGE, filtered.length - visible.length)} more · {filtered.length - visible.length} left
            </button>
          </div>
        )}
      </section>

      {inspectTicket && (
        <TicketStubModal
          data={inspectTicket}
          onClose={() => setInspectTicket(null)}
        />
      )}
    </div>
  );
}
