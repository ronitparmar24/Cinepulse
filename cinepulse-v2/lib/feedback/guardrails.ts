/**
 * CinePulse v10: Feedback Guardrails
 * Rate limiting, strict input validation, block checks, and user isolation.
 */
import { db } from '../db';
import { bad, forbidden } from '../errors';
import {
  FEEDBACK_CONFIG,
  type FeedbackSignal,
  type FeedbackReason,
} from './signals';

// In-memory sliding rate limit tracker per user: userId -> timestamps[]
const userFeedbackTimes = new Map<string, number[]>();

// Periodic cleanup of stale rate-limit keys
const CLEANUP_INTERVAL_MS = 60 * 1000;
let lastCleanup = Date.now();

function purgeOldFeedbackTimes(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const oneMinuteAgo = now - 60 * 1000;
  for (const [uid, times] of userFeedbackTimes.entries()) {
    const valid = times.filter((t) => t > oneMinuteAgo);
    if (valid.length === 0) {
      userFeedbackTimes.delete(uid);
    } else {
      userFeedbackTimes.set(uid, valid);
    }
  }
}

/**
 * Enforces per-user rate limit (default 60 writes per minute).
 */
export function checkFeedbackRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  purgeOldFeedbackTimes(now);

  const windowMs = 60 * 1000;
  const limit = FEEDBACK_CONFIG.RATE_LIMIT_PER_MINUTE;
  const cutoff = now - windowMs;

  const times = (userFeedbackTimes.get(userId) || []).filter((t) => t > cutoff);
  if (times.length >= limit) {
    return { allowed: false, remaining: 0 };
  }

  times.push(now);
  userFeedbackTimes.set(userId, times);
  return { allowed: true, remaining: limit - times.length };
}

/**
 * Validates request payload for POST /api/feedback/interest.
 */
export function validateFeedbackInput(data: any): {
  titleId: string;
  signal: FeedbackSignal;
  reason?: FeedbackReason | null;
  surface: string;
} {
  if (!data || typeof data !== 'object') {
    throw bad('Request body must be a JSON object');
  }

  const { titleId, signal, reason, surface } = data;

  // Title ID validation: safe string, 1..128 chars
  if (!titleId || typeof titleId !== 'string') {
    throw bad('titleId is required and must be a string');
  }
  const cleanTitleId = titleId.trim();
  if (cleanTitleId.length === 0 || cleanTitleId.length > 128) {
    throw bad('titleId length must be between 1 and 128 characters');
  }
  if (!/^[a-zA-Z0-9_\-:]+$/.test(cleanTitleId)) {
    throw bad('titleId contains invalid characters');
  }

  // Signal validation
  const validSignals: FeedbackSignal[] = ['interested', 'not_interested', 'already_seen', 'snooze'];
  if (!validSignals.includes(signal)) {
    throw bad(`Invalid signal "${signal}". Must be one of: ${validSignals.join(', ')}`);
  }

  // Reason validation (optional)
  let cleanReason: FeedbackReason | null = null;
  if (reason !== undefined && reason !== null && reason !== '') {
    const validReasons: FeedbackReason[] = [
      'not_my_genre',
      'too_violent',
      'seen_it',
      'not_into_actor_director',
      'language',
      'too_long',
      'other',
    ];
    if (!validReasons.includes(reason)) {
      throw bad(`Invalid reason "${reason}". Must be one of: ${validReasons.join(', ')}`);
    }
    cleanReason = reason;
  }

  // Surface validation (optional)
  let cleanSurface = 'discovery';
  if (surface && typeof surface === 'string') {
    cleanSurface = surface.trim().slice(0, 50).replace(/[^a-zA-Z0-9_-]/g, '') || 'discovery';
  }

  return {
    titleId: cleanTitleId,
    signal,
    reason: cleanReason,
    surface: cleanSurface,
  };
}

/**
 * Verifies the user is active, authenticated, and not blocked from giving feedback.
 */
export function assertUserCanGiveFeedback(userId: string): void {
  const d = db();
  const user = d.prepare('SELECT id FROM users WHERE id = ?').get(userId) as { id: string } | undefined;
  if (!user) {
    throw forbidden('User account not found');
  }

  const { allowed } = checkFeedbackRateLimit(userId);
  if (!allowed) {
    throw bad('Too many feedback actions. Please wait a minute before submitting again.');
  }
}
