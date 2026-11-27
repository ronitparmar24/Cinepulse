import { useState, useCallback, useRef, useEffect } from 'react';

/** One toast in the stack. `leaving` is set for the short exit animation before it is removed. */
export interface ToastItem {
  id: number;
  text: string;
  leaving: boolean;
}

export interface UseToastReturn {
  /** Newest visible message ('' when none): kept for callers that only show one toast. */
  message: string;
  /** Every toast on screen, oldest first, including ones playing their exit animation. */
  toasts: ToastItem[];
  toast: (text: string) => void;
  /** Dismisses every toast. */
  clearToast: () => void;
  /** Dismisses one toast. */
  dismissToast: (id: number) => void;
}

/** How long a dismissed toast stays mounted so it can animate out (matches polish.css). */
export const TOAST_EXIT_MS = 240;
/** At most this many toasts are visible at once; older ones are dismissed. */
const MAX_VISIBLE = 3;

export function useToast(durationMs = 4500): UseToastReturn {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Mirror of `toasts` so callbacks can read the latest list without side effects in updaters.
  const listRef = useRef<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const commit = useCallback((next: ToastItem[]) => {
    listRef.current = next;
    setToasts(next);
  }, []);

  const clearTimer = (id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  };

  const dismissToast = useCallback((id: number) => {
    const item = listRef.current.find((t) => t.id === id);
    if (!item || item.leaving) return;
    clearTimer(id);
    commit(listRef.current.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    timers.current.set(id, setTimeout(() => {
      timers.current.delete(id);
      commit(listRef.current.filter((t) => t.id !== id));
    }, TOAST_EXIT_MS));
  }, [commit]);

  const schedule = useCallback((id: number) => {
    clearTimer(id);
    timers.current.set(id, setTimeout(() => dismissToast(id), durationMs));
  }, [dismissToast, durationMs]);

  const clearToast = useCallback(() => {
    listRef.current.filter((t) => !t.leaving).forEach((t) => dismissToast(t.id));
  }, [dismissToast]);

  const toast = useCallback((text: string) => {
    const visible = listRef.current.filter((t) => !t.leaving);
    const newest = visible[visible.length - 1];
    // Same message again: keep the toast that is already showing and restart its timer.
    if (newest && newest.text === text) {
      schedule(newest.id);
      return;
    }
    const id = nextId.current++;
    commit([...listRef.current, { id, text, leaving: false }]);
    schedule(id);
    const overflow = visible.length + 1 - MAX_VISIBLE;
    if (overflow > 0) visible.slice(0, overflow).forEach((t) => dismissToast(t.id));
  }, [commit, dismissToast, schedule]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const visible = toasts.filter((t) => !t.leaving);
  const message = visible.length ? visible[visible.length - 1].text : '';
  return { message, toasts, toast, clearToast, dismissToast };
}
