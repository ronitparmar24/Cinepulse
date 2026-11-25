'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Clapperboard, LoaderCircle, Pause, Play, RotateCcw, Share2, Sparkles, Star, Target, X } from 'lucide-react';
import type { WrappedSummary } from '@/lib/wrapped';
import { api } from './client';
import { useReducedMotion } from './hooks/useReducedMotion';

const SLIDE_MS = 6500;
const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const STYLE_COPY = {
  generous: { label: 'Generous rater', text: 'You go in hoping to love it, and usually do.' },
  balanced: { label: 'Balanced critic', text: 'Fair, measured, and hard to fool.' },
  tough: { label: 'Tough critic', text: 'Stars are earned with you, never given.' },
} as const;

type Slide = { key: string; tone: string; body: React.ReactNode };

function useCountUp(target: number, run: boolean, reduced: boolean): number {
  const [value, setValue] = useState(reduced ? target : 0);
  useEffect(() => {
    if (!run) return;
    if (reduced || target <= 0) { setValue(target); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1100);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, reduced]);
  return value;
}

function Big({ n, reduced }: { n: number; reduced: boolean }) {
  return <>{useCountUp(n, true, reduced).toLocaleString()}</>;
}

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return null;
  const full = Math.floor(rating);
  return <span className="wr-stars" aria-label={`${rating} stars`}>{'★'.repeat(full)}{rating - full >= 0.5 ? '½' : ''}</span>;
}

async function shareCard(year: number): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const res = await fetch(`/api/wrapped/card?year=${year}`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('The share card could not be made right now.');
  const blob = await res.blob();
  const file = new File([blob], `cinepulse-wrapped-${year}.png`, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: `My ${year} on CinePulse`, text: `My ${year} in film #CinePulseWrapped` });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}

