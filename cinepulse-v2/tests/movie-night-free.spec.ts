import { test, expect } from '@playwright/test';
import { join } from 'node:path';

// The watch-party screen with an official free YouTube upload and a shared Teleparty invite (mocked room).
const SHOTS = process.env.WRAPPED_SHOTS;

test('watch party shows the in-room synced player and the shared invite (phone)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const now = Date.now();
  const room = {
    code: 'FREE42', version: 9, name: 'Free Friday', phase: 'party', serverNow: now,
    settings: { maxRuntime: null, mood: null, region: 'IN', freeOnly: true },
    you: { id: 'm1', isHost: true, votes: {}, veto: null, pitchesLeft: 0, signedIn: false },
    members: [{ id: 'm1', name: 'Asha', color: '#b3f3d5', isHost: true, signedIn: false, voted: true }, { id: 'm2', name: 'Ravi', color: '#fbbf24', isHost: false, signedIn: false, voted: true }],
    candidates: [{ id: 'movie-1', title: 'A Free Classic', poster: null, backdrop: null, releaseDate: '1999-01-01', runtime: 120, genres: ['Drama'], mediaType: 'movie', voteAverage: 7.5, overview: '', source: 'trending', addedBy: null, freeOn: ['YouTube'] }],
    result: { winnerId: 'movie-1', decidedAt: new Date(now).toISOString(), ranking: [{ titleId: 'movie-1', score: 4, yes: 2, maybe: 0, no: 0, vetoed: false }],
      watch: { link: null, providers: [], groupServices: [], direct: [{ name: 'YouTube', type: 'free', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }], youtubeId: 'dQw4w9WgXcQ' } },
    party: { titleId: 'movie-1', startAt: new Date(now - 60_000).toISOString(), runningSince: new Date(now - 60_000).toISOString(), state: 'scheduled', elapsedMs: 0, pausedBy: null, clock: null },
    handoff: { url: 'https://www.teleparty.com/join/abc', label: 'Teleparty', setBy: 'Asha' },
    feed: [],
  };
  await page.route('**/api/movie-night/rooms/FREE42**', (r) => r.fulfill({ json: { ...room, serverNow: Date.now() } }));
  await page.addInitScript(() => { try { localStorage.setItem('cinepulse_room_FREE42', 'test-token'); } catch {} });
  await page.goto('/?view=movie-night&room=FREE42');

  await expect(page.getByText(/Playing together|PRESS PLAY NOW/)).toBeVisible();
  const player = page.locator('iframe[title="Watch party player"]');
  await expect(player).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?enablejsapi=1/);
  await expect(page.getByRole('button', { name: 'Watch here, in sync with the room' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join the Teleparty party' })).toHaveAttribute('href', 'https://www.teleparty.com/join/abc');
  await expect(page.getByRole('link', { name: 'Watch free on YouTube' })).toBeVisible();
  await page.getByRole('button', { name: 'Watch here, in sync with the room' }).scrollIntoViewIfNeeded();
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'mn-free-party.png') });
  await page.getByRole('button', { name: 'Watch here, in sync with the room' }).click();
  await expect(page.getByRole('button', { name: 'Watch here, in sync with the room' })).toHaveCount(0);
});
