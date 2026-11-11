/**
 * CinePulse v10: Interest Feedback Signals & Config
 */
import type { Title } from '../types';

export type FeedbackSignal = 'interested' | 'not_interested' | 'already_seen' | 'snooze';

export type FeedbackReason =
  | 'not_my_genre'
  | 'too_violent'
  | 'seen_it'
  | 'not_into_actor_director'
  | 'language'
  | 'too_long'
  | 'other';

export type FeatureType =
  | 'genre'
  | 'director'
  | 'actor'
  | 'language'
  | 'decade'
  | 'runtime_bucket'
  | 'keyword'
  | 'media_type';

export interface TitleFeatureSnapshot {
  genres: string[];
  director?: string;
  cast: string[];
  language?: string;
  runtime?: number;
  year?: number;
  decade?: string;
  runtimeBucket?: string;
  keywords?: string[];
  mediaType?: 'movie' | 'tv';
}

export const FEEDBACK_CONFIG = {
  get HALF_LIFE_DAYS(): number {
    const val = Number(process.env.FEEDBACK_HALF_LIFE_DAYS);
    return Number.isFinite(val) && val > 0 ? val : 45;
  },
  get EXPLORE_RATIO(): number {
    const val = Number(process.env.FEEDBACK_EXPLORE_RATIO);
    return Number.isFinite(val) && val >= 0 && val <= 0.5 ? val : 0.15;
  },
  WEIGHTS: {
    interested: 1.0,
    watchlist_add: 1.5,
    watched_rating_high: 2.0, // rating >= 4
    watched_rating_low: -1.5, // rating <= 2
    not_interested: -2.0,
  },
  // Feature-specific dampening for reasons
  REASON_MULTIPLIERS: {
    not_my_genre: 1.5,
    too_violent: 1.5,
    seen_it: 0.0, // Neutral for taste, hides title
    not_into_actor_director: 2.0,
    language: 1.5,
    too_long: 1.2,
    other: 1.0,
  },
  AFFINITY_CLAMP: {
    min: -5.0,
    max: 5.0,
  },
  SNOOZE_EXPIRY_DAYS: 30,
  RATE_LIMIT_PER_MINUTE: 60,
};

/**
 * Derives runtime bucket from minutes.
 */
export function getRuntimeBucket(runtimeMinutes?: number | null): string {
  if (!runtimeMinutes || runtimeMinutes <= 0) return 'unknown';
  if (runtimeMinutes < 90) return '<90m';
  if (runtimeMinutes <= 120) return '90-120m';
  if (runtimeMinutes <= 150) return '120-150m';
  return '>150m';
}

/**
 * Derives decade from release date or year.
 */
export function getDecade(yearOrDate?: number | string | null): string {
  if (!yearOrDate) return 'unknown';
  let y = typeof yearOrDate === 'number' ? yearOrDate : parseInt(String(yearOrDate).slice(0, 4), 10);
  if (isNaN(y) || y < 1900 || y > 2100) return 'unknown';
  return `${Math.floor(y / 10) * 10}s`;
}

/**
 * Extracts normalized features from Title.
 */
export function extractTitleFeatures(title: Title | any): TitleFeatureSnapshot {
  const genres: string[] = Array.isArray(title.genres) ? title.genres.filter(Boolean) : [];
  const director: string | undefined = title.director && typeof title.director === 'string' ? title.director.trim() : undefined;
  
  let cast: string[] = [];
  if (Array.isArray(title.cast)) {
    cast = title.cast
      .map((c: any) => (typeof c === 'string' ? c : c?.name))
      .filter((c: any) => typeof c === 'string' && c.trim().length > 0)
      .slice(0, 3);
  }

  const rawLang = title.originalLanguage || title.language || (title.title_json ? title.title_json.language : undefined);
  const language = rawLang && typeof rawLang === 'string' ? rawLang.trim().toLowerCase() : undefined;

  const runtime = typeof title.runtime === 'number' && title.runtime > 0 ? title.runtime : undefined;
  
  let year: number | undefined;
  if (title.releaseDate && typeof title.releaseDate === 'string') {
    const parsed = parseInt(title.releaseDate.slice(0, 4), 10);
    if (!isNaN(parsed)) year = parsed;
  } else if (typeof title.year === 'number') {
    year = title.year;
  }

  const decade = year ? getDecade(year) : undefined;
  const runtimeBucket = runtime ? getRuntimeBucket(runtime) : undefined;
  const keywords: string[] = Array.isArray(title.keywords) ? title.keywords.filter(Boolean) : [];
  const mediaType: 'movie' | 'tv' = title.mediaType === 'tv' ? 'tv' : 'movie';

  return {
    genres,
    director,
    cast,
    language,
    runtime,
    year,
    decade,
    runtimeBucket,
    keywords,
    mediaType,
  };
}

