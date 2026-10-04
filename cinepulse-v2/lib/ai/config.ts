/**
 * CinePulse v9 — Track X: Operations & Environment Configuration
 * Kill switches, rate budgets, persona activation ramps, and pause toggles.
 */

import { db } from '../db';

export function isAiCommunityEnabled(): boolean {
  if (process.env.AI_COMMUNITY_ENABLED === 'false' || process.env.AI_COMMUNITY_ENABLED === '0') {
    return false;
  }

  try {
    const d = db();
    const row = d.prepare("SELECT value FROM api_cache WHERE cache_key = 'ai_community_paused'").get() as { value: string } | undefined;
    if (row && row.value === '"true"') return false;
  } catch {}

  return true;
}

export function setAiCommunityPaused(paused: boolean): void {
  const d = db();
  if (paused) {
    d.prepare(`
      INSERT INTO api_cache (cache_key, value, expires_at)
      VALUES ('ai_community_paused', '"true"', ?)
      ON CONFLICT(cache_key) DO UPDATE SET value=excluded.value, expires_at=excluded.expires_at
    `).run(Date.now() + 86400000 * 365);
  } else {
    d.prepare("DELETE FROM api_cache WHERE cache_key = 'ai_community_paused'").run();
  }
}

export const AI_CONFIG = {
  get maxActionsPerTick() {
    return Number(process.env.AI_MAX_ACTIONS_PER_TICK || 8);
  },
  get maxActionsPerDay() {
    return Number(process.env.AI_MAX_ACTIONS_PER_DAY || 60);
  },
  get llmDailyCallBudget() {
    return Number(process.env.AI_LLM_DAILY_CALL_BUDGET || 50);
  },
  get activePersonasCount() {
    return Number(process.env.AI_ACTIVE_PERSONAS || 15);
  }
};
