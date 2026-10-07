import { createHash } from 'node:crypto';
import { unifiedFetch, logMissingKeyOnce } from './base';
import { db } from '../db';
import { runCloudflareSentiment, runCloudflareEmbeddings } from './cloudflare';
import type { Title } from '../types';

export interface HFSentimentResult {
  label: 'POSITIVE' | 'NEGATIVE';
  score: number;
  provider: 'huggingface' | 'cloudflare' | 'heuristic';
}

export interface TitleEmbeddingRecord {
  titleId: string;
  vector: number[];
  model: string;
  fromCache: boolean;
}

/**
 * Sentiment analysis on social / review chatter.
 * Tier 1: Hugging Face distilbert-base-uncased-finetuned-sst-2-english
 * Tier 2: Cloudflare Workers AI distilbert-sst-2-int8
 * Tier 3: Heuristic sentiment
 */
export async function getHuggingFaceSentiment(text: string): Promise<HFSentimentResult | null> {
  if (!text || !text.trim()) return null;
  const token = process.env.HF_TOKEN;

  // 1. Try Hugging Face Inference API
  if (token) {
    try {
      const endpoint = 'https://router.huggingface.co/hf-inference/models/distilbert/distilbert-base-uncased-finetuned-sst-2-english';
      const res = await unifiedFetch<Array<Array<{ label: string; score: number }>>>({
        provider: 'hf',
        endpoint,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: text.slice(0, 500) }),
        ttlMs: 7 * 24 * 60 * 60 * 1000,
      });

      const scores = res.data?.[0];
      if (Array.isArray(scores) && scores.length > 0) {
        const top = scores.reduce((prev, curr) => (curr.score > prev.score ? curr : prev), scores[0]);
        return {
          label: (top.label?.toUpperCase() === 'POSITIVE' ? 'POSITIVE' : 'NEGATIVE'),
          score: Number(top.score.toFixed(3)),
          provider: 'huggingface',
        };
      }
    } catch {
      // Continue to Cloudflare fallback
    }
  } else {
    logMissingKeyOnce('hf', 'HF_TOKEN');
  }

  // 2. Fallback Tier: Cloudflare Workers AI
  try {
    const cf = await runCloudflareSentiment(text);
    if (cf) {
      return {
        label: cf.label,
        score: cf.score,
        provider: 'cloudflare',
      };
    }
  } catch { /* continue to heuristic */ }

  // 3. Fallback Tier: Rule-based lexicon sentiment
  const lower = text.toLowerCase();
  const positiveWords = ['amazing', 'great', 'hyped', 'excited', 'masterpiece', 'brilliant', 'love', 'stellar', 'epic', 'phenomenal'];
  const negativeWords = ['boring', 'awful', 'terrible', 'flop', 'bad', 'waste', 'disappointing', 'horrible', 'trash', 'skipping'];

  let posCount = 0;
  let negCount = 0;
  for (const w of positiveWords) if (lower.includes(w)) posCount++;
  for (const w of negativeWords) if (lower.includes(w)) negCount++;

  if (posCount !== negCount) {
    const isPos = posCount > negCount;
    const diff = Math.abs(posCount - negCount);
    return {
      label: isPos ? 'POSITIVE' : 'NEGATIVE',
      score: Math.min(0.95, 0.6 + diff * 0.1),
      provider: 'heuristic',
    };
  }

  return { label: 'POSITIVE', score: 0.5, provider: 'heuristic' };
}

/**
 * Computes vector cosine similarity locally between two dense embeddings.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return Number((dot / (Math.sqrt(normA) * Math.sqrt(normB))).toFixed(4));
}

/**
 * Sentence embeddings (all-MiniLM-L6-v2 / bge-small):
 * Embed every title's overview ONCE, store in title_embeddings, keep forever.
 * Zero live API calls per comparison.
 */