/**
 * Computes weight updates for each feature based on signal and reason.
 */
export function computeFeatureDeltas(
  snapshot: TitleFeatureSnapshot,
  signal: FeedbackSignal,
  reason?: FeedbackReason | null
): Array<{ featureType: FeatureType; featureValue: string; delta: number }> {
  const deltas: Array<{ featureType: FeatureType; featureValue: string; delta: number }> = [];

  // 'seen_it' or 'already_seen' is NEUTRAL for taste vector — delta is zero
  if (signal === 'already_seen' || reason === 'seen_it') {
    return deltas;
  }

  // Base delta
  let baseDelta = 0;
  if (signal === 'interested') {
    baseDelta = FEEDBACK_CONFIG.WEIGHTS.interested; // +1.0
  } else if (signal === 'not_interested') {
    baseDelta = FEEDBACK_CONFIG.WEIGHTS.not_interested; // -2.0
  } else if (signal === 'snooze') {
    // Snooze is a light temporary negative suppression (-0.5)
    baseDelta = -0.5;
  } else {
    return deltas;
  }

  // When a specific reason is provided, target only the relevant features
  if (signal === 'not_interested' && reason) {
    if (reason === 'not_into_actor_director') {
      // Affects only director and cast
      const mult = FEEDBACK_CONFIG.REASON_MULTIPLIERS.not_into_actor_director;
      if (snapshot.director) {
        deltas.push({ featureType: 'director', featureValue: snapshot.director, delta: baseDelta * mult });
      }
      for (const actor of snapshot.cast) {
        deltas.push({ featureType: 'actor', featureValue: actor, delta: (baseDelta * mult) / 2 });
      }
      return deltas;
    }

    if (reason === 'not_my_genre') {
      // Affects only genres
      const mult = FEEDBACK_CONFIG.REASON_MULTIPLIERS.not_my_genre;
      for (const genre of snapshot.genres) {
        deltas.push({ featureType: 'genre', featureValue: genre, delta: baseDelta * mult });
      }
      return deltas;
    }

    if (reason === 'too_violent') {
      // Lowers violent genres (Action, Horror, Crime, Thriller) and violence keywords
      const violentGenres = ['action', 'horror', 'crime', 'thriller'];
      for (const genre of snapshot.genres) {
        if (violentGenres.includes(genre.toLowerCase())) {
          deltas.push({ featureType: 'genre', featureValue: genre, delta: baseDelta * 1.5 });
        } else {
          // Other genres lightly dampened
          deltas.push({ featureType: 'genre', featureValue: genre, delta: -0.3 });
        }
      }
      for (const kw of snapshot.keywords || []) {
        deltas.push({ featureType: 'keyword', featureValue: kw, delta: baseDelta * 1.5 });
      }
      return deltas;
    }

    if (reason === 'language') {
      // Affects only language
      if (snapshot.language) {
        deltas.push({ featureType: 'language', featureValue: snapshot.language, delta: baseDelta * 1.5 });
      }
      return deltas;
    }

    if (reason === 'too_long') {
      // Affects runtime bucket
      if (snapshot.runtimeBucket) {
        deltas.push({ featureType: 'runtime_bucket', featureValue: snapshot.runtimeBucket, delta: baseDelta * 1.5 });
      }
      return deltas;
    }
  }

  // Default: Title-level delta applied across features with light dampening
  // "A single 'not interested' should drop that title to zero and lightly dampen its features;
  // 3+ negatives on the same genre should clearly suppress it."
  const genreDelta = signal === 'interested' ? 0.6 : -0.5;
  const personDelta = signal === 'interested' ? 0.5 : -0.4;
  const generalDelta = signal === 'interested' ? 0.3 : -0.2;

  for (const genre of snapshot.genres) {
    deltas.push({ featureType: 'genre', featureValue: genre, delta: genreDelta });
  }

  if (snapshot.director) {
    deltas.push({ featureType: 'director', featureValue: snapshot.director, delta: personDelta });
  }

  for (const actor of snapshot.cast) {
    deltas.push({ featureType: 'actor', featureValue: actor, delta: personDelta * 0.5 });
  }

  if (snapshot.language) {
    deltas.push({ featureType: 'language', featureValue: snapshot.language, delta: generalDelta });
  }

  if (snapshot.decade && snapshot.decade !== 'unknown') {
    deltas.push({ featureType: 'decade', featureValue: snapshot.decade, delta: generalDelta * 0.5 });
  }

  if (snapshot.runtimeBucket && snapshot.runtimeBucket !== 'unknown') {
    deltas.push({ featureType: 'runtime_bucket', featureValue: snapshot.runtimeBucket, delta: generalDelta * 0.5 });
  }

  return deltas;
}
