import { test, expect, devices } from '@playwright/test';
import { join } from 'node:path';

const SHOTS = process.env.WRAPPED_SHOTS;

test('install card offers the browser install dialog on a return visit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    try { localStorage.setItem('cinepulse_visits', '3'); localStorage.removeItem('cinepulse_install_dismissed_at'); } catch {}
    // A stand-in for Chrome's install offer, fired once the app has started listening.
    (window as any).__prompted = 0;
    setTimeout(() => {
      const e = new Event('beforeinstallprompt') as any;
      e.prompt = async () => { (window as any).__prompted++; };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    }, 1500);
  });
  await page.goto('/');
  const card = page.getByRole('dialog', { name: 'Install CinePulse' });
  await expect(card).toBeVisible({ timeout: 15000 });
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'install-android.png') });
  await card.getByRole('button', { name: 'Install' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__prompted)).toBe(1);
  await expect(card).toHaveCount(0);
});

test('iPhone Safari gets the Add to Home Screen hint, and Not now hides it', async ({ browser }) => {
  const context = await browser.newContext({ ...devices['iPhone 14'], defaultBrowserType: undefined } as any);
  const page = await context.newPage();
  // Reset only on the first load, so the reload below keeps the dismissal.
  await page.addInitScript(() => {
    try {
      if (sessionStorage.getItem('install-test-reset')) return;
      sessionStorage.setItem('install-test-reset', '1');
      localStorage.setItem('cinepulse_visits', '3');
      localStorage.removeItem('cinepulse_install_dismissed_at');
    } catch {}
  });
  await page.goto('/');
  const card = page.getByRole('dialog', { name: 'Install CinePulse' });
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card).toContainText('Add to Home Screen');
  await expect(card.getByRole('button', { name: 'Install' })).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'install-ios.png') });
  await card.getByRole('button', { name: 'Not now' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(8000);
  await expect(page.getByRole('dialog', { name: 'Install CinePulse' })).toHaveCount(0);
  await context.close();
});
