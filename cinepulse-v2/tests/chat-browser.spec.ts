import { test, expect } from '@playwright/test';

test('Ask CinePulse: open chat, ask about demo title, see forecast card, confirm watchlist action', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');

  // 1. Sign in to allow action execution
  await page.getByLabel('Sign in', { exact: true }).click();
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  const email = `chat-e2e-${Date.now()}@example.test`;
  await page.getByLabel('Your name', { exact: true }).fill('Cine Critic');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('secure-local-pwd-99');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('dialog')).toHaveCount(0);

  // 2. Open chat drawer via floating launcher
  const launcher = page.locator('.chat-launcher');
  await expect(launcher).toBeVisible();
  await launcher.click();

  const chatPanel = page.locator('.chat-panel');
  await expect(chatPanel).toBeVisible();

  // 3. Ask about demo title
  const input = page.getByLabel('Chat input message');
  const sendBtn = page.getByLabel('Send message');
  await input.fill('Will Beyond the Dunes be a hit?');
  await sendBtn.click();

  // 4. Verify forecast card appears with predictive analytics
  const forecastCard = page.locator('.chat-card--forecast');
  await expect(forecastCard).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.chat-forecast-prob')).toBeVisible();

  // 5. Ask to add to watchlist
  await input.fill('Add Beyond the Dunes to my watchlist');
  await sendBtn.click();

  // 6. Verify pending action card
  const actionCard = page.locator('.chat-card--action');
  await expect(actionCard).toBeVisible({ timeout: 15000 });
  await expect(actionCard).toContainText('watchlist');

  // 7. Click Confirm and verify execution
  const confirmBtn = actionCard.locator('button:has-text("Confirm")');
  await expect(confirmBtn).toBeVisible();
  await confirmBtn.click();

  // 8. Verify action confirmed status
  await expect(page.locator('.chat-action-status.text-hit')).toContainText(
    'Action Confirmed & Executed',
    { timeout: 10000 }
  );

  expect(errors).toEqual([]);
});
