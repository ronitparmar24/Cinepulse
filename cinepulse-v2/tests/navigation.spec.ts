import {test,expect} from '@playwright/test';

const titleUrl='/?view=calendar&title=demo-dunes&tab=reviews';

test.describe('shareable navigation and title dialogs',()=>{
 test('direct title links survive refresh and preserve the requested tab',async({page})=>{
  await page.goto(titleUrl);await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('tab',{name:'Community',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.getByRole('navigation',{name:'Mobile navigation'})).toBeHidden();
  await page.reload();await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('tab',{name:'Community',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page).toHaveURL(/view=calendar.*title=demo-dunes.*tab=reviews/);
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).not.toHaveURL(/title=/);
 });

 test('opening a card, browser back, and browser forward are synchronized',async({page})=>{
  await page.goto('/');const open=page.getByRole('button',{name:'Open Beyond the Dunes',exact:true});await expect(open).toBeVisible();
  await open.click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page).toHaveURL(/title=demo-dunes/);
  await page.goBack();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/?$/);
  await page.goForward();await expect(page.getByRole('dialog')).toBeVisible();
 });

 test('title tabs use roving keyboard focus and update the shareable tab',async({page})=>{
  await page.goto('/?title=demo-dunes');await expect(page.getByRole('dialog')).toBeVisible();
  const overview=page.getByRole('tab',{name:'Overview',exact:true});const pulse=page.getByRole('tab',{name:'Prediction desk',exact:true});const reviews=page.getByRole('tab',{name:'Community',exact:true});
  await overview.focus();await page.keyboard.press('ArrowRight');await expect(pulse).toBeFocused();await expect(pulse).toHaveAttribute('aria-selected','true');
  await page.keyboard.press('End');await expect(reviews).toBeFocused();await expect(page).toHaveURL(/tab=reviews/);
  await page.keyboard.press('Home');await expect(overview).toBeFocused();await expect(overview).toHaveAttribute('aria-selected','true');
 });

 test('closing restores the source card focus without adding a back loop',async({page})=>{
  await page.goto('/?view=community');await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Discover',exact:true}).click();const open=page.getByRole('button',{name:'Open Beyond the Dunes',exact:true});await open.click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(open).toBeFocused();
  await page.goBack();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).toHaveURL(/view=community/);
 });

 test('invalid title links show a recoverable error and close cleanly',async({page})=>{
  await page.goto('/?title=not-a-real-title');await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('.error-box')).toContainText(/unknown title|could not be loaded/i);
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).not.toHaveURL(/title=/);
 });

 test('mobile navigation remains available and unavailable provider health is honest',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.route('**/api/config',route=>route.fulfill({json:{mode:'tmdb',region:'IN',message:'TMDB configured',health:{status:'configured',checkedAt:null,message:'Not checked'}}}));
  await page.route('**/api/config/health',route=>route.fulfill({json:{mode:'tmdb',region:'IN',message:'TMDB unavailable',health:{status:'unavailable',checkedAt:new Date().toISOString(),message:'Provider could not be reached.'}}}));
  await page.goto('/');await expect(page.getByRole('navigation',{name:'Mobile navigation'})).toBeVisible();await expect(page.getByText('TMDB catalog · Unavailable')).toBeVisible();await expect(page.getByRole('button',{name:'Retry connection'})).toBeVisible();
  await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('button',{name:'Calendar',exact:true}).click();await expect(page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('button',{name:'Calendar',exact:true})).toHaveAttribute('aria-current','page');
 });
});
