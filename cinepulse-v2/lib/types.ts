export type MediaType = 'movie' | 'tv';
export interface Title {
  id: string; source: 'demo' | 'tmdb'; mediaType: MediaType; title: string;
  overview: string; tagline: string; poster: string | null; backdrop: string | null;
  releaseDate: string | null; releaseDateSource?: 'fictional-demo-date' | 'tmdb-primary-release-date' | 'tmdb-first-air-date';
  /** The region requested from TMDB, not a guarantee that the returned date is a local theatrical date. */
  releaseDateRegion?: string | null;
  genres: string[]; runtime: number | null; seasons: number | null;
  status: 'upcoming' | 'released' | 'unknown'; voteAverage: number | null; voteCount: number;
  popularity: number | null; cast: {id?: number; name: string; character: string; profile: string | null}[];
  trailerKey: string | null; director: string | null; directorId?: number | null; budget: number | null; revenue: number | null;
}
export interface User { id: string; name: string; email: string; createdAt: string; isGoogle?: boolean }
export interface LibraryEntry { title: Title; status: 'watchlist' | 'watching' | 'watched'; rating: number | null; updatedAt: string }
export interface Review { id: string; userId: string; name: string; titleId: string; titleName: string; body: string; rating: number | null; spoiler: boolean; kind: 'first-impression' | 'review'; createdAt: string }
export interface Forecast { titleId: string; choice: 'hit' | 'flop'; confidence: number; reason: string; createdAt: string; updatedAt: string }
export interface Pulse { count: number; hit: number; flop: number; hitShare: number | null; interval: [number, number] | null; stage: 'no-data' | 'early' | 'growing' | 'established'; history: {date: string; count: number; hit: number}[]; myForecast: Forecast | null; forecastOpen: boolean; target: string }
export type CatalogHealthStatus = 'configured' | 'checking' | 'verified' | 'unavailable';
export interface CatalogHealth {
  status: CatalogHealthStatus;
  checkedAt: string | null;
  message: string;
}
export interface Config { mode: 'demo' | 'tmdb'; region: string; message: string; health: CatalogHealth }
export type CatalogResultScope = 'complete-local' | 'provider-total' | 'loaded-page-titles' | 'mixed-provider-totals';
export type CatalogOrdering = 'demo-source-order' | 'demo-filter-order' | 'provider-page-order' | 'mixed-source-page-order' | 'provider-release-date-ascending';
export interface CatalogResponse {
  items: Title[]; page: number; totalPages: number; totalResults: number; mode: 'demo' | 'tmdb';
  /** Qualifies what totalResults counts; old clients may ignore these additive fields. */
  totalResultsScope?: CatalogResultScope;
  totalResultsComplete?: boolean;
  /** Results from two providers/pages are not presented as one globally ranked list. */
  ordering?: CatalogOrdering;
  /** Search uses TMDB's complete matching-result count, independent of collection. */
  searchSemantics?: 'all-matching-titles';
  /** Upcoming is a paginated loaded release list, not an exhaustive calendar. */
  completeness?: 'complete-local' | 'provider-paginated' | 'loaded-page-titles' | 'mixed-provider-pages';
}

// ─── AI Prediction Engine Types ───────────────────────────────────────────────

export type PredictionConfidence = 'very-low' | 'low' | 'medium' | 'high';
export type PredictionFactorImpact = 'positive' | 'neutral' | 'negative';

export interface PredictionFactor {
  label: string;
  impact: PredictionFactorImpact;
  detail?: string;
}

export interface Prediction {
  /** Median revenue estimate in USD, or null if insufficient data. */
  revenueEstimate: number | null;
  /** [low, high] 80% confidence band in USD. */
  revenueRange: [number, number] | null;
  /** 0–100 probability the film is a theatrical hit. */
  hitProbability: number;
  /** 0–100 probability the film underperforms. */
  flopProbability: number;
  confidence: PredictionConfidence;
  /** Ordered list of signal factors driving the prediction. */
  factors: PredictionFactor[];
  modelVersion: 'heuristic-v1';
  disclaimer: string;
  /** ISO timestamp when this prediction was computed. */
  computedAt: string;
}

// ─── Streaming Providers ──────────────────────────────────────────────────────
export interface WatchProvider {
  providerId: number;
  providerName: string;
  logoPath: string;
}
export interface WatchProviderInfo {
  flatrate: WatchProvider[];
  rent: WatchProvider[];
  buy: WatchProvider[];
  link: string | null;
  region: string;
}

// ─── Person / Actor / Director Profiles ──────────────────────────────────────
export interface PersonCredit {
  id: string;
  title: string;
  character: string;
  job: string;
  poster: string | null;
  releaseDate: string | null;
  mediaType: MediaType;
}
export interface Person {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  placeOfBirth: string | null;
  profilePath: string | null;
  knownForDepartment: string;
  credits: PersonCredit[];
}
