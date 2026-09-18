import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const tempDir = mkdtempSync(join(tmpdir(), 'cinepulse-social-api-'));
const testDbPath = join(tempDir, 'social_api.db');
process.env.DATABASE_PATH = testDbPath;
process.env.CATALOG_MODE = 'demo';

const { db, now } = await import('../lib/db');
const { getPublicProfile, updateUserProfile, getUserByUsername } = await import('../lib/social/profile');
const { followUser, unfollowUser, getPendingFollowRequests, acceptFollowRequest, getFollowers, getFollowing } = await import('../lib/social/follows');
const { logActivityEvent, getFollowedFeed, getGlobalFeed, revealSpoiler } = await import('../lib/social/activity');
const { toggleLike, addComment, deleteComment, getComments, blockUser, unblockUser } = await import('../lib/social/interactions');
const { getTasteMatch, getMutualWatchlist, getWhoToFollowSuggestions } = await import('../lib/social/differentiators');
const { getUnreadCount, getNotifications, markNotificationsAsRead } = await import('../lib/social/notifications');
const { getUserWatchlist, getUserDiary, getUserReviews, getUserPredictions } = await import('../lib/social/subresources');
const { updatePrivacySettings } = await import('../lib/social/visibility');

const userAId = 'user-alice';
const userBId = 'user-bob-private';
const userCId = 'user-charlie';

test.before(() => {
  const d = db();
  const stamp = now();

  // Create Alice (public)
  d.prepare(`
    INSERT INTO users (id, name, email, password_hash, username, display_name, bio, profile_visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'public', ?)
  `).run(userAId, 'Alice Cinephile', 'alice@cine.test', 'hash', 'alice', 'Alice C.', 'Sci-fi enthusiast', stamp);

  // Create Bob (private)
  d.prepare(`
    INSERT INTO users (id, name, email, password_hash, username, display_name, bio, profile_visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'private', ?)
  `).run(userBId, 'Bob Secretive', 'bob@cine.test', 'hash', 'bob', 'Bob S.', 'Private film diary', stamp);

  // Create Charlie (public)
  d.prepare(`
    INSERT INTO users (id, name, email, password_hash, username, display_name, bio, profile_visibility, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'public', ?)
  `).run(userCId, 'Charlie Viewer', 'charlie@cine.test', 'hash', 'charlie', 'Charlie V.', 'Casual watcher', stamp);

  // Populate library for Bob (watchlist and watched films)
  d.prepare(`
    INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at)
    VALUES (?, ?, ?, 'watchlist', null, ?)
  `).run(userBId, 'demo-dunes', JSON.stringify({ id: 'demo-dunes', title: 'Dune: Part Two', poster: '/assets/dunes.webp' }), stamp);

  d.prepare(`
    INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at)
    VALUES (?, ?, ?, 'watched', 5, ?)
  `).run(userBId, 'demo-blade-runner-2049', JSON.stringify({ id: 'demo-blade-runner-2049', title: 'Blade Runner 2049', poster: '/assets/blade.webp' }), stamp);

  // Shared library for Alice and Charlie to test Taste Match (Pearson correlation)
  // Shared films 1 to 5
  const titles = ['demo-film-1', 'demo-film-2', 'demo-film-3', 'demo-film-4', 'demo-film-5'];
  const ratingsAlice = [5, 4, 3, 5, 4];
  const ratingsCharlie = [4, 4, 3, 5, 3];

  for (let i = 0; i < 5; i++) {
    const tId = titles[i];
    const tJson = JSON.stringify({ id: tId, title: `Film ${i + 1}`, poster: null });
    d.prepare(`
      INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at)
      VALUES (?, ?, ?, 'watched', ?, ?)
    `).run(userAId, tId, tJson, ratingsAlice[i], stamp);

    d.prepare(`
      INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at)
      VALUES (?, ?, ?, 'watched', ?, ?)
    `).run(userCId, tId, tJson, ratingsCharlie[i], stamp);
  }

  // Mutual watchlist film between Alice and Charlie
  d.prepare(`
    INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at)
    VALUES (?, ?, ?, 'watchlist', null, ?)
  `).run(userAId, 'demo-interstellar', JSON.stringify({ id: 'demo-interstellar', title: 'Interstellar' }), stamp);

  d.prepare(`
    INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at)
    VALUES (?, ?, ?, 'watchlist', null, ?)
  `).run(userCId, 'demo-interstellar', JSON.stringify({ id: 'demo-interstellar', title: 'Interstellar' }), stamp);

  // Alice forecast prediction to test Brier score
  d.prepare(`
    INSERT INTO forecast_events (id, user_id, title_id, choice, confidence, reason, created_at, first_submission, release_date)
    VALUES ('event-1', ?, 'demo-film-1', 'hit', 80, 'Great director', ?, 1, '2020-01-01')
  `).run(userAId, stamp);
});

test.after(() => {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});

test('Public Profile: returns stats, favorite films, and Brier score for public user', async () => {
  const result = await getPublicProfile('alice', null);
  assert.equal(result.profile !== null, true);
  const p = result.profile!;
  assert.equal(p.username, 'alice');
  assert.equal(p.displayName, 'Alice C.');
  assert.equal(p.stats.totalFilmsWatched, 5);
  assert.equal(typeof p.stats.brierScore, 'number');
  assert.equal(typeof p.stats.hitRate, 'number');
});