export async function getTitleEmbedding(
  titleId: string,
  overview: string,
  titleData?: Partial<Title>
): Promise<TitleEmbeddingRecord | null> {
  if (!titleId || !overview) return null;
  const contentHash = createHash('sha256').update(overview.trim()).digest('hex');

  // 1. Check title_embeddings table (stored once, kept forever)
  try {
    const d = db();
    const row = d.prepare('SELECT vector_json, model FROM title_embeddings WHERE title_id = ?').get(titleId) as { vector_json: string; model: string } | undefined;
    if (row?.vector_json) {
      const vector = JSON.parse(row.vector_json) as number[];
      if (Array.isArray(vector) && vector.length > 0) {
        return { titleId, vector, model: row.model, fromCache: true };
      }
    }
  } catch { /* best-effort db check */ }

  const token = process.env.HF_TOKEN;
  let vector: number[] | null = null;
  let usedModel = 'all-MiniLM-L6-v2';

  // 2. Try Hugging Face Inference API
  if (token) {
    try {
      const endpoint = 'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction';
      const res = await unifiedFetch<number[][] | number[]>({
        provider: 'hf',
        endpoint,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: [overview.slice(0, 1000)] }),
        ttlMs: 365 * 24 * 60 * 60 * 1000, // permanent
      });

      if (Array.isArray(res.data)) {
        if (Array.isArray(res.data[0])) {
          vector = res.data[0] as number[];
        } else if (typeof res.data[0] === 'number') {
          vector = res.data as number[];
        }
      }
    } catch { /* continue to Cloudflare */ }
  }

  // 3. Fallback Tier: Cloudflare Workers AI embeddings
  if (!vector || vector.length === 0) {
    try {
      vector = await runCloudflareEmbeddings(overview);
      if (vector) {
        usedModel = 'cloudflare-bge-small-en-v1.5';
      }
    } catch { /* best-effort */ }
  }

  if (vector && vector.length > 0) {
    // Persist permanently in title_embeddings table
    try {
      db().prepare(`
        INSERT INTO title_embeddings(title_id, model, content_hash, title_json, vector_json)
        VALUES(?,?,?,?,?)
        ON CONFLICT(title_id, model) DO UPDATE SET
          vector_json = excluded.vector_json,
          content_hash = excluded.content_hash
      `).run(titleId, usedModel, contentHash, JSON.stringify(titleData || { id: titleId }), JSON.stringify(vector));
    } catch { /* best-effort write */ }

    return { titleId, vector, model: usedModel, fromCache: false };
  }

  return null;
}

/**
 * Finds semantic similar titles by comparing cached embedding vectors locally.
 * Zero live API calls per search.
 */
export async function getSemanticSimilarTitles(
  targetTitle: Title,
  candidateTitles: Title[],
  limit = 6
): Promise<Array<{ title: Title; similarity: number }>> {
  if (!targetTitle.overview) return [];

  const targetRec = await getTitleEmbedding(targetTitle.id, targetTitle.overview, targetTitle);
  if (!targetRec?.vector) return [];

  const scored: Array<{ title: Title; similarity: number }> = [];

  for (const cand of candidateTitles) {
    if (cand.id === targetTitle.id || !cand.overview) continue;
    const candRec = await getTitleEmbedding(cand.id, cand.overview, cand);
    if (candRec?.vector) {
      const sim = cosineSimilarity(targetRec.vector, candRec.vector);
      scored.push({ title: cand, similarity: sim });
    }
  }

  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

/**
 * Nightly batch backfill job for title embeddings (e.g. 50 titles per run).
 * Embeds titles in background so pageviews never trigger external embedding generation.
 */
export async function batchBackfillTitleEmbeddings(
  titles: Title[],
  maxPerRun = 50
): Promise<{ embedded: number; skipped: number }> {
  let embedded = 0;
  let skipped = 0;

  for (const t of titles.slice(0, maxPerRun)) {
    if (!t.overview) {
      skipped++;
      continue;
    }
    // Check if already embedded
    try {
      const existing = db().prepare('SELECT title_id FROM title_embeddings WHERE title_id = ?').get(t.id);
      if (existing) {
        skipped++;
        continue;
      }
    } catch { /* proceed */ }

    const res = await getTitleEmbedding(t.id, t.overview, t);
    if (res?.vector) embedded++;
    else skipped++;
  }

  return { embedded, skipped };
}
