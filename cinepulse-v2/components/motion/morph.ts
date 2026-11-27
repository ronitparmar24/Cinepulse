/**
 * Opening and closing motion for pop-ups.
 *
 * When a pop-up opens right after you tapped an image (a poster, a cast photo), it grows out of that
 * exact spot and, on close, shrinks back into it if the image is still on screen; otherwise it scales
 * in and out. Phones slide a bottom sheet up and down. Skipped for people who turn animations off.
 *
 * Only transform and opacity are animated (both run on the GPU), so the motion stays smooth even
 * over the pop-ups' heavy blur layers. The dialog's CSS entrance animation is switched off for good
 * (data-motion="js") the moment JavaScript takes over, so no second animation can start afterwards.
 */

export interface MorphOrigin { el: Element; rect: DOMRect; t: number; usedAt?: number }

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

/**
 * The image tapped just before this pop-up opened (within ~5s: the pop-up's code may still be
 * loading). Usable once — but the same pop-up asking again within a moment (React's development
 * double-mount) gets it again.
 */
export function takeMorphOrigin(maxAgeMs = 5000): MorphOrigin | null {
  const o = last;
  if (!o) return null;
  const nowMs = performance.now();
  if (nowMs - o.t > maxAgeMs) { last = null; return null; }
  if (o.usedAt === undefined) { o.usedAt = nowMs; return o; }
  if (nowMs - o.usedAt < 400) return o;
  last = null;
  return null;
}

export const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const isPhone = () => typeof window !== 'undefined' && window.innerWidth < 700;
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const EASE_IN = 'cubic-bezier(0.55, 0, 0.75, 0.2)';

/** translate+scale that maps the dialog's box onto `to` (top-left origin). */
function mapOnto(box: DOMRect, to: DOMRect): string {
  const sx = Math.max(0.04, to.width / box.width);
  const sy = Math.max(0.04, to.height / box.height);
  return `translate(${to.left - box.left}px, ${to.top - box.top}px) scale(${sx}, ${sy})`;
}

function onScreen(r: DOMRect | null): r is DOMRect {
  return Boolean(r && r.width > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth);
}

/** Plays the opening motion for a dialog that was just shown. Returns the origin it grew from (if any). */
export function animateOpen(dialog: HTMLElement, origin: MorphOrigin | null): MorphOrigin | null {
  if (reducedMotion()) return origin;
  dialog.dataset.motion = 'js'; // CSS entrance off for good: nothing can restart after we finish
  const content = dialog.querySelector<HTMLElement>('.modal-scroller');
  if (isPhone()) {
    dialog.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 380, easing: EASE_OUT });
    return origin;
  }
  const box = dialog.getBoundingClientRect();
  if (origin && box.width && box.height) {
    // While the pop-up's content loads, it shows the poster that was tapped (see globals.css).
    const src = origin.el instanceof HTMLImageElement ? (origin.el.currentSrc || origin.el.src) : '';
    if (src && /^(https:|\/)/.test(src)) {
      dialog.style.setProperty('--morph-img', `url("${src.replace(/["\\\n]/g, '')}")`);
      dialog.dataset.morphImg = '1';
    }
    dialog.animate(
      [
        { transformOrigin: '0 0', transform: mapOnto(box, origin.rect), opacity: 0.6, borderRadius: '14px' },
        { transformOrigin: '0 0', opacity: 1, offset: 0.35 },
        { transformOrigin: '0 0', transform: 'none', opacity: 1, borderRadius: '22px' },
      ],
      { duration: 480, easing: EASE_OUT },
    );
    // The content stays still and fades in once the box is mostly open (no squashed text).
    content?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: 480, easing: 'ease-out' });
    return origin;
  }
  dialog.animate(
    [{ transform: 'translateY(14px) scale(0.965)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: 300, easing: EASE_OUT },
  );
  return null;
}

/** Plays the closing motion, then resolves (call onClose after it). */
export function animateClose(dialog: HTMLElement, origin: MorphOrigin | null): Promise<void> {
  if (reducedMotion()) return Promise.resolve();
  dialog.dataset.motion = 'js';
  const done = (a: Animation) => a.finished.then(() => undefined).catch(() => undefined);
  if (isPhone()) {
    return done(dialog.animate([{ transform: 'none' }, { transform: 'translateY(100%)' }], { duration: 220, easing: EASE_IN, fill: 'forwards' }));
  }
  const box = dialog.getBoundingClientRect();
  const back = origin?.el.isConnected ? origin.el.getBoundingClientRect() : null;
  const content = dialog.querySelector<HTMLElement>('.modal-scroller');
  if (onScreen(back) && box.width && box.height) {
    content?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease-in', fill: 'forwards' });
    return done(dialog.animate(
      [
        { transformOrigin: '0 0', transform: 'none', opacity: 1 },
        { transformOrigin: '0 0', opacity: 1, offset: 0.7 },
        { transformOrigin: '0 0', transform: mapOnto(box, back), opacity: 0 },
      ],
      { duration: 300, easing: EASE_IN, fill: 'forwards' },
    ));
  }
  return done(dialog.animate(
    [{ transform: 'none', opacity: 1 }, { transform: 'translateY(10px) scale(0.965)', opacity: 0 }],
    { duration: 190, easing: EASE_IN, fill: 'forwards' },
  ));
}
