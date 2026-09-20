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
  if (health?.status === 'configured') return 'TMDB catalog · Not checked';
  return 'TMDB catalog · Unavailable';
}

export function useCatalogHealth(options: UseCatalogHealthOptions = {}): UseCatalogHealthReturn {
  const { toast } = options;
  const [config, setConfig] = useState<Config | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<Config>('/config')
      .then((base) => {
        if (!active) return;
        setConfig(base);
        return api<Config>('/config/health');
      })
      .then((health) => {
        if (active && health) {
          setConfig((previous) => (previous ? { ...previous, health: health.health } : health));
        }
      })
      .catch((e: Error) => {
        if (active && toast) {
          toast(e.message || 'Catalog status is unavailable.');
        }
      });

    return () => {
      active = false;
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
