'use client';
/**
 * Title "Overview" experience — cinematic hero + editorial overview.
 *
 * Motion system (all of it is skipped under prefers-reduced-motion):
 *  - Hero: letterbox bars retract on open, slow Ken Burns drift on the backdrop, animated film
 *    grain, word-by-word masked title reveal, and a pointer-tracked 3D tilt + glare on the poster.
 *  - Ambient colour: the poster's average colour is sampled (TMDB images send CORS headers) and
 *    tints the hero glow, accents and the tab indicator so every film gets its own palette.
 *  - Overview: blocks rise in as they scroll into view, cards carry a cursor-following spotlight,
 *    numbers count up and the rating ring draws itself.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  CalendarClock, CheckCircle2, ChevronDown, Clapperboard, Clock, Coins, Film, Quote, Sparkles, Users,
} from 'lucide-react';
import type { Title } from '@/lib/types';
import { dateLabel, kindLabel, money } from './client';
import { formatInrCrores } from '@/lib/currencyFormat';

type CurrencyInfo = { rates: { INR: number }; date: string } | null;

/* ─── Colour helpers ────────────────────────────────────────────────────────── */

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)].map((v) => Math.round(v * 255)) as [number, number, number];
}

/* ─── Hooks ─────────────────────────────────────────────────────────────────── */

/** Average colour of an image as "r g b" (for `rgb(var(--ambient) / a)`), or null. */
export function useAmbientColor(src: string | null | undefined): string | null {
  const [color, setColor] = useState<string | null>(null);
  useEffect(() => {
    setColor(null);
    if (!src || typeof window === 'undefined') return;
    // A tiny rendition is plenty for an average and loads instantly.
    const small = src.replace(/\/t\/p\/(w\d+|original)\//, '/t/p/w92/');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let cancelled = false;
    img.onload = () => {
      if (cancelled) return;
      try {
        const size = 24;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0, g = 0, b = 0, weight = 0;
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i], pg = data[i + 1], pb = data[i + 2];
          const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
          // Favour saturated, mid-bright pixels so the tint is a colour, not grey or black.
          const sat = max === 0 ? 0 : (max - min) / max;
          const light = max / 255;
          const w = 0.15 + sat * 1.6 * (light > 0.15 && light < 0.95 ? 1 : 0.2);
          r += pr * w; g += pg * w; b += pb * w; weight += w;
        }
        if (!weight) return;
        r /= weight; g /= weight; b /= weight;
        // Keep the hue, but clamp saturation/lightness so the accent always reads on the
        // dark UI (a near-black poster would otherwise give an unreadable dark accent).
        const [h, s] = rgbToHsl(r, g, b);
        const sat = s < 0.08 ? 0 : Math.min(0.85, Math.max(0.45, s * 1.3));
        const [cr, cg, cb] = hslToRgb(h, sat, sat === 0 ? 0.82 : 0.7);
        setColor(`${cr} ${cg} ${cb}`);
      } catch {
        /* tainted canvas or decode issue: keep the default mint */
      }
    };
    img.src = small;
    return () => {
      cancelled = true;
    };
  }, [src]);
  return color;
}

/** Adds `is-revealed` to every `[data-reveal]` descendant as it scrolls into view. */
export function useScrollReveal(rootRef: React.RefObject<HTMLElement | null>, reducedMotion: boolean, deps: unknown[] = []) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-revealed)'));
    const revealAll = () => items.forEach((el) => el.classList.add('is-revealed'));
    // Nobody is watching a hidden page, and hidden pages do not run IntersectionObserver
    // callbacks, so reveal straight away rather than risk content staying invisible.
    if (reducedMotion || typeof IntersectionObserver === 'undefined' || document.visibilityState === 'hidden') {
      revealAll();
      return;
    }
    root.classList.add('ovx-reveal-ready');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    items.forEach((el) => observer.observe(el));
    // Safety net: anything already on (or above) screen after a moment is shown even if the
    // observer never reported it (e.g. the tab was backgrounded mid-animation).
    const fallback = window.setTimeout(() => {
      for (const el of items) {
        if (!el.classList.contains('is-revealed') && el.getBoundingClientRect().top < window.innerHeight) {
          el.classList.add('is-revealed');
        }
      }
    }, 2500);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') revealAll();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, ...deps]);
}

