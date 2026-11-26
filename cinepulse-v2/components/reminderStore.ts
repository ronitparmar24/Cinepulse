'use client';
/**
 * Which titles the signed-in member has a release reminder for, shared across the app and
 * loaded once per session. Updates are optimistic and roll back if the server refuses.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { api } from './client';

export interface ReminderPrefsState { watchlist: boolean; email: boolean; productUpdates?: boolean }

let ids = new Set<string>();
let prefs: ReminderPrefsState | null = null;
let loadedFor: string | null = null;
let loading: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function loadReminders(userId: string | null | undefined, force = false): Promise<void> {
  if (!userId) {
    if (loadedFor) { ids = new Set(); prefs = null; loadedFor = null; emit(); }
    return Promise.resolve();
  }
  if (!force && loadedFor === userId) return loading ?? Promise.resolve();
  loadedFor = userId;
  loading = api<{ reminders: Array<{ titleId: string }>; prefs: ReminderPrefsState }>('/reminders')
    .then((res) => {
      if (loadedFor !== userId) return;
      ids = new Set(res.reminders.map((r) => r.titleId));
      prefs = res.prefs;
      emit();
    })
    .catch(() => { if (loadedFor === userId) loadedFor = null; })
    .finally(() => { loading = null; });
  return loading;
}

/** Re-reads reminders after something that may have created one (e.g. adding to the watchlist). */
export function refreshReminders(): void {
  if (loadedFor) void loadReminders(loadedFor, true);
}

export function useReminder(titleId: string, userId: string | null | undefined): boolean {
  useEffect(() => { void loadReminders(userId); }, [userId]);
  return useSyncExternalStore(subscribe, () => ids.has(titleId), () => false);
}

export function useReminderPrefs(userId: string | null | undefined): ReminderPrefsState | null {
  useEffect(() => { void loadReminders(userId); }, [userId]);
  return useSyncExternalStore(subscribe, () => prefs, () => null);
}

export async function setReminder(titleId: string, on: boolean): Promise<void> {
  const had = ids.has(titleId);
  if (had === on) return;
  ids = new Set(ids);
  if (on) ids.add(titleId); else ids.delete(titleId);
  emit();
  try {
    await api(`/reminders/${encodeURIComponent(titleId)}`, on ? 'PUT' : 'DELETE');
  } catch (e) {
    ids = new Set(ids);
    if (had) ids.add(titleId); else ids.delete(titleId);
    emit();
    throw e;
  }
}

export async function saveReminderPrefs(next: Partial<ReminderPrefsState>): Promise<ReminderPrefsState> {
  const before = prefs;
  prefs = { ...(prefs ?? { watchlist: true, email: false }), ...next };
  emit();
  try {
    const res = await api<{ prefs: ReminderPrefsState }>('/reminders/settings', 'PUT', next);
    prefs = res.prefs;
    emit();
    refreshReminders();
    return res.prefs;
  } catch (e) {
    prefs = before;
    emit();
    throw e;
  }
}

/** For tests and debugging. */
export function reminderStoreVersion(): number { return version; }
