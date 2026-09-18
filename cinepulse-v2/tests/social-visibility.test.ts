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

const { db } = await import('../lib/db.ts');
const { resolveVisibility, updatePrivacySettings, getPrivacySettings } = await import('../lib/social/visibility.ts');

test.before(() => {
  const d = db();
  const now = new Date().toISOString();

  // Create test users
  // User A: Public profile
  d.prepare(`
    INSERT INTO users (id, name, email, password_hash, username, display_name, profile_visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('user-a', 'Alice Public', 'alice@test.local', 'hash', 'alice', 'Alice', 'public', now);

  // User B: Private profile
  d.prepare(`
    INSERT INTO users (id, name, email, password_hash, username, display_name, profile_visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('user-b', 'Bob Private', 'bob@test.local', 'hash', 'bob', 'Bob', 'private', now);

  // User C: Followers-only profile
  d.prepare(`
    INSERT INTO users (id, name, email, password_hash, username, display_name, profile_visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('user-c', 'Charlie Restricted', 'charlie@test.local', 'hash', 'charlie', 'Charlie', 'followers_only', now);

  // User D: Regular user (Viewer)
  d.prepare(`
    INSERT INTO users (id, name, email, password_hash, username, display_name, profile_visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('user-d', 'Dave Viewer', 'dave@test.local', 'hash', 'dave', 'Dave', 'public', now);

  // User E: Follower with pending request
  d.prepare(`
    INSERT INTO users (id, name, email, password_hash, username, display_name, profile_visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('user-e', 'Eve Pending', 'eve@test.local', 'hash', 'eve', 'Eve', 'public', now);

  // User F: Stranger (Not following, not blocked)
  d.prepare(`
    INSERT INTO users (id, name, email, password_hash, username, display_name, profile_visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('user-f', 'Frank Stranger', 'frank@test.local', 'hash', 'frank', 'Frank', 'public', now);

  // Relationships
  // Dave is an accepted follower of Bob
  d.prepare(`
    INSERT INTO follows (follower_id, followee_id, status, created_at)
    VALUES (?, ?, 'accepted', ?)
  `).run('user-d', 'user-b', now);

  // Eve has a pending follow request to Bob
  d.prepare(`
    INSERT INTO follows (follower_id, followee_id, status, created_at)
    VALUES (?, ?, 'pending', ?)
  `).run('user-e', 'user-b', now);

  // Bob blocked Alice
  d.prepare(`
    INSERT INTO blocks (blocker_id, blocked_id, created_at)
    VALUES (?, ?, ?)
  `).run('user-b', 'user-a', now);
});

test.after(() => {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});

test('resolveVisibility: owner always has access to their own resources regardless of privacy', () => {
  const result = resolveVisibility('user-b', 'user-b', 'watchlist');
  assert.equal(result.allowed, true);
  assert.equal(result.status, 'granted');
  assert.equal(result.isOwner, true);
});

test('resolveVisibility: MUST deny non-follower attempting to read a private user watchlist', () => {
  // Frank is NOT following Bob, is NOT blocked, and Bob is private
  const result = resolveVisibility('user-f', 'user-b', 'watchlist');
  assert.equal(result.allowed, false, 'Non-follower must never access private watchlist');
  assert.equal(result.status, 'denied');
  assert.equal(result.reason, 'Private account');
});

test('resolveVisibility: MUST deny anonymous viewer attempting to read a private user watchlist', () => {
  const result = resolveVisibility(null, 'user-b', 'watchlist');
  assert.equal(result.allowed, false, 'Anonymous viewer must never access private watchlist');
  assert.equal(result.status, 'denied');
});

test('resolveVisibility: pending follow request to private user returns status=pending and allowed=false', () => {
  const result = resolveVisibility('user-e', 'user-b', 'watchlist');
  assert.equal(result.allowed, false);
  assert.equal(result.status, 'pending');
  assert.equal(result.followStatus, 'pending');
});

test('resolveVisibility: accepted follower CAN access private user public/default resources', () => {
  // Dave is an accepted follower of Bob
  const result = resolveVisibility('user-d', 'user-b', 'watchlist');
  assert.equal(result.allowed, true, 'Accepted follower should see default watchlist');
  assert.equal(result.status, 'granted');
  assert.equal(result.followStatus, 'accepted');
});

test('resolveVisibility: blocks prevent any access even if public or previously following', () => {
  // Bob blocked Alice. Alice trying to view Bob's profile
  const result1 = resolveVisibility('user-a', 'user-b', 'profile');
  assert.equal(result1.allowed, false);
  assert.equal(result1.status, 'blocked');

  // Bob trying to view Alice (bidirectional block check)
  const result2 = resolveVisibility('user-b', 'user-a', 'profile');
  assert.equal(result2.allowed, false);
  assert.equal(result2.status, 'blocked');
});

test('resolveVisibility: granular resource-level privacy overrides public profile', () => {
  // Alice has a public profile, but sets diary to private and reviews to followers_only
  updatePrivacySettings('user-a', {
    diaryVisibility: 'private',
    reviewsVisibility: 'followers_only',
  });

  // Dave (not a follower of Alice) checks Alice's profile card -> allowed
  const profileRes = resolveVisibility('user-d', 'user-a', 'profile');
  assert.equal(profileRes.allowed, true);

  // Dave checks Alice's diary (set to private) -> denied
  const diaryRes = resolveVisibility('user-d', 'user-a', 'diary');
  assert.equal(diaryRes.allowed, false);
  assert.equal(diaryRes.reason, 'Private resource');

  // Dave checks Alice's reviews (set to followers_only) -> denied
  const reviewsRes = resolveVisibility('user-d', 'user-a', 'reviews');
  assert.equal(reviewsRes.allowed, false);
  assert.equal(reviewsRes.reason, 'Followers-only resource');
});

test('resolveVisibility: per-list granular privacy enforcement', () => {
  // Public profile Alice has a custom list marked 'private' ("films with ex")
  const privateListRes = resolveVisibility('user-d', 'user-a', 'list', 'private');
  assert.equal(privateListRes.allowed, false);
  assert.equal(privateListRes.reason, 'Private resource');

  // Alice has another list marked 'public'
  const publicListRes = resolveVisibility('user-d', 'user-a', 'list', 'public');
  assert.equal(publicListRes.allowed, true);
});

test('resolveVisibility: immediate cache-free update upon privacy_settings write', () => {
  // Set predictions to private
  updatePrivacySettings('user-a', { predictionsVisibility: 'private' });
  const check1 = resolveVisibility('user-d', 'user-a', 'predictions');
  assert.equal(check1.allowed, false);

  // Instantly change predictions to public
  updatePrivacySettings('user-a', { predictionsVisibility: 'public' });
  const check2 = resolveVisibility('user-d', 'user-a', 'predictions');
  assert.equal(check2.allowed, true, 'Privacy setting changes must take effect immediately on next read');
});
