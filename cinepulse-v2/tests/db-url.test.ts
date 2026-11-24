import test from 'node:test';
import assert from 'node:assert/strict';
import { describeDatabaseUrlProblem, isPostgresUrl, normalizeDatabaseUrl } from '../lib/dbUrl';
import { checkEnvironment } from '../lib/env';

const good = 'postgresql://postgres.ref:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';

test('dashboard paste mistakes are tolerated', () => {
  for (const v of [good, ` ${good}\n`, `"${good}"`, `'${good}'`, `DATABASE_URL=${good}`, `DATABASE_URL="${good}"`]) {
    assert.equal(normalizeDatabaseUrl(v), good, JSON.stringify(v));
    assert.ok(isPostgresUrl(v));
  }
  assert.ok(isPostgresUrl('postgres://u:p@h:5432/db'));
});

test('wrong values are still rejected, with a hint that never echoes the value', () => {
  assert.equal(isPostgresUrl('https://abcd.supabase.co'), false);
  assert.match(describeDatabaseUrlProblem('https://abcd.supabase.co'), /Supabase project URL/);
  assert.match(describeDatabaseUrlProblem('mysql://u:hunter2@h/db'), /starts with "mysql:\/\/"/);
  assert.doesNotMatch(describeDatabaseUrlProblem('mysql://u:hunter2@h/db'), /hunter2/);
  assert.equal(describeDatabaseUrlProblem(''), 'it is empty');
});

test('startup check names the problem and accepts a quoted URL', () => {
  const bad = checkEnvironment({ NODE_ENV: 'production', VERCEL: '1', DATABASE_URL: 'https://abcd.supabase.co' } as NodeJS.ProcessEnv);
  assert.ok(bad.some((p) => /Supabase project URL/.test(p.message)));
  const ok = checkEnvironment({ NODE_ENV: 'production', VERCEL: '1', DATABASE_URL: `"${good}"` } as NodeJS.ProcessEnv);
  assert.ok(!ok.some((p) => /DATABASE_URL/.test(p.message)));
});
