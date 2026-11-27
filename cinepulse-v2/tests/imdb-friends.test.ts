import test from 'node:test';
import assert from 'node:assert/strict';
import { isImdbCsv, parseImdbExport } from '../lib/import/imdb-parse';
import { register } from '../lib/auth';
import { db, now } from '../lib/db';
import { notifyFollowersOfReview } from '../lib/reviews';
import { getNotifications } from '../lib/social/notifications';

const RATINGS = `Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
tt15239678,9,2024-03-05,Dune: Part Two,Dune: Part Two,https://www.imdb.com/title/tt15239678/,Movie,8.5,166,2024,"Action, Adventure",600000,2024-02-27,Denis Villeneuve
tt0087182,6,2023-01-02,Dune,Dune,https://www.imdb.com/title/tt0087182/,Movie,6.3,137,1984,Sci-Fi,170000,1984-12-14,David Lynch
tt0903747,10,2022-06-01,Breaking Bad,Breaking Bad,https://www.imdb.com/title/tt0903747/,TV Series,9.5,49,2008,Drama,2100000,2008-01-20,
tt0959621,8,2022-06-01,Pilot,Pilot,https://www.imdb.com/title/tt0959621/,TV Episode,9.0,58,2008,Drama,50000,2008-01-20,`;
const WATCHLIST = `Position,Const,Created,Modified,Description,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors,Your Rating,Date Rated
1,tt1160419,2024-01-01,2024-01-01,,Dune,Dune,https://www.imdb.com/title/tt1160419/,Movie,8.0,155,2021,Sci-Fi,900000,2021-09-15,Denis Villeneuve,,`;

test('IMDb exports: recognised by their columns, ratings halved to stars, watchlist kept, episodes skipped', () => {
  assert.equal(isImdbCsv(RATINGS), true);
  assert.equal(isImdbCsv(WATCHLIST), true);
  assert.equal(isImdbCsv('Date,Name,Year,Letterboxd URI,Rating\n'), false, 'a Letterboxd file is not IMDb');

  const parsed = parseImdbExport({ 'ratings.csv': RATINGS, 'watchlist.csv': WATCHLIST });
  const ratings = parsed.actions.filter((a) => a.kind === 'rating');
  assert.deepEqual(ratings.map((a) => [a.name, a.year, a.rating]), [['Dune: Part Two', 2024, 4.5], ['Dune', 1984, 3], ['Breaking Bad', 2008, 5]]);
  assert.ok(!parsed.actions.some((a) => a.name === 'Pilot'), 'single episodes are not titles');
  assert.equal(parsed.counts.watched, 3, 'a rated title counts as watched');
  assert.equal(parsed.actions.find((a) => a.kind === 'watched' && a.name === 'Dune')?.watchedOn, '2023-01-02');
  assert.deepEqual(parsed.actions.filter((a) => a.kind === 'watchlist').map((a) => [a.name, a.year]), [['Dune', 2021]]);
  assert.equal(parsed.films.length, 4, 'Dune 1984 and Dune 2021 stay separate films');
});

test('friend activity: followers hear about a new review, unless they cannot see it', async () => {
  const stamp = Date.now();
  const author = (await register({ name: 'Review Author', email: `fa.author.${stamp}@member-mail.org`, password: 'friend-activity-1' })).user;
  const fan = (await register({ name: 'Fan', email: `fa.fan.${stamp}@member-mail.org`, password: 'friend-activity-1' })).user;
  const blocked = (await register({ name: 'Blocked', email: `fa.blocked.${stamp}@member-mail.org`, password: 'friend-activity-1' })).user;
  for (const f of [fan, blocked]) await db().run(`INSERT INTO follows (follower_id, followee_id, status, created_at) VALUES (?, ?, 'accepted', ?)`, f.id, author.id, now());
  await db().run(`INSERT INTO reviews (id, user_id, title_id, title_name, body, rating, spoiler, kind, created_at) VALUES (?, ?, 'demo-x', 'Some Film', 'Great', NULL, 0, 'review', ?)`, `fa-${stamp}`, author.id, now());

  // Reviews visible to followers only: both followers may see it.
  let sent = await notifyFollowersOfReview(author.id, 'demo-x');
  assert.equal(sent, 2);
  const items = (await getNotifications(fan.id)).items.filter((i) => i.type === 'friend_review');
  assert.equal(items.length, 1);

  // Hidden by moderators: nobody is told.
  await db().run('UPDATE reviews SET hidden_at = ? WHERE id = ?', now(), `fa-${stamp}`);
  sent = await notifyFollowersOfReview(author.id, 'demo-x');
  assert.equal(sent, 0);
});
