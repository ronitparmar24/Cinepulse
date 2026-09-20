import { useState, useCallback } from 'react';
import { parseNavigation, type DetailTab, type View } from '@/lib/navigation';
import { trackEvent } from '../client';

export interface SelectedTitle {
  id: string;
  tab: DetailTab;
}

export interface UseTitleModalOptions {
  view: View;
  updateUrl: (
    state: { view: View; titleId: string | null; tab: DetailTab },
    mode?: 'push' | 'replace',
    historyState?: Record<string, unknown>
  ) => void;
}

export interface UseTitleModalReturn {
  selected: SelectedTitle | null;
  setSelected: React.Dispatch<React.SetStateAction<SelectedTitle | null>>;
  openTitle: (id: string, tab?: DetailTab) => void;
  changeTitleTab: (tab: DetailTab) => void;
  closeTitle: () => void;
}

export function useTitleModal(options: UseTitleModalOptions): UseTitleModalReturn {
  const { view, updateUrl } = options;
  const [selected, setSelected] = useState<SelectedTitle | null>(() => {
    if (typeof window !== 'undefined') {
      const state = parseNavigation(window.location.search);
      return state.titleId ? { id: state.titleId, tab: state.tab } : null;
    }
    return null;
  });

  const openTitle = useCallback(
    (id: string, tab: DetailTab = 'overview') => {
      trackEvent('movie_opened', { titleId: id, tab });
      const next = { view, titleId: id, tab };
      setSelected({ id, tab });
      if (selected) {
        const openedByApp = typeof window !== 'undefined' && window.history.state?.cinepulseTitle === true;
        updateUrl(next, 'replace', { cinepulseTitle: openedByApp });
      } else {
        updateUrl(next, 'push', { cinepulseTitle: true });
      }
    },
    [view, selected, updateUrl]
  );

  const changeTitleTab = useCallback(
    (tab: DetailTab) => {
      if (!selected) return;
      setSelected({ ...selected, tab });
      const openedByApp = typeof window !== 'undefined' && window.history.state?.cinepulseTitle === true;
      updateUrl({ view, titleId: selected.id, tab }, 'replace', { cinepulseTitle: openedByApp });
    },
    [view, selected, updateUrl]
  );

  const closeTitle = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.state?.cinepulseTitle) {
      window.history.back();
      return;
    }
    setSelected(null);
    updateUrl({ view, titleId: null, tab: 'overview' }, 'replace');
  }, [view, updateUrl]);

  return { selected, setSelected, openTitle, changeTitleTab, closeTitle };
}
