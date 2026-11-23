/**
 * CinePulse v9 — Track X: Operations & Environment Configuration
 * Kill switches, rate budgets, persona activation ramps, and pause toggles.
 */

import { db } from '../db';

export async function isAiCommunityEnabled(): Promise<boolean> {
  if (process.env.AI_COMMUNITY_ENABLED === 'false' || process.env.AI_COMMUNITY_ENABLED === '0') {
    return false;
  }

  try {
    const d = db();
    const row = (await d.get("SELECT value FROM api_cache WHERE cache_key = 'ai_community_paused'")) as { value: string } | undefined;
    if (row && row.value === '"true"') return false;
  } catch {}

  return true;
}

export async function setAiCommunityPaused(paused: boolean): Promise<void> {
  const d = db();
  if (paused) {
    (await d.run(`
      INSERT INTO api_cache (cache_key, value, expires_at)
      VALUES ('ai_community_paused', '"true"', ?)
      ON CONFLICT(cache_key) DO UPDATE SET value=excluded.value, expires_at=excluded.expires_at
    `, Date.now() + 86400000 * 365));
  } else {
    (await d.run("DELETE FROM api_cache WHERE cache_key = 'ai_community_paused'"));
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
