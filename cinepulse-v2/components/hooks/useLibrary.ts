import { useState, useCallback, useRef, useEffect } from 'react';
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
  updateLibrary: (title: Title, status: LibraryEntry['status'], rating?: number | null) => Promise<void>;
  confirmRemoval: () => Promise<void>;
}

export function useLibrary(options: UseLibraryOptions): UseLibraryReturn {
  const { user, needAuth, toast, refreshAuth } = options;
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [pendingRemoval, setPendingRemoval] = useState<{ title: Title; entry: LibraryEntry } | null>(null);

  const busyRef = useRef(new Set<string>());

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

  const libraryMutation = useCallback(
    async (title: Title, operation: () => Promise<unknown>, success: string) => {
      if (!needAuth() || busyRef.current.has(title.id)) return;
      busyRef.current.add(title.id);
      setBusyIds(new Set(busyRef.current));
      try {
        await operation();
        if (refreshAuth) await refreshAuth();
        await refreshLibrary();
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

  const updateLibrary = useCallback(
    async (title: Title, status: LibraryEntry['status'], rating?: number | null) => {
      await libraryMutation(
        title,
        () => api(`/library/${title.id}`, 'PUT', { status, ...(rating !== undefined ? { rating } : {}) }),
        'Your library is up to date.'
      );
    },
    [libraryMutation]
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
