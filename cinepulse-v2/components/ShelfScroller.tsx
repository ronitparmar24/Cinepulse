'use client';
/**
 * A horizontal poster shelf: snap scrolling, soft fade masks only on the edges that have more
 * to show, and round arrow buttons on pointer devices (styles in polish.css).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function ShelfScroller({ children, className = '', label }: { children: ReactNode; className?: string; label: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const start = el.scrollLeft < 8;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    update();
    // Cards are added, removed or resized (images loading, window resizing): re-check the edges.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true });
    return () => { ro?.disconnect(); mo.disconnect(); };
  }, [update]);

  const scroll = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <div className={`pl-shelf${edges.start && edges.end ? ' is-static' : ''}`}>
      <button type="button" className="pl-shelf-arrow is-prev" onClick={() => scroll(-1)} disabled={edges.start} aria-label={`Scroll ${label} left`} tabIndex={-1}>
        <ChevronLeft size={18} />
      </button>
      <div
        ref={trackRef}
        className={`pl-shelf-track pl-mask ${className}${edges.start ? '' : ' is-scrolled'}${edges.end ? ' at-end' : ''}`}
        onScroll={update}
        role="region"
        aria-label={label}
      >
        {children}
      </div>
      <button type="button" className="pl-shelf-arrow is-next" onClick={() => scroll(1)} disabled={edges.end} aria-label={`Scroll ${label} right`} tabIndex={-1}>
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
