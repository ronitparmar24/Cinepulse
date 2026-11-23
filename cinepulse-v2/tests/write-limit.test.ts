import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceWriteLimit, writeActor } from '../lib/auth/writeLimit';

const req = (headers: Record<string, string>) => new Request('http://127.0.0.1:3000/api/library/x', { method: 'PUT', headers });

test('write limit: the 61st write in a minute from one actor is refused with 429', async () => {
  const r = req({ 'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 200) + 20}` });
  for (let i = 0; i < 60; i++) await enforceWriteLimit(r, 'library');
  await assert.rejects(() => enforceWriteLimit(r, 'library'), (e: { status?: number }) => e.status === 429);
});

test('write limit: counted per actor (session beats IP), and auth/cron are exempt', async () => {
  const a = req({ cookie: 'cinepulse_session=token-a', 'x-forwarded-for': '198.51.100.7' });
  const b = req({ cookie: 'cinepulse_session=token-b', 'x-forwarded-for': '198.51.100.7' });
  assert.notEqual(writeActor(a), writeActor(b));
  for (let i = 0; i < 5; i++) await enforceWriteLimit(a, 'reviews', 5);
  await assert.rejects(() => enforceWriteLimit(a, 'reviews', 5));
  await enforceWriteLimit(b, 'reviews', 5); // a different session on the same IP is unaffected
  for (let i = 0; i < 10; i++) await enforceWriteLimit(a, 'auth', 5); // auth has its own limiter
});
