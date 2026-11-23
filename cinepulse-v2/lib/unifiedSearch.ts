import { catalog } from './catalog';
import { getPublicReceipts } from './receipts';

export interface UnifiedActionItem {
  id: string;
  label: string;
  description: string;
  category: 'navigation' | 'settings' | 'action';
  actionType: 'navigate' | 'toggle-region' | 'open-title' | 'open-receipt';
  target: string;
  keywords?: string[];
}

export interface UnifiedSearchResult {
  query: string;
  titles: Array<{
    id: string;
    title: string;
    mediaType: 'movie' | 'tv';
    releaseDate: string | null;
    rating: number | null;
    poster: string | null;
    genres: string[];
    overview: string;
    status: string;
  }>;
  receipts: Array<{
    id: string;
    titleId: string;
    titleName: string;
    verdict: 'called' | 'missed';
    predictedProbability: number;
    actualRevenue?: number;
    resolvedAt?: string;
  }>;
  actions: UnifiedActionItem[];
}

const STATIC_ACTIONS: UnifiedActionItem[] = [
  {
    id: 'nav-discover',
    label: 'Discover Catalog',
    description: 'Browse curated trending and upcoming cinema',
    category: 'navigation',
    actionType: 'navigate',
    target: 'discover',
    keywords: ['home', 'catalog', 'browse', 'trending', 'movies', 'series'],
  },
  {
    id: 'nav-predictions',
    label: 'Box Office Prediction Desk',
    description: 'Call theatrical outcomes & test forecast alpha',
    category: 'navigation',
    actionType: 'navigate',
    target: 'predictions',
    keywords: ['predict', 'box office', 'forecast', 'desk', 'call', 'hit', 'flop'],
  },
  {
    id: 'nav-receipts',
    label: 'Public Receipts & Audited Track Record',
    description: 'Permanently frozen historical model & crowd calls',
    category: 'navigation',
    actionType: 'navigate',
    target: 'receipts',
    keywords: ['receipts', 'audit', 'track record', 'accuracy', 'verdict', 'proof'],
  },
  {
    id: 'nav-contrarian',
    label: 'Contrarian Desk',
    description: 'Model vs Crowd high-conviction divergence clash',
    category: 'navigation',
    actionType: 'navigate',
    target: 'contrarian',
    keywords: ['contrarian', 'clash', 'divergence', 'crowd', 'underdog', 'spread'],
  },
  {
    id: 'nav-circles',
    label: 'Curated Circles',
    description: 'Collaborative watch circles & weekly cinema picks',
    category: 'navigation',
    actionType: 'navigate',
    target: 'circles',
    keywords: ['circles', 'friends', 'social', 'group', 'watch party'],
  },
  {
    id: 'nav-movie-night',
    label: 'Movie Night Planner',
    description: 'Real-time room voting & collective decision engine',
    category: 'navigation',
    actionType: 'navigate',
    target: 'movie-night',
    keywords: ['movie night', 'room', 'vote', 'party', 'session'],
  },
  {
    id: 'nav-leaderboard',
    label: 'Forecaster Leaderboard',
    description: 'Global forecaster rankings by Brier score and alpha',
    category: 'navigation',
    actionType: 'navigate',
    target: 'leaderboard',
    keywords: ['leaderboard', 'rank', 'brier', 'points', 'top forecasters'],
  },
  {
    id: 'nav-accuracy',
    label: 'Engine Accuracy Backtest',
    description: 'Empirical model accuracy metrics & calibration curves',
    category: 'navigation',
    actionType: 'navigate',
    target: 'accuracy',
    keywords: ['accuracy', 'backtest', 'calibration', 'metrics', 'reliability'],
  },
  {
    id: 'action-toggle-region',
    label: 'Switch Market Region (IN / US)',
    description: 'Toggle theatrical market between India and United States',
    category: 'settings',
    actionType: 'toggle-region',
    target: 'toggle',
    keywords: ['region', 'india', 'us', 'usa', 'switch', 'country', 'market', 'in'],
  },
];

// In-memory search cache (15 seconds TTL)
const searchCache = new Map<string, { result: UnifiedSearchResult; expires: number }>();

export async function searchUnified(query: string, limit = 8): Promise<UnifiedSearchResult> {
  const trimmed = query.trim();
  const cacheKey = `search:${trimmed.toLowerCase()}:${limit}`;
  const now = Date.now();

  const cached = searchCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.result;
  }

  // 1. Filter matching actions
  const normQuery = trimmed.toLowerCase();
  const matchedActions = normQuery
    ? STATIC_ACTIONS.filter(act =>
        act.label.toLowerCase().includes(normQuery) ||
        act.description.toLowerCase().includes(normQuery) ||
        act.keywords?.some(k => k.toLowerCase().includes(normQuery))
      )
    : STATIC_ACTIONS;

  // 2. Filter matching receipts
  let matchedReceipts: UnifiedSearchResult['receipts'] = [];
  try {
    const receiptsData = (await getPublicReceipts());
    const allReceipts = [...(receiptsData.receipts || []), ...(receiptsData.biggestMisses || [])];
    if (normQuery) {
      matchedReceipts = allReceipts
        .filter(r => r.titleName.toLowerCase().includes(normQuery))
        .slice(0, 4)
        .map(r => ({
          id: r.id,
          titleId: r.titleId,
          titleName: r.titleName,
          verdict: (r as any).verdict || (r as any).actualHit !== undefined ? ((r as any).actualHit ? 'called' : 'missed') : 'called',
          predictedProbability: r.predictedProbability,
          actualRevenue: r.actualRevenue,
          resolvedAt: r.resolvedAt,
        }));
    }
  } catch {
    // Non-fatal if receipts are empty
    matchedReceipts = [];
  }

  // 3. Search titles via catalog
  let matchedTitles: UnifiedSearchResult['titles'] = [];
  try {
    const catalogRes = await catalog({
      media: 'all',
      collection: 'trending',
      search: trimmed || undefined,
      page: 1,
    });

    matchedTitles = (catalogRes.items || []).slice(0, limit).map(t => ({
      id: t.id,
      title: t.title,
      mediaType: t.mediaType,
      releaseDate: t.releaseDate,
      rating: t.voteAverage,
      poster: t.poster,
      genres: t.genres || [],
      overview: t.overview || '',
      status: t.status,
    }));
  } catch {
    matchedTitles = [];
  }

  const result: UnifiedSearchResult = {
    query: trimmed,
    titles: matchedTitles,
    receipts: matchedReceipts,
    actions: matchedActions,
  };

  searchCache.set(cacheKey, { result, expires: now + 15_000 });

  // Clean stale cache entries if too large
  if (searchCache.size > 200) {
    for (const [k, v] of searchCache.entries()) {
      if (v.expires <= now) searchCache.delete(k);
    }
  }

  return result;
}
