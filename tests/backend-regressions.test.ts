import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { isReleased, isValidDate } from '../lib/eligibility';

const project = fileURLToPath(new URL('..', import.meta.url));

function runChild(databasePath: string, source: string): any {
  const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
    cwd: project,
    env: { ...process.env, DATABASE_PATH: databasePath },
    encoding: 'utf8',
  });
  const lines = output.trim().split('\n').map(l => l.trim()).filter(Boolean);
  const jsonLine = lines.find(l => l.startsWith('{') && l.endsWith('}')) || lines[lines.length - 1];
  return jsonLine ? JSON.parse(jsonLine) : null;
}

test('release eligibility accepts only actual dates and releases at UTC day boundaries', () => {
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2023-02-29'), false);
  assert.equal(isValidDate('2024-04-31'), false);
  assert.equal(isValidDate('2024-1-01'), false);
  assert.equal(isValidDate('2024-00-01'), false);
  assert.equal(isValidDate('2024-12-01T00:00:00Z'), false);
  const before = Date.parse('2026-05-09T23:59:59.999Z');
  const releaseDay = Date.parse('2026-05-10T00:00:00.000Z');
  assert.equal(isReleased('2026-05-10', before), false);
  assert.equal(isReleased('2026-05-10', releaseDay), true);
  assert.equal(isReleased(null, releaseDay), false);
  assert.equal(isReleased('not-a-date', releaseDay), false);
});

test('concurrent registration returns one controlled conflict and no orphaned session', () => {
  const folder = mkdtempSync(join(tmpdir(), 'cinepulse-auth-race-'));
  const source = `
    const { register } = await import('./lib/auth.ts');
    const { db } = await import('./lib/db.ts');
    const input = { name: 'Race User', email: 'race@example.test', password: 'long enough race password' };
    const results = await Promise.allSettled([register(input), register(input)]);
    const rejected = results.filter((item) => item.status === 'rejected').map((item) => ({ status: item.reason?.status, message: item.reason?.message }));
    const d = db();
    const users = d.prepare('SELECT COUNT(*) AS count FROM users').get().count;
    const sessions = d.prepare('SELECT COUNT(*) AS count FROM sessions').get().count;
    console.log(JSON.stringify({ fulfilled: results.filter((item) => item.status === 'fulfilled').length, rejected, users, sessions }));
  `;
  try {
    const result = runChild(join(folder, 'race.db'), source);
    assert.equal(result.fulfilled, 1);
    assert.deepEqual(result.rejected, [{ status: 409, message: 'An account with this email already exists' }]);
    assert.equal(Number(result.users), 1);
    assert.equal(Number(result.sessions), 1);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('library release policy rejects unreleased TV status/rating but allows a watchlist', () => {
  const folder = mkdtempSync(join(tmpdir(), 'cinepulse-library-policy-'));
  const source = `
    process.env.CATALOG_MODE = 'tmdb';
    process.env.TMDB_READ_TOKEN = 'test-token';
    globalThis.fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      const id = path.split('/').pop();
      const release = id === '101' ? '2099-01-01' : '2000-01-01';
      return new Response(JSON.stringify({ id: Number(id), name: 'Test Series', overview: '', genres: [], first_air_date: release, credits: { cast: [], crew: [] }, videos: { results: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const { db } = await import('./lib/db.ts');
    const { putLibrary } = await import('./lib/library.ts');
    db().prepare('INSERT INTO users(id,name,email,password_hash,created_at) VALUES(?,?,?,?,?)').run('user-1','User','user@example.test','not-a-login-hash',new Date().toISOString());
    const user = { id: 'user-1', name: 'User', email: 'user@example.test', createdAt: new Date().toISOString() };
    const errors = [];
    await putLibrary(user, 'tv-101', { status: 'watchlist' });
    for (const input of [{ status: 'watching' }, { status: 'watched', rating: 4 }]) {
      try { await putLibrary(user, 'tv-101', input); } catch (error) { errors.push({ status: error.status, message: error.message }); }
    }
    await putLibrary(user, 'tv-102', { status: 'watching', rating: 4 });
    console.log(JSON.stringify({ errors, rows: db().prepare('SELECT title_id,status,rating FROM library ORDER BY title_id').all() }));
  `;
  try {
    const result = runChild(join(folder, 'library.db'), source);
    assert.deepEqual(result.errors.map((error: any) => error.status), [400, 400]);
    assert.deepEqual(result.rows, [
      { title_id: 'tv-101', status: 'watchlist', rating: null },
      { title_id: 'tv-102', status: 'watching', rating: 4 },
    ]);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
