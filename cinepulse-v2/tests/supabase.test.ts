import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupabaseConfigured, getSupabaseUrl, getSupabaseAnonKey, createSupabaseClientFromRequest } from '../lib/supabase';
import { listLibrary } from '../lib/library';
import { community } from '../lib/reviews';

test('isSupabaseConfigured returns false when env variables are not present', () => {
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  assert.equal(isSupabaseConfigured(), false);
  assert.equal(getSupabaseUrl(), '');
  assert.equal(getSupabaseAnonKey(), '');

  // Clean up
  if (origUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
  if (origKey) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = origKey;
});

test('isSupabaseConfigured returns true when credentials are provided', () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example-project.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'example-anon-key-12345';

  assert.equal(isSupabaseConfigured(), true);
  assert.equal(getSupabaseUrl(), 'https://example-project.supabase.co');
  assert.equal(getSupabaseAnonKey(), 'example-anon-key-12345');

  // Verify server client creation
  const dummyReq = new Request('http://localhost:3000', {
    headers: { cookie: 'sb-access-token=dummy; sb-refresh-token=dummy' }
  });
  const client = createSupabaseClientFromRequest(dummyReq);
  assert.ok(client);

  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

test('Data layer falls back gracefully to SQLite when Supabase is not configured', async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const user = { id: 'dummy-user-id', name: 'Test User', email: 'test@example.com', createdAt: new Date().toISOString() };
  const items = await listLibrary(user);
  assert.ok(Array.isArray(items));

  const comm = await community();
  assert.ok(Array.isArray(comm));
});
