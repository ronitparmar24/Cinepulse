import { test, expect, devices, type Page } from '@playwright/test';
import { join } from 'node:path';

// Two people on two phones: create a room, join by link, vote, reveal, and watch in sync.
const SHOTS = process.env.WRAPPED_SHOTS;
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) }); };

async function voteAll(page: Page, choice: 'Yes' | 'No' | 'Maybe', maxCards = 12) {
  for (let i = 0; i < maxCards; i++) {
    const btn = page.getByRole('button', { name: choice, exact: true });
    if (!(await btn.isVisible().catch(() => false))) break;
    await btn.click();
    await page.waitForTimeout(320);
  }
}

test('host and guest pick a film and start a synced watch party', async ({ browser }) => {
  test.setTimeout(120_000);
  const phone = { ...devices['iPhone 14'], defaultBrowserType: undefined } as any;
  const hostCtx = await browser.newContext(phone);
  const guestCtx = await browser.newContext(phone);
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  await host.goto('/?view=movie-night');
  await host.getByLabel('Room name').fill('Friday Fright Night');
  await host.getByLabel('Your name').fill('Asha');
  await host.getByRole('button', { name: 'Any length' }).click();
  await shot(host, 'mn-landing');
  await host.getByRole('button', { name: 'Open the room' }).click();
  await expect(host.getByRole('heading', { name: 'Friday Fright Night' })).toBeVisible();
  await expect(host).toHaveURL(/room=[A-Z2-9]{6}/);
  const code = new URL(host.url()).searchParams.get('room')!;

  // The guest opens the invite link and joins with a name.
  await guest.goto(`/?view=movie-night&room=${code}`);
  await expect(guest.getByText(/invited you to/)).toBeVisible();
  await guest.getByLabel('Your name').fill('Ravi');
  await guest.getByRole('button', { name: 'Join the room' }).click();
  await expect(guest.getByText('Waiting for the host to start the vote')).toBeVisible();
  await expect(host.getByText('Ravi')).toBeVisible({ timeout: 10_000 }); // appears on the host's phone by polling
  await shot(host, 'mn-lobby');

  await host.getByRole('button', { name: /Start voting with 2 people/ }).click();
  await expect(guest.getByText('Would you watch this tonight?')).toBeVisible({ timeout: 10_000 });
  await shot(guest, 'mn-vote');
  await voteAll(host, 'Yes');
  await voteAll(guest, 'Maybe');
  await expect(host.getByText('Your votes are in')).toBeVisible();
  await expect(host.getByText('2 of 2 finished voting')).toBeVisible({ timeout: 10_000 });
  await shot(host, 'mn-myvotes');

  await host.getByRole('button', { name: 'Reveal the winner' }).click();
  await expect(host.getByText('TONIGHT’S PICK')).toBeVisible({ timeout: 8_000 });
  await expect(guest.getByText('TONIGHT’S PICK')).toBeVisible({ timeout: 12_000 });
  await host.waitForTimeout(900);
  await shot(host, 'mn-reveal');

  await host.getByRole('button', { name: 'In 1 minute' }).click();
  await expect(guest.getByText('Everyone press play in')).toBeVisible({ timeout: 10_000 });
  await host.getByRole('button', { name: 'Start now' }).click();
  await expect(guest.getByText(/PRESS PLAY NOW!|Playing together/)).toBeVisible({ timeout: 15_000 });
  await expect(host.getByText(/PRESS PLAY NOW!|Playing together/)).toBeVisible({ timeout: 15_000 });

  await guest.getByRole('button', { name: 'React 🍿' }).click();
  await guest.getByRole('button', { name: 'Ask everyone to pause' }).click();
  await expect(host.getByText('Paused by Ravi')).toBeVisible({ timeout: 10_000 });
  await shot(host, 'mn-paused');
  await host.getByRole('button', { name: 'Resume together' }).click();
  await expect(guest.getByText('Resume in')).toBeVisible({ timeout: 10_000 });
  await expect(guest.getByText(/Playing together/)).toBeVisible({ timeout: 15_000 });
  await shot(guest, 'mn-playing');

  await hostCtx.close();
  await guestCtx.close();
});
