'use client';
/**
 * "Top 10 this week" rail: posters ranked by the trending order, each standing in front of a
 * giant outlined rank number. Snap-scrolls horizontally with arrow buttons on desktop.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Clapperboard, Star } from 'lucide-react';
import type { Title } from '@/lib/types';
import { useApp } from './Context';

export function TopTenRail({ titles }: { titles: Title[] }) {
  const { openTitle } = useApp();
  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const top = titles.slice(0, 10);

  function updateEdges() {
    const el = railRef.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  }
  useEffect(updateEdges, [top.length]);

  function scrollRail(dir: 1 | -1) {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(300, el.clientWidth * 0.75), behavior: 'smooth' });
  }

  if (top.length < 5) return null;

  return (
    <section className="top10 section" aria-label="Top 10 this week">
      <div className="top10-head">
        <div>
          <span className="eyebrow">CHARTING NOW</span>
          <h2>Top 10 on CinePulse this week</h2>
        </div>
        <div className="top10-nav">
          <button type="button" onClick={() => scrollRail(-1)} disabled={edges.start} aria-label="Scroll Top 10 left"><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => scrollRail(1)} disabled={edges.end} aria-label="Scroll Top 10 right"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="top10-rail" ref={railRef} onScroll={updateEdges}>
        {top.map((t, i) => (
          <button
            key={t.id}
            type="button"
            className="top10-item"
            style={{ '--i': i } as CSSProperties}
            onClick={() => openTitle(t.id)}
            aria-label={`Number ${i + 1}: ${t.title}`}
          >
            <span className="top10-num" aria-hidden="true">{i + 1}</span>
            <span className="top10-poster">
              {t.poster ? <img src={t.poster} alt="" loading="lazy" decoding="async" /> : <Clapperboard size={30} aria-hidden="true" />}
              <span className="top10-info" aria-hidden="true">
                <b>{t.title}</b>
                <small>
                  {t.releaseDate?.slice(0, 4) || 'TBA'}
                  {t.voteAverage && t.voteCount > 0 ? <> · <Star size={10} fill="currentColor" /> {t.voteAverage.toFixed(1)}</> : null}
                </small>
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
