'use client';
/**
 * "More like this" rail for the title modal. Poster-first cards in a horizontal, snap-scrolling
 * rail: a match ring, a one-line reason (why it was picked) and icon-only feedback controls.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Compass, Film, Flame, Sparkles, Tag } from 'lucide-react';
import type { RecommendedMovieWithReason } from '@/lib/recommendations';
import { api, trackEvent } from './client';
import { useApp } from './Context';
import { FeedbackControls } from './FeedbackControls';

function MatchRing({ value }: { value: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <span className="wx-match" title={`${value}% match with this title`}>
      <svg viewBox="0 0 34 34" aria-hidden="true">
        <circle className="wx-match-track" cx="17" cy="17" r={r} />
        <circle className="wx-match-value" cx="17" cy="17" r={r} style={{ strokeDasharray: c, strokeDashoffset: c * (1 - value / 100) }} />
      </svg>
      <b>{value}</b>
    </span>
  );
}

export function WhyThisMovie({ titleId }: { titleId: string }) {
  const { openTitle } = useApp();
  const [recs, setRecs] = useState<RecommendedMovieWithReason[]>([]);
  const [loading, setLoading] = useState(true);
  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api<{ recommendations: RecommendedMovieWithReason[] }>(`/recommendations/why/${titleId}`, 'GET', undefined, controller.signal)
      .then((res) => {
        setRecs(res.recommendations || []);
        setLoading(false);
      })
      .catch(() => {
        setRecs([]);
        setLoading(false);
      });
    return () => controller.abort();
  }, [titleId]);

  function updateEdges() {
    const el = railRef.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  }
  useEffect(updateEdges, [recs.length]);

  function scrollRail(dir: 1 | -1) {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' });
  }

  if (loading) {
    return (
      <section className="why-this-movie-section wx" aria-busy="true">
        <div className="wx-head"><span className="ovx-eyebrow"><Compass size={13} /> More like this</span></div>
        <div className="wx-rail">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="wx-card wx-skeleton" />)}
        </div>
      </section>
    );
  }

  if (recs.length === 0) return null;

  return (
    <section className="why-this-movie-section wx" aria-label="More like this">
      <div className="wx-head">
        <div>
          <span className="ovx-eyebrow"><Compass size={13} aria-hidden="true" /> More like this</span>
          <h3>Why these picks?</h3>
          <p>Every suggestion shows the reason it was chosen.</p>
        </div>
        <div className="wx-nav">
          <button type="button" onClick={() => scrollRail(-1)} disabled={edges.start} aria-label="Scroll suggestions left"><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => scrollRail(1)} disabled={edges.end} aria-label="Scroll suggestions right"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="wx-rail" ref={railRef} onScroll={updateEdges}>
        {recs.map((item, i) => {
          const t = item.title;
          const r = item.reason;
          const year = t.releaseDate ? t.releaseDate.slice(0, 4) : 'TBA';
          const ReasonIcon = r.reasonType === 'box_office_momentum' ? Flame : r.reasonType === 'genre_affinity' ? Tag : Sparkles;
          const open = () => {
            trackEvent('recommendation_clicked', { fromTitleId: titleId, toTitleId: t.id, mode: r.reasonType });
            openTitle(t.id);
          };
          return (
            <article key={t.id} className="wx-card" style={{ '--i': Math.min(i, 8) } as CSSProperties}>
              <button type="button" className="wx-poster" onClick={open} aria-label={`Open ${t.title} (${year})`}>
                {t.poster ? <img src={t.poster} alt="" loading="lazy" /> : <span className="wx-poster-fallback"><Film size={28} /></span>}
                <span className="wx-shade" aria-hidden="true" />
                {item.tasteMatchScore ? <MatchRing value={item.tasteMatchScore} /> : null}
                <span className="wx-play" aria-hidden="true"><ChevronRight size={18} /></span>
                <span className="wx-caption">
                  <b>{t.title}</b>
                  <small>{year}{t.director ? ` · ${t.director}` : ''}</small>
                </span>
              </button>
              <p className="wx-reason" title={r.sharedSignals?.length ? `Shared: ${r.sharedSignals.join(', ')}` : undefined}>
                <ReasonIcon size={11} aria-hidden="true" />
                <span>{r.reasonText}</span>
              </p>
              <FeedbackControls
                title={t}
                surface="why_this_movie"
                compact
                onFeedbackGiven={(sig) => {
                  if (sig === 'not_interested' || sig === 'already_seen' || sig === 'snooze') {
                    setRecs((prev) => prev.filter((x) => x.title.id !== t.id));
                  }
                }}
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}
