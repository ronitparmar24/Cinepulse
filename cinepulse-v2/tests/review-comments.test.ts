import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../lib/auth';
import { db, now } from '../lib/db';
import { putReview, community, titleReviews } from '../lib/reviews';
import { addComment, deleteComment, getComments, toggleLike } from '../lib/social/interactions';
import { getTrendingFilms, getTrendingReviews, getRisingUsers } from '../lib/social/explore';
import { titleIdAvailable } from '../lib/catalog';
import { getNotifications } from '../lib/social/notifications';

let n = 0;
const member = async (name = 'Comment Fan') => {
  const i = ++n;
  const { user, token } = await register({ name: `${name} ${i}`, email: `talk${i}.${Date.now()}@member-mail.org`, password: 'comment-password-1' });
  await db().run('UPDATE users SET username = ? WHERE id = ?', `talker_${i}_${Date.now() % 100000}`, user.id);
  return { user, token };
};
const releasedDemoTitle = async () => {
  const { catalog } = await import('../lib/catalog');
  const items = (await catalog({ media: 'all', collection: 'trending', page: 1 })).items;
  return items.find((t) => t.releaseDate && t.releaseDate < '2026-01-01') ?? items[0];
};

test('comments: write, reply one level deep, like, and delete', async () => {
  const author = await member('Review Author');
  const fan = await member('Fan');
  const other = await member('Other');
  const title = await releasedDemoTitle();
  await putReview(author.user, title.id, { body: 'Loved every minute.', spoiler: false });
  const review = (await titleReviews(title.id)).find((r) => r.userId === author.user.id)!;

  const first = await addComment(fan.user.id, 'review', review.id, '  What a take!  ');
  assert.equal(first.success, true);
  assert.equal(first.comment!.body, 'What a take!', 'trimmed');
  const reply = await addComment(author.user.id, 'review', review.id, '@fan thanks!', undefined, { parentId: first.comment!.id });
  assert.equal(reply.comment!.parentId, first.comment!.id);
  const replyToReply = await addComment(other.user.id, 'review', review.id, 'Agreed', undefined, { parentId: reply.comment!.id });
  assert.equal(replyToReply.comment!.parentId, first.comment!.id, 'replies to a reply attach to the top comment');

  // Likes on comments
  const liked = await toggleLike(other.user.id, 'comment', String(first.comment!.id), true);
  assert.equal(liked.likesCount, 1);
  let list = await getComments('review', review.id, other.user.id);
  assert.equal(list.find((c) => c.id === first.comment!.id)!.likesCount, 1);
  assert.equal(list.find((c) => c.id === first.comment!.id)!.viewerLiked, true);
  assert.equal(list.length, 3);

  // Counts and the viewer's like on reviews
  await toggleLike(fan.user.id, 'review', review.id, true);
  const seen = (await community(fan.user.id)).find((r) => r.id === review.id)!;
  assert.equal(seen.likesCount, 1);
  assert.equal(seen.commentsCount, 3);
  assert.equal(seen.viewerLiked, true);
  assert.equal((await community(other.user.id)).find((r) => r.id === review.id)!.viewerLiked, false);

  // Notifications: the review's author hears about the comment, the commenter about the reply.
  assert.ok((await getNotifications(author.user.id)).items.some((i) => i.type === 'commented'));
  assert.ok((await getNotifications(fan.user.id)).items.some((i) => i.type === 'replied'));

  // Deleting a comment that has replies leaves a placeholder; one without replies disappears.
  assert.equal((await deleteComment(first.comment!.id, other.user.id)).httpStatus, 403, 'not yours');
  assert.equal((await deleteComment(first.comment!.id, fan.user.id)).success, true);
  list = await getComments('review', review.id, fan.user.id);
  const placeholder = list.find((c) => c.id === first.comment!.id)!;
  assert.equal(placeholder.isDeleted, true);
  assert.equal(placeholder.canDelete, false);
  assert.equal((await deleteComment(replyToReply.comment!.id, author.user.id)).success, true, 'the review author can remove comments on their review');
  await deleteComment(reply.comment!.id, author.user.id);
  list = await getComments('review', review.id, fan.user.id);
  assert.equal(list.length, 0, 'a deleted comment with no replies left is gone');
  assert.equal((await toggleLike(fan.user.id, 'comment', String(first.comment!.id), true)).error, 'That comment is no longer available');
});