/** Eases a number from 0 to `target` once `run` turns true. */
function useCountUp(target: number, run: boolean, reducedMotion: boolean, duration = 1100): number {
  const [value, setValue] = useState(reducedMotion ? target : 0);
  useEffect(() => {
    if (!run) return;
    if (reducedMotion) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, run, reducedMotion, duration]);
  return value;
}

/** True once the element has been on screen. */
function useInView<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) {
        setSeen(true);
        io.disconnect();
      }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

/** Sets --mx/--my on the `.ovx-spot` card under the pointer (drives the spotlight glow). */
export function spotlightMove(event: React.PointerEvent<HTMLElement>) {
  const card = (event.target as HTMLElement).closest<HTMLElement>('.ovx-spot');
  if (!card) return;
  const rect = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
  card.style.setProperty('--my', `${event.clientY - rect.top}px`);
}

function relativeFromToday(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((then.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return 'Out today';
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const abs = Math.abs(days);
  if (abs < 14) return rtf.format(days, 'day');
  if (abs < 60) return rtf.format(Math.round(days / 7), 'week');
  if (abs < 730) return rtf.format(Math.round(days / 30), 'month');
  return rtf.format(Math.round(days / 365), 'year');
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((then.getTime() - today.getTime()) / 86_400_000);
}

function compactMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n >= 1e10 ? 0 : 2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

/* ─── Rating ring ───────────────────────────────────────────────────────────── */

function RatingRing({ value, votes, reducedMotion }: { value: number; votes: number; reducedMotion: boolean }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const shown = useCountUp(value, seen, reducedMotion, 1300);
  const radius = 21;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, value / 10));
  const tone = value >= 7.5 ? 'great' : value >= 6 ? 'good' : value >= 4.5 ? 'mixed' : 'poor';
  return (
    <div ref={ref} className={`ovx-ring ovx-ring-${tone}`} title={`TMDB ${value.toFixed(1)} / 10 from ${votes.toLocaleString()} votes`}>
      <svg viewBox="0 0 52 52" aria-hidden="true">
        <circle className="ovx-ring-track" cx="26" cy="26" r={radius} />
        <circle
          className="ovx-ring-value"
          cx="26"
          cy="26"
          r={radius}
          style={{ strokeDasharray: circumference, strokeDashoffset: seen ? circumference * (1 - pct) : circumference }}
        />
      </svg>
      <span className="ovx-ring-num">{shown.toFixed(1)}</span>
      <span className="ovx-ring-label">
        <b>TMDB</b>
        <small>{votes >= 1000 ? `${(votes / 1000).toFixed(votes >= 10000 ? 0 : 1)}K` : votes} votes</small>
      </span>
    </div>
  );
}

/* ─── Hero ──────────────────────────────────────────────────────────────────── */