export function WrappedStory({ year, name, onClose, onNavigate }: { year: number; name: string; onClose: () => void; onNavigate?: (view: 'predictions' | 'discover') => void }) {
  const reduced = useReducedMotion();
  const [data, setData] = useState<WrappedSummary | null>(null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [paused, setPaused] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [shareNote, setShareNote] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const press = useRef<{ x: number; y: number; t: number; target: EventTarget | null } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<{ wrapped: WrappedSummary }>(`/wrapped?year=${year}`, 'GET', undefined, controller.signal)
      .then((d) => setData(d.wrapped))
      .catch((e: Error) => { if (!controller.signal.aborted) setError(e.message || 'Your Wrapped could not be loaded.'); });
    return () => controller.abort();
  }, [year]);

  // Lock the page behind, focus the close button, and give focus back when done.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const html = document.documentElement.style.overflow;
    const body = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.documentElement.style.overflow = html;
      document.body.style.overflow = body;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const slides = useMemo<Slide[]>(() => {
    if (!data) return [];
    const w = data;
    if (!w.hasData) {
      return [{
        key: 'empty', tone: 'mint', body: (
          <div className="wr-center">
            <span className="wr-icon"><Clapperboard size={30} /></span>
            <span className="wr-eyebrow">CinePulse Wrapped {w.year}</span>
            <h2 className="wr-h">Your story starts with one film</h2>
            <p className="wr-p">Mark films as watched or log them in your diary, and your {w.year} Wrapped fills itself in.</p>
            <button type="button" className="wr-btn is-primary" onClick={() => { onClose(); onNavigate?.('discover'); }}>Find something to watch</button>
          </div>
        ),
      }];
    }
    const out: Slide[] = [];
    out.push({
      key: 'intro', tone: 'mint', body: (
        <div className="wr-center">
          <span className="wr-eyebrow">CinePulse Wrapped</span>
          <h2 className="wr-h wr-h-xl">{name ? `${name}, your` : 'Your'} {w.year} in film</h2>
          <p className="wr-p">Everything you watched, rated and called this year — in one minute.</p>
          <span className="wr-hint">Tap to continue</span>
        </div>
      ),
    });
    out.push({
      key: 'count', tone: 'violet', body: (
        <div className="wr-block">
          <span className="wr-eyebrow">This year you watched</span>
          <div className="wr-mega"><Big n={w.filmsWatched} reduced={reduced} /></div>
          <h2 className="wr-h">{w.filmsWatched === 1 ? 'title' : 'titles'}</h2>
          <div className="wr-chips">
            <span>{w.moviesWatched} {w.moviesWatched === 1 ? 'film' : 'films'}</span>
            <span>{w.seriesWatched} {w.seriesWatched === 1 ? 'series' : 'series'}</span>
            {w.hoursWatched > 0 && <span>{w.hoursWatched} hours of film</span>}
          </div>
          {w.firstWatch && <p className="wr-p">It all started with <b>{w.firstWatch.title}</b> on {new Date(`${w.firstWatch.date}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'UTC' })}.</p>}
        </div>
      ),
    });
    if (w.topGenres.length) {
      const max = w.topGenres[0].count || 1;
      out.push({
        key: 'genres', tone: 'amber', body: (
          <div className="wr-block">
            <span className="wr-eyebrow">Your genres</span>
            <h2 className="wr-h">You kept coming back to <em>{w.topGenres[0].name}</em></h2>
            <ol className="wr-bars">
              {w.topGenres.map((g, i) => (
                <li key={g.name} style={{ '--w': `${Math.max(18, (g.count / max) * 100)}%`, '--i': i } as React.CSSProperties}>
                  <span>{g.name}</span><b>{g.count}</b><i />
                </li>
              ))}
            </ol>
            {w.favoriteDecade && <p className="wr-p">And most of it came from the <b>{w.favoriteDecade}</b>.</p>}
          </div>
        ),
      });
    }
    if (w.busiestMonth) {
      const peak = Math.max(1, ...w.months);
      out.push({
        key: 'months', tone: 'teal', body: (
          <div className="wr-block">
            <span className="wr-eyebrow">Your busiest month</span>
            <h2 className="wr-h"><em>{w.busiestMonth.label}</em> — {w.busiestMonth.count} {w.busiestMonth.count === 1 ? 'title' : 'titles'}</h2>
            <div className="wr-months" aria-hidden="true">
              {w.months.map((n, i) => (
                <span key={i} className={i === Number(w.busiestMonth!.month.slice(5)) - 1 ? 'is-peak' : ''} style={{ '--h': `${Math.max(4, (n / peak) * 100)}%`, '--i': i } as React.CSSProperties}>
                  <i /><small>{MONTH_LETTERS[i]}</small>
                </span>
              ))}
            </div>
          </div>
        ),
      });
    }
    if (w.topFilms.length) {
      out.push({
        key: 'top', tone: 'rose', body: (
          <div className="wr-block">
            <span className="wr-eyebrow">{w.topFilms.some((f) => f.rating !== null) ? 'Your highest rated' : 'Your year in posters'}</span>
            <h2 className="wr-h">Top {w.topFilms.length === 1 ? 'pick' : w.topFilms.length}</h2>
            <ol className="wr-posters">
              {w.topFilms.map((f, i) => (
                <li key={f.titleId} style={{ '--i': i } as React.CSSProperties}>
                  <span className="wr-rank">{i + 1}</span>
                  {f.poster ? <img src={f.poster} alt="" loading="eager" /> : <span className="wr-poster-fallback">{f.title}</span>}
                  <span className="wr-poster-meta"><b>{f.title}</b><Stars rating={f.rating} /></span>
                </li>
              ))}
            </ol>
          </div>
        ),
      });
    }
    if (w.ratings.count > 0) {
      const style = w.ratings.style ? STYLE_COPY[w.ratings.style] : null;
      out.push({
        key: 'ratings', tone: 'gold', body: (
          <div className="wr-center">
            <span className="wr-eyebrow">How you rate</span>
            <div className="wr-mega wr-mega-star">{w.ratings.average?.toFixed(1)}<Star size={54} fill="currentColor" /></div>
            <h2 className="wr-h">{style ? style.label : `Across ${w.ratings.count} ratings`}</h2>
            {style && <p className="wr-p">{style.text}</p>}
            <div className="wr-chips">
              <span>{w.ratings.count} rated</span>
              {w.ratings.fiveStars > 0 && <span>{w.ratings.fiveStars} five-star {w.ratings.fiveStars === 1 ? 'film' : 'films'}</span>}
              {w.reviewsWritten > 0 && <span>{w.reviewsWritten} {w.reviewsWritten === 1 ? 'review' : 'reviews'}</span>}
            </div>
          </div>
        ),
      });
    }
    out.push({
      key: 'calls', tone: 'mint', body: w.predictions.calls > 0 ? (
        <div className="wr-center">
          <span className="wr-eyebrow">Your opening calls</span>
          <div className="wr-ring" style={{ '--p': w.predictions.accuracy ?? 0 } as React.CSSProperties}>
            <span>{w.predictions.accuracy !== null ? `${w.predictions.accuracy}%` : <Target size={40} />}</span>
          </div>
          <h2 className="wr-h">{w.predictions.calls} {w.predictions.calls === 1 ? 'call' : 'calls'} made</h2>
          <p className="wr-p">{w.predictions.resolved > 0
            ? `${w.predictions.correct} of ${w.predictions.resolved} resolved calls landed. The rest are still playing out.`
            : 'None have resolved yet — the box office will have its say soon.'}</p>
        </div>
      ) : (
        <div className="wr-center">
          <span className="wr-icon"><Target size={30} /></span>
          <span className="wr-eyebrow">Your opening calls</span>
          <h2 className="wr-h">No calls yet</h2>
          <p className="wr-p">Next year, call a film hit or flop before it opens and see how your instincts stack up.</p>
          <button type="button" className="wr-btn" onClick={() => { onClose(); onNavigate?.('predictions'); }}>Make a call</button>
        </div>
      ),
    });
    out.push({ key: 'finale', tone: 'violet', body: null });
    return out;
  }, [data, name, reduced, onClose, onNavigate]);

  const count = slides.length;
  const last = count - 1;
  const go = useCallback((delta: number) => setIndex((i) => Math.max(0, Math.min(last, i + delta))), [last]);
  const isFinale = slides[index]?.key === 'finale';
  const autoPlay = !reduced && !paused && !held && count > 1 && index < last;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === ' ' && !(e.target as HTMLElement)?.closest?.('button')) { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    press.current = { x: e.clientX, y: e.clientY, t: performance.now(), target: e.target };
    setHeld(true);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    setHeld(false);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) { onClose(); return; }
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { go(dx < 0 ? 1 : -1); return; }
    if (performance.now() - p.t > 350 || Math.abs(dx) > 12 || Math.abs(dy) > 12) return; // a hold or drag, not a tap
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    go(e.clientX - rect.left < rect.width / 3 ? -1 : 1);
  };

  const doShare = async () => {
    if (!data) return;
    setShareState('busy');
    setShareNote('');
    try {
      const result = await shareCard(data.year);
      setShareState(result === 'cancelled' ? 'idle' : 'done');
      setShareNote(result === 'downloaded' ? 'Saved your card as an image.' : result === 'shared' ? 'Shared!' : '');
    } catch (e) {
      setShareState('error');
      setShareNote((e as Error).message);
    }
  };

  const finale = data && data.hasData ? (
    <div className="wr-block">
      <span className="wr-eyebrow">That was your {data.year}</span>
      <h2 className="wr-h">Here’s to the next one</h2>
      <div className="wr-summary">
        <div><small>Titles</small><b>{data.filmsWatched}</b></div>
        <div><small>Hours</small><b>{data.hoursWatched}</b></div>
        <div><small>Top genre</small><b>{data.topGenres[0]?.name ?? '—'}</b></div>
        <div><small>Calls</small><b>{data.predictions.calls}</b></div>
      </div>
      <button type="button" className="wr-btn is-primary" onClick={() => void doShare()} disabled={shareState === 'busy'}>
        {shareState === 'busy' ? <LoaderCircle size={17} className="spin" /> : <Share2 size={17} />}
        {shareState === 'busy' ? 'Making your card…' : 'Share my Wrapped'}
      </button>
      {shareNote && <p className={`wr-note ${shareState === 'error' ? 'is-error' : ''}`} role="status">{shareNote}</p>}
      <button type="button" className="wr-btn" onClick={() => setIndex(0)}><RotateCcw size={16} /> Watch again</button>
    </div>
  ) : null;

  const tone = slides[index]?.tone ?? 'mint';

  const content = (
    <div className="wr" role="dialog" aria-modal="true" aria-label={`Your ${year} CinePulse Wrapped`} data-tone={tone}>
      <div className="wr-bg" aria-hidden="true"><i /><i /><i /></div>
      <button type="button" className="wr-side wr-side-prev" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous"><ChevronLeft size={22} /></button>
      <div className="wr-frame" ref={frameRef}>
        <div className="wr-progress" aria-hidden="true">
          {(count ? slides : [{ key: 'x' }]).map((s, i) => (
            <span key={s.key} className={i < index ? 'is-done' : i === index ? 'is-active' : ''}>
              {i === index && count > 1 && index < last && !reduced && (
                <i key={`${index}-${s.key}`} style={{ animationDuration: `${SLIDE_MS}ms`, animationPlayState: autoPlay ? 'running' : 'paused' }} onAnimationEnd={() => go(1)} />
              )}
            </span>
          ))}
        </div>
        <header className="wr-top">
          <span className="wr-brand"><Sparkles size={14} /> Wrapped {year}</span>
          {count > 1 && !reduced && index < last && (
            <button type="button" className="wr-icon-btn" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play' : 'Pause'}>
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
          )}
          <button type="button" ref={closeRef} className="wr-icon-btn" onClick={onClose} aria-label="Close Wrapped"><X size={18} /></button>
        </header>
        <div className="wr-stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { press.current = null; setHeld(false); }}>
          {error ? (
            <div className="wr-center">
              <span className="wr-icon"><Clapperboard size={30} /></span>
              <h2 className="wr-h">Wrapped didn’t load</h2>
              <p className="wr-p">{error}</p>
              <button type="button" className="wr-btn" onClick={onClose}>Close</button>
            </div>
          ) : !data ? (
            <div className="wr-center" aria-busy="true"><LoaderCircle size={34} className="spin" /><p className="wr-p">Rewinding your year…</p></div>
          ) : (
            <section key={slides[index]?.key} className="wr-slide" aria-live="polite">
              {isFinale ? finale : slides[index]?.body}
            </section>
          )}
        </div>
        {count > 1 && <span className="wr-count" aria-hidden="true">{index + 1} / {count}</span>}
      </div>
      <button type="button" className="wr-side wr-side-next" onClick={() => go(1)} disabled={index >= last} aria-label="Next"><ChevronRight size={22} /></button>
    </div>
  );

  return createPortal(content, document.body);
}
