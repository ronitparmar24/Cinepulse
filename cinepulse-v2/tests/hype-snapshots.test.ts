import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../lib/db';
import { saveSnapshot, computeHypeFeatures, getHypeRadarData } from '../lib/cron/snapshotHype';
import { buildWaterfall, getModelWeights } from '../lib/prediction/model';

test('Track L: hype_snapshots table exists with unique (title_id, date(taken_at)) index', () => {
  const d = db();
  const tables = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hype_snapshots'").all();
  assert.equal(tables.length, 1, 'hype_snapshots table must exist');

  const indexes = d.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='hype_snapshots'").all() as { name: string }[];
  const hasUnique = indexes.some(idx => idx.name === 'hype_snapshots_title_date' || idx.name === 'idx_hype_snapshots_title_date');
  assert(hasUnique, 'Unique (title_id, date) index must exist on hype_snapshots');
});

test('Track L: snapshot save is idempotent — duplicate daily writes do not throw or duplicate', () => {
  const testTitleId = 'test_title_idempotency_1';
  const takenAt = '2026-10-04T10:00:00.000Z';

  // First save
  const saved1 = saveSnapshot(
    testTitleId,
    takenAt,
    { wikiViews7d: 1250, ytViews: 45000, tmdbPopularity: 42.5 },
    { wikipedia: true, youtube: true }
  );
  assert.equal(saved1, true);

  // Duplicate save on the same day
  const takenAtLaterSameDay = '2026-10-04T18:30:00.000Z';
  const saved2 = saveSnapshot(
    testTitleId,
    takenAtLaterSameDay,
    { wikiViews7d: 1300, ytViews: 46000, tmdbPopularity: 43.0 },
    { wikipedia: true, youtube: true }
  );
  // INSERT OR IGNORE succeeds without error
  assert.equal(saved2, true);

  // Check row count for this title on this date — must remain exactly 1
  const d = db();
  const rows = d.prepare(
    'SELECT COUNT(*) as count FROM hype_snapshots WHERE title_id = ? AND date(taken_at) = ?'
  ).get(testTitleId, '2026-10-04') as { count: number };

  assert.equal(rows.count, 1, 'Duplicate same-day snapshot must be ignored (idempotent)');

  // Clean up
  d.prepare('DELETE FROM hype_snapshots WHERE title_id = ?').run(testTitleId);
});

test('Track L: computeHypeFeatures strictly ignores data after cutoff (release_date - 14d)', () => {
  const testTitleId = 'test_title_cutoff_2';
  const releaseDate = '2026-11-01'; // 14 days before is 2026-10-18

  const d = db();
  d.prepare('DELETE FROM hype_snapshots WHERE title_id = ?').run(testTitleId);

  // 1. Insert 3 snapshots BEFORE the 14-day cutoff (e.g. Oct 10, Oct 12, Oct 14)
  saveSnapshot(testTitleId, '2026-10-10T00:00:00.000Z', { wikiSlope: 0.1, ytViews: 10000, tmdbPopularity: 20 }, {});
  saveSnapshot(testTitleId, '2026-10-12T00:00:00.000Z', { wikiSlope: 0.2, ytViews: 20000, tmdbPopularity: 25 }, {});
  saveSnapshot(testTitleId, '2026-10-14T00:00:00.000Z', { wikiSlope: 0.3, ytViews: 30000, tmdbPopularity: 30 }, {});

  // 2. Insert 2 snapshots AFTER the cutoff (e.g. Oct 25, Oct 30) - these MUST BE IGNORED
  saveSnapshot(testTitleId, '2026-10-25T00:00:00.000Z', { wikiSlope: 9.9, ytViews: 999999, tmdbPopularity: 99 }, {});
  saveSnapshot(testTitleId, '2026-10-30T00:00:00.000Z', { wikiSlope: 9.9, ytViews: 999999, tmdbPopularity: 99 }, {});

  const features = computeHypeFeatures(testTitleId, releaseDate);

  // Verify only 3 pre-cutoff snapshots were used
  assert.equal(features.snapshotCount, 3);
  assert.equal(features.dataQualityWarning, null);

  // Slope should be average of 0.1, 0.2, 0.3 = 0.2 (NOT contaminated by 9.9)
  assert.ok(features.wikiSlope28d !== null);
  assert.ok(Math.abs(features.wikiSlope28d - 0.2) < 0.001);

  // Clean up
  d.prepare('DELETE FROM hype_snapshots WHERE title_id = ?').run(testTitleId);
});

test('Track L: getHypeRadarData returns hasEnoughData = false when < 3 data points', () => {
  const testTitleId = 'test_title_radar_sparse';
  const d = db();
  d.prepare('DELETE FROM hype_snapshots WHERE title_id = ?').run(testTitleId);

  // Only 2 points
  saveSnapshot(testTitleId, '2026-10-01T00:00:00.000Z', { wikiViews7d: 500, ytViews: 1000 }, {});
  saveSnapshot(testTitleId, '2026-10-02T00:00:00.000Z', { wikiViews7d: 600, ytViews: 1200 }, {});

  const sparse = getHypeRadarData(testTitleId);
  assert.equal(sparse.hasEnoughData, false);
  assert.equal(sparse.points.length, 2);

  // Add 3rd point
  saveSnapshot(testTitleId, '2026-10-03T00:00:00.000Z', { wikiViews7d: 700, ytViews: 1500 }, {});
  const full = getHypeRadarData(testTitleId);
  assert.equal(full.hasEnoughData, true);
  assert.equal(full.points.length, 3);
  assert.equal(full.dateRange?.start, '2026-10-01');
  assert.equal(full.dateRange?.end, '2026-10-03');

  // Clean up
  d.prepare('DELETE FROM hype_snapshots WHERE title_id = ?').run(testTitleId);
});

test('Track K5: Waterfall identity — sum of feature contributions + intercept == predictedLogRevenue', () => {
  const weights = getModelWeights();
  const reg = weights.regression;

  const sampleFeatureMap: Record<string, number> = {
    log10_budget: 8.3,
    runtime: 135,
    is_franchise: 1,
    sequel_index: 2,
    release_month: 7,
    is_holiday_window: 0,
    is_summer_window: 1,
    competing_release_count: 2,
    cast_star_power: 75,
    director_prior_median_rev: 450,
    studio_tier: 1,
    genre_action: 1,
    genre_adventure: 0,
    cert_pg13: 1,
  };

  const explanation = buildWaterfall(sampleFeatureMap, reg.coefficients, reg.intercept, 250_000_000);

  // K5 identity check: sumContributions + intercept == predictedLogRevenue
  assert.ok(
    Math.abs(explanation.intercept + explanation.sumContributions - explanation.predictedLogRevenue) < 1e-9,
    'Identity violation: sum of contributions + intercept must equal predicted log revenue'
  );

  // Waterfall steps should be non-empty and have valid structure
  assert.ok(explanation.waterfall.length > 0);
  assert.equal(explanation.waterfall[0].name, 'Historical Baseline');
  assert.ok(explanation.topDrivers.length > 0);
});
