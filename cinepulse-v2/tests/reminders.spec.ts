import { test, expect, type Page } from '@playwright/test';
import { join } from 'node:path';

// Release reminders and Add to calendar in the browser, with mocked account APIs (no real account).
const SHOTS = process.env.WRAPPED_SHOTS;
const user = { id: 'u-remind', name: 'Asha Rao', displayName: 'Asha Rao', email: 'asha@example.com', username: 'asha', region: 'IN' };

async function signedIn(page: Page, state: { reminders: string[]; prefs: { watchlist: boolean; email: boolean } }) {
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { user } }));
  await page.route('**/api/privacy/settings', (r) => r.fulfill({ json: { settings: { watchlistVisibility: 'public', diaryVisibility: 'public', ratingsVisibility: 'public', reviewsVisibility: 'public', predictionsVisibility: 'public', activityVisibility: 'followers_only', showInSearch: true, allowActivityFrom: 'everyone' } } }));
  await page.route('**/api/notifications/unread-count', (r) => r.fulfill({ json: { count: 1 } }));
  await page.route('**/api/notifications', (r) => r.fulfill({ json: { items: [{ id: 1, userId: user.id, actorId: user.id, actor: { id: user.id, username: 'asha', displayName: 'Asha Rao' }, type: 'release_day', targetType: 'title', targetId: 'demo-dunes', title: { id: 'demo-dunes', title: 'Beyond the Dunes', poster: '/assets/dunes.webp' }, readAt: null, createdAt: new Date().toISOString() }], nextCursor: null, hasMore: false } }));
  await page.route('**/api/reminders**', async (r) => {
    const url = new URL(r.request().url());
    const method = r.request().method();
    const parts = url.pathname.split('/').filter(Boolean); // api, reminders, [id]
    if (parts.length === 2 && method === 'GET') {
      return r.fulfill({ json: { reminders: state.reminders.map((id) => ({ titleId: id, title: 'Beyond the Dunes', poster: '/assets/dunes.webp', mediaType: 'movie', releaseDate: '2027-11-19', source: 'manual', createdAt: '' })), prefs: state.prefs } });
    }
    if (parts[2] === 'settings' && method === 'PUT') {
      state.prefs = { ...state.prefs, ...JSON.parse(r.request().postData() || '{}') };
      return r.fulfill({ json: { prefs: state.prefs } });
    }
    const id = decodeURIComponent(parts[2]);
    if (method === 'PUT') { state.reminders = [...new Set([...state.reminders, id])]; return r.fulfill({ json: { reminder: { titleId: id } } }); }
    if (method === 'DELETE') { state.reminders = state.reminders.filter((x) => x !== id); return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ status: 404, json: { error: 'not found' } });
  });
}

const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) }); };

for (const size of [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }]) {
  test(`Remind me and Add to calendar on an upcoming title (${size.name})`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const state = { reminders: [] as string[], prefs: { watchlist: true, email: false } };
    await signedIn(page, state);
    await page.goto('/?title=demo-dunes');
    const dialog = page.getByRole('dialog').first();
    const remind = dialog.getByRole('button', { name: 'Remind me' });
    await expect(remind).toBeVisible();
    await remind.click();
    await expect(dialog.getByRole('button', { name: 'Reminder on' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('status').filter({ hasText: 'We’ll remind you on' })).toBeVisible();
    expect(state.reminders).toEqual(['demo-dunes']);

    await dialog.getByRole('button', { name: /Add to calendar/ }).click();
    const menu = dialog.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Google Calendar' })).toHaveAttribute('href', /calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
    await shot(page, `remind-${size.name}`);
    const download = page.waitForEvent('download');
    await menu.getByRole('menuitem', { name: /\.ics/ }).click();
    expect((await download).suggestedFilename()).toMatch(/-release\.ics$/);

    await dialog.getByRole('button', { name: 'Reminder on' }).click();
    await expect(dialog.getByRole('button', { name: 'Remind me' })).toHaveAttribute('aria-pressed', 'false');
    expect(state.reminders).toEqual([]);
  });
}

test('notification settings and the release-day alert', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = { reminders: ['demo-dunes'], prefs: { watchlist: true, email: false } };
  await signedIn(page, state);
  await page.goto('/');

  await page.getByRole('button', { name: 'Notifications' }).click();
  await expect(page.getByText('is out today')).toBeVisible();
  await shot(page, 'remind-bell');
  await page.getByRole('button', { name: /Beyond the Dunes is out today/ }).click();
  await expect(page).toHaveURL(/title=demo-dunes/);
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await page.getByRole('button', { name: 'Open your profile' }).click();
  await page.getByRole('tab', { name: /Privacy/ }).click();
  const email = page.getByRole('checkbox', { name: /Also email me/ });
  await expect(email).not.toBeChecked();
  await page.getByText('Also email me').click();
  await expect(email).toBeChecked();
  expect(state.prefs.email).toBe(true);
  await expect(page.getByText('Upcoming reminders (1)')).toBeVisible();
  await page.getByText('Upcoming reminders').scrollIntoViewIfNeeded();
  await shot(page, 'remind-settings');
  await page.getByRole('button', { name: 'Remove the reminder for Beyond the Dunes' }).click();
  await expect(page.getByText('Upcoming reminders (0)')).toBeVisible();
  expect(state.reminders).toEqual([]);
});
