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
    region: 'US',
    message: 'Demo mode active',
    health: { status: 'verified', message: 'Demo ready', checkedAt: new Date().toISOString() }
  };
  assert.equal(computeHealthLabel(demoConfig), 'Demo catalog · Fictional titles');

  const tmdbVerified: Config = {
    mode: 'tmdb',
    region: 'US',
    message: 'Live TMDB active',
    health: { status: 'verified', message: 'Reachable', checkedAt: new Date().toISOString() }
  };
  assert.equal(computeHealthLabel(tmdbVerified), 'TMDB catalog · Verified reachable');

  const tmdbChecking: Config = {
    mode: 'tmdb',
    region: 'US',
    message: 'Live TMDB active',
    health: { status: 'checking', message: 'Checking', checkedAt: new Date().toISOString() }
  };
  assert.equal(computeHealthLabel(tmdbChecking), 'TMDB catalog · Checking…');

  const tmdbConfigured: Config = {
    mode: 'tmdb',
    region: 'US',
    message: 'Live TMDB active',
    health: { status: 'configured', message: 'Configured', checkedAt: new Date().toISOString() }
  };
  assert.equal(computeHealthLabel(tmdbConfigured), 'TMDB catalog · Not checked');

  const tmdbUnavailable: Config = {
    mode: 'tmdb',
    region: 'US',
    message: 'Live TMDB active',
    health: { status: 'unavailable', message: 'Offline', checkedAt: new Date().toISOString() }
  };
  assert.equal(computeHealthLabel(tmdbUnavailable), 'TMDB catalog · Unavailable');
});
