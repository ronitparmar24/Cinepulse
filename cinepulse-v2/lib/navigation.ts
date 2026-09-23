export type View = 'discover' | 'predictions' | 'calendar' | 'community' | 'feed' | 'leaderboard' | 'accuracy' | 'library' | 'contrarian' | 'movie-night' | 'circles' | 'explore';
export type DetailTab = 'overview' | 'pulse' | 'reviews';

export interface NavigationState {
  view: View;
  titleId: string | null;
  tab: DetailTab;
}

const views = new Set<View>(['discover', 'predictions', 'calendar', 'community', 'feed', 'leaderboard', 'accuracy', 'library', 'contrarian', 'movie-night', 'circles']);
const tabs = new Set<DetailTab>(['overview', 'pulse', 'reviews']);
// Catalog IDs are deliberately conservative. Invalid values are still safe to
// ignore/render as an unavailable link rather than becoming an API path.
const safeTitleId = /^[A-Za-z0-9_-]{1,120}$/;

export function parseNavigation(search: string): NavigationState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const candidateView = params.get('view') as View | null;
  const candidateTitle = params.get('title');
  const candidateTab = params.get('tab') as DetailTab | null;
  return {
    view: candidateView && views.has(candidateView) ? candidateView : 'discover',
    titleId: candidateTitle && safeTitleId.test(candidateTitle) ? candidateTitle : null,
    tab: candidateTab && tabs.has(candidateTab) ? candidateTab : 'overview',
  };
}

export function navigationSearch(state: Pick<NavigationState, 'view' | 'titleId' | 'tab'>): string {
  const params = new URLSearchParams();
  if (state.view !== 'discover') params.set('view', state.view);
  if (state.titleId) {
    params.set('title', state.titleId);
    if (state.tab !== 'overview') params.set('tab', state.tab);
  }
  const value = params.toString();
  return value ? `?${value}` : '';
}

export function navigationUrl(locationLike: Pick<Location, 'pathname' | 'hash'>, state: NavigationState): string {
  return `${locationLike.pathname}${navigationSearch(state)}${locationLike.hash || ''}`;
}

export function isView(value: string): value is View { return views.has(value as View); }
export function isDetailTab(value: string): value is DetailTab { return tabs.has(value as DetailTab); }
