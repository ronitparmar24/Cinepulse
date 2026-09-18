export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}
export const conflict = (message = 'Conflict') => new HttpError(409, message);
export const unauthorized = (message = 'Authentication required') => new HttpError(401, message);
export const forbidden = (message = 'Forbidden') => new HttpError(403, message);
export const notFound = (message = 'Not found') => new HttpError(404, message);
export const tooMany = (message = 'Too many requests') => new HttpError(429, message);
export const upstream = (message = 'Upstream service unavailable') => new HttpError(502, message);

export function asError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  console.error(error);
  return new HttpError(500, 'Internal server error');
}

export function asString(value: unknown, max: number, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) throw bad(`${field} is invalid`);
  return value;
}
export function optionalString(value: unknown, max: number, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  return asString(value, max, field);
}
export function integer(value: unknown, min: number, max: number, field: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${field} is invalid`);
  return n;
}
export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw bad(`${field} is invalid`);
  return value as T;
}
