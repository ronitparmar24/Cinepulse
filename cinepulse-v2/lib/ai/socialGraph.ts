/**
 * CinePulse v9 — Track U4: Social Graph & Interaction Mechanics
 * Preferential attachment (heavy-tailed follower distribution),
 * taste affinity matching, reciprocity, and like probabilities.
 */

import { dotProduct } from './factors';

export interface SocialPersona {
  id: string;
  taste: {
    latentVector: number[];
  };
  forecasting?: {
    skill?: number;
  };
}

export function computeTasteSimilarity(a: SocialPersona, b: SocialPersona): number {
  if (!a.taste?.latentVector || !b.taste?.latentVector) return 0.5;
  const dot = dotProduct(a.taste.latentVector, b.taste.latentVector);
  // Transform from [-1, 1] to [0.1, 1.0]
  return Math.max(0.1, (dot + 1) / 2);
}

/**
 * Chooses a target to follow using preferential attachment + taste similarity.
 */
export function sampleFollowTarget(
  follower: SocialPersona,
  candidates: SocialPersona[],
  inDegrees: Map<string, number>,
  existingFollows: Set<string>,
  rng: () => number = Math.random
): SocialPersona | null {
  const available = candidates.filter(c => c.id !== follower.id && !existingFollows.has(c.id));
  if (available.length === 0) return null;

  // Weight = (inDegree + 1)^1.85 * tasteSimilarity
  const weights: number[] = [];
  let totalWeight = 0;

  for (const cand of available) {
    const deg = inDegrees.get(cand.id) ?? 0;
    const pref = Math.pow(deg + 1, 1.85);
    const taste = computeTasteSimilarity(follower, cand);
    const weight = pref * taste;
    weights.push(weight);
    totalWeight += weight;
  }

  if (totalWeight <= 0) return available[0];

  let threshold = rng() * totalWeight;
  for (let i = 0; i < available.length; i++) {
    threshold -= weights[i];
    if (threshold <= 0) {
      return available[i];
    }
  }

  return available[available.length - 1];
}

/**
 * Simulates a synthetic social graph over personas to verify heavy-tailed degree distribution.
 */
export function simulateFollowGraph(
  personas: SocialPersona[],
  totalFollowEvents = 160,
  seed = 42
): { follows: [string, string][]; inDegrees: Map<string, number> } {
  // Simple seeded pseudo-RNG
  let s = seed;
  const rng = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const follows: [string, string][] = [];
  const inDegrees = new Map<string, number>();
  const followingSets = new Map<string, Set<string>>();

  for (const p of personas) {
    inDegrees.set(p.id, 0);
    followingSets.set(p.id, new Set<string>());
  }

  // Pre-seed first 3 prominent personas with a small initial anchor
  for (let i = 0; i < Math.min(3, personas.length); i++) {
    inDegrees.set(personas[i].id, 2);
  }

  for (let ev = 0; ev < totalFollowEvents; ev++) {
    const followerIdx = Math.floor(rng() * personas.length);
    const follower = personas[followerIdx];
    const target = sampleFollowTarget(
      follower,
      personas,
      inDegrees,
      followingSets.get(follower.id)!,
      rng
    );

    if (target) {
      follows.push([follower.id, target.id]);
      followingSets.get(follower.id)!.add(target.id);
      inDegrees.set(target.id, (inDegrees.get(target.id) ?? 0) + 1);

      // Reciprocity check: 30% chance target follows back if not already following
      if (rng() < 0.30 && !followingSets.get(target.id)!.has(follower.id)) {
        follows.push([target.id, follower.id]);
        followingSets.get(target.id)!.add(follower.id);
        inDegrees.set(follower.id, (inDegrees.get(follower.id) ?? 0) + 1);
      }
    }
  }

  return { follows, inDegrees };
}

/**
 * Evaluates whether persona will like a review or comment.
 * Probability proportional to taste match * recency * author popularity.
 */
export function computeLikeProbability(
  viewer: SocialPersona,
  author: SocialPersona,
  authorFollowersCount = 0,
  postAgeMinutes = 30
): number {
  const taste = computeTasteSimilarity(viewer, author);
  const popularityBoost = 1 + Math.log1p(authorFollowersCount) * 0.15;
  const recencyDecay = Math.exp(-postAgeMinutes / (24 * 60)); // 24-hr halflife

  const p = 0.18 * taste * popularityBoost * recencyDecay;
  return Math.max(0.01, Math.min(0.85, p));
}
