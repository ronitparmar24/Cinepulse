'use client';
/**
 * Small motion + data-viz primitives shared by the Predict views (open calls, leaderboard,
 * receipts, accuracy, contrarian) and the Community page. Styles live in predict.css.
 * Everything here settles on its final state immediately for prefers-reduced-motion users.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import './predict.css';

/** Entrance delay for the house `.ex-in` rise animation (capped so long lists don't lag). */
export const stagger = (i: number, step = 40): CSSProperties => ({ animationDelay: `${Math.min(i, 12) * step}ms` });

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Marks every `.pk-rv` element inside `root` with `data-in` once it scrolls into view, which
 * un-pauses its CSS entrance (bars growing, stamps landing). A data attribute rather than a class
 * so React re-renders never strip it. Re-scans whenever `key` changes.
 */
export function useReveal<T extends HTMLElement>(key: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const pending = Array.from(root.querySelectorAll<HTMLElement>('.pk-rv:not([data-in])'));
    if (!pending.length) return;
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      pending.forEach((el) => { el.dataset.in = '1'; });
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { (e.target as HTMLElement).dataset.in = '1'; io.unobserve(e.target); }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    pending.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key]);
  return ref;
}

/** A number that counts up from 0 the first time it scrolls into view (and eases to new values). */
export function CountUp({ value, decimals = 0, prefix = '', suffix = '', duration = 900, className }: {
  value: number; decimals?: number; prefix?: string; suffix?: string; duration?: number; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || !Number.isFinite(value)) return;
    if (prefersReducedMotion()) { from.current = value; setShown(value); return; }
    let raf = 0;
    const run = () => {
      const start = performance.now();
      const a = from.current;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setShown(a + (value - a) * eased);
        if (t < 1) raf = requestAnimationFrame(tick);
        else from.current = value;
      };
      raf = requestAnimationFrame(tick);
    };
    if (typeof IntersectionObserver === 'undefined') { run(); return () => cancelAnimationFrame(raf); }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); run(); }
    });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value, duration]);
  const final = `${prefix}${Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—'}${suffix}`;
  return (
    <span ref={ref} className={`pk-num ${className ?? ''}`}>
      <span aria-hidden="true">{prefix}{shown.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>
      <span className="sr-only">{final}</span>
    </span>
  );
}

/** House-style hero header (drifting glow, kicker chip, display title) for the Predict + Community views. */
export function PkHero({ icon: Icon, kicker, title, sub, tone = 'mint', aside, children }: {
  icon: LucideIcon; kicker: string; title: ReactNode; sub?: ReactNode; tone?: 'mint' | 'amber' | 'lavender'; aside?: ReactNode; children?: ReactNode;
}) {
  return (
    <header className={`pk-hero pk-tone-${tone}`}>
      <div className="pk-hero-aurora" aria-hidden="true" />
      <div className="pk-hero-top">
        <span className="pk-hero-kicker"><Icon size={13} /> {kicker}</span>
        {aside}
      </div>
      <h1 className="pk-hero-title">{title}</h1>
      {sub && <p className="pk-hero-sub">{sub}</p>}
      {children}
    </header>
  );
}

/** Sliding-indicator tabs, modelled on ExploreTabs. */
export function PkTabs<T extends string>({ tabs, value, onChange, label, size = 'md' }: {
  tabs: { id: T; label: string; icon?: LucideIcon; count?: number }[]; value: T; onChange: (id: T) => void; label: string; size?: 'md' | 'sm';
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);
  const sig = tabs.map((t) => `${t.id}:${t.count ?? ''}`).join('|');
  useLayoutEffect(() => {
    const measure = () => {
      const el = wrap.current?.querySelector<HTMLButtonElement>(`[data-tab="${value}"]`);
      if (el) setBar({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [value, sig]);
  const onKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value);
    if (e.key === 'ArrowRight') onChange(tabs[(i + 1) % tabs.length].id);
    if (e.key === 'ArrowLeft') onChange(tabs[(i - 1 + tabs.length) % tabs.length].id);
  };
  return (
    <div className={`pk-tabs pk-tabs-${size}`} ref={wrap} role="tablist" aria-label={label} onKeyDown={onKey}>
      {bar && <span className="pk-tabs-bar" style={{ transform: `translateX(${bar.x}px)`, width: bar.w }} aria-hidden="true" />}
      {tabs.map(({ id, label: l, icon: Icon, count }) => (
        <button key={id} type="button" data-tab={id} role="tab" aria-selected={value === id} tabIndex={value === id ? 0 : -1}
          className={`pk-tab ${value === id ? 'is-on' : ''}`} onClick={() => onChange(id)}>
          {Icon && <Icon size={13} aria-hidden="true" />}
          <span>{l}</span>
          {count !== undefined && <em className="pk-tab-count">{count}</em>}
        </button>
      ))}
    </div>
  );
}

/** A horizontal bar that grows to `value`% when revealed (wrap the list in `useReveal`). */
export function GrowBar({ value, tone = 'mint', delay = 0, className = '' }: { value: number; tone?: 'mint' | 'coral' | 'amber' | 'lavender' | 'muted'; delay?: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className={`pk-bar pk-rv ${className}`} aria-hidden="true">
      <i className={`pk-bar-fill pk-${tone}`} style={{ '--v': `${v}%`, animationDelay: `${delay}ms` } as CSSProperties} />
    </span>
  );
}

/** Ring gauge (0–1 fill) drawn with a single SVG stroke; the arc sweeps in when revealed. */
export function Ring({ fill, size = 76, stroke = 7, tone = 'mint', children, label }: {
  fill: number; size?: number; stroke?: number; tone?: 'mint' | 'amber' | 'coral' | 'lavender'; children?: ReactNode; label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fill));
  return (
    <span className="pk-ring pk-rv" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="pk-ring-track" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className={`pk-ring-arc pk-stroke-${tone}`}
          style={{ strokeDasharray: c, strokeDashoffset: c * (1 - f), '--c': c } as CSSProperties}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="pk-ring-inner">{children}</span>
    </span>
  );
}

/** Hand-rolled SVG sparkline: one or two series on a 0–100 scale, line draws in when revealed. */
export function Sparkline({ series, width = 220, height = 64, label }: {
  series: { values: number[]; tone: 'mint' | 'amber' | 'muted'; dashed?: boolean }[]; width?: number; height?: number; label: string;
}) {
  const pad = 4;
  const path = (vals: number[]) => vals.map((v, i) => {
    const x = pad + (i / Math.max(1, vals.length - 1)) * (width - pad * 2);
    const y = height - pad - (Math.max(0, Math.min(100, v)) / 100) * (height - pad * 2);
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg className="pk-spark pk-rv" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={label}>
      {series.map((s, i) => (
        <path key={i} d={path(s.values)} pathLength={1} fill="none" vectorEffect="non-scaling-stroke"
          className={`pk-spark-line pk-stroke-${s.tone} ${s.dashed ? 'is-dashed' : ''}`} style={{ animationDelay: `${i * 160}ms` }} />
      ))}
    </svg>
  );
}

/** Days until a YYYY-MM-DD release (forecasts lock on release day, UTC). */
export function daysUntil(date: string | null | undefined, now: number): number | null {
  if (!date) return null;
  const t = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - now) / 86_400_000);
}

export function closesLabel(days: number | null): { text: string; urgent: boolean; locked: boolean } | null {
  if (days === null) return null;
  if (days <= 0) return { text: 'Locked', urgent: false, locked: true };
  if (days === 1) return { text: 'Closes tomorrow', urgent: true, locked: false };
  return { text: `Closes in ${days} days`, urgent: days <= 7, locked: false };
}
