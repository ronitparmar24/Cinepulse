'use client';
import { useState } from 'react';
import { Scissors, Check, Share2, Printer, Ticket, CheckCircle2, XCircle } from 'lucide-react';
import { Modal } from './UI';
import { useToast } from './hooks/useToast';

export interface TicketStubData {
  titleName: string;
  serialNumber: string;
  verdict?: 'called' | 'missed' | 'verified';
  releaseYear?: string;
  screen?: string;
  seat?: string;
  format?: string;
  stats?: Array<{ label: string; value: string }>;
  resolvedAt?: string;
}

export function TicketStubModal({
  data,
  onClose,
}: {
  data: TicketStubData;
  onClose: () => void;
}) {
  const [isTorn, setIsTorn] = useState(false);
  const { toast } = useToast();

  const screen = data.screen || 'AUDITORIUM 04';
  const seat = data.seat || 'ROW F · SEAT 14';
  const format = data.format || 'DOLBY ATMOS · 4K LASER';

  function handleTear() {
    setIsTorn(true);
    toast('Ticket stub torn! Verified admission detached.');
  }

  function handlePrint() {
    window.print();
  }

  function handleCopy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`CinePulse Ticket Stub: ${data.titleName} [${data.serialNumber}]`);
      toast(`Copied ticket serial ${data.serialNumber} to clipboard!`);
    }
  }

  return (
    <Modal label={`Cinema Ticket · ${data.titleName}`} onClose={onClose}>
      <div className="modal-pad" style={{ padding: '24px 20px', maxWidth: 460, margin: '0 auto' }}>
        {/* Ticket Outer Wrapper */}
        <div
          className="cinema-ticket-container"
          style={{
            position: 'relative',
            perspective: '1000px',
            marginBottom: 20,
          }}
        >
          {/* Main Ticket Body */}
          <div
            className="cinema-ticket"
            style={{
              background: 'linear-gradient(135deg, #172027, #0d1217)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: isTorn ? '16px 16px 0 0' : '16px',
              borderBottom: isTorn ? '2px dashed #475569' : undefined,
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
              overflow: 'hidden',
              transition: 'all 0.3s ease',
            }}
          >
            {/* Header Circuit Banner */}
            <div
              style={{
                background: 'linear-gradient(90deg, #10b98120, #06b6d420)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Ticket size={14} className="mint" />
                <span className="mono" style={{ fontSize: 10, letterSpacing: '0.12em', fontWeight: 800, color: '#e2e8f0' }}>
                  CINEPULSE THEATRICAL CIRCUIT
                </span>
              </div>
              <span className="mono" style={{ fontSize: 10, color: 'var(--mint)', fontWeight: 700 }}>
                {data.serialNumber}
              </span>
            </div>

            {/* Core Ticket Content */}
            <div style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <span className="mono text-muted" style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    FEATURE PRESENTATION
                  </span>
                  <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc', margin: '4px 0 2px', lineHeight: 1.15 }}>
                    {data.titleName}
                  </h2>
                  <span className="mono text-muted" style={{ fontSize: 11 }}>
                    {data.releaseYear ? `Released ${data.releaseYear} · ` : ''}{format}
                  </span>
                </div>

                {/* Stamp */}
                {data.verdict === 'called' ? (
                  <div className="ticket-stamp called" style={{ flexShrink: 0 }}>
                    <CheckCircle2 size={12} /> CALLED IT
                  </div>
                ) : data.verdict === 'missed' ? (
                  <div className="ticket-stamp missed" style={{ flexShrink: 0 }}>
                    <XCircle size={12} /> AUDITED MISS
                  </div>
                ) : (
                  <div className="ticket-stamp called" style={{ flexShrink: 0 }}>
                    <Check size={12} /> ADMIT ONE
                  </div>
                )}
              </div>

              {/* Coordinates Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 10,
                  marginTop: 18,
                  padding: '10px 14px',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.05)',
                  fontSize: 11,
                }}
              >
                <div>
                  <small className="mono muted" style={{ display: 'block', fontSize: 8 }}>SCREEN</small>
                  <strong className="mono" style={{ color: '#e2e8f0' }}>{screen}</strong>
                </div>
                <div>
                  <small className="mono muted" style={{ display: 'block', fontSize: 8 }}>SEATING</small>
                  <strong className="mono" style={{ color: '#e2e8f0' }}>{seat}</strong>
                </div>
                <div>
                  <small className="mono muted" style={{ display: 'block', fontSize: 8 }}>GATE</small>
                  <strong className="mono" style={{ color: 'var(--mint)' }}>A-NORTH</strong>
                </div>
              </div>

              {/* Custom Stats if provided */}
              {data.stats && data.stats.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.stats.length}, 1fr)`, gap: 10, marginTop: 12 }}>
                  {data.stats.map((s, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.04)',
                      }}
                    >
                      <small className="mono muted" style={{ display: 'block', fontSize: 8 }}>{s.label}</small>
                      <strong className="mono" style={{ color: '#f1f5f9', fontSize: 12 }}>{s.value}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Perforation Line (Interactive) */}
            <div
              className="ticket-perforation ticket-perforation-interactive"
              onClick={handleTear}
              title={isTorn ? 'Stub already detached' : 'Click to tear ticket stub!'}
            >
              <div className="ticket-notch ticket-notch-l" />
              <div className="ticket-perforation-line" />
              <div className="ticket-notch ticket-notch-r" />
              {!isTorn && (
                <div className="tear-guide mono">
                  <Scissors size={10} />
                  <span>CLICK TO TEAR STUB</span>
                </div>
              )}
            </div>

            {/* Stub Barcode Bottom Section */}
            <div
              className={isTorn ? 'ticket-torn-stub' : ''}
              style={{
                background: 'rgba(0, 0, 0, 0.4)',
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.3s ease',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="ticket-barcode" style={{ fontSize: 13, letterSpacing: 3 }}>
                  ||| | |||| | ||||| | |||
                </span>
                <span className="mono text-muted" style={{ fontSize: 9 }}>
                  {isTorn ? '★ VERIFIED CUSTOMER DETACHED STUB' : 'HOLD FOR ADMITTANCE · DO NOT DETACH'}
                </span>
              </div>
              <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: isTorn ? 'var(--mint)' : '#94a3b8' }}>
                {isTorn ? 'TORN & AUDITED' : 'INTACT'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          {!isTorn ? (
            <button
              type="button"
              className="button primary small"
              onClick={handleTear}
              style={{ gap: 6 }}
            >
              <Scissors size={13} />
              <span>Tear Ticket Stub</span>
            </button>
          ) : (
            <button
              type="button"
              className="button glass small"
              onClick={() => setIsTorn(false)}
              style={{ gap: 6 }}
            >
              <Ticket size={13} />
              <span>Reattach Stub</span>
            </button>
          )}

          <button
            type="button"
            className="button glass small"
            onClick={handleCopy}
            style={{ gap: 6 }}
          >
            <Share2 size={13} />
            <span>Copy Serial</span>
          </button>

          <button
            type="button"
            className="button glass small"
            onClick={handlePrint}
            style={{ gap: 6 }}
          >
            <Printer size={13} />
            <span>Print Souvenir</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
