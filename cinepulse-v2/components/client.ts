'use client';
import type {Title} from '@/lib/types';
import {isValidDate} from '@/lib/eligibility';
export async function api<T>(path:string, method='GET', body?:unknown, signal?:AbortSignal):Promise<T> {
  const response = await fetch(`/api${path}`,{method,credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal,cache:'no-store'});
  let data:any;
  try { data=await response.json(); } catch(error) {
    if(signal?.aborted || (error instanceof Error && error.name==='AbortError')) throw error;
    throw new Error('The server returned an unreadable response. Please try again.');
  }
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data as T;
}
export const dateLabel = (value:string|null) => value && isValidDate(value) ? new Date(value+'T12:00:00Z').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}) : 'Date to be announced';
export const year = (t:Title) => t.releaseDate && isValidDate(t.releaseDate) ? t.releaseDate.slice(0,4) : 'TBA';
export const kindLabel = (t:Title) => t.mediaType==='tv'?'Series':'Film';
export const money = (n:number|null) => n !== null && Number.isFinite(n) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:1}).format(n) : 'Not reported';
export function trackEvent(eventType: string, metadata: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  api('/analytics', 'POST', { eventType, metadata }).catch(() => {});
}
