'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, PlusSquare, Share, X } from 'lucide-react';
import {
  DISMISS_KEY,
  VISITS_KEY,
  dismissalActive,
  installMode,
  promptInstall,
  startInstallSupport,
  subscribeInstall,
  wasInstalled,
  type InstallMode,
} from '@/lib/installPrompt';

export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribeInstall, installMode, () => null);
}

/**
 * Offers to install CinePulse once someone is clearly using it: from their second visit, or after
 * 40 seconds on the first. Dismissing hides it for three weeks. Never shown inside the installed app.
 */
export function InstallPrompt({ toast }: { toast?: (text: string) => void }) {
  const mode = useInstallMode();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    startInstallSupport();
    let dismissedAt: number | null = null;
    let visits = 0;
    try {
      dismissedAt = Number(localStorage.getItem(DISMISS_KEY)) || null;
      visits = (Number(localStorage.getItem(VISITS_KEY)) || 0) + 1;
      localStorage.setItem(VISITS_KEY, String(visits));
    } catch {}
    if (dismissalActive(dismissedAt)) return;
    const timer = window.setTimeout(() => setReady(true), visits >= 2 ? 6000 : 40000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeInstall(() => {
      if (wasInstalled()) {
        setOpen(false);
        toast?.('CinePulse is installed. Open it from your home screen.');
      }
    });
    return () => { unsubscribe(); };
  }, [toast]);

  useEffect(() => {
    setOpen(ready && mode !== null);
  }, [ready, mode]);

  if (!open || !mode) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setOpen(false);
  };
  const install = async () => {
    const accepted = await promptInstall();
    if (!accepted) dismiss();
  };

  return (
    <aside className="install-card" role="dialog" aria-label="Install CinePulse">
      <img src="/icons/icon-192.png" alt="" width={44} height={44} />
      <div className="install-card-text">
        <b>Get the CinePulse app</b>
        {mode === 'ios' ? (
          <small>
            Tap <Share size={13} aria-label="Share" /> then <span className="install-ios-step"><PlusSquare size={13} aria-hidden="true" /> Add to Home Screen</span>
          </small>
        ) : (
          <small>Full screen, one tap from your home screen, no app store.</small>
        )}
      </div>
      {mode === 'prompt' && (
        <button type="button" className="install-card-btn" onClick={() => void install()}>
          <Download size={15} /> Install
        </button>
      )}
      <button type="button" className="install-card-close" onClick={dismiss} aria-label="Not now"><X size={16} /></button>
    </aside>
  );
}
