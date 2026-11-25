import { test, expect, type Page } from '@playwright/test';
import { join } from 'node:path';

// Browser check of the Wrapped story with mocked API responses (no real account involved).
const SHOTS = process.env.WRAPPED_SHOTS; // optional folder for review screenshots

const user = { id: 'u-wrapped', name: 'Asha Rao', displayName: 'Asha Rao', email: 'asha@example.com', username: 'asha', region: 'IN' };
const wrapped = {
  year: new Date().getMonth() === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear(),
  hasData: true, filmsWatched: 37, moviesWatched: 31, seriesWatched: 6, hoursWatched: 68,
  topGenres: [{ name: 'Drama', count: 14 }, { name: 'Thriller', count: 9 }, { name: 'Science Fiction', count: 6 }],
  favoriteDecade: '2020s',
  busiestMonth: { month: '2026-07', label: 'July', count: 7 },
  months: [2, 3, 1, 4, 2, 3, 7, 5, 2, 4, 3, 1],
  ratings: { count: 29, average: 3.7, style: 'balanced', fiveStars: 4 },
  topFilms: [
    { titleId: 'demo-dunes', title: 'Beyond the Dunes', poster: '/assets/dunes.webp', rating: 5 },
    { titleId: 'demo-neon', title: 'Neon Requiem', poster: '/assets/neon.webp', rating: 4.5 },
    { titleId: 'demo-orbit', title: 'Orbit Line', poster: '/assets/orbit.webp', rating: 4.5 },
    { titleId: 'demo-velvet', title: 'Velvet Hour', poster: '/assets/velvet.webp', rating: 4 },
    { titleId: 'demo-hollow', title: 'The Hollow', poster: '/assets/hollow.webp', rating: 4 },
  ],
  firstWatch: { title: 'Beyond the Dunes', date: '2026-01-03' },
  reviewsWritten: 5, listsCreated: 2,
  predictions: { calls: 12, resolved: 7, correct: 5, accuracy: 71 },
};

async function mockSignedIn(page: Page) {
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }));
  await page.route('**/api/wrapped?**', (r) => r.fulfill({ json: { wrapped } }));
  await page.route('**/api/wrapped/card?**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }));
  // Start each test with the banner not yet dismissed (only on the first load, so a reload keeps a dismissal).
  await page.addInitScript(() => {
    try {
      if (sessionStorage.getItem('wrapped-test-reset')) return;
      sessionStorage.setItem('wrapped-test-reset', '1');
      const y = new Date().getMonth() === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear();
      localStorage.removeItem(`cinepulse_wrapped_teaser_${y}`);
    } catch {}
  });
}

const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) }); };

for (const size of [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }]) {
  test(`Wrapped story plays through on ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await mockSignedIn(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Open your profile' })).toBeVisible(); // signed-in state has loaded
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('cinepulse:open-wrapped')));
    const story = page.getByRole('dialog', { name: /CinePulse Wrapped/ });
    await expect(story).toBeVisible();
    await expect(story.getByText(/in film/)).toBeVisible();
    await page.waitForTimeout(700);
    await shot(page, `${size.name}-1-intro`);

    // Pause auto-advance so each slide is checked deliberately.
    await story.getByRole('button', { name: 'Pause' }).click();
    const expectations = ['titles', 'You kept coming back to', 'busiest month', 'Top 5', 'Balanced critic', 'calls made', 'Here’s to the next one'];
    for (let i = 0; i < expectations.length; i++) {
      await page.keyboard.press('ArrowRight');
      await expect(story.getByText(expectations[i], { exact: false }).first()).toBeVisible();
      await page.waitForTimeout(900);
      await shot(page, `${size.name}-${i + 2}`);
    }

    // Share falls back to saving the image when the browser cannot share files.
    const download = page.waitForEvent('download');
    await story.getByRole('button', { name: 'Share my Wrapped' }).click();
    expect((await download).suggestedFilename()).toMatch(/^cinepulse-wrapped-\d{4}\.png$/);
    await expect(story.getByRole('status')).toContainText('Saved your card');

    await page.keyboard.press('Escape');
    await expect(story).toHaveCount(0);
  });
}

test('home banner opens Wrapped and can be dismissed', async ({ page }) => {
  test.skip(!(() => { const d = new Date(); const m = d.getMonth(); return m === 0 || m === 11 || (m === 10 && d.getDate() >= 15); })(), 'Banner only shows in Wrapped season');
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSignedIn(page);
  await page.goto('/');
  const banner = page.getByRole('region', { name: /Wrapped/ });
  await expect(banner).toBeVisible();
  await shot(page, 'phone-0-banner');
  await banner.getByRole('button', { name: /in film is ready/ }).click();
  await expect(page.getByRole('dialog', { name: /CinePulse Wrapped/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await banner.getByRole('button', { name: 'Hide the Wrapped banner' }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: /Wrapped/ })).toHaveCount(0);
});
