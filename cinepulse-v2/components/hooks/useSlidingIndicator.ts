import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * Measures the active child (`button.active` by default) of a nav and returns CSS variables
 * (--nav-x / --nav-y / --nav-w / --nav-h) for a pill that slides between items. Re-measures on
 * `dep` change, window or nav resize, and once web fonts are ready.
 */
export function useSlidingIndicator<T extends HTMLElement>(dep: unknown, selector = 'button.active') {
  const ref = useRef<T | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const active = ref.current?.querySelector<HTMLElement>(selector);
      setBox(active ? { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight } : null);
    };
    measure();
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure).catch(() => {});
    // The nav can change width without a window resize (dialogs, late styles, wrapping).
    const ro = typeof ResizeObserver !== 'undefined' && ref.current ? new ResizeObserver(measure) : null;
    if (ro && ref.current) ro.observe(ref.current);
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [dep, selector]);
  const style = box
    ? ({ '--nav-x': `${box.x}px`, '--nav-y': `${box.y}px`, '--nav-w': `${box.w}px`, '--nav-h': `${box.h}px` } as CSSProperties)
    : undefined;
  return { ref, style, ready: box !== null };
}
