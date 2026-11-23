import { useState, useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { isView, parseNavigation, navigationUrl, type DetailTab, type View } from '@/lib/navigation';

export interface UseNavigationOptions {
  onSyncTitle?: (titleId: string | null, tab: DetailTab) => void;
  onNavigateTitle?: () => void;
  initialView?: View;
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

  // Always start with the SSR-safe default. The syncUrl useEffect below runs
  // on mount and will update `view` to match the URL on the client side,
  // preventing a server/client hydration mismatch.
  const [view, setView] = useState<View>(options.initialView || 'discover');
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

  // Ctrl/Cmd+K itself is handled in Cinepulse.tsx (it opens the command palette); a second
  // listener here used to also focus the header input on every press.
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setShortcut(/Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘ K' : 'Ctrl K');
    }
  }, []);

  const navigate = useCallback(
    (next: View) => {
      const apply = (instantScroll: boolean) => {
        setView(next);
        if (onNavigateTitleRef.current) {
          onNavigateTitleRef.current();
        }
        setSearch('');
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: instantScroll ? 'auto' : 'smooth' });
        }
      };
      updateUrl({ view: next, titleId: null, tab: 'overview' }, 'push', { cinepulseNavigation: true });
      // Cross-fade between views with the browser's native View Transitions (Chromium, Safari 18+);
      // the header and bottom bar are excluded so they stay perfectly still.
      const doc = typeof document !== 'undefined' ? (document as Document & { startViewTransition?: (cb: () => void) => unknown }) : null;
      const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (doc?.startViewTransition && !reduced && doc.visibilityState === 'visible') {
        doc.startViewTransition(() => flushSync(() => apply(true)));
      } else {
        apply(false);
      }
    },
    [updateUrl]
  );

  // In-app links outside this hook (e.g. Discover quick actions) dispatch
  // `cinepulse:navigate` with { view } instead of reloading the whole page.
  useEffect(() => {
    const onNavigateEvent = (event: Event) => {
      const next = (event as CustomEvent<{ view?: string }>).detail?.view;
      if (next && isView(next)) navigate(next);
    };
    window.addEventListener('cinepulse:navigate', onNavigateEvent);
    return () => window.removeEventListener('cinepulse:navigate', onNavigateEvent);
  }, [navigate]);

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
