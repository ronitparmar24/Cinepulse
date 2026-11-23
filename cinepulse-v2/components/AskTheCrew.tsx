'use client';
/**
 * Ask the Crew — a panel of simulated AI critic personas answering one of three questions.
 * A sliding question switch, a consensus bar summarising the panel, and take cards whose
 * confidence meters fill and whose words fade in one by one.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { AiBadge } from './AiBadge';
import { api } from './client';
import type { AskTheCrewResponse } from '@/lib/ai/types';
import { CREW_QUESTIONS } from '@/lib/ai/types';

export function AskTheCrew({ titleId }: { titleId: string }) {
  const [selectedQuestion, setSelectedQuestion] = useState(CREW_QUESTIONS[0].key);
  const [data, setData] = useState<AskTheCrewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api<AskTheCrewResponse>(`/ai/ask-the-crew?titleId=${encodeURIComponent(titleId)}&question=${encodeURIComponent(selectedQuestion)}`)
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message || 'Unable to consult the AI crew.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [titleId, selectedQuestion]);

  const takes = useMemo(() => data?.takes ?? [], [data]);
  const consensus = useMemo(() => {
    if (takes.length === 0) return null;
    const hits = takes.filter((t) => t.choice === 'hit');
    const avg = Math.round(takes.reduce((s, t) => s + (t.choice === 'hit' ? t.confidence : 100 - t.confidence), 0) / takes.length);
    return { hits: hits.length, flops: takes.length - hits.length, total: takes.length, hitLean: avg };
  }, [takes]);
  const qIndex = Math.max(0, CREW_QUESTIONS.findIndex((q) => q.key === selectedQuestion));

  return (
    <div className="ask-the-crew-container cx" role="region" aria-label="Ask the Crew simulated critics">
      <div className="cx-head">
        <div>
          <span className="ovx-eyebrow"><Sparkles size={13} aria-hidden="true" /> Simulated critic panel</span>
          <h3>Ask the Crew <AiBadge size="sm" /></h3>
          <p>Distinct AI critic archetypes, calibrated on historical release trends.</p>
        </div>
      </div>

      <div
        className="cx-switch"
        role="tablist"
        aria-label="Crew questions"
        style={{ '--q': qIndex, '--n': CREW_QUESTIONS.length } as CSSProperties}
      >
        <span className="cx-switch-thumb" aria-hidden="true" />
        {CREW_QUESTIONS.map((q) => (
          <button
            key={q.key}
            type="button"
            role="tab"
            aria-selected={selectedQuestion === q.key}
            className={selectedQuestion === q.key ? 'is-active' : ''}
            onClick={() => setSelectedQuestion(q.key)}
          >
            {q.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="cx-grid" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="cx-card cx-skeleton" />)}
        </div>
      ) : error ? (
        <p className="cx-empty">{error}</p>
      ) : takes.length > 0 ? (
        <div key={selectedQuestion}>
          {consensus && (
            <div className="cx-consensus" aria-label={`${consensus.hits} of ${consensus.total} critics lean hit`}>
              <span className="cx-consensus-label">
                Panel verdict
                <b className={consensus.hits >= consensus.flops ? 'is-hit' : 'is-flop'}>
                  {consensus.hits >= consensus.flops ? 'Leans hit' : 'Leans flop'}
                </b>
              </span>
              <span className="cx-consensus-bar" aria-hidden="true">
                <span className="is-hit" style={{ width: `${consensus.hitLean}%` }} />
              </span>
              <span className="cx-consensus-count">{consensus.hits}/{consensus.total} hit · {consensus.hitLean}% avg</span>
            </div>
          )}
          <div className="cx-grid">
            {takes.map((take, i) => {
              const words = `“${take.take}”`.split(/\s+/);
              return (
                <article key={take.personaId} className={`cx-card ovx-spot is-${take.choice}`} style={{ '--i': i } as CSSProperties}>
                  <div className="cx-author">
                    <span className="cx-avatar">
                      <img src={take.avatarUrl} alt="" width={38} height={38} loading="lazy" />
                    </span>
                    <div className="cx-author-text">
                      <b>{take.displayName} <AiBadge size="sm" /></b>
                      <small>{take.archetype}</small>
                    </div>
                    {take.tasteMatchPercent ? <span className="cx-taste" title="Taste match with you">{take.tasteMatchPercent}%</span> : null}
                  </div>
                  <div className="cx-verdict">
                    <span className="cx-verdict-label">
                      {take.choice === 'hit' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {take.choice === 'hit' ? 'Hit' : 'Flop'}
                    </span>
                    <span className="cx-meter" aria-hidden="true"><span style={{ width: `${take.confidence}%` }} /></span>
                    <span className="cx-verdict-num">{take.confidence}%</span>
                  </div>
                  <p className="cx-take" aria-label={take.take}>
                    {words.map((w, wi) => (
                      <span key={wi} aria-hidden="true" style={{ '--w': wi } as CSSProperties}>{w} </span>
                    ))}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      ) : data ? (
        <p className="cx-empty">Persona commentary is being synthesized. Tap another question or refresh.</p>
      ) : null}
    </div>
  );
}
