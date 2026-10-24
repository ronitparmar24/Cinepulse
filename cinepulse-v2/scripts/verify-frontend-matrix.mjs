// Comprehensive Frontend Matrix Verification for CinePulse
// Evaluates every view, modal, interaction, console errors, and hydration on both LOCAL and DEPLOYED.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCAL_URL = 'http://127.0.0.1:3000';
const DEPLOYED_URL = 'https://cinepulse-kohl.vercel.app';
const ARTIFACT_DIR = 'docs/qa/screenshots';
mkdirSync(ARTIFACT_DIR, { recursive: true });

const VIEWS = [
  { name: 'Home / Discover', path: '/' },
  { name: 'Explore', path: '/?view=explore' },
  { name: 'Calendar', path: '/?view=calendar' },
  { name: 'Predictions', path: '/?view=predictions' },
  { name: 'Community', path: '/?view=community' },
  { name: 'Library', path: '/?view=library' },
  { name: 'Contrarian Desk', path: '/?view=contrarian' },
  { name: 'Leaderboard', path: '/?view=leaderboard' },
  { name: 'Accuracy', path: '/?view=accuracy' },
  { name: 'Feed', path: '/?view=feed' },
  { name: 'Title Detail (Modal)', path: '/?title=movie-27205' },
];

async function verifyTarget(targetUrl, targetName) {
  console.log(`\n==================================================`);
  console.log(`VERIFYING FRONTEND TARGET: ${targetName} (${targetUrl})`);
  console.log(`==================================================\n`);

  const browser = await chromium.launch({ headless: true });
  const results = {
    target: targetName,
    url: targetUrl,
    timestamp: new Date().toISOString(),
    views: [],
    features: {},
    consoleErrors: [],
    pageErrors: [],
  };

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CinePulse-QA-Matrix/1.0',
  });

  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      results.consoleErrors.push({ text: msg.text(), location: msg.location() });
    }
  });

  page.on('pageerror', err => {
    results.pageErrors.push(err.message);
  });

  // 1. Audit all individual views
  for (const view of VIEWS) {
    const fullUrl = `${targetUrl}${view.path}`;
    const viewReport = { name: view.name, path: view.path, status: 'UNKNOWN', errors: [], loadTimeMs: 0 };
    const start = Date.now();
    try {
      const resp = await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      viewReport.httpStatus = resp ? resp.status() : 'NO_RESPONSE';
      viewReport.loadTimeMs = Date.now() - start;

      // Wait a moment for client hydration
      await page.waitForTimeout(1500);

      const hasErrorBox = await page.locator('.error-box').count();
      const titleText = await page.title();
      viewReport.docTitle = titleText;
      viewReport.hasErrorBox = hasErrorBox > 0;

      const screenshotName = `${targetName.toLowerCase()}_view_${view.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
      await page.screenshot({ path: join(ARTIFACT_DIR, screenshotName) });
      viewReport.screenshot = screenshotName;
      viewReport.status = viewReport.hasErrorBox ? 'ERROR_BOX_PRESENT' : 'PASS';
    } catch (err) {
      viewReport.status = 'FAIL';
      viewReport.error = err.message;
    }
    results.views.push(viewReport);
    console.log(`  [View] ${view.name.padEnd(25)} -> ${viewReport.status} (${viewReport.loadTimeMs}ms, HTTP ${viewReport.httpStatus})`);
  }

  // 2. Test Feature: Search and Clear
  try {
    await page.goto(`${targetUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const searchInput = page.getByLabel('Search movies and series');
    if (await searchInput.isVisible()) {
      await searchInput.fill('dune');
      await page.waitForTimeout(600);
      const cardCount = await page.locator('.poster-card').count();
      const clearBtn = page.getByLabel('Clear search');
      if (await clearBtn.isVisible()) {
        await clearBtn.click();
        await page.waitForTimeout(600);
      }
      results.features.search = { status: 'PASS', filteredCards: cardCount };
    } else {
      results.features.search = { status: 'MISSING_ELEMENT', message: 'Search input not visible' };
    }
  } catch (err) {
    results.features.search = { status: 'FAIL', error: err.message };
  }
  console.log(`  [Feature] Search: ${results.features.search.status}`);

  // 3. Test Feature: Media Type Segmentation (Everything, Movies, Series)
  try {
    const movieBtn = page.getByRole('button', { name: 'Movies', exact: true });
    if (await movieBtn.isVisible()) {
      await movieBtn.click();
      await page.waitForTimeout(600);
      const movieCount = await page.locator('.poster-card').count();
      results.features.mediaFilter = { status: 'PASS', countAfterFilter: movieCount };
    } else {
      results.features.mediaFilter = { status: 'MISSING_BUTTON' };
    }
  } catch (err) {
    results.features.mediaFilter = { status: 'FAIL', error: err.message };
  }
  console.log(`  [Feature] Media Filter: ${results.features.mediaFilter.status}`);

  // 4. Test Feature: Title Detail Modal & Tabs
  try {
    await page.goto(`${targetUrl}/?title=movie-27205`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const modalVisible = await page.getByRole('dialog').isVisible();
    const overviewTab = await page.getByRole('tab', { name: 'Overview', exact: true }).isVisible();
    const pulseTab = await page.getByRole('tab', { name: 'Prediction desk', exact: true });
    let tabSwitched = false;
    if (await pulseTab.isVisible()) {
      await pulseTab.click();
      await page.waitForTimeout(500);
      tabSwitched = true;
    }
    const closeBtn = page.getByRole('button', { name: 'Close dialog', exact: true });
    let modalClosed = false;
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(500);
      modalClosed = (await page.getByRole('dialog').count()) === 0;
    }
    results.features.titleModal = {
      status: modalVisible && tabSwitched && modalClosed ? 'PASS' : 'WARN',
      modalVisible,
      tabSwitched,
      modalClosed,
    };
  } catch (err) {
    results.features.titleModal = { status: 'FAIL', error: err.message };
  }
  console.log(`  [Feature] Title Modal: ${results.features.titleModal.status}`);

  // 5. Test Feature: Chat Launcher & Panel
  try {
    await page.goto(`${targetUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const launcher = page.locator('.chat-launcher');
    const launcherExists = await launcher.isVisible();
    let panelOpened = false;
    if (launcherExists) {
      await launcher.click();
      await page.waitForTimeout(600);
      panelOpened = await page.locator('.chat-panel').isVisible();
      const closeChat = page.getByRole('button', { name: 'Close CinePulse Assistant', exact: true }).or(page.locator('.chat-panel-close'));
      if (await closeChat.isVisible()) {
        await closeChat.click();
        await page.waitForTimeout(400);
      }
    }
    results.features.chatAssistant = { status: launcherExists && panelOpened ? 'PASS' : 'WARN', launcherExists, panelOpened };
  } catch (err) {
    results.features.chatAssistant = { status: 'FAIL', error: err.message };
  }
  console.log(`  [Feature] Chat Assistant: ${results.features.chatAssistant.status}`);

  // 6. Test Feature: Auth Modal Launch & Forms
  try {
    await page.goto(`${targetUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const signInBtn = page.getByLabel('Sign in', { exact: true }).or(page.getByRole('button', { name: 'Sign in', exact: true }));
    let authModalOpened = false;
    let hasGoogleBtn = false;
    let hasCreateBtn = false;
    if (await signInBtn.first().isVisible()) {
      await signInBtn.first().click();
      await page.waitForTimeout(600);
      authModalOpened = await page.locator('dialog').isVisible();
      hasGoogleBtn = (await page.getByText(/Google/i).count()) > 0;
      hasCreateBtn = (await page.getByRole('button', { name: 'Create an account', exact: true }).count()) > 0;
      // Close auth dialog
      const closeAuth = page.getByRole('button', { name: 'Close dialog', exact: true }).or(page.locator('.close'));
      if (await closeAuth.first().isVisible()) {
        await closeAuth.first().click();
        await page.waitForTimeout(400);
      }
    }
    results.features.authModal = {
      status: authModalOpened ? 'PASS' : 'WARN',
      authModalOpened,
      hasGoogleBtn,
      hasCreateBtn,
    };
  } catch (err) {
    results.features.authModal = { status: 'FAIL', error: err.message };
  }
  console.log(`  [Feature] Auth Modal: ${results.features.authModal.status}`);

  // 7. Mobile Viewport Audit (390x844)
  try {
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${targetUrl}/`, { waitUntil: 'domcontentloaded' });
    await mobilePage.waitForTimeout(1000);
    const mobileNavVisible = await mobilePage.getByRole('navigation', { name: 'Mobile navigation' }).isVisible();
    const isOverflowing = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    results.features.mobileResponsiveness = {
      status: mobileNavVisible && !isOverflowing ? 'PASS' : 'WARN',
      mobileNavVisible,
      isOverflowing,
    };
    await mobilePage.screenshot({ path: join(ARTIFACT_DIR, `${targetName.toLowerCase()}_mobile.png`) });
    await mobileContext.close();
  } catch (err) {
    results.features.mobileResponsiveness = { status: 'FAIL', error: err.message };
  }
  console.log(`  [Feature] Mobile Responsiveness: ${results.features.mobileResponsiveness.status}`);

  await browser.close();
  return results;
}

async function run() {
  const localReport = await verifyTarget(LOCAL_URL, 'LOCAL');
  const deployedReport = await verifyTarget(DEPLOYED_URL, 'DEPLOYED');

  const fullReport = {
    timestamp: new Date().toISOString(),
    local: localReport,
    deployed: deployedReport,
  };

  writeFileSync('docs/qa/frontend-results.json', JSON.stringify(fullReport, null, 2));
  console.log('\nWrote docs/qa/frontend-results.json successfully.');
}

run().catch(console.error);
