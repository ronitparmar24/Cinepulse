import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Config } from '@/lib/types';
import { api } from '../client';

export interface UseCatalogHealthOptions {
  toast?: (text: string) => void;
}

export interface UseCatalogHealthReturn {
  config: Config | null;
  setConfig: React.Dispatch<React.SetStateAction<Config | null>>;
  healthBusy: boolean;
  healthLabel: string;
  retryHealth: () => Promise<void>;
}

export function computeHealthLabel(config: Config | null): string {
  if (!config) return 'Checking catalog…';
  if (config.mode === 'demo') return 'Demo catalog · Fictional titles';
  const health = config.health;
  if (health?.status === 'verified') return 'TMDB catalog · Verified reachable';
  if (health?.status === 'checking') return 'TMDB catalog · Checking…';
  // "configured" only means the token exists and the first check has not reported back yet.
  if (health?.status === 'configured') return 'TMDB catalog · Connecting…';
  return 'TMDB catalog · Unavailable';
}

/** Offer "Retry connection" only after a check has actually failed, never while one is pending. */
export function shouldOfferHealthRetry(config: Config | null): boolean {
  return config?.mode === 'tmdb' && config.health?.status === 'unavailable';
}

const unavailableHealth = (message: string): Config['health'] => ({
  status: 'unavailable',
  checkedAt: new Date().toISOString(),
  message,
});

export function useCatalogHealth(options: UseCatalogHealthOptions = {}): UseCatalogHealthReturn {
  const { toast } = options;
  const [config, setConfig] = useState<Config | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const applyHealth = (health: Config['health']) =>
      setConfig((previous) => (previous ? { ...previous, health } : previous));

    api<Config>('/config')
      .then(async (base) => {
        if (!active) return;
        // Show "Connecting…" while the first reachability check runs, not a stale "Not checked".
        setConfig(base.mode === 'tmdb' && base.health?.status === 'configured'
          ? { ...base, health: { ...base.health, status: 'checking' } }
          : base);
        if (base.mode !== 'tmdb') return;
        let first: Config['health'];
        try {
          first = (await api<Config>('/config/health')).health;
        } catch {
          first = unavailableHealth('The catalog status check did not complete.');
        }
        if (!active) return;
        applyHealth(first);
        // A cold server or a brief network blip often fails the very first check: retry once
        // quietly before asking the visitor to press anything.
        if (first?.status === 'unavailable') {
          retryTimer = setTimeout(() => {
            api<Config>('/config/health/retry', 'POST')
              .then((next) => { if (active) applyHealth(next.health); })
              .catch(() => {});
          }, 4000);
        }
      })
      .catch((e: Error) => {
        if (active && toast) {
          toast(e.message || 'Catalog status is unavailable.');
        }
      });

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [toast]);

  const retryHealth = useCallback(async () => {
    if (healthBusy || config?.mode !== 'tmdb') return;
    setHealthBusy(true);
    setConfig((previous) =>
      previous
        ? {
            ...previous,
            health: { ...previous.health, status: 'checking', message: 'Checking the catalog provider…' },
          }
        : previous
    );
    try {
      const next = await api<Config>('/config/health/retry', 'POST');
      setConfig((previous) => (previous ? { ...previous, health: next.health } : next));
    } catch (e) {
      setConfig((previous) =>
        previous
          ? {
              ...previous,
              health: {
                status: 'unavailable',
                checkedAt: new Date().toISOString(),
                message: 'The connection check failed. Retry when the local server is reachable.',
              },
            }
          : previous
      );
      if (toast) toast((e as Error).message);
    } finally {
      setHealthBusy(false);
    }
  }, [healthBusy, config?.mode, toast]);

  const healthLabel = useMemo(() => computeHealthLabel(config), [config]);

  return { config, setConfig, healthBusy, healthLabel, retryHealth };
}
