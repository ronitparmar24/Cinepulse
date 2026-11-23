import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../lib/auth';
import { adminEmails } from '../lib/auth/guards';

const route = await import('../app/api/[...path]/route');
const { NextRequest } = await import('next/server');

function call(method: 'GET' | 'POST', cookie?: string, body?: unknown) {
  const url = 'http://127.0.0.1:3000/api/admin/ai-community';
  const headers: Record<string, string> = { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000', 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  const req = new NextRequest(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const ctx = { params: Promise.resolve({ path: ['admin', 'ai-community'] }) };
  return method === 'GET' ? route.GET(req, ctx) : route.POST(req, ctx);
}

test('ADMIN_EMAILS parsing is case-insensitive and ignores blanks', () => {
  const set = adminEmails({ ADMIN_EMAILS: ' Boss@Example.com, ,ops@example.com ' } as unknown as NodeJS.ProcessEnv);
  assert.deepEqual([...set].sort(), ['boss@example.com', 'ops@example.com']);
});

test('admin endpoint: 401 signed out, 403 for a normal user, 200 for a listed admin', async () => {
  const stamp = Date.now();
  const normal = await register({ name: 'Normal', email: `normal.${stamp}@example.com`, password: 'normal-password-1' });
  const admin = await register({ name: 'Admin', email: `admin.${stamp}@example.com`, password: 'admin-password-12' });
  process.env.ADMIN_EMAILS = `admin.${stamp}@example.com`;
  assert.equal((await call('GET')).status, 401);
  assert.equal((await call('GET', `cinepulse_session=${normal.token}`)).status, 403);
  assert.equal((await call('POST', `cinepulse_session=${normal.token}`, { paused: true })).status, 403, 'normal users must not pause the AI community');
  assert.equal((await call('GET', `cinepulse_session=${admin.token}`)).status, 200);
  delete process.env.ADMIN_EMAILS;
  assert.equal((await call('GET', `cinepulse_session=${admin.token}`)).status, 403, 'closed when ADMIN_EMAILS is empty');
});
