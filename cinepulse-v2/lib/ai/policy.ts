/**
 * CinePulse v9 — Track U5: Action Policy Engine
 * Pure deterministic function deciding what and when an AI persona acts.
 */

import { computeActionProbability } from './circadian';
import { computePersonaForecast } from './forecasting';
import { predictPersonaRating, getItemFactor } from './factors';
import { sampleFollowTarget } from './socialGraph';

export type AiActionType = 'forecast' | 'review' | 'reply' | 'like' | 'follow' | 'list_add' | 'idle';

export interface AiAction {
  type: AiActionType;
  personaId: string;
  reasonCode: string;
  payload?: Record<string, unknown>;
}

export interface WorldState {
  tickId: string | number;
  upcomingTitles?: Array<{
    id: string;
    title: string;
    releaseDate?: string;
    modelProb?: number;
    crowdProb?: number;
    genres?: string[];
    director?: string;
  }>;
  releasedTitles?: Array<{
    id: string;
    title: string;
    genres?: string[];
    director?: string;
  }>;
  recentPosts?: Array<{
    id: string;
    authorId: string;
    titleId: string;
    createdAt: string;
    body?: string;
    kind: string;
  }>;
  allPersonas?: any[];
  existingFollows?: Set<string>;
  personaDailyActionCount?: number;
  lastActionTimestampMs?: number | null;
}

function seededRng(seedStr: string): () => number {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = (Math.imul(31, h) + seedStr.charCodeAt(i)) | 0;
  }
  let s = Math.abs(h) || 12345;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/**
 * Pure function: decides the next action for an AI persona given world state and current timestamp.
 */
export function chooseAction(
  persona: any,
  now: Date,
  worldState: WorldState
): AiAction {
  const dailyCount = worldState.personaDailyActionCount ?? 0;
  if (dailyCount >= 6) {
    return {
      type: 'idle',
      personaId: persona.id,
      reasonCode: 'DAILY_CAP_REACHED'
    };
  }

  const rng = seededRng(`${persona.id}_tick_${worldState.tickId}`);

  // Circadian & Hawkes probability check
  const actProb = computeActionProbability(
    persona,
    now,
    worldState.lastActionTimestampMs ?? null
  );

  if (rng() > actProb) {
    return {
      type: 'idle',
      personaId: persona.id,
      reasonCode: 'CIRCADIAN_IDLE'
    };
  }

  // Persona is active! Select appropriate action category
  const roll = rng();

  // 1. Forecast action (if upcoming titles exist)
  if (roll < 0.35 && worldState.upcomingTitles && worldState.upcomingTitles.length > 0) {
    const titleIdx = Math.floor(rng() * worldState.upcomingTitles.length);
    const title = worldState.upcomingTitles[titleIdx];
    const forecast = computePersonaForecast(
      persona,
      title.modelProb ?? 0.5,
      title.crowdProb ?? 0.5,
      0.0,
      (rng() - 0.5) * 0.2
    );

    return {
      type: 'forecast',
      personaId: persona.id,
      reasonCode: 'UPCOMING_RELEASE_CALL',
      payload: {
        titleId: title.id,
        titleName: title.title,
        choice: forecast.choice,
        confidence: forecast.confidence,
        reason: forecast.reason
      }
    };
  }

  // 2. Review action (if released titles exist)
  if (roll < 0.65 && worldState.releasedTitles && worldState.releasedTitles.length > 0) {
    const titleIdx = Math.floor(rng() * worldState.releasedTitles.length);
    const title = worldState.releasedTitles[titleIdx];
    const factor = getItemFactor(title.id, title.genres || [], title.director || '');
    const prediction = predictPersonaRating(persona, factor, (rng() - 0.5) * 0.3);

    return {
      type: 'review',
      personaId: persona.id,
      reasonCode: 'CATALOG_TAKE',
      payload: {
        titleId: title.id,
        titleName: title.title,
        rating: prediction.rating,
        matchScore: prediction.matchScore
      }
    };
  }

  // 3. Like / Reply to peer post
  if (roll < 0.85 && worldState.recentPosts && worldState.recentPosts.length > 0) {
    const peerPosts = worldState.recentPosts.filter(p => p.authorId !== persona.id);
    if (peerPosts.length > 0) {
      const post = peerPosts[Math.floor(rng() * peerPosts.length)];
      const actionType = (roll < 0.75) ? 'like' : 'reply';

      return {
        type: actionType,
        personaId: persona.id,
        reasonCode: actionType === 'like' ? 'ENDORSES_PEER_TAKE' : 'THREADED_ENGAGEMENT',
        payload: {
          targetPostId: post.id,
          targetAuthorId: post.authorId,
          titleId: post.titleId
        }
      };
    }
  }

  // 4. Social Follow
  if (worldState.allPersonas && worldState.allPersonas.length > 1) {
    const target = sampleFollowTarget(
      persona,
      worldState.allPersonas,
      new Map(),
      worldState.existingFollows ?? new Set(),
      rng
    );

    if (target) {
      return {
        type: 'follow',
        personaId: persona.id,
        reasonCode: 'TASTE_AFFINITY_DISCOVERY',
        payload: {
          targetPersonaId: target.id
        }
      };
    }
  }

  return {
    type: 'idle',
    personaId: persona.id,
    reasonCode: 'NO_OPPORTUNITY_IN_WORLD'
  };
}