test('comments: refuse empty, too long, missing or hidden targets, and foreign parents', async () => {
  const a = await member();
  const title = await releasedDemoTitle();
  await putReview(a.user, title.id, { body: 'Fine.', spoiler: false });
  const review = (await titleReviews(title.id)).find((r) => r.userId === a.user.id)!;
  assert.equal((await addComment(a.user.id, 'review', review.id, '   ')).httpStatus, 400);
  assert.equal((await addComment(a.user.id, 'review', review.id, 'x'.repeat(1001))).httpStatus, 400);
  assert.equal((await addComment(a.user.id, 'review', 'no-such-review', 'hello')).httpStatus, 404);
  assert.equal((await addComment(a.user.id, 'title' as any, title.id, 'hello')).httpStatus, 400);
  const elsewhere = await addComment(a.user.id, 'review', review.id, 'parent');
  await db().run(`INSERT INTO reviews (id, user_id, title_id, title_name, body, rating, spoiler, kind, created_at) VALUES ('other-review-x', ?, 'demo-other', 'Other', 'b', NULL, 0, 'review', ?)`, a.user.id, now());
  assert.equal((await addComment(a.user.id, 'review', 'other-review-x', 'reply', undefined, { parentId: elsewhere.comment!.id })).httpStatus, 404, 'a parent from another thread');
  await db().run('UPDATE reviews SET hidden_at = ? WHERE id = ?', now(), review.id);
  assert.equal((await addComment(a.user.id, 'review', review.id, 'hello?')).httpStatus, 404, 'hidden by moderators');
});

test('comments API: anyone can read, members can post and reply', async () => {
  const route = await import('../app/api/[...path]/route');
  const { NextRequest } = await import('next/server');
  const call = (method: 'GET' | 'POST', path: string, cookie?: string, payload?: unknown) => {
    const [p, q] = path.split('?');
    const headers: Record<string, string> = { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000', 'content-type': 'application/json' };
    if (cookie) headers.cookie = cookie;
    return route[method](new NextRequest(`http://127.0.0.1:3000/api/${p}${q ? `?${q}` : ''}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) }), { params: Promise.resolve({ path: p.split('/') }) });
  };
  const a = await member();
  const b = await member();
  const title = await releasedDemoTitle();
  await putReview(a.user, title.id, { body: 'Great.', spoiler: false });
  const review = (await titleReviews(title.id)).find((r) => r.userId === a.user.id)!;
  assert.equal((await call('POST', 'comments', undefined, { targetType: 'review', targetId: review.id, body: 'hi' })).status, 401);
  const posted = await call('POST', 'comments', `cinepulse_session=${b.token}`, { targetType: 'review', targetId: review.id, body: 'Nice one' });
  assert.equal(posted.status, 200);
  const { comment } = await posted.json();
  const replied = await (await call('POST', 'comments', `cinepulse_session=${a.token}`, { targetType: 'review', targetId: review.id, body: 'Thanks', parentId: comment.id })).json();
  assert.equal(replied.comment.parentId, comment.id);
  const read = await call('GET', `comments?targetType=review&targetId=${review.id}`);
  assert.equal(read.status, 200);
  assert.deepEqual((await read.json()).comments.map((c: any) => c.body), ['Nice one', 'Thanks']);
  const list = await (await call('GET', 'community', `cinepulse_session=${b.token}`)).json();
  assert.equal(list.reviews.find((r: any) => r.id === review.id).commentsCount, 2);
});

test('explore: only titles the catalogue can open, never a raw id; people are real profiles', async () => {
  const viewer = await member('Viewer');
  const someone = await member('Someone');
  const title = await releasedDemoTitle();
  assert.equal(titleIdAvailable(title.id), true);
  assert.equal(titleIdAvailable('movie-123'), false, 'TMDB ids are not openable in demo mode');
  assert.equal(titleIdAvailable('../etc'), false);
  const add = (id: string) => db().run(`INSERT INTO activity_events (user_id, type, target_type, target_id, metadata, visibility, created_at) VALUES (?, 'watched', 'title', ?, '{}', 'public', ?)`, someone.user.id, id, now());
  for (let i = 0; i < 9; i++) await add('demo-not-a-real-title');
  for (let i = 0; i < 8; i++) await add('movie-424242');
  await add(title.id);
  const films = await getTrendingFilms(50);
  assert.ok(films.some((f) => f.titleId === title.id && f.title === title.title));
  assert.ok(!films.some((f) => f.titleId === 'demo-not-a-real-title' || f.titleId === 'movie-424242'));
  assert.ok(films.every((f) => f.title !== f.titleId));
  assert.deepEqual(films.map((f) => f.trendingRank), films.map((_, i) => i + 1), 'ranks have no gaps');

  await putReview(someone.user, title.id, { body: 'Superb', spoiler: true });
  const reviews = await getTrendingReviews(50, viewer.user.id);
  const mine = reviews.find((r) => r.author.id === someone.user.id)!;
  assert.equal(mine.body, '', 'spoilers are not sent to other people');
  assert.equal(mine.viewerLiked, false);

  const testAccount = await register({ name: 'Probe', email: `probe.${Date.now()}@example.com`, password: 'probe-password-1' });
  await db().run('UPDATE users SET username = ? WHERE id = ?', `probe_${Date.now() % 100000}`, testAccount.user.id);
  const people = await getRisingUsers(100, viewer.user.id);
  assert.ok(!people.some((p) => p.id === viewer.user.id), 'not yourself');
  assert.ok(!people.some((p) => p.id === testAccount.user.id), 'no test accounts');
  assert.ok(people.some((p) => p.id === someone.user.id));
  assert.ok(people.every((p) => p.username && !String(p.avatarUrl ?? '').includes('dicebear')));
});
