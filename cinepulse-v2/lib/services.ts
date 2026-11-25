/**
 * Streaming services a member can pick, per region, and how TMDB watch providers map onto them.
 * Matching uses TMDB provider ids first and falls back to the provider name, because TMDB
 * sometimes adds new ids for the same service (ad tiers, rebrands such as Hotstar → JioHotstar).
 * Pure and browser-safe: no database imports.
 */
import type { WatchProviderInfo } from './types';

export interface StreamingService {
  id: string;
  name: string;
  providerIds: number[];
  /** Lower-case name prefixes that identify the service in TMDB data. */
  aliases: string[];
}

const NETFLIX: StreamingService = { id: 'netflix', name: 'Netflix', providerIds: [8, 1796], aliases: ['netflix'] };
const APPLE: StreamingService = { id: 'appletv', name: 'Apple TV+', providerIds: [350], aliases: ['apple tv+', 'apple tv plus'] };

export const SERVICES: Record<'IN' | 'US', StreamingService[]> = {
  IN: [
    NETFLIX,
    { id: 'prime', name: 'Prime Video', providerIds: [119, 9], aliases: ['amazon prime video', 'prime video'] },
    { id: 'jiohotstar', name: 'JioHotstar', providerIds: [2336, 122, 220], aliases: ['jiohotstar', 'hotstar', 'disney+ hotstar', 'jio cinema', 'jiocinema'] },
    { id: 'sonyliv', name: 'Sony LIV', providerIds: [237], aliases: ['sony liv', 'sonyliv'] },
    { id: 'zee5', name: 'ZEE5', providerIds: [232], aliases: ['zee5'] },
    APPLE,
    { id: 'mubi', name: 'MUBI', providerIds: [11], aliases: ['mubi'] },
    { id: 'aha', name: 'aha', providerIds: [532], aliases: ['aha'] },
    { id: 'sunnxt', name: 'Sun NXT', providerIds: [309], aliases: ['sun nxt', 'sunnxt'] },
  ],
  US: [
    NETFLIX,
    { id: 'prime', name: 'Prime Video', providerIds: [9, 119], aliases: ['amazon prime video', 'prime video'] },
    { id: 'disney', name: 'Disney+', providerIds: [337], aliases: ['disney plus', 'disney+'] },
    { id: 'max', name: 'Max', providerIds: [1899, 384], aliases: ['max', 'hbo max'] },
    { id: 'hulu', name: 'Hulu', providerIds: [15], aliases: ['hulu'] },
    APPLE,
    { id: 'paramount', name: 'Paramount+', providerIds: [531, 2303, 2616], aliases: ['paramount+', 'paramount plus'] },
    { id: 'peacock', name: 'Peacock', providerIds: [386, 387], aliases: ['peacock'] },
    { id: 'mubi', name: 'MUBI', providerIds: [11], aliases: ['mubi'] },
  ],
};

export function servicesForRegion(region: string | null | undefined): StreamingService[] {
  return SERVICES[String(region || 'IN').toUpperCase() === 'US' ? 'US' : 'IN'];
}

/** Keeps only known ids for the region, in the region's order, without duplicates. */
export function cleanServiceIds(ids: unknown, region: string | null | undefined): string[] {
  const wanted = new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []);
  return servicesForRegion(region).filter((s) => wanted.has(s.id)).map((s) => s.id);
}

function matches(service: StreamingService, providerId: number, providerName: string): boolean {
  if (service.providerIds.includes(providerId)) return true;
  const name = providerName.toLowerCase().trim();
  // "max" must match exactly (it is a prefix of unrelated names); others match as prefixes.
  return service.aliases.some((a) => (a.length <= 4 ? name === a : name === a || name.startsWith(`${a} `)));
}

/** Names of the member's services that include this title in their subscription (not rent/buy). */
export function matchServices(info: Pick<WatchProviderInfo, 'flatrate'> | null | undefined, selected: string[], region: string | null | undefined): string[] {
  if (!info?.flatrate?.length || !selected.length) return [];
  const picked = servicesForRegion(region).filter((s) => selected.includes(s.id));
  return picked.filter((s) => info.flatrate.some((p) => matches(s, Number(p.providerId), String(p.providerName || '')))).map((s) => s.name);
}
