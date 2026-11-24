'use client';
import type {Title} from '@/lib/types';
import {isValidDate} from '@/lib/eligibility';
// Sessions use the HttpOnly cookie only. Remove the token older versions kept in localStorage.
if (typeof window !== 'undefined') { try { localStorage.removeItem('cinepulse_token'); } catch {} }

export async function api<T>(path:string, method='GET', body?:unknown, signal?:AbortSignal):Promise<T> {
  const headers: Record<string, string> = body === undefined ? {} : { 'Content-Type': 'application/json' };
  const response = await fetch(`/api${path}`,{method,credentials:'include',headers,body:body===undefined?undefined:JSON.stringify(body),signal,cache:'no-store'});
  let data:any;
  try { data=await response.json(); } catch(error) {
    if(signal?.aborted || (error instanceof Error && error.name==='AbortError')) throw error;
    throw new Error('The server returned an unreadable response. Please try again.');
  }
  if (!response.ok) {
    // A 401 outside /auth means the server no longer recognises this browser's session (it
    // expired or was lost). useAuth re-checks and asks the user to sign in again, instead of
    // the action failing silently while the header still shows them as signed in.
    if (response.status === 401 && !path.startsWith('/auth/') && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cinepulse:unauthorized', { detail: { path } }));
    }
    throw new Error(response.status === 401 ? 'Please sign in again to do that.' : data?.error || `Request failed (${response.status})`);
  }
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
