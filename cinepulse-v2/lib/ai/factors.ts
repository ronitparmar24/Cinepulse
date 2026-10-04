/**
 * CinePulse v9 — Track U2: Latent Taste & Item Factors Engine
 * Evaluates persona taste similarity and predicts calibrated ratings
 * based on k=16 low-rank factor embeddings.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ItemFactor {
  titleId: string;
  title: string;
  genres?: string[];
  director?: string;
  latentVector: number[];
}

let cachedFactors: Record<string, ItemFactor> | null = null;

const GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Family', 'Fantasy', 'History',
  'Horror', 'Music', 'Mystery', 'Romance', 'Science Fiction', 'Thriller'
];

function stringHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function buildLatentVector(titleId: string, genres: string[] = [], director = ''): number[] {
  const vec = new Array(16).fill(0);
  const hash = stringHash(titleId + (director || ''));

  for (const g of genres) {
    const idx = GENRES.indexOf(g);
    if (idx >= 0) {
      vec[idx] += 0.8;
      vec[(idx + 4) % 16] += 0.3;
    }
  }

  for (let i = 0; i < 16; i++) {
    const pseudo = Math.sin(hash * 0.0017 + i * 19.3) * 0.4;
    vec[i] += pseudo;
  }

  let norm = 0;
  for (let i = 0; i < 16; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  return vec.map(v => Number((v / norm).toFixed(4)));
}

export function loadItemFactors(): Record<string, ItemFactor> {
  if (cachedFactors) return cachedFactors;

  try {
    const p = resolve(process.cwd(), 'data/item-factors.json');
    if (existsSync(p)) {
      cachedFactors = JSON.parse(readFileSync(p, 'utf8'));
      return cachedFactors!;
    }
  } catch {
    // Graceful fallback if file is reading
  }

  cachedFactors = {};
  return cachedFactors;
}

export function getItemFactor(titleId: string, genres: string[] = [], director = ''): ItemFactor {
  const all = loadItemFactors();
  if (all[titleId]) return all[titleId];

  const latent = buildLatentVector(titleId, genres, director);
  const created: ItemFactor = {
    titleId,
    title: titleId,
    genres,
    director,
    latentVector: latent
  };
  all[titleId] = created;
  return created;
}

export function dotProduct(vecA: number[], vecB: number[]): number {
  const len = Math.min(vecA.length, vecB.length);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += vecA[i] * vecB[i];
  }
  return sum;
}

export interface RatingPrediction {
  rating: number;
  matchScore: number; // dot product in [-1, 1]
  expectedRating: number;
}

/**
 * Predicts a persona's rating (1 to 5 stars) on a title using latent taste dot product.
 */
export function predictPersonaRating(
  persona: { taste: { latentVector: number[]; ratingBias?: number; ratingSpread?: number } },
  titleFactor: { latentVector: number[] },
  noise = 0
): RatingPrediction {
  const dot = dotProduct(persona.taste.latentVector, titleFactor.latentVector);
  const bias = persona.taste.ratingBias ?? 0;
  const spread = persona.taste.ratingSpread ?? 1.0;

  // Center around 3.0 stars, scaled by dot product and persona spread
  const expected = 3.0 + (dot * 2.5 * spread) + bias + noise;
  const roundedHalf = Math.round(expected * 2) / 2;
  const clamped = Math.max(1, Math.min(5, roundedHalf));

  return {
    rating: clamped,
    matchScore: Number(dot.toFixed(4)),
    expectedRating: Number(expected.toFixed(2))
  };
}
