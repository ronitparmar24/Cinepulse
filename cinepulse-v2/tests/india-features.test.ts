import test from 'node:test';
import assert from 'node:assert/strict';
import { formatInrCrores } from '../lib/fetchers/currency';
import { createMovieNightSession, getMovieNightSession } from '../lib/movieNight';
import { watchProviders } from '../lib/catalog';

test('Track M4: formatInrCrores converts USD to INR crores with date label', () => {
  const result = formatInrCrores(100_000_000, 83.5, '2026-10-04');
  assert.ok(result !== null);
  assert.ok(result.includes('₹835 cr'));
  assert.ok(result.includes('4 Oct 2026 rate'));
});

test('Track M4: formatInrCrores returns null if amount or rate missing', () => {
  assert.equal(formatInrCrores(null as any, 83.5, '2026-10-04'), null);
  assert.equal(formatInrCrores(100_000_000, 0, '2026-10-04'), null);
});

test('Track M3: watchProviders supports custom region parameter', async () => {
  const provsIN = await watchProviders('demo-1', 'IN');
  assert.equal(provsIN.region, 'IN');

  const provsUS = await watchProviders('demo-1', 'US');
  assert.equal(provsUS.region, 'US');
});

test('Track M: Movie Night session supports platform filtering', async () => {
  const host = { id: null, name: 'Host' };
  const session = await createMovieNightSession(host, {
    title: 'OTT Night',
    onlyOurPlatforms: true,
    platforms: ['Netflix', 'Prime Video']
  });

  assert.equal(session.onlyOurPlatforms, true);
  assert.deepEqual(session.platforms, ['Netflix', 'Prime Video']);
  assert.ok(session.candidates.length > 0);

  const retrieved = getMovieNightSession(session.sessionCode);
  assert.ok(retrieved !== null);
  assert.equal(retrieved.onlyOurPlatforms, true);
  assert.deepEqual(retrieved.platforms, ['Netflix', 'Prime Video']);
});
