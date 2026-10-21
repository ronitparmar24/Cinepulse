'use client';
import { useState, useEffect } from 'react';
import { ShieldAlert, ShieldCheck, CheckCircle2, XCircle, Share2, TrendingUp, Users, Cpu, Trophy, ArrowUpRight, Ticket } from 'lucide-react';
import type { ReceiptsData, ReceiptItem, MissReceipt } from '@/lib/receipts';
import { api, money } from './client';
import { Loading } from './UI';
import { useToast } from './hooks/useToast';
import { TicketStubModal, type TicketStubData } from './TicketStubModal';

export function ReceiptsView({ onOpenTitle }: { onOpenTitle?: (titleId: string) => void }) {
  const [data, setData] = useState<ReceiptsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspectTicket, setInspectTicket] = useState<TicketStubData | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    api<ReceiptsData>('/receipts')
      .then(res => setData(res))
      .catch(err => setError(err.message || 'Failed to load receipts'))
      .finally(() => setLoading(false));
  }, []);

  function handleShare(receipt: ReceiptItem | MissReceipt) {
    const url = `${window.location.origin}/receipts/${receipt.id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      toast(`Copied receipt permalink for ${receipt.titleName}!`);
    }
  }

  if (loading) return <Loading />;
  if (error || !data) return <div className="pad-page error-box"><p>{error || 'Receipts unavailable'}</p></div>;

  return (
    <div className="pad-page receipts-container" style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Hero */}
      <div className="section-heading" style={{ marginBottom: 32 }}>
        <div>
          <span className="eyebrow mint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={14} /> PUBLIC TRACK RECORD & VERIFIABLE RECEIPTS
          </span>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 800, marginTop: 8 }}>
            Called It or Missed It.<br />
            <span style={{ color: 'var(--mint)' }}>Every Single Forecast Published.</span>
          </h1>
          <p className="muted" style={{ maxWidth: 700, fontSize: 15, lineHeight: 1.6, marginTop: 10 }}>
            Most prediction platforms hide their misses and highlight only lucky hits. CinePulse publishes every model call and community forecast permanently frozen at serve time.
          </p>
        </div>
      </div>

      {/* 3 Tracks Side-by-Side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 20, marginBottom: 40 }}>
        {/* Track 1: Model */}
        <div className="glass pad-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Cpu size={18} className="mint" />
              <h3 style={{ margin: 0, fontSize: 16 }}>Model Engine Track</h3>
            </div>
            <span className="mini-pill">v3 ML + Platt</span>
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--mint)' }}>
                {data.modelTrack.brierScore.toFixed(3)}
              </div>
              <small className="muted mono" style={{ fontSize: 11 }}>Brier Score (lower is better)</small>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>
                {data.modelTrack.hitRate}%
              </div>
              <small className="muted mono" style={{ fontSize: 11 }}>Hit Rate ({data.modelTrack.correctCalls}/{data.modelTrack.totalResolved})</small>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
            Strict Ridge regression log-revenue model calibrated via Platt scaling over temporal theatrical splits.
          </p>
        </div>

        {/* Track 2: Community Crowd */}
        <div className="glass pad-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={18} className="amber" />
              <h3 style={{ margin: 0, fontSize: 16 }}>Community Crowd Track</h3>
            </div>
            <span className="mini-pill">Consensus</span>
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--amber)' }}>
                {data.communityTrack.brierScore.toFixed(3)}
              </div>
              <small className="muted mono" style={{ fontSize: 11 }}>Brier Score</small>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>
                {data.communityTrack.hitRate}%
              </div>
              <small className="muted mono" style={{ fontSize: 11 }}>Hit Rate ({data.communityTrack.correctCalls}/{data.communityTrack.totalResolved})</small>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
            Aggregated crowd sentiment scored 30 days post-theatrical window. Seed persona accounts excluded from rankings.
          </p>
        </div>

        {/* Track 3: Top Forecasters */}
        <div className="glass pad-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trophy size={18} className="mint" />
              <h3 style={{ margin: 0, fontSize: 16 }}>Top Forecasters (&ge; 10 Calls)</h3>
            </div>
            <span className="mini-pill">Audited</span>
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--mint)' }}>
                {data.topForecastersTrack.averageBrierScore.toFixed(3)}
              </div>
              <small className="muted mono" style={{ fontSize: 11 }}>Top 10 Avg Brier</small>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>
                {data.topForecastersTrack.averageHitRate}%
              </div>
              <small className="muted mono" style={{ fontSize: 11 }}>Top 10 Avg Hit Rate</small>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
            Ranked community forecasters who have logged and resolved at least 10 official calls.
          </p>
        </div>
      </div>

      {/* "We Were Wrong About…" (Biggest Misses Section) */}
      <section style={{ marginBottom: 44 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <ShieldAlert size={20} className="amber" />
          <h2 style={{ fontSize: 20, margin: 0 }}>We Were Wrong About… (Our Biggest Misses)</h2>
        </div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
          Prediction science requires radical transparency. Below are the titles where our model missed hardest, paired with the exact statistical post-mortem identifying the largest misleading feature.
        </p>

        {data.biggestMisses.length === 0 ? (
          <div className="glass pad-card muted text-center">No major model misses recorded yet.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
            {data.biggestMisses.map(miss => {
              const ticketSerial = `CP-${miss.id.slice(0, 8).toUpperCase()}`;
              return (
                <div
                  key={miss.id}
                  className="cinema-ticket receipt-card-miss"
                  style={{ borderLeft: '3px solid #f43f5e' }}
                >
                  <div className="ticket-header-strip">
                    <span className="ticket-serial">AUDITED TICKET #{ticketSerial}</span>
                    <span className="mono text-xs text-muted" style={{ fontSize: 9 }}>v3 ENGINE POST-MORTEM</span>
                  </div>

                  <div className="ticket-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div>
                        <h4
                          style={{ margin: 0, fontSize: 16, cursor: onOpenTitle ? 'pointer' : 'default', fontWeight: 700 }}
                          onClick={() => onOpenTitle?.(miss.titleId)}
                        >
                          {miss.titleName}
                        </h4>
                        <span className="mono text-xs text-muted" style={{ fontSize: 10 }}>Model: {miss.modelVersion}</span>
                      </div>
                      <div className="ticket-stamp missed">
                        <XCircle size={12} /> AUDITED MISS
                      </div>
                    </div>

                    <div className="ticket-perforation">
                      <div className="ticket-notch ticket-notch-l" />
                      <div className="ticket-perforation-line" />
                      <div className="ticket-notch ticket-notch-r" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                        <span className="muted block mono" style={{ fontSize: 9, letterSpacing: '0.05em', marginBottom: 2 }}>MODEL CALL</span>
                        <strong style={{ color: '#f8fafc', fontSize: 13 }}>{miss.predictedProbability}% Hit</strong>
                        <div className="muted mono" style={{ fontSize: 11, marginTop: 2 }}>{miss.predictedP50 ? money(miss.predictedP50) : '—'}</div>
                      </div>
                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                        <span className="muted block mono" style={{ fontSize: 9, letterSpacing: '0.05em', marginBottom: 2 }}>THEATRICAL RESULT</span>
                        <strong style={{ color: '#f87171', fontSize: 13 }}>{miss.actualHit ? 'Hit' : 'Flop'}</strong>
                        <div className="muted mono" style={{ fontSize: 11, marginTop: 2 }}>{money(miss.actualRevenue)}</div>
                      </div>
                    </div>

                    {/* One-line reason */}
                    <div
                      style={{
                        background: 'rgba(244, 63, 94, 0.05)',
                        border: '1px solid rgba(244, 63, 94, 0.2)',
                        borderRadius: 8,
                        padding: '8px 10px',
                        fontSize: 12,
                        lineHeight: 1.4,
                      }}
                    >
                      <span className="muted mono" style={{ display: 'block', fontSize: 9, marginBottom: 2, color: '#fca5a5' }}>
                        DIVERGENCE ROOT CAUSE
                      </span>
                      {miss.errorReason}
                    </div>
                  </div>

                  <div className="ticket-barcode-wrap">
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="ticket-barcode">||| | |||| | ||||| | |||</span>
                      <span className="mono text-xs text-muted" style={{ fontSize: 9 }}>
                        Resolved {miss.resolvedAt?.slice(0, 10)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
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
                        style={{ fontSize: 11, padding: '4px 10px', gap: 5 }}
                      >
                        <Ticket size={12} /> Inspect Stub
                      </button>
                      <button
                        className="button glass small"
                        onClick={() => handleShare(miss)}
                        style={{ fontSize: 11, padding: '4px 10px', gap: 5 }}
                      >
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

      {/* Chronological Audited Receipts (Equal Visual Weight for Hits and Misses) */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle2 size={20} className="mint" />
            <h2 style={{ fontSize: 20, margin: 0 }}>All Audited Receipts</h2>
          </div>
          <span className="muted mono text-xs">{data.receipts.length} total calls verified</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
          {data.receipts.map(r => {
            const isHit = r.verdict === 'called';
            const ticketSerial = `CP-${r.id.slice(0, 8).toUpperCase()}`;

            return (
              <div
                key={r.id}
                className="cinema-ticket receipt-card"
                style={{
                  borderLeft: isHit ? '3px solid #10b981' : '3px solid #f43f5e',
                }}
              >
                <div className="ticket-header-strip">
                  <span className="ticket-serial">ADMIT: FORECAST AUDIT #{ticketSerial}</span>
                  <span className="mono text-xs text-muted" style={{ fontSize: 9 }}>v3 ML ENGINE</span>
                </div>

                <div className="ticket-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div>
                      <h4
                        style={{ margin: 0, fontSize: 16, cursor: onOpenTitle ? 'pointer' : 'default', fontWeight: 700 }}
                        onClick={() => onOpenTitle?.(r.titleId)}
                      >
                        {r.titleName}
                      </h4>
                      <span className="mono text-xs text-muted" style={{ fontSize: 10 }}>Model: {r.modelVersion}</span>
                    </div>

                    <div className={`ticket-stamp ${isHit ? 'called' : 'missed'}`}>
                      {isHit ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      {isHit ? 'VERIFIED HIT' : 'AUDITED MISS'}
                    </div>
                  </div>

                  <div className="ticket-perforation">
                    <div className="ticket-notch ticket-notch-l" />
                    <div className="ticket-perforation-line" />
                    <div className="ticket-notch ticket-notch-r" />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span className="muted block mono" style={{ fontSize: 9, letterSpacing: '0.05em', marginBottom: 2 }}>CINEPULSE CALL</span>
                      <strong style={{ color: '#f8fafc', fontSize: 13 }}>{r.predictedProbability}% Hit</strong>
                      <div className="muted mono" style={{ fontSize: 11, marginTop: 2 }}>{r.predictedP50 ? money(r.predictedP50) : '—'}</div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span className="muted block mono" style={{ fontSize: 9, letterSpacing: '0.05em', marginBottom: 2 }}>BOX OFFICE VERDICT</span>
                      <strong style={{ color: isHit ? '#34d399' : '#f87171', fontSize: 13 }}>{r.actualHit ? 'Theatrical Hit' : 'Theatrical Flop'}</strong>
                      <div className="muted mono" style={{ fontSize: 11, marginTop: 2 }}>{money(r.actualRevenue)}</div>
                    </div>
                  </div>
                </div>

                <div className="ticket-barcode-wrap">
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="ticket-barcode">||| | |||| | ||||| | |||</span>
                    <span className="mono text-xs text-muted" style={{ fontSize: 9 }}>
                      Settled {r.resolvedAt?.slice(0, 10)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
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
                      style={{ fontSize: 11, padding: '4px 10px', gap: 5 }}
                    >
                      <Ticket size={12} /> Inspect Stub
                    </button>
                    <button
                      className="button glass small"
                      onClick={() => handleShare(r)}
                      style={{ fontSize: 11, padding: '4px 10px', gap: 5 }}
                    >
                      <Share2 size={12} /> Share
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
