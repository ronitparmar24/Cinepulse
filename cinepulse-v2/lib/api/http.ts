/**
 * Shared request/response helpers for the API route modules in lib/api/routes/.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { bad } from '../errors';

export interface ApiContext {
  request: NextRequest;
  /** Path segments after /api/, e.g. ['library', 'movie-27205']. */
  parts: string[];
  /** HTTP method, with HEAD treated as GET. */
  method: string;
  query: URLSearchParams;
}

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(data, { status, headers });
}

/** Parses a JSON object body (default max 16 KB). */
export async function body(request: Request, maxBytes = 16 * 1024): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw bad('JSON content type is required');
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw bad('Request body is too large');
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw bad('Invalid JSON body');
  }
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw bad('Request body is too large');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw bad('Invalid JSON body');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad('JSON body must be an object');
  return value as Record<string, unknown>;
}

export function param(parts: string[], index: number, label: string): string {
  const value = parts[index];
  if (!value) throw bad(`${label} is required`);
  return value;
}
export function media(value: string | null): 'all' | 'movie' | 'tv' {
  if (!value || value === 'all') return 'all';
  if (value === 'movie' || value === 'tv') return value;
  throw bad('media is invalid');
}
export function collection(value: string | null): 'trending' | 'upcoming' | 'top' | 'now-playing' {
  if (!value || value === 'trending') return 'trending';
  if (value === 'upcoming' || value === 'top' || value === 'now-playing') return value;
  throw bad('collection is invalid');
}
export function page(value: string | null): number {
  const n = value ? Number(value) : 1;
  if (!Number.isInteger(n) || n < 1 || n > 500) throw bad('page is invalid');
  return n;
}
export function optYear(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1900 || n > 2100) throw bad('year is invalid');
  return n;
}
export function optRating(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (n < 0 || n > 10) throw bad('minRating is invalid');
  return n;
}
