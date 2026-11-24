import { useState, useCallback, useEffect, useRef } from 'react';
import type { User } from '@/lib/types';
import { api } from '../client';
import { saveLastAccount } from '@/lib/lastAccount';

export interface UseAuthOptions {
  toast?: (text: string) => void;
  onUserChanged?: (user: User | null) => void;
}

export interface UseAuthReturn {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  auth: boolean;
  setAuth: React.Dispatch<React.SetStateAction<boolean>>;
  profile: boolean;
  setProfile: React.Dispatch<React.SetStateAction<boolean>>;
  welcomeUser: User | null;
  setWelcomeUser: React.Dispatch<React.SetStateAction<User | null>>;
  refresh: () => Promise<User | null>;
  needAuth: () => boolean;
  showAuth: () => void;
}

export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const { toast, onUserChanged } = options;
  const [user, setUser] = useState<User | null>(null);
  const [auth, setAuth] = useState(false);
  const [profile, setProfile] = useState(false);
  const [welcomeUser, setWelcomeUser] = useState<User | null>(null);

  const onUserChangedRef = useRef(onUserChanged);
  onUserChangedRef.current = onUserChanged;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const refresh = useCallback(async (): Promise<User | null> => {
    try {
      const res = await api<{ user: User | null }>('/auth/me');
      const u = res.user;
      if (u) {
        setUser(u);
        if (typeof window !== 'undefined') {
          try { localStorage.setItem('cinepulse_user', JSON.stringify(u)); } catch {}
        }
        if (onUserChangedRef.current) {
          onUserChangedRef.current(u);
        }
        return u;
      } else {
        setUser(null);
        if (typeof window !== 'undefined') {
          try { localStorage.removeItem('cinepulse_user'); } catch {}
        }
        if (onUserChangedRef.current) {
          onUserChangedRef.current(null);
        }
        return null;
      }
    } catch {
      return null;
    }
  }, []);

  const needAuth = useCallback((): boolean => {
    if (user) return true;
    setAuth(true);
    return false;
  }, [user]);

  const showAuth = useCallback(() => {
    setAuth(true);
  }, []);

  // The server rejected a request as signed-out while this page still shows a user: confirm
  // with /auth/me and, if the session is really gone, drop the stale user and offer sign-in.
  const userRef = useRef<User | null>(null);
  userRef.current = user;
  useEffect(() => {
    let lastCheck = 0;
    const onUnauthorized = () => {
      if (!userRef.current || Date.now() - lastCheck < 15_000) return;
      lastCheck = Date.now();
      refresh()
        .then((u) => {
          if (u) return;
          if (toastRef.current) toastRef.current('Your session ended. Please sign in again.');
          setAuth(true);
        })
        .catch(() => {});
    };
    window.addEventListener('cinepulse:unauthorized', onUnauthorized);
    return () => window.removeEventListener('cinepulse:unauthorized', onUnauthorized);
  }, [refresh]);

  // Hydrate authenticated user session on mount
  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('cinepulse_user') : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') setUser(parsed);
      }
    } catch {}
    refresh().catch(() => {});
  }, [refresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.replace(/^#/, ''));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        api<{ user: User; token?: string }>('/auth/session', 'POST', { access_token: accessToken, refresh_token: refreshToken })
          .then(async (res) => {
            if (res.user && typeof window !== 'undefined') {
              try { localStorage.setItem('cinepulse_user', JSON.stringify(res.user)); } catch {}
            }
            await refresh();
            setWelcomeUser(res.user);
            if (toastRef.current) toastRef.current(`Welcome, ${res.user.name || 'film lover'}!`);
          })
          .catch((err) => {
            if (toastRef.current) toastRef.current((err as Error).message || 'Failed to complete Google sign-in.');
          });
      }
    } else if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.replace(/^#/, ''));
      const errorDesc = params.get('error_description') || params.get('error') || 'Authentication failed';
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      if (toastRef.current) toastRef.current(decodeURIComponent(errorDesc).replace(/\+/g, ' '));
    }

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has('auth_success')) {
      const kind = searchParams.get('auth_success');
      searchParams.delete('auth_success');
      const newSearch = searchParams.toString() ? `?${searchParams.toString()}` : '';
      window.history.replaceState(window.history.state, '', window.location.pathname + newSearch);
      refresh()
        .then((u) => {
          if (!u) {
            if (toastRef.current) toastRef.current('Google sign-in did not complete. Please try again.');
            return;
          }
          if (kind === 'google' || kind === 'google_new') saveLastAccount(u, 'google');
          // The welcome tour is for brand-new accounts; returning members just get a greeting.
          if (kind === 'google_new') setWelcomeUser(u);
          else if (toastRef.current) toastRef.current(`Welcome back, ${(u.displayName || u.name || 'film lover').split(' ')[0]}.`);
        })
        .catch(() => {});
    } else if (searchParams.has('auth_error')) {
      const err = searchParams.get('auth_error') || 'Google sign-in failed';
      searchParams.delete('auth_error');
      const newSearch = searchParams.toString() ? `?${searchParams.toString()}` : '';
      window.history.replaceState(window.history.state, '', window.location.pathname + newSearch);
      if (toastRef.current) toastRef.current(err.slice(0, 160));
    }
  }, [refresh]);

  return {
    user,
    setUser,
    auth,
    setAuth,
    profile,
    setProfile,
    welcomeUser,
    setWelcomeUser,
    refresh,
    needAuth,
    showAuth,
  };
}
