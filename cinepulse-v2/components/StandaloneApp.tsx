'use client';
/**
 * The shared app context for pages that live outside the main app shell (e.g. /u/[username]),
 * so components that need it — the film panel, review likes and comments, reminders — work there
 * too instead of crashing. Signing in happens on the main app.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { AppContext } from './Context';
import { useLibrary } from './hooks/useLibrary';
import type { User } from '@/lib/types';

export function StandaloneApp({ user, onOpenTitle, children }: { user: User | null; onOpenTitle: (id: string) => void; children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const toast = useCallback((text: string) => {
    setMessage(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(''), 3500);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const showAuth = useCallback(() => {
    window.location.href = `/?signin=1&next=${encodeURIComponent(window.location.pathname)}`;
  }, []);
  const needAuth = useCallback(() => {
    if (user) return true;
    toast('Sign in to do that — taking you to sign in…');
    window.setTimeout(showAuth, 900);
    return false;
  }, [user, toast, showAuth]);

  const { library, save, remove, updateLibrary, busyIds, refreshLibrary } = useLibrary({ user, needAuth, toast });

  const [region, setRegionState] = useState('US');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cinepulse_region');
      setRegionState(saved || ((navigator.language || '').toLowerCase().includes('in') ? 'IN' : 'US'));
    } catch { /* storage blocked: keep the default */ }
  }, []);
  const setRegion = useCallback((r: string) => {
    setRegionState(r);
    try { localStorage.setItem('cinepulse_region', r); } catch { /* ignore */ }
  }, []);

  return (
    <AppContext.Provider value={{
      user, config: null, library, openTitle: (id) => onOpenTitle(id), save, remove, updateLibrary,
      refresh: refreshLibrary, toast, needAuth, showAuth, busyIds, region, setRegion,
    }}>
      {children}
      {message && <div className="toast" role="status"><Check size={16} /> {message}</div>}
    </AppContext.Provider>
  );
}
