import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Every top-level view and the title modal must have no serious or critical WCAG 2.1 AA issues.
const VIEWS = ['/', '/?view=explore', '/?view=calendar', '/?view=predictions', '/?view=receipts', '/?view=leaderboard', '/?view=accuracy', '/?view=contrarian', '/?view=community', '/?view=feed', '/?view=circles', '/?view=movie-night', '/?view=library', '/?title=demo-dunes'];

for (const path of VIEWS) {
  test(`a11y: ${path}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const serious = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  });
}

test('phone width: no horizontal scrolling on key views', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const path of ['/', '/?view=predictions', '/?view=feed', '/?title=demo-dunes']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
