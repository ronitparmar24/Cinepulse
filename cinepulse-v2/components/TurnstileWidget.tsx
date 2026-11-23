'use client';
import { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile bot check for the sign-in / sign-up form.
 *
 * Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set, which matches
 * the server: it only requires a token when both the site key and
 * TURNSTILE_SECRET_KEY are configured (see lib/auth/turnstile.ts).
 */

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * The site key, but only when the bot check is active for this build: production, or
 * development with NEXT_PUBLIC_TURNSTILE_IN_DEV=1. Site keys are bound to their allowed
 * hostnames, so on 127.0.0.1 the widget can never issue a token and would lock every
 * local sign-in. Mirrors `turnstileRequired()` in lib/auth/turnstile.ts.
 */
export const TURNSTILE_SITE_KEY =
  process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_TURNSTILE_IN_DEV === '1'
    ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''
    : '';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SCRIPT_SRC;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load the bot check. Check your connection and try again.'));
    };
    document.head.appendChild(el);
  });
  return scriptPromise;
}

export function TurnstileWidget({
  action,
  onToken,
  resetKey = 0,
}: {
  action: string;
  onToken: (token: string) => void;
  /** Change this number to get a fresh token (tokens are single-use). */
  resetKey?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const tokenCallback = useRef(onToken);
  tokenCallback.current = onToken;

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !box.current) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          theme: 'dark',
          callback: (token: string) => tokenCallback.current(token),
          'expired-callback': () => tokenCallback.current(''),
          'error-callback': () => tokenCallback.current(''),
        });
      })
      .catch(() => tokenCallback.current(''));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [action]);

  useEffect(() => {
    if (resetKey && widgetId.current && window.turnstile) {
      tokenCallback.current('');
      window.turnstile.reset(widgetId.current);
    }
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} className="turnstile-box" />;
}
