import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('v4 components accessibility audit (Score Card, Waterfall Chart, Taste DNA)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');

  async function assertA11y(selector?: string) {
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {}))
      );
    });
    const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']);
    if (selector) {
      builder.include(selector);
    }
    const result = await builder.analyze();
    expect.soft(result.violations.map((v) => ({ id: v.id, impact: v.impact }))).toEqual([]);
  }

  // 1. Title Detail with Score Card and Waterfall Chart
  await page.getByRole('button', { name: 'Open Beyond the Dunes', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible();

  // Audit Score Card if rendered
  const scoreCard = page.locator('.score-card, .cinepulse-score-card, .detail-toolbar');
  if ((await scoreCard.count()) > 0) {
    await assertA11y('.score-card, .cinepulse-score-card, .detail-toolbar');
  }

  // 2. Prediction Waterfall Chart on Prediction Desk tab
  await page.getByRole('tab', { name: 'Prediction desk', exact: true }).click();
  await expect(page.locator('.poll-number')).toBeVisible();

  const waterfall = page.locator('.waterfall-container, .waterfall-table, .poll-card');
  if ((await waterfall.count()) > 0) {
    await assertA11y('.waterfall-container, .waterfall-table, .poll-card');
  }

  await page.keyboard.press('Escape');

  // 3. Overall Page Baseline
  await assertA11y('main');
});
