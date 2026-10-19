import { catalog, titleById } from '../../catalog';
import { getPrediction } from '../../prediction';
import { getPulse, putForecast } from '../../pulse';
import { parseMoodSearch } from '../layer';
import { getContrarianReleases } from '../../contrarian';
import { getUserPersonalizedRecommendations } from '../../recommendations';
import { putLibrary } from '../../library';
import { db } from '../../db';
import type { User, Title } from '../../types';
import type { ToolResult, PendingAction } from './types';
import { randomUUID } from 'node:crypto';

// ─── Hand-rolled Validators ──────────────────────────────────────────────────

function cleanString(val: unknown, maxLen = 200): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, maxLen);
}

function cleanInt(val: unknown, min = 0, max = 3000): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const n = typeof val === 'number' ? val : parseInt(String(val), 10);
  if (Number.isNaN(n) || n < min || n > max) return undefined;
  return n;
}

function withTimeout<T>(promise: Promise<T>, ms = 4000, fallbackVal?: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Tool execution timed out after ${ms}ms`)), ms)
    ),
  ]).catch((err) => {
    if (fallbackVal !== undefined) return fallbackVal;
    throw err;
  });
}

function truncateJson<T extends Record<string, unknown>>(data: T, maxBytes = 1536): T {
  const str = JSON.stringify(data);
  if (Buffer.byteLength(str, 'utf8') <= maxBytes) return data;
  // If too large, trim array values or truncate text fields
  const trimmed = { ...data };
  for (const key of Object.keys(trimmed)) {
    if (Array.isArray(trimmed[key])) {
      (trimmed[key] as unknown[]) = (trimmed[key] as unknown[]).slice(0, 3);
    } else if (typeof trimmed[key] === 'string' && (trimmed[key] as string).length > 200) {
      (trimmed[key] as string) = (trimmed[key] as string).slice(0, 200) + '…';
    }
  }
  return trimmed;
}

// ─── Tool Execution Implementations ──────────────────────────────────────────

export async function executeSearchTitles(args: Record<string, unknown>): Promise<ToolResult> {
  const query = cleanString(args.query);
  if (!query) {
    return { name: 'search_titles', cardType: 'list', data: { items: [], query: '' }, summary: 'No query provided' };
  }
  const mediaType = args.type === 'movie' || args.type === 'tv' ? args.type : 'all';
  const year = cleanInt(args.year, 1900, 2100);
  const language = cleanString(args.language, 10) || undefined;

  const res = await withTimeout(
    catalog({
      search: query,
      media: mediaType,
      year,
      language,
      page: 1,
      collection: 'trending',
    })
  );

  const items = (res.items || []).slice(0, 5).map((t) => ({
    id: t.id,
    title: t.title,
    releaseDate: t.releaseDate,
    poster: t.poster,
    genres: t.genres.slice(0, 3),
    voteAverage: t.voteAverage,
    mediaType: t.mediaType,
    overview: t.overview ? t.overview.slice(0, 140) + '…' : '',
  }));

  const data = truncateJson({ query, totalFound: res.totalResults || items.length, items });
  return {
    name: 'search_titles',
    cardType: 'list',
    data,
    summary: items.length > 0 ? `Found ${items.length} titles matching "${query}"` : `No titles found matching "${query}"`,
  };
}

export async function executeGetTitleDetails(args: Record<string, unknown>): Promise<ToolResult> {
  const titleId = cleanString(args.titleId);
  if (!titleId) throw new Error('titleId is required');

  const t = await withTimeout(titleById(titleId));
  const data = truncateJson({
    id: t.id,
    title: t.title,
    overview: t.overview ? t.overview.slice(0, 300) : '',
    poster: t.poster,
    backdrop: t.backdrop,
    releaseDate: t.releaseDate,
    genres: t.genres,
    runtime: t.runtime,
    status: t.status,
    voteAverage: t.voteAverage,
    voteCount: t.voteCount,
    director: t.director,
    cast: (t.cast || []).slice(0, 4).map((c) => ({ name: c.name, character: c.character })),
    budget: t.budget,
    revenue: t.revenue,
    mediaType: t.mediaType,
  });

  return {
    name: 'get_title_details',
    cardType: 'title',
    data,
    summary: `${t.title} (${t.releaseDate ? t.releaseDate.slice(0, 4) : 'TBA'}) - ${t.genres.join(', ')}`,
  };
}

export async function executeGetForecast(args: Record<string, unknown>): Promise<ToolResult> {
  const titleId = cleanString(args.titleId);
  if (!titleId) throw new Error('titleId is required');

  const title = await withTimeout(titleById(titleId));
  const pred = await withTimeout(getPrediction(titleId, title));

  // Extract top 3 drivers from waterfall explanation or factors
  let topDrivers: string[] = [];
  if (pred.explanation?.topDrivers && pred.explanation.topDrivers.length > 0) {
    topDrivers = pred.explanation.topDrivers.slice(0, 3);
  } else if (pred.factors && pred.factors.length > 0) {
    topDrivers = pred.factors.slice(0, 3).map((f) => `${f.label}${f.detail ? ` (${f.detail})` : ''}`);
  }

  const data = truncateJson({
    titleId: title.id,
    title: title.title,
    poster: title.poster,
    releaseDate: title.releaseDate,
    hitProbability: pred.hitProbability,
    flopProbability: pred.flopProbability,
    revenueEstimate: pred.revenueEstimate,
    revenueRange: pred.revenueRange,
    confidence: pred.confidence,
    topDrivers,
    modelVersion: pred.modelVersion,
    disclaimer: pred.disclaimer,
  });

  return {
    name: 'get_forecast',
    cardType: 'forecast',
    data,
    summary: `${title.title}: ${pred.hitProbability}% Hit Probability, Est. Revenue: ${
      pred.revenueEstimate ? `$${Math.round(pred.revenueEstimate / 1e6)}M` : 'N/A'
    } (${pred.confidence} confidence)`,
  };
}

export async function executeGetCommunityPulse(
  args: Record<string, unknown>,
  user?: User | null
): Promise<ToolResult> {
  const titleId = cleanString(args.titleId);
  if (!titleId) throw new Error('titleId is required');

  const title = await withTimeout(titleById(titleId));
  const pulse = await withTimeout(getPulse(titleId, user || null));

  const data = truncateJson({
    titleId: title.id,
    title: title.title,
    count: pulse.count,
    hit: pulse.hit,
    flop: pulse.flop,
    hitShare: pulse.hitShare,
    interval: pulse.interval,
    stage: pulse.stage,
    sampleSizeWarning: pulse.count < 10,
    forecastOpen: pulse.forecastOpen,
    target: pulse.target,
    humanCount: pulse.humanCount,
    aiCount: pulse.aiCount,
  });

  return {
    name: 'get_community_pulse',
    cardType: 'pulse',
    data,
    summary:
      pulse.count > 0
        ? `Community Pulse for "${title.title}": ${pulse.count} calls (${pulse.hitShare ?? 0}% Hit). Sample: ${pulse.stage}`
        : `No community calls recorded yet for "${title.title}".`,
  };
}

export async function executeGetTrending(args: Record<string, unknown>): Promise<ToolResult> {
  const region = cleanString(args.region, 5) || undefined;
  const language = cleanString(args.language, 10) || undefined;

  const res = await withTimeout(
    catalog({
      collection: 'trending',
      media: 'all',
      page: 1,
      language,
    })
  );

  const items = (res.items || []).slice(0, 6).map((t) => ({
    id: t.id,
    title: t.title,
    poster: t.poster,
    releaseDate: t.releaseDate,
    genres: t.genres.slice(0, 2),
    voteAverage: t.voteAverage,
    mediaType: t.mediaType,
  }));

  const data = truncateJson({ region: region || 'Global', items });
  return {
    name: 'get_trending',
    cardType: 'list',
    data,
    summary: `Top ${items.length} trending releases right now`,
  };
}

export async function executeRecommendForMe(
  user?: User | null
): Promise<ToolResult> {
  if (!user?.id) {
    return {
      name: 'recommend_for_me',
      cardType: 'list',
      data: {
        items: [],
        authRequired: true,
        message: 'Please sign in to access personalized recommendations matched to your Taste DNA.',
      },
      summary: 'Authentication required for personalized recommendations.',
    };
  }

  const recs = await withTimeout(getUserPersonalizedRecommendations(user.id), 4000, []);
  const items = recs.slice(0, 5).map((r) => ({
    id: r.title.id,
    title: r.title.title,
    poster: r.title.poster,
    releaseDate: r.title.releaseDate,
    genres: r.title.genres.slice(0, 2),
    voteAverage: r.title.voteAverage,
    reasonText: r.reason.reasonText,
    matchScore: r.reason.matchScore,
  }));

  const data = truncateJson({ items, username: user.name || user.email });
  return {
    name: 'recommend_for_me',
    cardType: 'list',
    data,
    summary: `Found ${items.length} personalized recommendations tailored to your Taste DNA.`,
  };
}

export async function executeMoodSearch(
  args: Record<string, unknown>,
  ip = 'anon'
): Promise<ToolResult> {
  const query = cleanString(args.query);
  if (!query) {
    return { name: 'mood_search', cardType: 'list', data: { items: [] }, summary: 'No mood query provided' };
  }

  const parsed = await withTimeout(parseMoodSearch(query, ip), 3000, {
    genres: [],
    excludeKeywords: [],
    queryKeywords: [],
  });

  const catRes = await withTimeout(
    catalog({
      media: 'all',
      collection: 'trending',
      genre: parsed.genres[0] || undefined,
      page: 1,
    })
  );

  let filtered = catRes.items || [];
  if (parsed.maxRuntime) {
    filtered = filtered.filter((t) => !t.runtime || t.runtime <= (parsed.maxRuntime || 999));
  }

  const items = filtered.slice(0, 5).map((t) => ({
    id: t.id,
    title: t.title,
    poster: t.poster,
    releaseDate: t.releaseDate,
    runtime: t.runtime,
    genres: t.genres.slice(0, 3),
    voteAverage: t.voteAverage,
    overview: t.overview ? t.overview.slice(0, 120) + '…' : '',
  }));

  const data = truncateJson({
    query,
    appliedFilters: {
      genres: parsed.genres,
      maxRuntime: parsed.maxRuntime,
      era: parsed.era,
    },
    items,
  });

  return {
    name: 'mood_search',
    cardType: 'list',
    data,
    summary: `Mood search for "${query}" returned ${items.length} films matching your vibe.`,
  };
}

export async function executeCompareTitles(args: Record<string, unknown>): Promise<ToolResult> {
  const idA = cleanString(args.idA);
  const idB = cleanString(args.idB);
  if (!idA || !idB) throw new Error('Both idA and idB are required for comparison');

  const [titleA, titleB] = await Promise.all([withTimeout(titleById(idA)), withTimeout(titleById(idB))]);
  const [predA, predB] = await Promise.all([
    withTimeout(getPrediction(idA, titleA)),
    withTimeout(getPrediction(idB, titleB)),
  ]);

  const diff = predA.hitProbability - predB.hitProbability;
  let verdict = '';
  if (Math.abs(diff) <= 5) {
    verdict = `Dead heat: Both "${titleA.title}" (${predA.hitProbability}%) and "${titleB.title}" (${predB.hitProbability}%) have similar box-office outlooks.`;
  } else if (diff > 0) {
    verdict = `"${titleA.title}" holds the theatrical edge with ${predA.hitProbability}% hit probability vs ${predB.hitProbability}% for "${titleB.title}".`;
  } else {
    verdict = `"${titleB.title}" holds the theatrical edge with ${predB.hitProbability}% hit probability vs ${predA.hitProbability}% for "${titleA.title}".`;
  }

  const data = truncateJson({
    titleA: {
      id: titleA.id,
      title: titleA.title,
      poster: titleA.poster,
      releaseDate: titleA.releaseDate,
      hitProbability: predA.hitProbability,
      revenueEstimate: predA.revenueEstimate,
      voteAverage: titleA.voteAverage,
      confidence: predA.confidence,
    },
    titleB: {
      id: titleB.id,
      title: titleB.title,
      poster: titleB.poster,
      releaseDate: titleB.releaseDate,
      hitProbability: predB.hitProbability,
      revenueEstimate: predB.revenueEstimate,
      voteAverage: titleB.voteAverage,
      confidence: predB.confidence,
    },
    verdict,
  });

  return {
    name: 'compare_titles',
    cardType: 'compare',
    data,
    summary: verdict,
  };
}

export async function executeGetMyAccuracy(user?: User | null): Promise<ToolResult> {
  if (!user?.id) {
    return {
      name: 'get_my_accuracy',
      cardType: 'accuracy',
      data: { authRequired: true, message: 'Sign in to view your CinePulse accuracy and prediction rank.' },
      summary: 'Authentication required to see your prediction receipts.',
    };
  }

  try {
    const d = db();
    const row = d.prepare('SELECT brier_score, accuracy_rate, total_calls, correct_calls, rank FROM brier_scores WHERE entity_id = ?').get(user.id) as any;
    const stats = {
      brierScore: row?.brier_score ?? null,
      accuracyRate: row?.accuracy_rate ?? null,
      totalCalls: row?.total_calls ?? 0,
      correctCalls: row?.correct_calls ?? 0,
      rank: row?.rank ?? null,
      userName: user.name || user.email,
    };
    return {
      name: 'get_my_accuracy',
      cardType: 'accuracy',
      data: stats,
      summary: stats.totalCalls > 0
        ? `Your track record: ${stats.accuracyRate ?? 0}% accuracy across ${stats.totalCalls} calls (Brier score: ${stats.brierScore?.toFixed(3) ?? 'N/A'}).`
        : 'You have not submitted any resolved prediction calls yet.',
    };
  } catch {
    return {
      name: 'get_my_accuracy',
      cardType: 'accuracy',
      data: { totalCalls: 0, brierScore: null, accuracyRate: null },
      summary: 'No prediction history found yet.',
    };
  }
}

export async function executeGetContrarianPicks(): Promise<ToolResult> {
  const contrarians = await withTimeout(getContrarianReleases(), 4000, []);
  const items = contrarians.slice(0, 5).map((c) => ({
    titleId: c.title.id,
    title: c.title.title,
    poster: c.title.poster,
    releaseDate: c.title.releaseDate,
    modelHitProbability: c.modelHitProbability,
    communityHitProbability: c.communityHitProbability,
    divergence: c.divergence,
    contrarianSide: c.contrarianSide,
    reasoning: c.reasoning.divergenceReason,
  }));

  const data = truncateJson({ items, count: items.length });
  return {
    name: 'get_contrarian_picks',
    cardType: 'contrarian',
    data,
    summary: items.length > 0
      ? `Found ${items.length} contrarian releases with major divergence between the algorithmic model and community consensus.`
      : 'No high-divergence contrarian releases currently detected.',
  };
}

// ─── ACTION Tools: Only Propose, Never Execute Direct ─────────────────────────

export async function proposeAddToLibrary(args: Record<string, unknown>): Promise<ToolResult> {
  const titleId = cleanString(args.titleId);
  const rawList = cleanString(args.list || 'watchlist').toLowerCase();
  const list = ['watchlist', 'watching', 'watched'].includes(rawList) ? rawList : 'watchlist';

  if (!titleId) throw new Error('titleId is required to propose adding to library');
  const title = await withTimeout(titleById(titleId));

  const action: PendingAction = {
    id: `act_${randomUUID().slice(0, 8)}`,
    toolName: 'add_to_library',
    args: { titleId, list },
    description: `Add "${title.title}" to your ${list}`,
    titleId: title.id,
  };

  const data = {
    action,
    titleId: title.id,
    titleName: title.title,
    poster: title.poster,
    list,
  };

  return {
    name: 'add_to_library',
    cardType: 'action',
    data,
    summary: `Proposed action: Add "${title.title}" to your ${list}. Awaiting your confirmation.`,
  };
}

export async function proposeMakeOpeningCall(args: Record<string, unknown>): Promise<ToolResult> {
  const titleId = cleanString(args.titleId);
  const rawChoice = cleanString(args.choice || 'hit').toLowerCase();
  const choice = rawChoice === 'flop' ? 'flop' : 'hit';

  if (!titleId) throw new Error('titleId is required to make an opening call');
  const title = await withTimeout(titleById(titleId));

  const action: PendingAction = {
    id: `act_${randomUUID().slice(0, 8)}`,
    toolName: 'make_opening_call',
    args: { titleId, choice },
    description: `Predict "${title.title}" will be a ${choice.toUpperCase()} at the box office`,
    titleId: title.id,
  };

  const data = {
    action,
    titleId: title.id,
    titleName: title.title,
    poster: title.poster,
    choice,
  };

  return {
    name: 'make_opening_call',
    cardType: 'action',
    data,
    summary: `Proposed prediction: Call "${title.title}" as a ${choice.toUpperCase()}. Awaiting your confirmation.`,
  };
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: { user?: User | null; ip?: string }
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'search_titles':
        return await executeSearchTitles(args);
      case 'get_title_details':
        return await executeGetTitleDetails(args);
      case 'get_forecast':
        return await executeGetForecast(args);
      case 'get_community_pulse':
        return await executeGetCommunityPulse(args, context.user);
      case 'get_trending':
        return await executeGetTrending(args);
      case 'recommend_for_me':
        return await executeRecommendForMe(context.user);
      case 'mood_search':
        return await executeMoodSearch(args, context.ip);
      case 'compare_titles':
        return await executeCompareTitles(args);
      case 'get_my_accuracy':
        return await executeGetMyAccuracy(context.user);
      case 'get_contrarian_picks':
        return await executeGetContrarianPicks();
      case 'add_to_library':
        return await proposeAddToLibrary(args);
      case 'make_opening_call':
        return await proposeMakeOpeningCall(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      name,
      cardType: 'error',
      data: { error: error?.message || 'Tool execution failed' },
      error: error?.message || 'Tool execution failed',
      summary: `Failed to execute ${name}: ${error?.message || 'Unknown error'}`,
    };
  }
}

// ─── Tool Definitions for LLM Function Calling ────────────────────────────────

export const TOOL_DEFINITIONS = [
  {
    name: 'search_titles',
    description: 'Search for movies and TV series by title query, media type, release year, or language.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Title keywords to search for (e.g. "Dune", "Oppenheimer")' },
        type: { type: 'STRING', enum: ['movie', 'tv', 'all'], description: 'Media type filter' },
        year: { type: 'INTEGER', description: 'Release year filter (e.g. 2024)' },
        language: { type: 'STRING', description: 'ISO 639-1 language code (e.g. "hi", "en")' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_title_details',
    description: 'Get full metadata for a specific title by its ID (e.g. synopsis, genres, director, cast, budget, release date).',
    parameters: {
      type: 'OBJECT',
      properties: {
        titleId: { type: 'STRING', description: 'The title ID (e.g. "movie-693134", "demo-dunes")' },
      },
      required: ['titleId'],
    },
  },
  {
    name: 'get_forecast',
    description: 'Get the algorithmic box-office forecast for a title, including hit probability (0-100%), estimated revenue range, confidence score, and top contributing drivers.',
    parameters: {
      type: 'OBJECT',
      properties: {
        titleId: { type: 'STRING', description: 'The title ID to fetch the forecast for' },
      },
      required: ['titleId'],
    },
  },
  {
    name: 'get_community_pulse',
    description: 'Get community crowd sentiment and vote distribution (Hit vs Flop count, hit share percentage, confidence intervals, sample size).',
    parameters: {
      type: 'OBJECT',
      properties: {
        titleId: { type: 'STRING', description: 'The title ID to check community sentiment for' },
      },
      required: ['titleId'],
    },
  },
  {
    name: 'get_trending',
    description: 'Get currently trending movies and series across the CinePulse catalog.',
    parameters: {
      type: 'OBJECT',
      properties: {
        region: { type: 'STRING', description: 'Optional region code (e.g. "US", "IN")' },
        language: { type: 'STRING', description: 'Optional language code' },
      },
    },
  },
  {
    name: 'recommend_for_me',
    description: 'Get personalized recommendations tailored to the logged-in user\'s authentic Taste DNA and rating history.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'mood_search',
    description: 'Search movies using natural language queries like "slow-burn sci-fi thriller under 2 hours" or "fun feel-good 90s comedy".',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Natural language mood description or vibe' },
      },
      required: ['query'],
    },
  },
  {
    name: 'compare_titles',
    description: 'Compare two films side-by-side on box office predictions, hit probability, and audience reception.',
    parameters: {
      type: 'OBJECT',
      properties: {
        idA: { type: 'STRING', description: 'First title ID' },
        idB: { type: 'STRING', description: 'Second title ID' },
      },
      required: ['idA', 'idB'],
    },
  },
  {
    name: 'get_my_accuracy',
    description: 'Retrieve the signed-in user\'s prediction track record, Brier accuracy score, and leaderboard ranking.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'get_contrarian_picks',
    description: 'Find releases where the algorithmic model prediction diverges sharply from the community crowd consensus (by 20%+).',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'add_to_library',
    description: 'Propose adding a film to the user\'s library or watchlist. IMPORTANT: This will NOT execute directly; it returns a confirmation card for the user to confirm.',
    parameters: {
      type: 'OBJECT',
      properties: {
        titleId: { type: 'STRING', description: 'The title ID to add' },
        list: { type: 'STRING', enum: ['watchlist', 'watching', 'watched'], description: 'Target list name' },
      },
      required: ['titleId'],
    },
  },
  {
    name: 'make_opening_call',
    description: 'Propose submitting an opening weekend box-office forecast call (Hit or Flop). IMPORTANT: This will NOT execute directly; it returns a confirmation card for the user to confirm.',
    parameters: {
      type: 'OBJECT',
      properties: {
        titleId: { type: 'STRING', description: 'The title ID' },
        choice: { type: 'STRING', enum: ['hit', 'flop'], description: 'Hit or Flop call' },
      },
      required: ['titleId', 'choice'],
    },
  },
];

export const TOOL_SCHEMAS = TOOL_DEFINITIONS.map(
  (t) => `- **${t.name}**: ${t.description}`
).join('\n');
