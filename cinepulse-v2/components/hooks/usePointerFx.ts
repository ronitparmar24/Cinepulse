import { useEffect } from 'react';

const SPOT = '.poster-image, .top10-poster, .rv-card, .pad-card, .editorial-card, .calendar-row, .glass-card';
const TILT = new Set(['poster-image', 'top10-poster', 'rv-card']);
const MAX_TILT = 7; // degrees

/**
 * One delegated, rAF-throttled pointer listener for the whole app (mouse/trackpad only, and off
 * for reduced motion):
 *  - cards under the pointer get --mx/--my for a spotlight sheen,
 *  - posters also get --rx/--ry for an Apple-TV style parallax tilt with glare,
 *  - a single fixed `.cursor-glow` element follows the pointer via transform (no layout work).
 */
export function usePointerFx() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!fine.matches || reduced.matches) return;

    const glow = document.querySelector<HTMLElement>('.cursor-glow');
    let frame = 0;
    let lastEvent: PointerEvent | null = null;
    let current: HTMLElement | null = null;

    const release = (el: HTMLElement | null) => {
      if (!el) return;
      el.classList.remove('fx-on');
      el.style.removeProperty('--rx');
      el.style.removeProperty('--ry');
    };

    const isTilt = (el: HTMLElement) => {
      for (const c of el.classList) if (TILT.has(c)) return true;
      return false;
    };

    const tick = () => {
      frame = 0;
      const e = lastEvent;
      if (!e) return;
      if (glow) glow.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      const target = (e.target instanceof Element ? e.target.closest<HTMLElement>(SPOT) : null) ?? null;
      if (target !== current) {
        release(current);
        current = target;
        current?.classList.add('fx-on');
      }
      if (!current) return;
      const r = current.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      current.style.setProperty('--mx', `${x.toFixed(0)}px`);
      current.style.setProperty('--my', `${y.toFixed(0)}px`);
      if (isTilt(current) && r.width > 0 && r.height > 0) {
        const px = x / r.width - 0.5;
        const py = y / r.height - 0.5;
        current.style.setProperty('--rx', `${(-py * MAX_TILT * 2).toFixed(2)}deg`);
        current.style.setProperty('--ry', `${(px * MAX_TILT * 2).toFixed(2)}deg`);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      lastEvent = e;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      release(current);
      current = null;
      glow?.classList.remove('is-on');
    };
    const onEnter = () => glow?.classList.add('is-on');

    document.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    document.documentElement.addEventListener('pointerenter', onEnter);
    glow?.classList.add('is-on');
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.documentElement.removeEventListener('pointerenter', onEnter);
      release(current);
    };
  }, []);
}
