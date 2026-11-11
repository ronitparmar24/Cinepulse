/**
 * CinePulse v10: Anonymous Client-Side Feedback Persistence & Synchronization
 */
import { api } from '../components/client';
import type { Title } from './types';
import type { FeedbackSignal, FeedbackReason } from './feedback/signals';

export interface LocalFeedbackItem {
  title: Title | { id: string; title: string; [key: string]: any };
  signal: FeedbackSignal;
  reason?: FeedbackReason | null;
  surface: string;
  timestamp: number;
}

const STORAGE_KEY = 'cinepulse_local_feedback';

export function getLocalFeedback(): LocalFeedbackItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalFeedback(
  title: Title | { id: string; title: string; [key: string]: any },
  signal: FeedbackSignal,
  reason?: FeedbackReason | null,
  surface = 'discovery'
): void {
  if (typeof window === 'undefined') return;
  try {
    const items = getLocalFeedback();
    const cleanId = String(title.id);
    const filtered = items.filter((it) => String(it.title?.id) !== cleanId);
    filtered.push({
      title,
      signal,
      reason: reason || null,
      surface,
      timestamp: Date.now(),
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent('cinepulse:local_feedback_updated'));
  } catch {}
}

export function removeLocalFeedback(titleId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const items = getLocalFeedback();
    const cleanId = String(titleId);
    const filtered = items.filter((it) => String(it.title?.id) !== cleanId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent('cinepulse:local_feedback_updated'));
  } catch {}
}

export function getLocalExcludedIds(): string[] {
  const items = getLocalFeedback();
  return items
    .filter((it) => it.signal === 'not_interested' || it.signal === 'already_seen' || it.signal === 'snooze')
    .map((it) => String(it.title?.id))
    .filter(Boolean);
}

/**
 * On login, merges all anonymous feedback items into the account.
 */
export async function syncLocalFeedbackToAccount(): Promise<number> {
  const items = getLocalFeedback();
  if (items.length === 0) return 0;
  try {
    const res = await api<{ ok: boolean; mergedCount: number }>('/feedback/merge', 'POST', { items });
    if (res?.ok) {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('cinepulse:local_feedback_updated'));
      return res.mergedCount || 0;
    }
  } catch {}
  return 0;
}
