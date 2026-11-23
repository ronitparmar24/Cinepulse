'use client';
import { useEffect } from 'react';

/**
 * Site-wide scroll reveal: top-level sections inside <main> fade and rise in as they enter the
 * viewport. Content is never left hidden — under reduced motion, in a hidden tab, or if the
 * observer never reports, everything is shown.
 */
const SELECTOR = 'main > .section, main section.section, main > div > .section, main .space-page > *, main .reveal-on-scroll';

export function useSectionReveal(viewKey: string) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const main = document.querySelector('main');
    if (!main) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') return;

    const seen = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('gx-in');
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.04 },
    );

    const scan = () => {
      const hidden = document.visibilityState === 'hidden';
      main.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        // Already on screen at first sight (e.g. the hero): show immediately, no flash.
        const r = el.getBoundingClientRect();
        if (hidden || r.top < window.innerHeight * 0.92) {
          el.classList.add('gx-reveal', 'gx-in');
          return;
        }
        el.classList.add('gx-reveal');
        observer.observe(el);
      });
    };
    scan();

    // Views load their content asynchronously; pick up sections as they appear.
    let pending = 0;
    const mo = new MutationObserver(() => {
      if (pending) return;
      pending = window.setTimeout(() => {
        pending = 0;
        scan();
      }, 120);
    });
    mo.observe(main, { childList: true, subtree: true });

    const revealAll = () => main.querySelectorAll('.gx-reveal:not(.gx-in)').forEach((el) => el.classList.add('gx-in'));
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') revealAll();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      observer.disconnect();
      mo.disconnect();
      window.clearTimeout(pending);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [viewKey]);
}
