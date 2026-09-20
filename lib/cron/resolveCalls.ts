import { db, now } from '../db';
import { titleById } from '../catalog';
import { computeBrierScore } from '../pulse/adjudication';

export interface CallResolutionSummary {
  titlesResolved: number;
  userCallsScored: number;
  engineScored: boolean;
}

/**
 * Resolves open community calls and ML predictions 30 days post-theatrical release (Track F1/F2)
 */
export async function resolvePendingCalls(): Promise<CallResolutionSummary> {
  const d = db();
  const cutoffDate = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);

  // 1. Find unresolved predictions_log entries whose release date is <= 30 days ago
  const unresolvedTitles = d.prepare(`
    SELECT DISTINCT title_id, title_name
    FROM predictions_log
    WHERE resolved_at IS NULL
  `).all() as { title_id: string; title_name: string }[];

  let titlesResolved = 0;
  let userCallsScored = 0;

  for (const item of unresolvedTitles) {
    try {
      const title = await titleById(item.title_id);
      if (!title || !title.releaseDate || title.releaseDate > cutoffDate) {
        continue;
      }

      // Check if actual budget and revenue are reported
      const budget = title.budget || 0;
      const revenue = title.revenue || 0;
      if (budget <= 0 || revenue <= 0) {
        continue;
      }

      const actualHit = revenue >= 2.5 * budget;
      const actualHitInt = actualHit ? 1 : 0;
      const resolvedStamp = now();

      // Update predictions_log
      d.prepare(`
        UPDATE predictions_log
        SET actual_revenue = ?, actual_hit = ?, resolved_at = ?
        WHERE title_id = ? AND resolved_at IS NULL
      `).run(revenue, actualHitInt, resolvedStamp, item.title_id);

      titlesResolved++;

      // Score user forecasts on this title
      const userForecasts = d.prepare(`
        SELECT user_id, choice, confidence
        FROM forecasts
        WHERE title_id = ?
      `).all(item.title_id) as { user_id: string; choice: string; confidence: number }[];

      for (const uf of userForecasts) {
        userCallsScored++;
        updateUserBrierScore(uf.user_id);
      }
    } catch {
      // Continue to next title if catalog query fails
    }
  }

  // Update engine benchmark Brier score on all resolved titles
  const allResolvedEngine = d.prepare(`
    SELECT hit_probability, actual_hit
    FROM predictions_log
    WHERE resolved_at IS NOT NULL AND actual_hit IS NOT NULL
  `).all() as { hit_probability: number; actual_hit: number }[];

  if (allResolvedEngine.length > 0) {
    const engineForecasts = allResolvedEngine.map(r => ({
      choice: r.hit_probability >= 50 ? 'hit' : 'flop',
      confidence: r.hit_probability >= 50 ? r.hit_probability : 100 - r.hit_probability,
      actualHit: Boolean(r.actual_hit)
    }));

    const engineMetrics = computeBrierScore(engineForecasts);

    d.prepare(`
      INSERT INTO brier_scores (entity_id, entity_type, entity_name, brier_score, accuracy_rate, total_calls, correct_calls, updated_at)
      VALUES ('cinepulse-engine', 'engine', 'CinePulse Engine', ?, ?, ?, ?, ?)
      ON CONFLICT(entity_id) DO UPDATE SET
        brier_score = excluded.brier_score,
        accuracy_rate = excluded.accuracy_rate,
        total_calls = excluded.total_calls,
        correct_calls = excluded.correct_calls,
        updated_at = excluded.updated_at
    `).run(
      engineMetrics.brierScore,
      engineMetrics.accuracyRate,
      engineMetrics.totalCalls,
      engineMetrics.correctCalls,
      now()
    );
  }

  return {
    titlesResolved,
    userCallsScored,
    engineScored: allResolvedEngine.length > 0,
  };
}

export function updateUserBrierScore(userId: string): void {
  const d = db();
  const user = d.prepare('SELECT id, name, username, avatar_url, created_at FROM users WHERE id = ?').get(userId) as any;
  if (!user) return;

  // Query all user forecasts joined with resolved predictions_log
  const resolvedCalls = d.prepare(`
    SELECT f.choice, f.confidence, p.actual_hit
    FROM forecasts f
    JOIN predictions_log p ON p.title_id = f.title_id
    WHERE f.user_id = ? AND p.actual_hit IS NOT NULL
  `).all(userId) as { choice: string; confidence: number; actual_hit: number }[];

  if (resolvedCalls.length === 0) return;

  const metrics = computeBrierScore(resolvedCalls.map(c => ({
    choice: c.choice,
    confidence: c.confidence,
    actualHit: Boolean(c.actual_hit)
  })));

  d.prepare(`
    INSERT INTO brier_scores (entity_id, entity_type, entity_name, avatar_url, brier_score, accuracy_rate, total_calls, correct_calls, updated_at)
    VALUES (?, 'user', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(entity_id) DO UPDATE SET
      entity_name = excluded.entity_name,
      avatar_url = excluded.avatar_url,
      brier_score = excluded.brier_score,
      accuracy_rate = excluded.accuracy_rate,
      total_calls = excluded.total_calls,
      correct_calls = excluded.correct_calls,
      updated_at = excluded.updated_at
  `).run(
    user.id,
    user.name || user.username || 'Cinephile',
    user.avatar_url || null,
    metrics.brierScore,
    metrics.accuracyRate,
    metrics.totalCalls,
    metrics.correctCalls,
    now()
  );
}
