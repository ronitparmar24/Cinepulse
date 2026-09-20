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
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  isGoogle?: boolean;
  username?: string;
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  profileVisibility?: 'public' | 'followers_only' | 'private';
  isVerified?: boolean;
  favoriteTitleIds?: string[];
}
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
  p10RevenueUsd?: number | null;
  p50RevenueUsd?: number | null;
  p90RevenueUsd?: number | null;
  /** 0–100 probability the film is a theatrical hit. */
  hitProbability: number;
  /** 0–100 probability the film underperforms. */
  flopProbability: number;
  brierScoreExpected?: number;
  confidence: PredictionConfidence;
  /** Ordered list of signal factors driving the prediction. */
  factors: PredictionFactor[];
  explanation?: {
    baseUsd: number;
    finalP50Usd: number;
    waterfall: Array<{
      name: string;
      deltaUsd: number;
      cumulativeUsd: number;
      impact: 'positive' | 'negative' | 'neutral';
      explanation: string;
    }>;
    topDrivers: string[];
  };
  features?: Record<string, { value: any; source: string; confidence: number }>;
  modelVersion: 'heuristic-v1' | 'cinepulse-ml-v3';
  disclaimer: string;
  /** ISO timestamp when this prediction was computed. */
  computedAt: string;
}

// ─── Watch Providers ──────────────────────────────────────────────────────────
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

// ─── Social Layer & Public Profiles Types ────────────────────────────────────

export type VisibilityLevel = 'public' | 'followers_only' | 'private';

export interface PrivacySettings {
  userId: string;
  watchlistVisibility: VisibilityLevel;
  diaryVisibility: VisibilityLevel;
  ratingsVisibility: VisibilityLevel;
  reviewsVisibility: VisibilityLevel;
  predictionsVisibility: VisibilityLevel;
  activityVisibility: VisibilityLevel;
  showInSearch: boolean;
  allowActivityFrom: 'everyone' | 'followers' | 'nobody';
}

export type FollowStatus = 'accepted' | 'pending';

export interface FollowRecord {
  followerId: string;
  followeeId: string;
  status: FollowStatus;
  createdAt: string;
}

export type TargetType = 'title' | 'user' | 'list' | 'review' | 'activity_event';

export type ActivityType =
  | 'watched'
  | 'rated'
  | 'reviewed'
  | 'added_to_watchlist'
  | 'made_call'
  | 'followed'
  | 'created_list';

export type ActivityEventType = ActivityType;

export interface ActivityEvent {
  id: number;
  userId?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string | null;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
  };
  type: ActivityType;
  targetType: TargetType;
  targetId: string;
  titleName?: string;
  poster?: string | null;
  metadata: Record<string, any>;
  visibility: VisibilityLevel;
  createdAt: string;
  likesCount: number;
  isLiked?: boolean;
  commentsCount?: number;
}

export interface CommentRecord {
  id: number;
  userId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string | null;
  user?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
  };
  targetType: TargetType;
  targetId: string;
  body: string;
  createdAt: string;
  deletedAt?: string | null;
  isDeleted?: boolean;
  isOwner?: boolean;
  canDelete?: boolean;
}

export interface UserList {
  id: string;
  userId: string;
  username?: string;
  name: string;
  title?: string;
  description?: string | null;
  isRanked: boolean;
  visibility: VisibilityLevel;
  titleIds?: string[];
  items?: { titleId: string; titleName?: string; poster?: string | null; notes?: string; order: number }[];
  itemCount?: number;
  createdAt: string;
  updatedAt: string;
  likesCount?: number;
  isLiked?: boolean;
  hasLiked?: boolean;
}

export type NotificationType =
  | 'followed_you'
  | 'liked_review'
  | 'commented'
  | 'follow_request'
  | 'call_resolved';

export interface NotificationRecord {
  id: number;
  userId: string;
  actorId: string;
  actorUsername?: string;
  actorDisplayName?: string;
  actorAvatarUrl?: string | null;
  actor?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
  };
  type: NotificationType;
  targetType?: string | null;
  targetId?: string | null;
  targetTitle?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface UserStats {
  filmsWatchedThisYear: number;
  totalWatched: number;
  totalFilmsWatched?: number;
  averageRating: number | null;
  averageRatingGiven?: number | null;
  totalReviews?: number;
  brierScore: number | null;
  accuracyRate?: number | null;
  hitRate?: number | null;
  totalPredictions?: number;
  totalCalls?: number;
  followersCount?: number;
  followingCount?: number;
}

export interface PublicProfile {
  id: string;
  username: string;
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  profileVisibility: VisibilityLevel;
  isVerified: boolean;
  createdAt: string;
  favoriteFilms?: any[];
  favoriteTitles?: any[];
  stats: UserStats;
  followerCount?: number;
  followingCount?: number;
  isFollowing?: boolean;
  isPendingFollow?: boolean;
  isFollower?: boolean;
  isBlocked?: boolean;
  isViewerBlocked?: boolean;
  isOwner?: boolean;
  viewerRelation?: {
    isSelf: boolean;
    isFollowing: boolean;
    followStatus?: 'accepted' | 'pending' | null;
    isFollowedBy: boolean;
    isBlocked: boolean;
  };
  privacySettings?: PrivacySettings;
}

export interface TasteMatchResult {
  score: number | null; // 0 to 100 percentage or null
  coWatchedCount: number;
  agreementDescription?: string;
  description?: string;
}

export interface MutualWatchlistResult {
  count?: number;
  mutualCount?: number;
  titles?: any[];
  mutualTitles?: Title[];
  description?: string;
}

