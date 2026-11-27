'use client';
/**
 * Small motion helpers shared by the social surfaces (activity feed, public profile, watch circles).
 * Styles live in components/social-motion.css, which this module imports.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ComponentType, type KeyboardEvent } from 'react';
import './social-motion.css';

/** Entrance delay for the nth item of a list (caps out so long lists don't drag). */
export const stagger = (i: number, step = 45): CSSProperties => ({ animationDelay: `${Math.min(i, 12) * step}ms` });

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/** A number that counts up from 0 the first time it scrolls into view. Screen readers get the final value. */
export function CountUp({ value, decimals = 0, duration = 900, prefix = '', suffix = '' }: {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') { setShown(value); from.current = value; return; }
    let raf = 0;
    const start = from.current;
    const run = () => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setShown(start + (value - start) * eased);
        if (p < 1) raf = requestAnimationFrame(tick);
        else from.current = value;
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); run(); }
    }, { threshold: 0.2 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value, duration]);
  const text = `${prefix}${shown.toFixed(decimals)}${suffix}`;
  const final = `${prefix}${value.toFixed(decimals)}${suffix}`;
  return (
    <span ref={ref} className="sx-count">
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{final}</span>
    </span>
  );
}

export interface SlidingTab<T extends string> { id: T; label: string; Icon?: ComponentType<{ size?: number }> }

/**
 * Pill tab bar with an indicator that glides to the active tab (the Explore page pattern).
 * Roving tabindex: arrows / Home / End move between tabs and select them.
 */
export function SlidingTabs<T extends string>({ tabs, value, onChange, label, idPrefix, panelId }: {
  tabs: SlidingTab<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  idPrefix: string;
  panelId: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const box = wrap.current;
    if (!box) return;
    const measure = () => {
      const el = box.querySelector<HTMLButtonElement>(`[data-tab="${value}"]`);
      if (!el) return;
      setBar({ x: el.offsetLeft, w: el.offsetWidth });
      // Keep the active tab visible inside the scrollable strip without scrolling the page.
      const left = el.offsetLeft - 12;
      const right = el.offsetLeft + el.offsetWidth + 12 - box.clientWidth;
      if (box.scrollLeft > left) box.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      else if (box.scrollLeft < right) box.scrollTo({ left: right, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(box);
    window.addEventListener('resize', measure);
    // Web fonts can change tab widths after first paint.
    void document.fonts?.ready.then(measure).catch(() => {});
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, [value, tabs.length]);
  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    wrap.current?.querySelector<HTMLButtonElement>(`[data-tab="${tabs[next].id}"]`)?.focus();
  };
  return (
    <div className="sxt" ref={wrap} role="tablist" aria-label={label} onKeyDown={onKey}>
      {bar && <span className="sxt-bar" style={{ transform: `translateX(${bar.x}px)`, width: bar.w }} aria-hidden="true" />}
      {tabs.map(({ id, label: text, Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          data-tab={id}
          id={`${idPrefix}-${id}`}
          aria-selected={value === id}
          aria-controls={panelId}
          tabIndex={value === id ? 0 : -1}
          className={`sxt-tab ${value === id ? 'is-on' : ''}`}
          onClick={() => onChange(id)}
        >
          {Icon && <Icon size={14} />}
          <span>{text}</span>
        </button>
      ))}
    </div>
  );
}

/** Deterministic hue per name, so initials avatars stay the same colour everywhere. */
const HUES = [152, 190, 38, 280, 12, 220, 330];
export function nameHue(name: string): number {
  return HUES[[...(name || '?')].reduce((n, c) => n + c.charCodeAt(0), 0) % HUES.length];
}

/** Round avatar with a mint ring; falls back to a tinted initial when there is no (working) image. */
export function RingAvatar({ name, src, size = 40, className = '' }: { name: string; src?: string | null; size?: number; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const hue = nameHue(name);
  const showImg = Boolean(src) && broken !== src;
  return (
    <span
      className={`sx-avatar ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: `hsl(${hue} 32% 24%)`, color: `hsl(${hue} 70% 82%)` }}
      aria-hidden="true"
    >
      {showImg ? <img src={src!} alt="" loading="lazy" decoding="async" onError={() => setBroken(src!)} /> : (name || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}
