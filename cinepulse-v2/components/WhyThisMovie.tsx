'use client';
import { useEffect, useState } from 'react';
import { Sparkles, Film, Tag, Compass, Flame } from 'lucide-react';
import type { RecommendedMovieWithReason } from '@/lib/recommendations';
import { api, trackEvent } from './client';
import { useApp } from './Context';

export function WhyThisMovie({ titleId }: { titleId: string }) {
  const { openTitle } = useApp();
  const [recs, setRecs] = useState<RecommendedMovieWithReason[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api<{ recommendations: RecommendedMovieWithReason[] }>(
      `/recommendations/why/${titleId}`,
      'GET',
      undefined,
      controller.signal
    )
      .then(res => {
        setRecs(res.recommendations || []);
        setLoading(false);
      })
      .catch(() => {
        setRecs([]);
        setLoading(false);
      });
    return () => controller.abort();
  }, [titleId]);

  if (loading) {
    return (
      <div className="why-movie-skeleton">
        <div className="skeleton-line" style={{ width: '40%', height: 16, marginBottom: 12 }} />
        <div className="why-strip-scroll">
          {[1, 2, 3].map(i => (
            <div key={i} className="why-card skeleton-box" style={{ width: 220, height: 320 }} />
          ))}
        </div>
      </div>
    );
  }

  if (recs.length === 0) return null;

  return (
    <section className="why-this-movie-section">
      <div className="section-title-row">
        <div className="title-with-icon">
          <Compass size={18} className="mint" />
          <h3>Why This Movie? (Curated Connections)</h3>
        </div>
        <span className="mono text-xs text-muted">Transparent Recommendation Attribution</span>
      </div>

      <div className="why-cards-row">
        {recs.map(item => {
          const t = item.title;
          const r = item.reason;
          const year = t.releaseDate ? t.releaseDate.slice(0, 4) : 'TBA';

          return (
            <div
              key={t.id}
              className="why-movie-card glass clickable-card"
              onClick={() => {
                trackEvent('recommendation_clicked', { fromTitleId: titleId, toTitleId: t.id, mode: r.reasonType });
                openTitle(t.id);
              }}
            >
              <div className="why-poster-wrap">
                {t.poster ? (
                  <img src={t.poster} alt={t.title} loading="lazy" />
                ) : (
                  <div className="why-poster-fallback">
                    <Film size={32} />
                  </div>
                )}
                {item.tasteMatchScore && (
                  <div className="why-taste-badge mono mint">
                    <Sparkles size={11} />
                    <span>{item.tasteMatchScore}% Match</span>
                  </div>
                )}
              </div>

              <div className="why-card-body">
                <div className="why-reason-banner">
                  <span className="reason-tag-pill">
                    {r.reasonType === 'taste_match' && <Sparkles size={11} />}
                    {r.reasonType === 'box_office_momentum' && <Flame size={11} />}
                    {r.reasonType === 'genre_affinity' && <Tag size={11} />}
                    <span className="reason-text">{r.reasonText}</span>
                  </span>
                </div>

                <h4 className="why-title">{t.title}</h4>
                <div className="why-meta mono text-xs text-muted">
                  <span>{year}</span>
                  {t.director && <span> · {t.director}</span>}
                </div>

                {r.sharedSignals && r.sharedSignals.length > 0 && (
                  <div className="shared-signals-chips">
                    {r.sharedSignals.map((signal, sIdx) => (
                      <span key={sIdx} className="signal-chip">
                        {signal}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