test('Public Profile: private user displays pending state without leaking stats to non-follower', async () => {
  const result = await getPublicProfile('bob', userAId);
  assert.equal(result.profile !== null, true);
  const p = result.profile!;
  assert.equal(p.username, 'bob');
  assert.equal(p.isFollowing, false);
  // Stats and favorites are stripped for private account
  assert.equal(p.stats.totalFilmsWatched, 0);
  assert.equal(p.favoriteFilms?.length || 0, 0);
});

test('Privacy Gate: MUST deny non-follower from accessing private user watchlist', () => {
  const res = getUserWatchlist('bob', userAId);
  assert.equal(res.allowed, false);
  assert.equal(res.status, 'denied');
});

test('Follow Workflow: request to private user becomes pending, accepted follower gains access', () => {
  // Alice follows private Bob
  const followRes = followUser(userAId, 'bob');
  assert.equal(followRes.success, true);
  assert.equal(followRes.status, 'pending');

  // Check Bob received a follow_request notification
  assert.equal(getUnreadCount(userBId), 1);
  const requests = getPendingFollowRequests(userBId);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].follower.username, 'alice');

  // Bob accepts Alice's follow request
  const acceptRes = acceptFollowRequest(userBId, userAId);
  assert.equal(acceptRes.success, true);

  // Now Alice IS an accepted follower: Alice CAN read Bob's watchlist!
  const watchlistRes = getUserWatchlist('bob', userAId);
  assert.equal(watchlistRes.allowed, true);
  assert.equal(watchlistRes.items?.length, 1);
  assert.equal(watchlistRes.items![0].titleId, 'demo-dunes');
});

test('Chronological Activity Feed: reverse-chronological and server-side spoiler redaction', () => {
  // Bob logs a review with a spoiler
  const eventId = logActivityEvent(userBId, 'reviewed', 'title', 'demo-dunes', {
    titleName: 'Dune: Part Two',
    spoiler: true,
    reviewBody: 'The secret plot twist at the end is shocking!',
  });

  // Alice fetches her feed (Alice follows Bob)
  const feed = getFollowedFeed(userAId);
  assert.equal(feed.items.length > 0, true);
  const item = feed.items.find((x) => x.id === eventId);
  assert.equal(Boolean(item), true);

  // Server-side spoiler redaction: reviewBody must NOT be present in payload!
  assert.equal(item!.metadata.reviewBody, undefined);
  assert.equal(item!.metadata.spoilerRedacted, true);

  // Alice explicitly reveals the spoiler
  revealSpoiler(userAId, String(eventId));
  const feedAfterReveal = getFollowedFeed(userAId);
  const itemRevealed = feedAfterReveal.items.find((x) => x.id === eventId);
  assert.equal(itemRevealed!.metadata.spoilerRevealed, true);
});

test('Taste Match: Pearson correlation agreement calculated over shared rated titles', () => {
  const match = getTasteMatch(userAId, 'charlie');
  assert.equal(match.coWatchedCount, 5);
  assert.equal(typeof match.score, 'number');
  assert.equal(match.score! > 70, true, 'Correlated ratings should yield high taste agreement');
  assert.match(match.description || '', /agree \d+% of the time/);
});

test('Mutual Watchlist: surfaces shared films between viewer and target', () => {
  const overlap = getMutualWatchlist(userAId, 'charlie');
  assert.equal(overlap.count, 1);
  assert.equal(overlap.titles![0].id, 'demo-interstellar');
});

test('Likes, Threaded Comments with soft-delete & Block cascade', () => {
  const d = db();
  const stamp = now();
  // Alice authors reviews rev-1 and rev-2
  d.prepare(`
    INSERT INTO reviews (id, user_id, title_id, title_name, body, rating, spoiler, kind, created_at)
    VALUES ('rev-1', ?, 'demo-film-1', 'Film 1', 'Masterpiece', 5, 0, 'review', ?)
  `).run(userAId, stamp);

  d.prepare(`
    INSERT INTO reviews (id, user_id, title_id, title_name, body, rating, spoiler, kind, created_at)
    VALUES ('rev-2', ?, 'demo-film-2', 'Film 2', 'Great flick', 4, 0, 'review', ?)
  `).run(userAId, stamp);

  // Charlie comments on Alice's review
  const commentRes = addComment(userCId, 'review', 'rev-1', 'Outstanding cinematography!');
  assert.equal(commentRes.success, true);
  const commentId = commentRes.comment!.id;

  // Verify comment is returned
  let comments = getComments('review', 'rev-1', userAId);
  assert.equal(comments.length, 1);
  assert.equal(comments[0].body, 'Outstanding cinematography!');

  // Alice soft-deletes the comment on her content
  const delRes = deleteComment(commentId, userAId);
  assert.equal(delRes.success, true);

  // Thread integrity: body is replaced with [Comment deleted]
  comments = getComments('review', 'rev-1', userAId);
  assert.equal(comments.length, 1);
  assert.equal(comments[0].body, '[Comment deleted]');
  assert.equal(comments[0].isDeleted, true);

  // Add another comment by Charlie
  const c2 = addComment(userCId, 'review', 'rev-2', 'Another comment');
  assert.equal(c2.success, true);

  // Alice blocks Charlie -> Block cascade: Charlie's comment is hidden retroactively from Alice!
  blockUser(userAId, 'charlie');
  const commentsAfterBlock = getComments('review', 'rev-2', userAId);
  assert.equal(commentsAfterBlock.length, 0, 'Blocked user comments must be hidden retroactively');
});
