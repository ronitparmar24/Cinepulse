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
