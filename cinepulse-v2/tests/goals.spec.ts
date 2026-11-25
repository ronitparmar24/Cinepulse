import { test, expect, type Page } from '@playwright/test';
import { join } from 'node:path';

// Watch goals and reporting in the browser, with mocked account APIs (no real account).
const SHOTS = process.env.WRAPPED_SHOTS;
const user = { id: 'u-goal', name: 'Asha Rao', displayName: 'Asha Rao', email: 'asha@example.com', username: 'asha', region: 'IN' };
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) }); };

test('set a yearly goal from the profile dashboard (phone)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let target: number | null = null;
  const status = () => ({ year: 2026, target, watched: 18, percent: target ? Math.round((18 / target) * 100) : null, perWeekToFinish: target ? 4.2 : null, streak: { current: 3, best: 5 }, weeks: [0, 1, 2, 0, 1, 1, 0, 2, 3, 1, 2, 1] });
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }));
  await page.route('**/api/goals', async (r) => {
    if (r.request().method() === 'PUT') target = JSON.parse(r.request().postData() || '{}').target;
    return r.fulfill({ json: status() });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open your profile' }).click();
  const card = page.getByRole('region', { name: '2026 watch goal' });
  await expect(card).toContainText('Set a yearly goal');
  await expect(card).toContainText('3');
  await card.getByRole('button', { name: 'Set goal' }).click();
  await card.getByRole('button', { name: '24' }).click();
  await card.getByRole('button', { name: 'Save goal' }).click();
  await expect(card).toContainText('6 to go');
  expect(target).toBe(24);
  await card.scrollIntoViewIfNeeded();
  await shot(page, 'goal-card');
});

test('report someone else\'s review (phone)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let reported: any = null;
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }));
  await page.route('**/api/reviews/demo-dunes', (r) => r.fulfill({ json: { reviews: [{ id: 'rev-1', userId: 'someone-else', name: 'Ravi', titleId: 'demo-dunes', titleName: 'Beyond the Dunes', body: 'The ending where the hero dies is so obvious.', rating: null, spoiler: false, kind: 'first-impression', createdAt: new Date().toISOString() }] } }));
  await page.route('**/api/reports', (r) => { reported = JSON.parse(r.request().postData() || '{}'); return r.fulfill({ json: { ok: true, hidden: false, alreadyReported: false } }); });
  await page.goto('/?title=demo-dunes&tab=reviews');
  await page.getByRole('button', { name: 'Report this review' }).click();
  const dialog = page.getByRole('dialog', { name: 'Report this review' });
  await dialog.getByText('Spoilers without a warning').click();
  await dialog.getByRole('textbox').fill('Reveals the ending');
  await shot(page, 'report-dialog');
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Thanks for flagging it' })).toBeVisible();
  expect(reported).toEqual({ targetType: 'review', targetId: 'rev-1', reason: 'spoilers', note: 'Reveals the ending' });
  await expect(page.getByRole('button', { name: 'Reported' })).toBeDisabled();
});
