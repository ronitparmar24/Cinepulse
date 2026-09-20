import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('review editing preloads saved text and spoilers, updates once, and survives refresh',async({page})=>{
 await page.goto('/');await page.getByLabel('Sign in',{exact:true}).click();await page.getByRole('button',{name:'Create an account',exact:true}).click();
 const email=`edit-${Date.now()}@example.test`,password='review-edit-password-2468';
 await page.getByLabel('Your name',{exact:true}).fill('Review Editor');await page.getByLabel('Email address',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Open Beyond the Dunes',exact:true}).click();await page.getByRole('tab',{name:'Community',exact:true}).click();
 await page.getByLabel('Your first impression',{exact:false}).fill('First     thoughtful take.');await page.getByLabel('Contains spoilers',{exact:true}).check();await page.getByRole('button',{name:'Share my take',exact:true}).click();
 await expect(page.getByRole('button',{name:'Edit my take',exact:true})).toBeVisible();await expect(page.locator('.review-card')).toHaveCount(1);await expect(page.locator('.review-body')).toHaveCount(0);
 await page.getByRole('button',{name:'Edit my take',exact:true}).click();await expect(page.locator('#review-body')).toHaveValue('First thoughtful take.');await expect(page.getByLabel('Contains spoilers',{exact:true})).toBeChecked();
 await page.locator('#review-body').fill('<img src=x onerror=alert(1)> Updated honest opinion.');await page.getByLabel('Contains spoilers',{exact:true}).uncheck();await page.getByRole('button',{name:'Update my take',exact:true}).click();await expect(page.locator('.review-body')).toHaveText('<img src=x onerror=alert(1)> Updated honest opinion.');await expect(page.locator('.review-body img')).toHaveCount(0);
 await page.reload();await expect(page.locator('.review-body')).toHaveText('<img src=x onerror=alert(1)> Updated honest opinion.');
 await page.getByRole('button',{name:'Edit my take',exact:true}).click();await page.locator('#review-body').fill('Unsaved draft');await page.getByRole('button',{name:'Discard edits',exact:true}).click();await expect(page.locator('.review-body')).toHaveText('<img src=x onerror=alert(1)> Updated honest opinion.');
 await page.getByLabel('Close dialog',{exact:true}).click();await page.getByLabel('Open your profile',{exact:true}).click();await page.getByRole('button',{name:'Delete my account',exact:true}).click();await page.getByLabel('Confirm your password').fill(password);await page.getByRole('button',{name:'Permanently delete account',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
});

test('genre errors show retry and recover without silently appearing empty',async({page})=>{
 let fail=true;await page.route('**/api/genres?*',route=>fail?route.fulfill({status:502,json:{error:'Genre provider unavailable'}}):route.continue());
 await page.goto('/');await expect(page.locator('.error-box')).toContainText('Genre provider unavailable');fail=false;await page.locator('.error-box').getByRole('button',{name:/Try again/}).click();await expect(page.locator('.error-box')).toHaveCount(0);await expect(page.getByLabel('Filter by genre')).toBeEnabled();
});

test('automated accessibility checks on discovery, auth, and title sections',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto('/');await expect(page.locator('.poster-card')).toHaveCount(6);
 async function check(){await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect.soft(result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);}
 await check();await page.getByLabel('Sign in',{exact:true}).click();await check();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Open Beyond the Dunes',exact:true}).click();await expect(page.getByRole('tab',{name:'Overview',exact:true})).toBeVisible();await check();
 await page.getByRole('tab',{name:'Prediction desk',exact:true}).click();await expect(page.locator('.poll-number')).toBeVisible();await check();
 await page.getByRole('tab',{name:'Community',exact:true}).click();await expect(page.locator('#review-body')).toBeVisible();await check();
});

test('future and unknown movie/TV dates disable viewing controls; released dates enable them',async({page})=>{
 const catalog=await (await page.request.get('/api/catalog')).json();const template=catalog.items[0];
 for(const mediaType of ['movie','tv'])for(const releaseDate of ['2099-01-01',null,'2000-01-01']){
  await page.route('**/api/title/demo-dunes',route=>route.fulfill({json:{title:{...template,mediaType,releaseDate,status:releaseDate===null?'unknown':releaseDate==='2000-01-01'?'released':'upcoming'}}}));
  await page.goto('/?title=demo-dunes');const select=page.getByLabel('Library status',{exact:true});await expect(select).toBeVisible();const released=releaseDate==='2000-01-01';
  await expect(select.locator('option[value="watching"]')).toHaveJSProperty('disabled',!released);await expect(select.locator('option[value="watched"]')).toHaveJSProperty('disabled',!released);await expect(page.getByLabel('Your private rating')).toHaveCount(released?1:0);
  await page.unroute('**/api/title/demo-dunes');
 }
});
