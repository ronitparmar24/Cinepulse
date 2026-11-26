import { useState, useCallback, useRef, useEffect } from 'react';
import { refreshReminders } from '../reminderStore';
import type { LibraryEntry, Title, User } from '@/lib/types';
import { api } from '../client';

export interface UseLibraryOptions {
  user: User | null;
  needAuth: () => boolean;
  toast: (text: string) => void;
  refreshAuth?: () => Promise<unknown>;
}

export interface UseLibraryReturn {
  library: LibraryEntry[];
  setLibrary: React.Dispatch<React.SetStateAction<LibraryEntry[]>>;
  busyIds: Set<string>;
  pendingRemoval: { title: Title; entry: LibraryEntry } | null;
  setPendingRemoval: React.Dispatch<React.SetStateAction<{ title: Title; entry: LibraryEntry } | null>>;
  refreshLibrary: () => Promise<void>;
  save: (title: Title) => Promise<void>;
  remove: (title: Title) => Promise<void>;
  updateLibrary: (title: Title, status: LibraryEntry['status'], rating?: number | null, opts?: { quiet?: boolean }) => Promise<void>;
  confirmRemoval: () => Promise<void>;
}

export function useLibrary(options: UseLibraryOptions): UseLibraryReturn {
  const { user, needAuth, toast, refreshAuth } = options;
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [pendingRemoval, setPendingRemoval] = useState<{ title: Title; entry: LibraryEntry } | null>(null);

  const busyRef = useRef(new Set<string>());
  // Status/rating changes: the latest wanted state per title, and which titles have a save running.
  const wanted = useRef(new Map<string, { status: LibraryEntry['status']; rating: number | null }>());
  const saving = useRef(new Set<string>());
  const libraryRef = useRef<LibraryEntry[]>([]);

  const refreshLibrary = useCallback(async () => {
    if (!user) {
      setLibrary([]);
      return;
    }
    try {
      const res = await api<{ items: LibraryEntry[] }>('/library');
      setLibrary(res.items);
    } catch {
      setLibrary([]);
    }
  }, [user]);

  useEffect(() => {
    refreshLibrary().catch(() => {});
  }, [refreshLibrary]);
  useEffect(() => { libraryRef.current = library; }, [library]);

  const libraryMutation = useCallback(
    async (title: Title, operation: () => Promise<unknown>, success: string) => {
      if (!needAuth() || busyRef.current.has(title.id)) return;
      busyRef.current.add(title.id);
      setBusyIds(new Set(busyRef.current));
      try {
        await operation();
        if (refreshAuth) await refreshAuth();
        await refreshLibrary();
        refreshReminders(); // watchlisting an upcoming title may have set a release reminder
        toast(success);
      } catch (e) {
        toast((e as Error).message);
      } finally {
        busyRef.current.delete(title.id);
        setBusyIds(new Set(busyRef.current));
      }
    },
    [needAuth, refreshAuth, refreshLibrary, toast]
  );

  const remove = useCallback(
    async (title: Title) => {
      const entry = library.find((x) => x.title.id === title.id);
      if (!entry) return;
      if (entry.status !== 'watchlist' || entry.rating !== null) {
        setPendingRemoval({ title, entry });
        return;
      }
      await libraryMutation(title, () => api(`/library/${title.id}`, 'DELETE'), 'Removed from your library.');
    },
    [library, libraryMutation]
  );

  const save = useCallback(
    async (title: Title) => {
      const exists = library.some((x) => x.title.id === title.id);
      if (exists) {
        await remove(title);
        return;
      }
      await libraryMutation(
        title,
        () => api(`/library/${title.id}`, 'PUT', { status: 'watchlist' }),
        'Saved. Your next movie night is taking shape.'
      );
    },
    [library, remove, libraryMutation]
  );

  /**
   * Status and rating changes update the screen at once and save in the background. Quick
   * successive taps (3★ then 4★) are never dropped: only the latest wanted state is sent once the
   * running save finishes. A failed save puts the library back as the server has it.
   */
  const updateLibrary = useCallback(
    async (title: Title, status: LibraryEntry['status'], rating?: number | null, opts: { quiet?: boolean } = {}) => {
      if (!needAuth()) return;
      const current = libraryRef.current.find((x) => x.title.id === title.id);
      // Ratings belong to watched titles; changing status never silently clears an existing rating.
      const nextRating = status === 'watched' ? (rating !== undefined ? rating : current?.rating ?? null) : null;
      const optimistic: LibraryEntry = { title: current?.title ?? title, status, rating: nextRating, updatedAt: new Date().toISOString() };
      setLibrary((list) => {
        const next = list.filter((x) => x.title.id !== title.id);
        return [optimistic, ...next];
      });
      wanted.current.set(title.id, { status, rating: nextRating });
      if (saving.current.has(title.id)) return; // the running save picks up the latest state
      saving.current.add(title.id);
      const statusChanged = current?.status !== status;
      try {
        while (wanted.current.has(title.id)) {
          const op = wanted.current.get(title.id)!;
          wanted.current.delete(title.id);
          await api(`/library/${title.id}`, 'PUT', { status: op.status, ...(op.status === 'watched' ? { rating: op.rating } : {}) });
        }
        if (!opts.quiet) {
          const r = libraryRef.current.find((x) => x.title.id === title.id);
          toast(statusChanged
            ? (status === 'watched' ? 'Marked as watched.' : status === 'watching' ? 'Marked as watching.' : 'On your watchlist.')
            : r?.rating ? `Rated ${r.rating}★.` : 'Saved.');
        }
        // Counts, goals and reminders catch up quietly, without blocking the screen.
        if (refreshAuth) void refreshAuth().catch(() => {});
        refreshReminders();
      } catch (e) {
        wanted.current.delete(title.id);
        toast((e as Error).message);
        await refreshLibrary(); // put it back as the server has it
      } finally {
        saving.current.delete(title.id);
      }
    },
    [needAuth, refreshAuth, refreshLibrary, toast]
  );

  const confirmRemoval = useCallback(async () => {
    if (!pendingRemoval) return;
    const { title } = pendingRemoval;
    setPendingRemoval(null);
    await libraryMutation(title, () => api(`/library/${title.id}`, 'DELETE'), 'Removed from your library.');
  }, [pendingRemoval, libraryMutation]);

  return {
    library,
    setLibrary,
    busyIds,
    pendingRemoval,
    setPendingRemoval,
    refreshLibrary,
    save,
    remove,
    updateLibrary,
    confirmRemoval,
  };
}
