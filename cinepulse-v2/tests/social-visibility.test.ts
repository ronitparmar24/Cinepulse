import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

// Use an isolated temporary database for the visibility test suite
const tempDir = mkdtempSync(join(tmpdir(), 'cinepulse-social-vis-'));
const testDbPath = join(tempDir, 'test.db');
process.env.DATABASE_PATH = testDbPath;

const { db } = await import('../lib/db');
const { resolveVisibility, updatePrivacySettings, getPrivacySettings } = await import('../lib/social/visibility');

test.before(async () => {
  const d = db();
  const now = new Date().toISOString();

  // Create test users
  // User A: Public profile
  (await d.run(`
    INSERT INTO users (id, name, email, password_hash, username, display_name, profile_visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, 'user-a', 'Alice Public', 'alice@test.local', 'hash', 'alice', 'Alice', 'public', now));

  // User B: Private profile
  (await d.run(`
    INSERT INTO users (id, name, email, password_hash, username, display_name, profile_visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, 'user-b', 'Bob Private', 'bob@test.local', 'hash', 'bob', 'Bob', 'private', now));

  // User C: Followers-only profile
  (await d.run(`
    INSERT INTO users (id, name, email, password_hash, username, display_name, profile_visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, 'user-c', 'Charlie Restricted', 'charlie@test.local', 'hash', 'charlie', 'Charlie', 'followers_only', now));

  // User D: Regular user (Viewer)
  (await d.run(`
    INSERT INTO users (id, name, email, password_hash, username, display_name, profile_visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, 'user-d', 'Dave Viewer', 'dave@test.local', 'hash', 'dave', 'Dave', 'public', now));

  // User E: Follower with pending request
  (await d.run(`
    INSERT INTO users (id, name, email, password_hash, username, display_name, profile_visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, 'user-e', 'Eve Pending', 'eve@test.local', 'hash', 'eve', 'Eve', 'public', now));

  // User F: Stranger (Not following, not blocked)
  (await d.run(`
    INSERT INTO users (id, name, email, password_hash, username, display_name, profile_visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, 'user-f', 'Frank Stranger', 'frank@test.local', 'hash', 'frank', 'Frank', 'public', now));

  // Relationships
  // Dave is an accepted follower of Bob
  (await d.run(`
    INSERT INTO follows (follower_id, followee_id, status, created_at)
    VALUES (?, ?, 'accepted', ?)
  `, 'user-d', 'user-b', now));

  // Eve has a pending follow request to Bob
  (await d.run(`
    INSERT INTO follows (follower_id, followee_id, status, created_at)
    VALUES (?, ?, 'pending', ?)
  `, 'user-e', 'user-b', now));

  // Bob blocked Alice
  (await d.run(`
    INSERT INTO blocks (blocker_id, blocked_id, created_at)
    VALUES (?, ?, ?)
  `, 'user-b', 'user-a', now));
});

test.after(() => {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});

test('resolveVisibility: owner always has access to their own resources regardless of privacy', async () => {
  const result = (await resolveVisibility('user-b', 'user-b', 'watchlist'));
  assert.equal(result.allowed, true);
  assert.equal(result.status, 'granted');
  assert.equal(result.isOwner, true);
});

test('resolveVisibility: MUST deny non-follower attempting to read a private user watchlist', async () => {
  // Frank is NOT following Bob, is NOT blocked, and Bob is private
  const result = (await resolveVisibility('user-f', 'user-b', 'watchlist'));
  assert.equal(result.allowed, false, 'Non-follower must never access private watchlist');
  assert.equal(result.status, 'denied');
  assert.equal(result.reason, 'Private account');
});

test('resolveVisibility: MUST deny anonymous viewer attempting to read a private user watchlist', async () => {
  const result = (await resolveVisibility(null, 'user-b', 'watchlist'));
  assert.equal(result.allowed, false, 'Anonymous viewer must never access private watchlist');
  assert.equal(result.status, 'denied');
});

test('resolveVisibility: pending follow request to private user returns status=pending and allowed=false', async () => {
  const result = (await resolveVisibility('user-e', 'user-b', 'watchlist'));
  assert.equal(result.allowed, false);
  assert.equal(result.status, 'pending');
  assert.equal(result.followStatus, 'pending');
});

test('resolveVisibility: accepted follower CAN access private user public/default resources', async () => {
  // Dave is an accepted follower of Bob
  const result = (await resolveVisibility('user-d', 'user-b', 'watchlist'));
  assert.equal(result.allowed, true, 'Accepted follower should see default watchlist');
  assert.equal(result.status, 'granted');
  assert.equal(result.followStatus, 'accepted');
});

test('resolveVisibility: blocks prevent any access even if public or previously following', async () => {
  // Bob blocked Alice. Alice trying to view Bob's profile
  const result1 = (await resolveVisibility('user-a', 'user-b', 'profile'));
  assert.equal(result1.allowed, false);
  assert.equal(result1.status, 'blocked');

  // Bob trying to view Alice (bidirectional block check)
  const result2 = (await resolveVisibility('user-b', 'user-a', 'profile'));
  assert.equal(result2.allowed, false);
  assert.equal(result2.status, 'blocked');
});

test('resolveVisibility: granular resource-level privacy overrides public profile', async () => {
  // Alice has a public profile, but sets diary to private and reviews to followers_only
  (await updatePrivacySettings('user-a', {
    diaryVisibility: 'private',
    reviewsVisibility: 'followers_only',
  }));

  // Dave (not a follower of Alice) checks Alice's profile card -> allowed
  const profileRes = (await resolveVisibility('user-d', 'user-a', 'profile'));
  assert.equal(profileRes.allowed, true);

  // Dave checks Alice's diary (set to private) -> denied
  const diaryRes = (await resolveVisibility('user-d', 'user-a', 'diary'));
  assert.equal(diaryRes.allowed, false);
  assert.equal(diaryRes.reason, 'Private resource');

  // Dave checks Alice's reviews (set to followers_only) -> denied
  const reviewsRes = (await resolveVisibility('user-d', 'user-a', 'reviews'));
  assert.equal(reviewsRes.allowed, false);
  assert.equal(reviewsRes.reason, 'Followers-only resource');
});

test('resolveVisibility: per-list granular privacy enforcement', async () => {
  // Public profile Alice has a custom list marked 'private' ("films with ex")
  const privateListRes = (await resolveVisibility('user-d', 'user-a', 'list', 'private'));
  assert.equal(privateListRes.allowed, false);
  assert.equal(privateListRes.reason, 'Private resource');

  // Alice has another list marked 'public'
  const publicListRes = (await resolveVisibility('user-d', 'user-a', 'list', 'public'));
  assert.equal(publicListRes.allowed, true);
});

test('resolveVisibility: immediate cache-free update upon privacy_settings write', async () => {
  // Set predictions to private
  (await updatePrivacySettings('user-a', { predictionsVisibility: 'private' }));
  const check1 = (await resolveVisibility('user-d', 'user-a', 'predictions'));
  assert.equal(check1.allowed, false);

  // Instantly change predictions to public
  (await updatePrivacySettings('user-a', { predictionsVisibility: 'public' }));
  const check2 = (await resolveVisibility('user-d', 'user-a', 'predictions'));
  assert.equal(check2.allowed, true, 'Privacy setting changes must take effect immediately on next read');
});
