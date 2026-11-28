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

// Receipt names for search, refreshed at most every 5 minutes (the full list is a slow query in production).
let receiptCache: { rows: UnifiedSearchResult['receipts']; expires: number } | null = null;
let receiptLoad: Promise<UnifiedSearchResult['receipts']> | null = null;
async function allReceipts(): Promise<UnifiedSearchResult['receipts']> {
  if (receiptCache && receiptCache.expires > Date.now()) return receiptCache.rows;
  if (!receiptLoad) {
    receiptLoad = (async () => {
      try {
        const data = await getPublicReceipts();
        // Receipts carry their verdict; the "biggest misses" list is, by definition, misses.
        const pick = (r: { id: string; titleId: string; titleName: string; predictedProbability: number; actualRevenue?: number; resolvedAt?: string }, verdict: 'called' | 'missed') => ({
          id: r.id, titleId: r.titleId, titleName: r.titleName, verdict,
          predictedProbability: r.predictedProbability, actualRevenue: r.actualRevenue, resolvedAt: r.resolvedAt,
        });
        const rows = [
          ...(data.receipts || []).map((r) => pick(r, r.verdict === 'missed' ? 'missed' : 'called')),
          ...(data.biggestMisses || []).map((r) => pick(r, 'missed')),
        ];
        receiptCache = { rows, expires: Date.now() + 5 * 60_000 };
        return rows;
      } catch {
        return receiptCache?.rows ?? [];
      } finally {
        receiptLoad = null;
      }
    })();
  }
  return receiptLoad;
}

async function receiptMatches(normQuery: string): Promise<UnifiedSearchResult['receipts']> {
  if (!normQuery) return [];
  const seen = new Set<string>();
  return (await allReceipts())
    .filter((r) => r.titleName.toLowerCase().includes(normQuery) && !seen.has(r.id) && seen.add(r.id))
    .slice(0, 4);
}

async function titleMatches(query: string, limit: number): Promise<UnifiedSearchResult['titles']> {
  try {
    const search = catalog({ media: 'all', collection: 'trending', search: query || undefined, page: 1 });
    const res = await Promise.race([search, new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000))]);
    if (!res) return [];
    return (res.items || []).slice(0, limit).map((t) => ({
      id: t.id, title: t.title, mediaType: t.mediaType, releaseDate: t.releaseDate, rating: t.voteAverage,
      poster: t.poster, genres: t.genres || [], overview: t.overview || '', status: t.status,
    }));
  } catch {
    return [];
  }
}

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

  // 2 + 3 run together: receipts (from a short-lived in-memory copy — they rarely change) and titles
  // (time-boxed, so a slow catalogue never leaves the search box spinning).
  const [matchedReceipts, matchedTitles] = await Promise.all([
    receiptMatches(normQuery),
    titleMatches(trimmed, limit),
  ]);

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
