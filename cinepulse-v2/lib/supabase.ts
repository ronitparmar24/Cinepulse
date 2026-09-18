import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}

export function getSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
}

export function getSupabaseServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
}

let adminClient: SupabaseClient | null = null;

/**
 * Server-side Supabase client with elevated privileges for trusted API routes.
 */
export function supabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!adminClient) {
    adminClient = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return adminClient;
}

/**
 * Creates an SSR-safe Supabase client aware of cookies on the incoming request.
 */
export function createSupabaseClientFromRequest(request: Request) {
  if (!isSupabaseConfigured()) return null;

  const cookieHeader = request.headers.get('cookie') || '';
  const parsedCookies: Record<string, string> = {};
  cookieHeader.split(';').forEach((part) => {
    const [key, ...val] = part.trim().split('=');
    if (key) parsedCookies[key] = decodeURIComponent(val.join('='));
  });

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      get(name: string) {
        return parsedCookies[name];
      },
      set() {},
      remove() {},
    },
  });
}
