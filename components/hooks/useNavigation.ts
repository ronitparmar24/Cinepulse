import { useState, useCallback, useEffect, useRef } from 'react';
import { parseNavigation, navigationUrl, type DetailTab, type View } from '@/lib/navigation';

export interface UseNavigationOptions {
  onSyncTitle?: (titleId: string | null, tab: DetailTab) => void;
  onNavigateTitle?: () => void;
}

export interface UseNavigationReturn {
  view: View;
  setView: React.Dispatch<React.SetStateAction<View>>;
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  shortcut: string;
  searchRef: React.RefObject<HTMLInputElement | null>;
  navigate: (next: View) => void;
  updateUrl: (
    state: { view: View; titleId: string | null; tab: DetailTab },
    mode?: 'push' | 'replace',
    historyState?: Record<string, unknown>
  ) => void;
  syncUrl: () => void;
}

export function useNavigation(options: UseNavigationOptions = {}): UseNavigationReturn {
  const { onSyncTitle, onNavigateTitle } = options;
  const onSyncTitleRef = useRef(onSyncTitle);
  const onNavigateTitleRef = useRef(onNavigateTitle);

  useEffect(() => {
    onSyncTitleRef.current = onSyncTitle;
    onNavigateTitleRef.current = onNavigateTitle;
  });

  const [view, setView] = useState<View>(() => {
    if (typeof window !== 'undefined') {
      return parseNavigation(window.location.search).view;
    }
    return 'discover';
  });
  const [search, setSearch] = useState('');
  const [shortcut, setShortcut] = useState('Ctrl K');
  const searchRef = useRef<HTMLInputElement | null>(null);

  const updateUrl = useCallback(
    (
      state: { view: View; titleId: string | null; tab: DetailTab },
      mode: 'push' | 'replace' = 'replace',
      historyState?: Record<string, unknown>
    ) => {
      if (typeof window === 'undefined') return;
      const url = navigationUrl(window.location, state);
      if (mode === 'push') {
        window.history.pushState(historyState || null, '', url);
      } else {
        window.history.replaceState({ ...window.history.state, ...historyState }, '', url);
      }
    },
    []
  );

  const syncUrl = useCallback(() => {
    if (typeof window === 'undefined') return;
    const state = parseNavigation(window.location.search);
    setView((prev) => (prev === state.view ? prev : state.view));
    if (onSyncTitleRef.current) {
      onSyncTitleRef.current(state.titleId, state.tab);
    }
  }, []);

  useEffect(() => {
    syncUrl();
    const onPop = () => syncUrl();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [syncUrl]);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setShortcut(/Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘ K' : 'Ctrl K');
    }
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const navigate = useCallback(
    (next: View) => {
      setView(next);
      if (onNavigateTitleRef.current) {
        onNavigateTitleRef.current();
      }
      setSearch('');
      updateUrl({ view: next, titleId: null, tab: 'overview' }, 'push', { cinepulseNavigation: true });
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [updateUrl]
  );

  return {
    view,
    setView,
    search,
    setSearch,
    shortcut,
    searchRef,
    navigate,
    updateUrl,
    syncUrl,
  };
}
