import type { User } from '../types';
import { requireUser } from '../auth';
import { forbidden, unauthorized } from '../errors';

/**
 * Ensures the incoming request is authenticated with a valid user session.
 * Throws 401 Unauthorized if not authenticated.
 */
export async function requireAuth(request: Request): Promise<User> {
  const user = await requireUser(request);
  if (!user || !user.id) {
    throw unauthorized('Authentication required to access this resource');
  }
  return user;
}

/**
 * Ensures the incoming request is authenticated AND the authenticated user
 * is the owner of the resource.
 * Throws 401 if unauthenticated, 403 Forbidden if not the resource owner.
 */
export async function requireOwnership(request: Request, resourceOwnerId: string): Promise<User> {
  const user = await requireAuth(request);
  if (!resourceOwnerId || user.id !== resourceOwnerId) {
    throw forbidden('You do not have permission to modify this resource');
  }
  return user;
}

/** Emails allowed into admin endpoints: ADMIN_EMAILS="you@example.com,other@example.com". */
export function adminEmails(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set((env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
}

/**
 * Ensures the request comes from a signed-in admin. 401 when signed out; 403 for everyone
 * else, including when ADMIN_EMAILS is empty (admin endpoints are closed by default).
 */
export async function requireAdmin(request: Request): Promise<User> {
  const user = await requireAuth(request);
  if (!adminEmails().has((user.email || '').toLowerCase())) throw forbidden('Admin access required');
  return user;
}
