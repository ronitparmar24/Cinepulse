import test from 'node:test';
import assert from 'node:assert/strict';
import { useCatalogHealth, computeHealthLabel } from '../components/hooks/useCatalogHealth';
import type { Config } from '../lib/types';

test('useCatalogHealth exports expected hook and helper', () => {
  assert.equal(typeof useCatalogHealth, 'function');
  assert.equal(typeof computeHealthLabel, 'function');
});

test('computeHealthLabel returns correct status labels for various configurations', () => {
  assert.equal(computeHealthLabel(null), 'Checking catalog…');

  const demoConfig: Config = {
    mode: 'demo',
    features: { forecasts: true, reviews: true },
    limits: { maxForecasts: 10 },
    health: { status: 'verified', checkedAt: new Date().toISOString() }
  };
  assert.equal(computeHealthLabel(demoConfig), 'Demo catalog · Fictional titles');

  const tmdbVerified: Config = {
    mode: 'tmdb',
    features: { forecasts: true, reviews: true },
    limits: { maxForecasts: 10 },
    health: { status: 'verified', checkedAt: new Date().toISOString() }
  };
  assert.equal(computeHealthLabel(tmdbVerified), 'TMDB catalog · Verified reachable');

  const tmdbChecking: Config = {
    mode: 'tmdb',
    features: { forecasts: true, reviews: true },
    limits: { maxForecasts: 10 },
    health: { status: 'checking', checkedAt: new Date().toISOString() }
  };
  assert.equal(computeHealthLabel(tmdbChecking), 'TMDB catalog · Checking…');

  const tmdbConfigured: Config = {
    mode: 'tmdb',
    features: { forecasts: true, reviews: true },
    limits: { maxForecasts: 10 },
    health: { status: 'configured', checkedAt: new Date().toISOString() }
  };
  assert.equal(computeHealthLabel(tmdbConfigured), 'TMDB catalog · Not checked');

  const tmdbUnavailable: Config = {
    mode: 'tmdb',
    features: { forecasts: true, reviews: true },
    limits: { maxForecasts: 10 },
    health: { status: 'unavailable', checkedAt: new Date().toISOString() }
  };
  assert.equal(computeHealthLabel(tmdbUnavailable), 'TMDB catalog · Unavailable');
});
