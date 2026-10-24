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

/**
 * Ensures a user has a corresponding row in Supabase auth.users and public.profiles.
 * If user does not exist in Supabase auth, creates the user and profile via supabaseAdmin.
 */
export async function ensureSupabaseUserProfile(user: { id: string; email: string; name?: string }): Promise<void> {
  const admin = supabaseAdmin();
  if (!admin) return;

  try {
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (existingProfile) return;

    const { data: existingAuth } = await admin.auth.admin.getUserById(user.id);
    if (!existingAuth?.user) {
      await admin.auth.admin.createUser({
        id: user.id,
        email: user.email,
        email_confirm: true,
        user_metadata: { name: user.name || user.email.split('@')[0], full_name: user.name || user.email.split('@')[0] },
      });
    }

    await admin.from('profiles').upsert({
      id: user.id,
      name: user.name || user.email.split('@')[0],
      email: user.email,
      updated_at: new Date().toISOString(),
    });
  } catch {
    try {
      await admin.from('profiles').upsert({
        id: user.id,
        name: user.name || user.email.split('@')[0],
        email: user.email,
        updated_at: new Date().toISOString(),
      });
    } catch {}
  }
}

