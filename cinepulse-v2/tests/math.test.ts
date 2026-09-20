import test from 'node:test';
import assert from 'node:assert/strict';
import { wilson, isForecastOpen } from '../lib/pulse';

test('forecasts close on release day and remain closed for missing dates',()=>{
 assert.equal(isForecastOpen('2027-01-02','2027-01-01'),true);
 assert.equal(isForecastOpen('2027-01-01','2027-01-01'),false);
 assert.equal(isForecastOpen('2026-12-31','2027-01-01'),false);
 assert.equal(isForecastOpen(null,'2027-01-01'),false);
 assert.equal(isForecastOpen('not-a-date','2027-01-01'),false);
});
import { demoCatalogForTests } from '../lib/catalog';

test('Wilson interval handles empty, all-success, and all-failure samples', () => {
  assert.equal(wilson(0,0), null);
  const allSuccess=wilson(10,10)!; assert.ok(allSuccess[0] > 0.5 && allSuccess[1] === 1);
  const allFail=wilson(0,10)!; assert.ok(allFail[0] === 0 && allFail[1] < 0.5);
  const half=wilson(5,10)!; assert.ok(half[0] < .5 && half[1] > .5);
});

test('demo catalog contains metadata only, never synthetic community statistics', () => {
  const items=demoCatalogForTests(); assert.ok(items.length > 0);
  for (const item of items) { assert.match(item.id,/^demo-/); assert.equal(item.voteAverage,null); assert.equal(item.popularity,null); assert.equal(item.cast.length,0); }
});
