'use client';
import { useState, useEffect } from 'react';
import { MessageSquare, Sparkles, TrendingUp, TrendingDown, HelpCircle, CheckCircle2 } from 'lucide-react';
import { AiBadge } from './AiBadge';
import { api } from './client';
import type { CrewTake, AskTheCrewResponse } from '@/lib/ai/types';
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
      .then(res => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(err => {
        if (active) {
          setError(err.message || 'Unable to consult the AI crew.');
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [titleId, selectedQuestion]);

  return (
    <div className="ask-the-crew-container glass pad-card" role="region" aria-label="Ask the Crew simulated critics">
      <div className="crew-header-row">
        <div className="title-with-icon">
          <Sparkles size={18} className="mint" />
          <h3 className="section-title">Ask the Crew</h3>
          <AiBadge size="md" />
        </div>
        <span className="mono text-xs text-muted">Simulated Critic Panel</span>
      </div>

      <p className="crew-intro muted-text">
        Get instant perspectives from distinct AI critic archetypes calibrated on historical release trends.
      </p>

      {/* Question Selector Pills */}
      <div className="crew-question-pills" role="tablist" aria-label="Crew questions">
        {CREW_QUESTIONS.map(q => (
          <button
            key={q.key}
            role="tab"
            aria-selected={selectedQuestion === q.key}
            className={`button small ${selectedQuestion === q.key ? 'primary active' : 'secondary'}`}
            onClick={() => setSelectedQuestion(q.key)}
          >
            {q.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="crew-loading skeleton-line" style={{ height: 120, width: '100%', marginTop: 16 }} />
      ) : error ? (
        <div className="crew-error muted-text text-sm" style={{ marginTop: 12 }}>{error}</div>
      ) : data?.takes ? (
        <div className="crew-takes-grid" style={{ marginTop: 16 }}>
          {data.takes.map(take => (
            <div key={take.personaId} className="crew-take-card glass">
              <div className="take-author-row">
                <img
                  src={take.avatarUrl}
                  alt={take.displayName}
                  className="take-avatar"
                  width={36}
                  height={36}
                  loading="lazy"
                />
                <div className="take-author-info">
                  <div className="take-name-line">
                    <span className="take-name font-bold">{take.displayName}</span>
                    <AiBadge size="sm" />
                  </div>
                  <span className="take-archetype mono text-xs text-muted">
                    {take.archetype}
                  </span>
                </div>

                <div className="take-badge-col right">
                  <span className={`forecast-pill mono ${take.choice === 'hit' ? 'mint' : 'coral'}`}>
                    {take.choice === 'hit' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {take.choice.toUpperCase()} · {take.confidence}%
                  </span>
                  {take.tasteMatchPercent && (
                    <span className="taste-match-pill mono text-xs">
                      {take.tasteMatchPercent}% Taste Match
                    </span>
                  )}
                </div>
              </div>

              <p className="take-text">
                "{take.take}"
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
