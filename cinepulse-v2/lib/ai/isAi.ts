import { realUsersOnly } from '../db';

/**
 * Checks whether a user record or object belongs to a simulated AI critic persona.
 */
export function isAi(entity: { is_ai?: number | boolean; isAi?: boolean } | null | undefined): boolean {
  if (!entity) return false;
  return Boolean(entity.isAi || (typeof entity.is_ai === 'number' ? entity.is_ai === 1 : entity.is_ai));
}

/**
 * SQL predicate isolating human (non-seed and non-AI) records from public statistics.
 */
export const aiWall = realUsersOnly;
export { realUsersOnly };

/**
 * SQL predicate isolating AI critic persona records.
 */
export function aiCrewOnly(tableAlias?: string): string {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return `COALESCE(${prefix}is_ai, 0) = 1`;
}
