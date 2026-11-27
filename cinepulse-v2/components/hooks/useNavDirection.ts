'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { NAV_SECTIONS, type View } from '@/lib/navigation';

/** Every view in reading order (Home → Films → Predict → Community → You), used to pick a slide direction. */
const VIEW_ORDER: View[] = NAV_SECTIONS.flatMap((s) => s.views);

/** Position of a view in the site's reading order (unknown views sort first). */
export function viewOrder(view: View): number {
  return Math.max(0, VIEW_ORDER.indexOf(view));
}

/**
 * Which way the active item of a nav just moved: "fwd" when the new index is after the previous
 * one, "back" otherwise. Uses React's "adjust state during render" pattern, so the direction is
 * already correct on the very render that moves the indicator (an effect would be a frame late).
 */
export function useNavDirection(index: number): 'fwd' | 'back' {
  const [prev, setPrev] = useState(index);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  if (index !== prev) {
    setPrev(index);
    setDir(index > prev ? 'fwd' : 'back');
  }
  return dir;
}

/**
 * Keeps the active item of a horizontally scrollable nav in view (phones, narrow windows) by
 * scrolling only the nav itself — never the page.
 */
export function useKeepActiveInView(navRef: RefObject<HTMLElement | null>, dep: unknown, selector = 'button.active') {
  const first = useRef(true);
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>(selector);
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth + 1) return;
    const wasFirst = first.current;
    first.current = false;
    // Already fully visible: leave the bar where the person put it.
    const start = active.offsetLeft;
    const end = start + active.offsetWidth;
    if (start >= nav.scrollLeft && end <= nav.scrollLeft + nav.clientWidth) return;
    const left = start - (nav.clientWidth - active.offsetWidth) / 2;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    nav.scrollTo({ left: Math.max(0, left), behavior: wasFirst || reduced ? 'auto' : 'smooth' });
  }, [navRef, dep, selector]);
}

/**
 * False until two frames after `ready` first holds for `key`. Sliding indicators only enable
 * their glide once settled, so a pill that has just been measured (first paint, or a freshly
 * mounted sub-nav) appears in place instead of growing in from the corner.
 */
export function useSettled(key: unknown, ready: boolean): boolean {
  const [settledKey, setSettledKey] = useState<unknown>(undefined);
  useEffect(() => {
    if (!ready) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setSettledKey(key));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [key, ready]);
  return ready && settledKey === key;
}
