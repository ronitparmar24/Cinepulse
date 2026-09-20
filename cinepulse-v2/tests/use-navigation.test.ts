import test from 'node:test';
import assert from 'node:assert/strict';
import { useNavigation } from '../components/hooks/useNavigation';
import { parseNavigation, navigationUrl } from '../lib/navigation';

test('useNavigation exports expected function', () => {
  assert.equal(typeof useNavigation, 'function');
});

test('parseNavigation and navigationUrl synchronize paths and query params', () => {
  const parsed1 = parseNavigation('?view=predictions&title=beyond-dunes&tab=reviews');
  assert.equal(parsed1.view, 'predictions');
  assert.equal(parsed1.titleId, 'beyond-dunes');
  assert.equal(parsed1.tab, 'reviews');

  const parsedDefault = parseNavigation('');
  assert.equal(parsedDefault.view, 'discover');
  assert.equal(parsedDefault.titleId, null);
  assert.equal(parsedDefault.tab, 'overview');

  const fakeLocation = new URL('http://127.0.0.1:3000/?view=discover') as unknown as Location;
  const url1 = navigationUrl(fakeLocation, { view: 'contrarian', titleId: null, tab: 'overview' });
  assert.match(url1, /view=contrarian/);

  const url2 = navigationUrl(fakeLocation, { view: 'discover', titleId: 'film-99', tab: 'pulse' });
  assert.match(url2, /title=film-99/);
  assert.match(url2, /tab=pulse/);
});
