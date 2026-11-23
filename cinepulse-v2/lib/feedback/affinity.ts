/**
 * CinePulse v10: User Taste Affinity Engine
 * Exponential Time Decay, Clamping (-5..+5), Persistence, Undo, and Audit Trail.
 */
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import type { Title } from '../types';
import {
  FEEDBACK_CONFIG,
  extractTitleFeatures,
  computeFeatureDeltas,
  type FeedbackSignal,
  type FeedbackReason,
  type FeatureType,
  type TitleFeatureSnapshot,
} from './signals';

export interface AffinityRecord {
  featureType: FeatureType;
  featureValue: string;
  weight: number;
  updatedAt: string;
}

export interface FeedbackRecord {
  userId: string;
  titleId: string;
  signal: FeedbackSignal;
  reason?: FeedbackReason | null;
  surface: string;
  titleJson?: TitleFeatureSnapshot | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackSummary {
  liked: Array<{ featureType: FeatureType; featureValue: string; weight: number }>;
  suppressed: Array<{ featureType: FeatureType; featureValue: string; weight: number }>;
}

/**
 * Calculates exponential time decay: W(t) = W_0 * e^(-lambda * delta_t)
 * where lambda = ln(2) / halfLifeDays.
 */
export function applyExponentialDecay(
  weight: number,
  daysElapsed: number,
  halfLifeDays = FEEDBACK_CONFIG.HALF_LIFE_DAYS
): number {
  if (daysElapsed <= 0 || weight === 0 || halfLifeDays <= 0) return weight;
  const lambda = Math.LN2 / halfLifeDays;
  const decayed = weight * Math.exp(-lambda * daysElapsed);
  return Math.round(decayed * 1000) / 1000;
}

/**
 * Clamps weights strictly within [-5.0, +5.0].
 */
export function clampAffinityWeight(weight: number): number {
  const min = FEEDBACK_CONFIG.AFFINITY_CLAMP.min;
  const max = FEEDBACK_CONFIG.AFFINITY_CLAMP.max;
  const clamped = Math.min(max, Math.max(min, weight));
  return Math.round(clamped * 1000) / 1000;
}

/**
 * Applies a feedback signal to a title for a user.
 */
export async function applyFeedback(
  userId: string,
  title: Title | { id: string; [key: string]: any },
  signal: FeedbackSignal,
  reason?: FeedbackReason | null,
  surface = 'discovery'
): Promise<{ feedback: FeedbackRecord; deltas: Array<{ featureType: FeatureType; featureValue: string; delta: number }> }> {
  const d = db();
  const titleId = String(title.id);
  const now = new Date().toISOString();
  const snapshot = extractTitleFeatures(title);
  const titleJson = JSON.stringify(snapshot);

  // Check existing feedback record
  const existing = (await d.get(`
    SELECT signal, reason FROM interest_feedback 
    WHERE user_id = ? AND title_id = ?
  `, userId, titleId)) as { signal: FeedbackSignal; reason?: FeedbackReason | null } | undefined;

  const previousSignal = existing?.signal || null;
  const previousReason = existing?.reason || null;
  const action = existing ? 'update' : 'set';

  // Compute feature deltas
  const deltas = computeFeatureDeltas(snapshot, signal, reason);

  await d.transaction(async () => {
    // 1. Save or update interest_feedback
    (await d.run(`
      INSERT INTO interest_feedback (user_id, title_id, signal, reason, surface, title_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, title_id) DO UPDATE SET
        signal = excluded.signal,
        reason = excluded.reason,
        surface = excluded.surface,
        title_json = excluded.title_json,
        updated_at = excluded.updated_at
    `, userId, titleId, signal, reason || null, surface, titleJson, now, now));

    // 2. Audit trail event
    const eventId = randomUUID();
    (await d.run(`
      INSERT INTO interest_feedback_events (id, user_id, title_id, action, previous_signal, new_signal, previous_reason, new_reason, surface, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, eventId, userId, titleId, action, previousSignal, signal, previousReason, reason || null, surface, now));

    // 3. Update user_affinity for each feature with decay and clamping
    for (const item of deltas) {
      const row = (await d.get(`
        SELECT weight, updated_at FROM user_affinity
        WHERE user_id = ? AND feature_type = ? AND feature_value = ?
      `, userId, item.featureType, item.featureValue)) as { weight: number; updated_at: string } | undefined;

      let currentWeight = 0;
      if (row) {
        const lastDate = new Date(row.updated_at).getTime();
        const daysElapsed = Math.max(0, (Date.now() - lastDate) / (1000 * 60 * 60 * 24));
        currentWeight = applyExponentialDecay(row.weight, daysElapsed);
      }

      const nextWeight = clampAffinityWeight(currentWeight + item.delta);

      (await d.run(`
        INSERT INTO user_affinity (user_id, feature_type, feature_value, weight, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, feature_type, feature_value) DO UPDATE SET
          weight = excluded.weight,
          updated_at = excluded.updated_at
      `, userId, item.featureType, item.featureValue, nextWeight, now));
    }

  });

  return {
    feedback: {
      userId,
      titleId,
      signal,
      reason,
      surface,
      titleJson: snapshot,
      createdAt: now,
      updatedAt: now,
    },
    deltas,
  };
}

/**
 * Reverts feedback on a title (Undo).
 */
export async function undoFeedback(
  userId: string,
  titleId: string
): Promise<{ success: boolean; restoredSignal?: FeedbackSignal | null }> {
  const d = db();
  const current = (await d.get(`
    SELECT signal, reason, surface, title_json, created_at FROM interest_feedback
    WHERE user_id = ? AND title_id = ?
  `, userId, titleId)) as { signal: FeedbackSignal; reason?: FeedbackReason | null; surface: string; title_json?: string; created_at: string } | undefined;

  if (!current) {
    return { success: false };
  }

  // Find previous event to restore if any
  const previousEvents = (await d.get(`
    SELECT previous_signal, previous_reason FROM interest_feedback_events
    WHERE user_id = ? AND title_id = ? AND action != 'undo'
    ORDER BY created_at DESC LIMIT 1
  `, userId, titleId)) as { previous_signal?: FeedbackSignal | null; previous_reason?: FeedbackReason | null } | undefined;

  const restoredSignal = previousEvents?.previous_signal || null;
  const restoredReason = previousEvents?.previous_reason || null;
  const now = new Date().toISOString();

  let snapshot: TitleFeatureSnapshot | null = null;
  if (current.title_json) {
    try { snapshot = JSON.parse(current.title_json); } catch {}
  }

  // If we had snapshot, reverse the feature deltas applied by the current signal
  const appliedDeltas = snapshot ? computeFeatureDeltas(snapshot, current.signal, current.reason) : [];

  await d.transaction(async () => {
    // Record undo event
    const eventId = randomUUID();
    (await d.run(`
      INSERT INTO interest_feedback_events (id, user_id, title_id, action, previous_signal, new_signal, previous_reason, new_reason, surface, created_at)
      VALUES (?, ?, ?, 'undo', ?, ?, ?, ?, ?, ?)
    `, eventId, userId, titleId, current.signal, restoredSignal || null, current.reason || null, restoredReason || null, current.surface, now));

    if (restoredSignal) {
      // Restore previous state
      (await d.run(`
        UPDATE interest_feedback
        SET signal = ?, reason = ?, updated_at = ?
        WHERE user_id = ? AND title_id = ?
      `, restoredSignal, restoredReason || null, now, userId, titleId));
    } else {
      // Remove completely
      (await d.run(`
        DELETE FROM interest_feedback
        WHERE user_id = ? AND title_id = ?
      `, userId, titleId));
    }

    // Reverse applied affinity deltas
    for (const item of appliedDeltas) {
      const row = (await d.get(`
        SELECT weight, updated_at FROM user_affinity
        WHERE user_id = ? AND feature_type = ? AND feature_value = ?
      `, userId, item.featureType, item.featureValue)) as { weight: number; updated_at: string } | undefined;

      if (row) {
        // Subtract delta to revert
        const nextWeight = clampAffinityWeight(row.weight - item.delta);
        (await d.run(`
          UPDATE user_affinity SET weight = ?, updated_at = ?
          WHERE user_id = ? AND feature_type = ? AND feature_value = ?
        `, nextWeight, now, userId, item.featureType, item.featureValue));
      }
    }

  });

  return { success: true, restoredSignal };
}

/**
 * Returns all learned taste affinities for a user.
 */
export async function getUserAffinities(userId: string): Promise<AffinityRecord[]> {
  const d = db();
  const rows = (await d.all(`
    SELECT feature_type, feature_value, weight, updated_at
    FROM user_affinity
    WHERE user_id = ?
    ORDER BY weight DESC
  `, userId)) as any[];

  return rows.map((r) => ({
    featureType: r.feature_type as FeatureType,
    featureValue: r.feature_value,
    weight: Number(r.weight),
    updatedAt: r.updated_at,
  }));
}

/**
 * Returns top liked and suppressed features for "Your Taste" panel.
 */
export async function getFeedbackSummary(userId: string): Promise<FeedbackSummary> {
  const affinities = (await getUserAffinities(userId));

  const liked = affinities
    .filter((a) => a.weight >= 0.5)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10);

  const suppressed = affinities
    .filter((a) => a.weight <= -0.5)
    .sort((a, b) => a.weight - b.weight)
    .slice(0, 10);

  return { liked, suppressed };
}

/**
 * Removes or resets a specific affinity feature (from the Your Taste panel).
 */
export async function removeUserAffinity(userId: string, featureType: FeatureType, featureValue: string): Promise<boolean> {
  const d = db();
  const res = (await d.run(`
    DELETE FROM user_affinity
    WHERE user_id = ? AND feature_type = ? AND feature_value = ?
  `, userId, featureType, featureValue));
  return (res as any).changes > 0;
}

/**
 * Resets all recommendations, feedback, and learned affinities for a user.
 */
export async function resetUserFeedback(userId: string): Promise<void> {
  const d = db();
  await d.transaction(async () => {
    (await d.run('DELETE FROM interest_feedback WHERE user_id = ?', userId));
    (await d.run('DELETE FROM interest_feedback_events WHERE user_id = ?', userId));
    (await d.run('DELETE FROM user_affinity WHERE user_id = ?', userId));
  });
}

/**
 * Merges anonymous local storage feedback items into the authenticated user profile.
 */
export async function mergeLocalFeedback(
  userId: string,
  localItems: Array<{ title: any; signal: FeedbackSignal; reason?: FeedbackReason | null; surface?: string }>
): Promise<number> {
  if (!Array.isArray(localItems) || localItems.length === 0) return 0;
  let count = 0;
  for (const item of localItems) {
    if (!item || !item.title || !item.title.id || !item.signal) continue;
    try {
      (await applyFeedback(userId, item.title, item.signal, item.reason, item.surface || 'local_merge'));
      count++;
    } catch {}
  }
  return count;
}
