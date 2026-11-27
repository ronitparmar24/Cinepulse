import { useState, useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { isView, parseNavigation, navigationUrl, sectionOf, type DetailTab, type View } from '@/lib/navigation';
import { viewOrder } from './useNavDirection';

interface ViewTransitionLike {
  ready?: Promise<void>;
  finished?: Promise<void>;
}

/**
 * Entrance animations (cards rising in, fades) that start while a view transition is already
 * cross-fading the page would play twice. Jump those to their end state: the transition is the
 * entrance. Only finite CSS animations under <main> whose first keyframe is fully transparent are
 * touched, so loaders, progress bars and hover effects keep running.
 */
export function settleEntranceAnimations(root: Node | null = typeof document !== 'undefined' ? document.querySelector('main') : null) {
  if (!root || typeof document === 'undefined' || typeof document.getAnimations !== 'function') return;
  for (const animation of document.getAnimations()) {
    if (typeof CSSAnimation === 'undefined' || !(animation instanceof CSSAnimation)) continue;
    const effect = animation.effect as KeyframeEffect | null;
    const target = effect?.target;
    if (!effect || !target || !root.contains(target)) continue;
    if (animation.playState === 'finished' || effect.getComputedTiming().iterations === Infinity) continue;
    const first = effect.getKeyframes()[0];
    if (!first || first.offset !== 0 || String(first.opacity ?? '') !== '0') continue;
    try {
      animation.finish();
    } catch {
      // A zero-length or detached animation cannot be finished; leave it alone.
    }
  }
}

let transitionToken = 0;

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
  // The view being left, read when a navigation starts (to pick the slide direction).
  const viewRef = useRef<View>(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

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
      const from = viewRef.current;
      viewRef.current = next;
      // Cross-fade + short slide between views with the browser's native View Transitions
      // (Chromium, Safari 18+). The slide follows the site's reading order: going further along
      // (Home → Films → Predict…) slides in from the right, going back from the left. The header
      // and bottom bar are excluded (chrome.css) so they stay perfectly still.
      const doc = typeof document !== 'undefined' ? (document as Document & { startViewTransition?: (cb: () => void) => ViewTransitionLike }) : null;
      const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (next !== from && doc?.startViewTransition && !reduced && doc.visibilityState === 'visible') {
        const html = doc.documentElement;
        const token = ++transitionToken;
        const clear = () => {
          delete html.dataset.navDir;
          delete html.dataset.navScope;
        };
        html.dataset.navDir = viewOrder(next) >= viewOrder(from) ? 'forward' : 'back';
        // Within one section the sub-nav stays put and only its pill glides.
        if (sectionOf(next).id === sectionOf(from).id) html.dataset.navScope = 'section';
        else delete html.dataset.navScope;
        try {
          const transition = doc.startViewTransition(() => {
            flushSync(() => apply(true));
            settleEntranceAnimations();
          });
          transition.ready?.then(() => settleEntranceAnimations()).catch(() => {});
          // A newer navigation owns the attributes once it has started.
          const cleanup = () => {
            if (token === transitionToken) clear();
          };
          (transition.finished ?? Promise.resolve()).then(cleanup, cleanup);
        } catch {
          clear();
          apply(false);
        }
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
