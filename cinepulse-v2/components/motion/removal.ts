'use client';
/**
 * Animated card removal: the card shrinks and fades out (~220 ms, `.pl-leaving` in polish.css),
 * then it is removed and its neighbours glide into the gap (FLIP) instead of jumping.
 * With prefers-reduced-motion the card is removed at once and nothing animates.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

export const REMOVE_MS = 220;
const REFLOW_MS = 320;
const EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)';

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Runs `commit` (the state change that takes `el` out of the DOM) and slides the elements that
 * shared its parent from where they were to where they end up.
 */
export function removeWithReflow(el: HTMLElement | null, commit: () => void) {
  const parent = el?.parentElement;
  if (!el || !parent || reducedMotion()) { commit(); return; }
  const before = new Map<Element, DOMRect>();
  for (const node of Array.from(parent.children)) if (node !== el) before.set(node, node.getBoundingClientRect());
  flushSync(commit);
  before.forEach((rect, node) => {
    if (!node.isConnected || typeof (node as HTMLElement).animate !== 'function') return;
    const now = node.getBoundingClientRect();
    const dx = rect.left - now.left;
    const dy = rect.top - now.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    (node as HTMLElement).animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
      { duration: REFLOW_MS, easing: EASE },
    );
  });
}

/**
 * For a card that removes itself. Attach `ref` and `className` to the card's root element,
 * call `remove()` to animate it out (then render nothing while `gone`), `restore()` to undo.
 * `onRemoved` runs once the card has left (use it when a parent owns the list instead).
 */
export function useCardRemoval<T extends HTMLElement = HTMLDivElement>(onRemoved?: () => void) {
  const ref = useRef<T>(null);
  const [phase, setPhase] = useState<'shown' | 'leaving' | 'gone'>('shown');
  const timer = useRef<number | undefined>(undefined);
  const removedCb = useRef(onRemoved);
  useEffect(() => { removedCb.current = onRemoved; });

  const finish = useCallback(() => {
    removeWithReflow(ref.current, () => {
      if (removedCb.current) removedCb.current();
      else setPhase('gone');
    });
  }, []);

  const remove = useCallback(() => {
    window.clearTimeout(timer.current);
    if (reducedMotion()) { finish(); return; }
    setPhase('leaving');
    timer.current = window.setTimeout(finish, REMOVE_MS);
  }, [finish]);

  const restore = useCallback(() => {
    window.clearTimeout(timer.current);
    setPhase('shown');
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { ref, phase, remove, restore, className: phase === 'leaving' ? 'pl-leaving' : '' };
}
