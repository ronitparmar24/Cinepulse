/**
 * Opening and closing motion for pop-ups.
 *
 * When a pop-up opens right after you tapped an image (a poster, a cast photo), it expands out of
 * that exact spot — a "container transform" — and on close collapses back into it, if the image is
 * still on screen. Otherwise it scales in and out. Phones keep their bottom-sheet slide. Everything
 * is skipped for people who turn animations off.
 */

export interface MorphOrigin { el: Element; rect: DOMRect; t: number }

let last: MorphOrigin | null = null;
let installed = false;

/** Remembers the image under the last tap/click (poster cards, cast photos…). Call once on the client. */
export function installMorphTracker(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('pointerdown', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    let img: Element | null = target.closest('img');
    if (!img) img = target.closest('button, a, [role="button"], [role="link"]')?.querySelector('img') ?? null;
    if (!img) { last = null; return; }
    const rect = img.getBoundingClientRect();
    last = rect.width >= 40 && rect.height >= 40 ? { el: img, rect, t: performance.now() } : null;
  }, { capture: true, passive: true });
}

/** The image tapped just before this pop-up opened (within ~1.5s), consumed once. */
export function takeMorphOrigin(maxAgeMs = 5000): MorphOrigin | null {
  const o = last;
  last = null;
  return o && performance.now() - o.t <= maxAgeMs ? o : null;
}

export const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const isPhone = () => typeof window !== 'undefined' && window.innerWidth < 700;
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';

function insetFor(box: DOMRect, from: DOMRect, radius = 14): string {
  const top = Math.max(0, from.top - box.top);
  const left = Math.max(0, from.left - box.left);
  const right = Math.max(0, box.right - from.right);
  const bottom = Math.max(0, box.bottom - from.bottom);
  return `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)`;
}

/** Plays the opening motion for a dialog that was just shown. Returns the origin it grew from (if any). */
export function animateOpen(dialog: HTMLElement, origin: MorphOrigin | null): MorphOrigin | null {
  if (reducedMotion() || isPhone()) return null; // phones: the CSS bottom-sheet slide
  if (!origin) return null; // no tapped image: the CSS scale-in
  const box = dialog.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  dialog.classList.add('is-morph');
  dialog.animate(
    [{ clipPath: insetFor(box, origin.rect), opacity: 0.85 }, { clipPath: 'inset(0px 0px 0px 0px round 22px)', opacity: 1 }],
    { duration: 520, easing: EASE_OUT },
  ).finished.finally(() => dialog.classList.remove('is-morph')).catch(() => {});
  return origin;
}

/** Plays the closing motion, then resolves (call onClose after it). */
export function animateClose(dialog: HTMLElement, origin: MorphOrigin | null): Promise<void> {
  if (reducedMotion()) return Promise.resolve();
  const box = dialog.getBoundingClientRect();
  if (isPhone()) {
    return dialog.animate([{ transform: 'none' }, { transform: `translateY(${box.height}px)` }], { duration: 200, easing: EASE_IN, fill: 'forwards' })
      .finished.then(() => undefined).catch(() => undefined);
  }
  const back = origin?.el.isConnected ? origin.el.getBoundingClientRect() : null;
  const visible = back && back.width > 0 && back.bottom > 0 && back.top < window.innerHeight && back.right > 0 && back.left < window.innerWidth;
  const frames = visible
    ? [{ clipPath: 'inset(0px 0px 0px 0px round 22px)', opacity: 1 }, { clipPath: insetFor(box, back!), opacity: 0.6 }]
    : [{ transform: 'none', opacity: 1 }, { transform: 'scale(0.96) translateY(8px)', opacity: 0 }];
  return dialog.animate(frames, { duration: visible ? 260 : 180, easing: EASE_IN, fill: 'forwards' })
    .finished.then(() => undefined).catch(() => undefined);
}
