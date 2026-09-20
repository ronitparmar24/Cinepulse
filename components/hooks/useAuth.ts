import { useState, useCallback, useEffect, useRef } from 'react';
import type { User } from '@/lib/types';
import { api } from '../client';

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
      const { user: u } = await api<{ user: User | null }>('/auth/me');
      setUser(u);
      if (onUserChangedRef.current) {
        onUserChangedRef.current(u);
      }
      return u;
    } catch {
      setUser(null);
      if (onUserChangedRef.current) {
        onUserChangedRef.current(null);
      }
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

  // Hydrate authenticated user session on mount
  useEffect(() => {
    let active = true;
    refresh().catch(() => {});
    return () => {
      active = false;
    };
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
        api<{ user: User }>('/auth/session', 'POST', { access_token: accessToken, refresh_token: refreshToken })
          .then(async (res) => {
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
      searchParams.delete('auth_success');
      const newSearch = searchParams.toString() ? `?${searchParams.toString()}` : '';
      window.history.replaceState(null, '', window.location.pathname + newSearch);
      refresh()
        .then((u) => {
          if (u) setWelcomeUser(u);
          if (toastRef.current) toastRef.current('Signed in successfully with Google!');
        })
        .catch(() => {});
    } else if (searchParams.has('auth_error')) {
      const err = searchParams.get('auth_error') || 'Google sign-in failed';
      searchParams.delete('auth_error');
      const newSearch = searchParams.toString() ? `?${searchParams.toString()}` : '';
      window.history.replaceState(null, '', window.location.pathname + newSearch);
      if (toastRef.current) toastRef.current(decodeURIComponent(err).replace(/\+/g, ' '));
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
