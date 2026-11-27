import test from 'node:test';
import assert from 'node:assert/strict';
import { countdownLabel, daysUntil, monthGrid, releaseWeekLabel, shiftMonth } from '../lib/releaseCountdown';

test('daysUntil counts whole calendar days and rejects bad dates', () => {
  assert.equal(daysUntil('2026-12-02', '2026-11-27'), 5);
  assert.equal(daysUntil('2026-11-27', '2026-11-27'), 0);
  assert.equal(daysUntil('2026-11-20', '2026-11-27'), -7);
  assert.equal(daysUntil('2027-03-01', '2027-02-28'), 1);
  assert.equal(daysUntil(null, '2026-11-27'), null);
  assert.equal(daysUntil('2026-13', '2026-11-27'), null);
});

test('countdownLabel gives short chip labels with a tone', () => {
  const today = '2026-11-27';
  assert.deepEqual(countdownLabel('2026-11-27', today), { label: 'Today', tone: 'today' });
  assert.deepEqual(countdownLabel('2026-11-28', today), { label: 'Tomorrow', tone: 'soon' });
  assert.deepEqual(countdownLabel('2026-12-02', today), { label: 'in 5 days', tone: 'soon' });
  assert.deepEqual(countdownLabel('2026-12-07', today), { label: 'in 10 days', tone: 'later' });
  assert.equal(countdownLabel('2026-12-18', today)?.label, 'in 3 wks');
  assert.equal(countdownLabel('2027-04-27', today)?.label, 'in 5 mos');
  assert.equal(countdownLabel('2028-11-27', today)?.label, 'in 2 yrs');
  assert.deepEqual(countdownLabel('2026-11-20', today), { label: 'Out now', tone: 'out' });
  assert.equal(countdownLabel('2026-09-01', today), null);
  assert.equal(countdownLabel(null, today), null);
});

test('monthGrid is Monday-first and padded to whole weeks', () => {
  const nov = monthGrid('2026-11'); // 1 Nov 2026 is a Sunday
  assert.equal(nov.length % 7, 0);
  assert.deepEqual(nov.slice(0, 7), [null, null, null, null, null, null, '2026-11-01']);
  assert.equal(nov.filter(Boolean).length, 30);
  const feb = monthGrid('2027-02'); // 1 Feb 2027 is a Monday
  assert.equal(feb[0], '2027-02-01');
  assert.equal(feb.filter(Boolean).length, 28);
});

test('shiftMonth crosses year boundaries; week labels run Monday to Sunday', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(releaseWeekLabel(null), 'TBA');
  assert.match(releaseWeekLabel('2026-11-27'), /^Week of 23 Nov – 29 Nov 2026$/);
});
