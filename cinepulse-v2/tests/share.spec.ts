import { test, expect } from '@playwright/test';
import { join } from 'node:path';

// Share sheet on a review (mocked account and image).
const SHOTS = process.env.WRAPPED_SHOTS;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('share a review as an image or a link (phone)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const user = { id: 'u-share', name: 'Asha Rao', displayName: 'Asha Rao', email: 'asha@example.com', username: 'asha', region: 'IN' };
  const requested: string[] = [];
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }));
  await page.route('**/api/reviews/demo-dunes', (r) => r.fulfill({ json: { reviews: [{ id: 'rev-9', userId: 'u-share', name: 'Asha Rao', titleId: 'demo-dunes', titleName: 'Beyond the Dunes', body: 'A gorgeous, patient desert epic.', rating: 4.5, spoiler: false, kind: 'review', createdAt: '2026-11-26T10:00:00.000Z' }] } }));
  await page.route('**/api/share/review/**', (r) => { requested.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'image/png', body: PNG }); });
  await page.goto('/?title=demo-dunes&tab=reviews');
  await page.getByRole('button', { name: /Share your review of Beyond the Dunes/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Share Beyond the Dunes' });
  await expect(sheet.getByRole('img', { name: 'Share card for Beyond the Dunes' })).toBeVisible();
  expect(requested.at(-1)).toMatch(/\/api\/share\/review\/rev-9\?format=story&v=/);
  await sheet.getByRole('tab', { name: /Post/ }).click();
  await expect.poll(() => requested.at(-1)).toMatch(/format=square/);
  await expect(sheet.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /wa\.me\/\?text=.*%2Fr%2Frev-9/);
  await expect(sheet.getByRole('link', { name: 'X' })).toHaveAttribute('href', /twitter\.com\/intent\/tweet/);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'share-sheet.png') });
  const download = page.waitForEvent('download');
  await sheet.getByRole('button', { name: 'Save' }).click();
  expect((await download).suggestedFilename()).toBe('cinepulse-review-beyond-the-dunes-square.png');
});
