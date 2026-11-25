import { test, expect, type Page } from '@playwright/test';
import { join } from 'node:path';

// Streaming services and Tonight's pick in the browser, with mocked account APIs (no real account).
const SHOTS = process.env.WRAPPED_SHOTS;
const user = { id: 'u-svc', name: 'Asha Rao', displayName: 'Asha Rao', email: 'asha@example.com', username: 'asha', region: 'IN' };
const title = (id: string, name: string, poster: string, runtime: number, genres: string[]) => ({ id, title: name, mediaType: 'movie', poster, backdrop: null, releaseDate: '2024-03-01', genres, runtime, seasons: null, overview: '', cast: [], voteAverage: 7.4, voteCount: 900, source: 'demo' });
const library = [
  { title: title('demo-dunes', 'Beyond the Dunes', '/assets/dunes.webp', 112, ['Sci-Fi', 'Adventure']), status: 'watchlist', rating: null, updatedAt: '2026-02-01T00:00:00.000Z' },
  { title: title('demo-neon', 'Neon Requiem', '/assets/neon.webp', 128, ['Thriller']), status: 'watchlist', rating: null, updatedAt: '2026-05-01T00:00:00.000Z' },
];

async function signedIn(page: Page) {
  const state = { selected: [] as string[] };
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }));
  await page.route('**/api/library', (r) => r.fulfill({ json: { items: library } }));
  await page.route('**/api/services**', async (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith('/services') && r.request().method() === 'GET') return r.fulfill({ json: { region: 'IN', available: [{ id: 'netflix', name: 'Netflix' }, { id: 'prime', name: 'Prime Video' }, { id: 'jiohotstar', name: 'JioHotstar' }, { id: 'sonyliv', name: 'Sony LIV' }], selected: state.selected } });
    if (path.endsWith('/services') && r.request().method() === 'PUT') { state.selected = JSON.parse(r.request().postData() || '{}').services; return r.fulfill({ json: { selected: state.selected } }); }
    if (path.endsWith('/services/watchlist')) return r.fulfill({ json: { matches: state.selected.includes('netflix') ? { 'demo-dunes': ['Netflix'] } : {} } });
    return r.fulfill({ json: { services: state.selected.includes('netflix') ? ['Netflix'] : [], link: 'https://www.themoviedb.org/movie/1/watch' } });
  });
  await page.route('**/api/tonight**', (r) => r.fulfill({ json: { pick: { title: library[0].title, services: state.selected.includes('netflix') ? ['Netflix'] : [], reasons: ['Streaming on your Netflix', 'Fits your 120 minutes (112 min)', 'On your watchlist for 9 months'] }, alternates: [{ title: library[1].title, services: [], reasons: [] }], considered: 2, moods: ['Adventure', 'Sci-Fi', 'Thriller'] } }));
  return state;
}
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) }); };

test('pick services, filter the library, and get tonight\'s pick (phone)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await signedIn(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open your profile' }).click();
  await page.getByRole('tab', { name: 'Services' }).click();
  await page.getByRole('button', { name: 'Netflix' }).click();
  await expect(page.getByRole('button', { name: 'Netflix' })).toHaveAttribute('aria-pressed', 'true');
  expect(state.selected).toEqual(['netflix']);
  await shot(page, 'svc-picker');
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await page.goto('/?view=library');
  const filter = page.getByRole('button', { name: /On my services/ });
  await expect(filter).toContainText('(1)');
  await filter.click();
  await expect(page.getByRole('button', { name: 'Open Beyond the Dunes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Neon Requiem' })).toHaveCount(0);
  await shot(page, 'svc-library');

  await page.getByRole('button', { name: /Tonight’s pick/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Tonight’s pick' });
  await expect(sheet.getByRole('heading', { name: 'Beyond the Dunes' })).toBeVisible();
  await expect(sheet.locator('.svc-badge')).toHaveText(/On your Netflix/);
  await page.waitForTimeout(700);
  await shot(page, 'svc-tonight');
  await sheet.getByRole('button', { name: 'Under 2 h' }).click();
  await sheet.getByRole('button', { name: 'Pick again' }).click();
  await sheet.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page).toHaveURL(/title=demo-dunes/);
});
