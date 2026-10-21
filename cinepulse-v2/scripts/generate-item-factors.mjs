#!/usr/bin/env node
/**
 * CinePulse v9 — Track U2: Offline Item Factors (k=16)
 * Generates low-rank latent representation for catalog and training titles.
 */

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const OUT_PATH = resolve(process.cwd(), 'data/item-factors.json');
const DEMO_PATH = resolve(process.cwd(), 'lib/demo-catalog.json');
const CSV_PATH = resolve(process.cwd(), 'data/training.csv');

const GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Family', 'Fantasy', 'History',
  'Horror', 'Music', 'Mystery', 'Romance', 'Science Fiction', 'Thriller'
];

function stringHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function buildLatentVector(titleId, genres = [], director = '') {
  const vec = new Array(16).fill(0);
  const hash = stringHash(titleId + (director || ''));

  // Genre projection into 16 dimensions
  for (const g of genres) {
    const idx = GENRES.indexOf(g);
    if (idx >= 0) {
      vec[idx] += 0.8;
      vec[(idx + 4) % 16] += 0.3;
    }
  }

  // Latent feature noise from hash
  for (let i = 0; i < 16; i++) {
    const pseudo = Math.sin(hash * 0.0017 + i * 19.3) * 0.4;
    vec[i] += pseudo;
  }

  // Normalize
  let norm = 0;
  for (let i = 0; i < 16; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  return vec.map(v => Number((v / norm).toFixed(4)));
}

export function generateAllItemFactors() {
  const factors = {};

  // 1. Demo catalog
  const demoData = JSON.parse(readFileSync(DEMO_PATH, 'utf8'));
  for (const item of demoData) {
    const [id, title, mediaType, genres, releaseDate, runtime, tagline, overview, director] = item;
    const titleId = `demo-${id}`;
    factors[titleId] = {
      titleId,
      title,
      genres,
      director,
      latentVector: buildLatentVector(titleId, genres, director)
    };
  }

  // 2. Training CSV titles
  try {
    const csv = readFileSync(CSV_PATH, 'utf8');
    const lines = csv.trim().split('\n').slice(1);
    for (const line of lines) {
      const match = line.match(/^(\d+),"([^"]+)"/);
      if (match) {
        const tmdbId = match[1];
        const title = match[2];
        const titleId = `movie-${tmdbId}`;
        factors[titleId] = {
          titleId,
          title,
          latentVector: buildLatentVector(titleId, ['Action', 'Drama'], '')
        };
      }
    }
  } catch (e) {
    console.warn('Could not read training.csv, skipping training item factors:', e.message);
  }

  return factors;
}

const factors = generateAllItemFactors();
mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(factors, null, 2), 'utf8');
console.log(`Generated item factors for ${Object.keys(factors).length} items at ${OUT_PATH}`);
