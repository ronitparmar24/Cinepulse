'use client';
/**
 * "Pick up where you left off" — a Continue-Watching style rail of the titles this device opened
 * most recently (localStorage only). Wide backdrop cards, per-item remove, clear all.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Clapperboard, History, Star, X } from 'lucide-react';
import { useApp } from './Context';
import { RECENT_EVENT, clearRecent, forgetTitle, readRecent, timeAgo, type RecentTitle } from '@/lib/recentlyViewed';

const EMPTY: RecentTitle[] = [];
let cacheRaw: string | null = null;
let cacheList: RecentTitle[] = EMPTY;

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === 'cinepulse_recent_v1') cb(); };
  window.addEventListener(RECENT_EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(RECENT_EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}
function getSnapshot(): RecentTitle[] {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem('cinepulse_recent_v1'); } catch { raw = null; }
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cacheList = readRecent();
  }
  return cacheList;
}
const getServerSnapshot = () => EMPTY;

export function useRecentTitles(): RecentTitle[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function RecentlyViewedRail() {
  const { openTitle } = useApp();
  const items = useRecentTitles();
  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  // Timestamps are relative, so they are computed at render; the rail re-renders whenever it changes.
  const [now] = useState(() => Date.now());

  function updateEdges() {
    const el = railRef.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  }
  useEffect(updateEdges, [items.length]);
  function scrollRail(dir: 1 | -1) {
    railRef.current?.scrollBy({ left: dir * Math.max(280, (railRef.current?.clientWidth ?? 600) * 0.75), behavior: 'smooth' });
  }

  if (items.length < 2) return null;

  return (
    <section className="rv section" aria-label="Recently viewed">
      <div className="top10-head">
        <div>
          <span className="eyebrow"><History size={12} aria-hidden="true" /> ON THIS DEVICE</span>
          <h2>Pick up where you left off</h2>
        </div>
        <div className="rv-tools">
          <button type="button" className="rv-clear" onClick={clearRecent}>Clear history</button>
          <div className="top10-nav">
            <button type="button" onClick={() => scrollRail(-1)} disabled={edges.start} aria-label="Scroll recently viewed left"><ChevronLeft size={18} /></button>
            <button type="button" onClick={() => scrollRail(1)} disabled={edges.end} aria-label="Scroll recently viewed right"><ChevronRight size={18} /></button>
          </div>
        </div>
      </div>
      <div className={`rv-rail pl-mask${edges.start ? '' : ' is-scrolled'}${edges.end ? ' at-end' : ''}`} ref={railRef} onScroll={updateEdges}>
        {items.map((r, i) => {
          const art = r.backdrop || r.poster;
          return (
            <div key={r.id} className="rv-card" style={{ '--i': i } as CSSProperties}>
              <button type="button" className="rv-open" onClick={() => openTitle(r.id)} aria-label={`Open ${r.title}`}>
                {art ? (
                  <img src={r.backdrop ? art.replace('/w1280/', '/w780/') : art.replace('/w500/', '/w342/')} alt="" loading="lazy" decoding="async" className={r.backdrop ? '' : 'is-poster'} />
                ) : (
                  <span className="rv-fallback"><Clapperboard size={26} aria-hidden="true" /></span>
                )}
                <span className="rv-shade" aria-hidden="true" />
                <span className="rv-info">
                  <b>{r.title}</b>
                  <small>
                    {[r.year, r.genre].filter(Boolean).join(' · ')}
                    {r.voteAverage ? <> · <Star size={10} fill="currentColor" aria-hidden="true" /> {r.voteAverage.toFixed(1)}</> : null}
                  </small>
                </span>
                <span className="rv-when">{timeAgo(r.viewedAt, now)}</span>
              </button>
              <button type="button" className="rv-remove" onClick={() => forgetTitle(r.id)} aria-label={`Remove ${r.title} from history`}>
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
