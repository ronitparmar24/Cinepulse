import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dismissalActive, isIosSafari } from '../lib/installPrompt';
import { buildCsp } from '../proxy';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';

test('iOS hint only for Safari on iPhone and iPad', () => {
  assert.equal(isIosSafari(IPHONE_SAFARI, 5), true);
  assert.equal(isIosSafari(IPAD_DESKTOP_UA, 5), true, 'iPadOS reports a Mac user agent with touch');
  assert.equal(isIosSafari(IPAD_DESKTOP_UA, 0), false, 'a real Mac is not iOS');
  assert.equal(isIosSafari(IPHONE_CHROME, 5), false, 'Chrome on iOS cannot add to home screen the same way');
  assert.equal(isIosSafari(ANDROID_CHROME, 5), false);
});

test('a dismissal lasts three weeks', () => {
  const now = Date.UTC(2026, 10, 25);
  assert.equal(dismissalActive(null, now), false);
  assert.equal(dismissalActive(now - 20 * 86_400_000, now), true);
  assert.equal(dismissalActive(now - 22 * 86_400_000, now), false);
});

test('the page CSP allows the same-origin service worker', () => {
  const csp = buildCsp('abc', false);
  assert.match(csp, /worker-src 'self'/);
  assert.match(csp, /manifest-src 'self'/);
});

test('manifest is installable: PNG icons, a maskable icon, standalone, and in-scope shortcuts', () => {
  const m = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.scope, '/');
  const sizes = m.icons.filter((i: any) => i.type === 'image/png').map((i: any) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.ok(m.icons.some((i: any) => i.purpose === 'maskable'));
  for (const s of m.shortcuts) assert.match(s.url, /^\/\?view=(library|predictions|calendar)/);
  for (const icon of [...m.icons, ...m.shortcuts.flatMap((s: any) => s.icons)]) {
    const file = icon.src === '/icon.svg' ? 'app/icon.svg' : `public${icon.src}`; // app/icon.svg is served at /icon.svg
    assert.ok(readFileSync(file).length > 100, `${icon.src} exists`);
  }
});

test('the service worker never caches API responses or pages', () => {
  const sw = readFileSync('public/sw.js', 'utf8');
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)\) return;/);
  assert.doesNotMatch(sw, /cache\.put\(event\.request/);
  assert.match(sw, /request\.mode === 'navigate'/);
});
