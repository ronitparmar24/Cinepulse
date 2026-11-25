/**
 * Installable-app helpers: registers the service worker (production only), keeps the browser's
 * deferred install offer, and works out whether to show an install button or the iOS hint.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Listener = () => void;
let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let started = false;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

export const DISMISS_KEY = 'cinepulse_install_dismissed_at';
export const VISITS_KEY = 'cinepulse_visits';
const DISMISS_DAYS = 21;

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone/iPad Safari, where installing is a manual "Add to Home Screen" step. */
export function isIosSafari(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '', touchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0): boolean {
  const iOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1);
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(ua);
  return iOS && /Safari/i.test(ua) && !otherBrowser;
}

/** Whether a dismissal from `dismissedAt` (ms) still applies at `now`. */
export function dismissalActive(dismissedAt: number | null, now = Date.now()): boolean {
  return dismissedAt !== null && Number.isFinite(dismissedAt) && now - dismissedAt < DISMISS_DAYS * 86_400_000;
}

export function startInstallSupport(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep it for our own button instead of the browser's mini bar
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });
  if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
    const register = () => { void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {}); };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }
}

export function subscribeInstall(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type InstallMode = 'prompt' | 'ios' | null;

export function installMode(): InstallMode {
  if (typeof window === 'undefined' || installed || isStandalone()) return null;
  if (deferred) return 'prompt';
  if (isIosSafari()) return 'ios';
  return null;
}

export function wasInstalled(): boolean {
  return installed;
}

/** Shows the browser's install dialog. Resolves true when the person accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  emit();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === 'accepted';
}