export function OverviewHero({
  title,
  logoUrl,
  backdropLoaded,
  reducedMotion,
  ambient,
  children,
}: {
  title: Title;
  logoUrl: string | null | undefined;
  backdropLoaded: boolean;
  reducedMotion: boolean;
  ambient: string | null;
  children?: ReactNode;
}) {
  const posterRef = useRef<HTMLDivElement>(null);
  const art = title.backdrop || title.poster;
  const words = useMemo(() => title.title.split(/\s+/).filter(Boolean), [title.title]);
  const year = title.releaseDate?.slice(0, 4);
  const runtime = title.runtime && title.runtime > 0 ? `${Math.floor(title.runtime / 60)}h ${title.runtime % 60}m` : null;
  const finePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;

  function tilt(event: React.PointerEvent<HTMLDivElement>) {
    const el = posterRef.current;
    if (!el || reducedMotion || !finePointer) return;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty('--rx', `${(-y * 14).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${(x * 16).toFixed(2)}deg`);
    el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`);
  }
  function untilt() {
    const el = posterRef.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  }

  return (
    <div
      className={`ovx-hero ${art ? '' : 'ovx-hero-empty'} ${reducedMotion ? 'ovx-still' : ''}`}
      style={ambient ? ({ '--ambient': ambient } as CSSProperties) : undefined}
    >
      {art && (
        <div
          className={`ovx-hero-bg ${title.backdrop ? '' : 'is-poster'} ${backdropLoaded || reducedMotion || !title.backdrop ? 'is-loaded' : ''}`}
          style={{ backgroundImage: `url("${art}")` }}
          aria-hidden="true"
        />
      )}
      <div className="ovx-hero-glow" aria-hidden="true" />
      <div className="ovx-hero-shade" aria-hidden="true" />
      <div className="ovx-hero-grain" aria-hidden="true" />
      <div className="ovx-letterbox ovx-letterbox-top" aria-hidden="true" />
      <div className="ovx-letterbox ovx-letterbox-bottom" aria-hidden="true" />

      <div className="ovx-hero-inner">
        {title.poster ? (
          <div className="ovx-poster-stage" onPointerMove={tilt} onPointerLeave={untilt}>
            <div className="ovx-poster" ref={posterRef}>
              <img src={title.poster} alt={`${title.title} poster`} />
              <span className="ovx-poster-glare" aria-hidden="true" />
            </div>
            <div className="ovx-poster-reflection" aria-hidden="true" style={{ backgroundImage: `url("${title.poster}")` }} />
          </div>
        ) : (
          <div className="ovx-poster-stage ovx-poster-missing" aria-hidden="true">
            <Clapperboard size={40} />
          </div>
        )}

        <div className="ovx-hero-text">
          <span className="ovx-kicker">
            <span className="ovx-kicker-dot" aria-hidden="true" />
            {title.source === 'demo' ? 'Original concept' : kindLabel(title)}
            {title.genres.length > 0 && <i aria-hidden="true">/</i>}
            {title.genres.slice(0, 3).join(' · ')}
          </span>

          {logoUrl ? (
            <img className="ovx-logo" src={logoUrl} alt={title.title} />
          ) : (
            <h2 className="ovx-title" aria-label={title.title}>
              {words.map((word, i) => (
                <span className="ovx-word" key={`${word}-${i}`} aria-hidden="true">
                  <span style={{ '--i': i } as CSSProperties}>{word}</span>
                </span>
              ))}
            </h2>
          )}

          {title.tagline && <p className="ovx-hero-tagline">{title.tagline}</p>}

          <div className="ovx-meta">
            {title.voteCount > 0 && title.voteAverage !== null && (
              <RatingRing value={title.voteAverage} votes={title.voteCount} reducedMotion={reducedMotion} />
            )}
            <div className="ovx-meta-chips">
              {year && (
                <span className="ovx-chip">
                  <CalendarClock size={13} aria-hidden="true" /> {dateLabel(title.releaseDate)}
                </span>
              )}
              {runtime && (
                <span className="ovx-chip">
                  <Clock size={13} aria-hidden="true" /> {runtime}
                </span>
              )}
              {title.mediaType === 'tv' && title.seasons ? (
                <span className="ovx-chip">
                  <Film size={13} aria-hidden="true" /> {title.seasons} {title.seasons === 1 ? 'season' : 'seasons'}
                </span>
              ) : null}
              <span className={`ovx-chip ovx-chip-status ${title.status}`}>
                <span className="ovx-live-dot" aria-hidden="true" />
                {title.status === 'upcoming' ? 'Coming soon' : title.status === 'released' ? 'Now showing' : 'Status TBA'}
              </span>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ─── Overview body (left column) ───────────────────────────────────────────── */

export function OverviewStory({
  title,
  released,
  currencyInfo,
  reducedMotion,
  onOpenPerson,
}: {
  title: Title;
  released: boolean;
  currencyInfo: CurrencyInfo;
  reducedMotion: boolean;
  onOpenPerson: (id: number) => void;
}) {
  const overview = title.overview || 'A full synopsis has not been published for this title yet.';
  const long = overview.length > 380;
  const [expanded, setExpanded] = useState(false);

  const [moneyRef, moneySeen] = useInView<HTMLDivElement>();
  const budget = useCountUp(title.budget || 0, moneySeen, reducedMotion);
  const gross = useCountUp(title.revenue || 0, moneySeen, reducedMotion, 1400);
  const multiple = title.budget && title.revenue ? title.revenue / title.budget : null;
  const roiTone = multiple === null ? '' : multiple >= 2.5 ? 'hit' : multiple >= 1 ? 'even' : 'miss';

  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const creditsAt =
    now && title.runtime && title.runtime > 0
      ? new Date(now.getTime() + title.runtime * 60_000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : null;
  const runtimePct = title.runtime ? Math.min(100, Math.round((title.runtime / 180) * 100)) : 0;

  const until = daysUntil(title.releaseDate);
  const relative = relativeFromToday(title.releaseDate);
  const castTop = title.cast.slice(0, 6);

  return (
    <>
      {/* Story */}
      <section className="ovx-card ovx-spot ovx-story" data-reveal aria-label="Story and premise">
        <div className="ovx-card-head">
          <span className="ovx-eyebrow">
            <Sparkles size={13} aria-hidden="true" /> The story
          </span>
          {title.source === 'tmdb' && (
            <span className="ovx-verified">
              <CheckCircle2 size={12} aria-hidden="true" /> Verified · TMDB
            </span>
          )}
        </div>

        {title.tagline && (
          <blockquote className="ovx-quote">
            <Quote size={22} className="ovx-quote-mark" aria-hidden="true" />
            <span>{title.tagline}</span>
          </blockquote>
        )}

        <p className={`ovx-synopsis ${long && !expanded ? 'is-clamped' : ''}`}>{overview}</p>
        {long && (
          <button type="button" className="ovx-more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
            {expanded ? 'Show less' : 'Read the full synopsis'}
            <ChevronDown size={14} className={expanded ? 'is-up' : ''} aria-hidden="true" />
          </button>
        )}

        {title.genres.length > 0 && (
          <ul className="ovx-genres" aria-label="Genres">
            {title.genres.map((g, i) => (
              <li key={g} style={{ '--i': i } as CSSProperties}>
                {g}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Vitals bento */}
      <div className="ovx-vitals" data-reveal>
        <div className="ovx-card ovx-spot ovx-vital ovx-vital-director">
          <span className="ovx-vital-icon"><Clapperboard size={16} aria-hidden="true" /></span>
          <span className="ovx-vital-label">{title.mediaType === 'tv' ? 'Created by' : 'Directed by'}</span>
          {title.director && title.source === 'tmdb' && title.directorId ? (
            <button type="button" className="ovx-vital-value ovx-link" onClick={() => onOpenPerson(title.directorId!)}>
              {title.director}
            </button>
          ) : (
            <b className="ovx-vital-value">{title.director || 'Not listed'}</b>
          )}
          <span className="ovx-vital-sub">{title.director && title.directorId ? 'Open filmography' : 'Credits pending'}</span>
        </div>

        <div className="ovx-card ovx-spot ovx-vital ovx-vital-release">
          <span className="ovx-vital-icon"><CalendarClock size={16} aria-hidden="true" /></span>
          <span className="ovx-vital-label">{title.status === 'upcoming' ? 'Opens' : 'Released'}</span>
          {title.status === 'upcoming' && until !== null && until > 0 ? (
            <b className="ovx-vital-value ovx-countdown">
              {until}
              <small>{until === 1 ? 'day to go' : 'days to go'}</small>
            </b>
          ) : (
            <b className="ovx-vital-value">{title.releaseDate ? dateLabel(title.releaseDate) : 'TBA'}</b>
          )}
          <span className="ovx-vital-sub">
            <span className={`ovx-status ${released ? 'is-out' : title.status === 'upcoming' ? 'is-soon' : ''}`}>
              {title.status === 'upcoming' ? 'Upcoming' : released ? 'Released' : 'In theaters'}
            </span>
            {relative && title.status !== 'upcoming' && <span>{relative}</span>}
            {title.status === 'upcoming' && title.releaseDate && <span>{dateLabel(title.releaseDate)}</span>}
          </span>
        </div>

        <div className="ovx-card ovx-spot ovx-vital ovx-vital-runtime">
          <span className="ovx-vital-icon"><Clock size={16} aria-hidden="true" /></span>
          <span className="ovx-vital-label">Runtime</span>
          <b className="ovx-vital-value">
            {title.runtime && title.runtime > 0
              ? `${Math.floor(title.runtime / 60)}h ${title.runtime % 60}m`
              : title.mediaType === 'tv' && title.seasons
                ? `${title.seasons} ${title.seasons === 1 ? 'season' : 'seasons'}`
                : 'TBA'}
          </b>
          {title.runtime ? (
            <>
              <span className="ovx-reel" aria-hidden="true"><span style={{ width: `${runtimePct}%` }} /></span>
              <span className="ovx-vital-sub">{creditsAt ? `Start now, credits roll ≈ ${creditsAt}` : `${title.runtime} minutes`}</span>
            </>
          ) : (
            <span className="ovx-vital-sub">Runtime not announced</span>
          )}
        </div>

        <div className="ovx-card ovx-spot ovx-vital ovx-vital-money" ref={moneyRef}>
          <span className="ovx-vital-icon"><Coins size={16} aria-hidden="true" /></span>
          <span className="ovx-vital-label">Box office</span>
          {title.budget ? (
            <>
              <div className="ovx-money-row">
                <span>
                  <small>Budget</small>
                  <b>{compactMoney(budget)}</b>
                </span>
                {title.revenue ? (
                  <span>
                    <small>Worldwide</small>
                    <b>{compactMoney(gross)}</b>
                  </span>
                ) : null}
                {multiple !== null && <span className={`ovx-roi ${roiTone}`} title="Worldwide gross divided by production budget">{multiple.toFixed(1)}× budget</span>}
              </div>
              <span className="ovx-vital-sub" title={`Exact: ${money(title.budget)}${title.revenue ? ` · ${money(title.revenue)} gross` : ''}`}>
                {currencyInfo ? `${formatInrCrores(title.budget, currencyInfo.rates.INR, currencyInfo.date)}` : money(title.budget)}
              </span>
            </>
          ) : (
            <>
              <b className="ovx-vital-value">Undisclosed</b>
              <span className="ovx-vital-sub">Studio has not reported figures</span>
            </>
          )}
        </div>
      </div>

      {/* Cast */}
      {castTop.length > 0 && (
        <section className="ovx-cast" data-reveal aria-label="Top billed cast">
          <div className="ovx-section-head">
            <span className="ovx-eyebrow"><Users size={13} aria-hidden="true" /> Top billed</span>
            <span className="ovx-count">{title.cast.length} credited</span>
          </div>
          <div className="ovx-cast-row">
            {castTop.map((c, i) => {
              const inner = (
                <>
                  <span className="ovx-cast-photo">
                    {c.profile ? <img src={c.profile} alt="" loading="lazy" /> : <Users size={26} aria-hidden="true" />}
                  </span>
                  <span className="ovx-cast-index" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  <span className="ovx-cast-meta">
                    <b>{c.name}</b>
                    <small>{c.character || 'Cast'}</small>
                  </span>
                </>
              );
              return c.id ? (
                <button
                  type="button"
                  key={c.name + i}
                  className="ovx-cast-card"
                  style={{ '--i': i } as CSSProperties}
                  onClick={() => onOpenPerson(c.id!)}
                  aria-label={`${c.name} as ${c.character || 'cast'}. Open filmography`}
                >
                  {inner}
                </button>
              ) : (
                <div key={c.name + i} className="ovx-cast-card" style={{ '--i': i } as CSSProperties}>
                  {inner}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

