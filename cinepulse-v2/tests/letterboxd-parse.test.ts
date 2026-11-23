import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, toCsv } from '../lib/import/csv';
import { parseLetterboxdExport } from '../lib/import/letterboxd-parse';

test('CSV: quotes, escaped quotes, commas and newlines inside fields, CRLF, BOM', () => {
  const text = '﻿Name,Review\r\n"Heat, 1995","Line one\nline ""two"""\r\nAlien,\r\n';
  assert.deepEqual(parseCsv(text), [['Name', 'Review'], ['Heat, 1995', 'Line one\nline "two"'], ['Alien', '']]);
  assert.deepEqual(parseCsv(toCsv([['a,b', 'c"d', null]])), [['a,b', 'c"d', '']]);
});

test('Letterboxd export: diary with rewatch/tags/review, ratings, watchlist, likes', () => {
  const files = {
    'letterboxd-user-2026/diary.csv': 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2026-01-03,Heat,1995,https://boxd.it/x,4.5,Yes,"cinema, 35mm",2026-01-02\n2026-02-01,Alien,1979,https://boxd.it/y,,,,2026-02-01\n',
    'letterboxd-user-2026/reviews.csv': 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n2026-01-03,Heat,1995,https://boxd.it/x,4.5,Yes,"The bank scene, still.",,2026-01-02\n2025-05-05,Paris Texas,1984,https://boxd.it/z,5,,Quiet devastation.,,2025-05-05\n',
    'letterboxd-user-2026/ratings.csv': 'Date,Name,Year,Letterboxd URI,Rating\n2026-01-03,Heat,1995,https://boxd.it/x,4.5\n2025-01-01,Bad Film,2001,u,7\n',
    'letterboxd-user-2026/watchlist.csv': 'Date,Name,Year,Letterboxd URI\n2026-03-01,Dune: Part Three,,u\n',
    'letterboxd-user-2026/likes/films.csv': 'Date,Name,Year,Letterboxd URI\n2026-01-03,Heat,1995,u\n',
    'letterboxd-user-2026/profile.csv': 'Username\nme\n',
    'letterboxd-user-2026/comments.csv': 'x\n',
  };
  const out = parseLetterboxdExport(files);
  assert.deepEqual(out.counts, { diary: 2, rating: 2, watched: 0, watchlist: 1, like: 1, review: 1 });
  const heat = out.actions.find((a) => a.kind === 'diary' && a.name === 'Heat')!;
  assert.equal(heat.watchedOn, '2026-01-02');
  assert.equal(heat.rating, 4.5);
  assert.equal(heat.rewatch, true);
  assert.deepEqual(heat.tags, ['cinema', '35mm']);
  assert.equal(heat.review, 'The bank scene, still.', 'review text is attached to its diary entry');
  assert.equal(out.actions.find((a) => a.kind === 'review')?.name, 'Paris Texas', 'reviews without a diary row stand alone');
  assert.equal(out.actions.find((a) => a.kind === 'rating' && a.name === 'Bad Film')?.rating, null, 'out-of-range ratings are dropped');
  assert.equal(out.actions.find((a) => a.kind === 'watchlist')?.year, null);
  assert.deepEqual(out.films.map((f) => f.key).sort(), ['Alien|1979', 'Bad Film|2001', 'Dune: Part Three|', 'Heat|1995', 'Paris Texas|1984']);
  assert.deepEqual(out.unrecognisedFiles, ['comments.csv'], 'profile.csv is account metadata and is skipped; other unknown CSVs are reported');
});
