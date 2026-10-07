/**
 * Provider registry — the single place that says what each external API key
 * costs us and how long its answers stay fresh.
 *
 * Every fetcher goes through `unifiedFetch` (lib/fetchers/base.ts), which
 * reserves quota against `provider_usage` BEFORE calling out. When a provider
 * with a finite `dailyQuota` is exhausted, the call is skipped and cached data
 * (even expired) is served with `stale: true` — no feature crashes because a
 * free tier ran out for the day.
 *
 * `dailyQuota: null` means the provider's free tier is rpm/rpd-limited in a way
 * we can't express as one number (Gemini, Groq, HF, Cloudflare). Usage is still
 * tracked and shown on /api/health; set PROVIDER_QUOTA_<NAME>=<n> in the env to
 * impose a hard cap (e.g. PROVIDER_QUOTA_GEMINI=1400).
 */
export const PROVIDERS = {
  youtube:    { dailyQuota: 10_000, unit: 'units',    costPerCall: 1, ttlHours: 24 },
  omdb:       { dailyQuota: 1_000,  unit: 'requests', costPerCall: 1, ttlHours: 168 }, // 7d for released titles
  gnews:      { dailyQuota: 100,    unit: 'requests', costPerCall: 1, ttlHours: 12 },
  gemini:     { dailyQuota: null,   unit: 'requests', costPerCall: 1, ttlHours: 0 },   // check current free-tier rpm/rpd in AI Studio console
  groq:       { dailyQuota: null,   unit: 'requests', costPerCall: 1, ttlHours: 0 },
  hf:         { dailyQuota: null,   unit: 'requests', costPerCall: 1, ttlHours: 0 },
  cloudflare: { dailyQuota: null,   unit: 'neurons',  costPerCall: 1, ttlHours: 0 },
} as const;

export type ProviderName = keyof typeof PROVIDERS;

/** Env var(s) that must be present for each provider to be considered configured. */
export const PROVIDER_ENV: Record<ProviderName, string[]> = {
  youtube: ['YOUTUBE_API_KEY'],
  omdb: ['OMDB_API_KEY'],
  gnews: ['GNEWS_API_KEY'],
  gemini: ['GEMINI_API_KEY'],
  groq: ['GROQ_API_KEY'],
  hf: ['HF_TOKEN'],
  cloudflare: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'],
};

/**
 * Documented degradation path for every provider. Surfaced on /api/health so
 * "what happens when this runs out?" is never a guess.
 */
export const PROVIDER_FALLBACKS: Record<ProviderName, string> = {
  youtube: 'Batched nightly snapshot only; over quota → last cached stats (stale) → trailer features null',
  omdb: '7d cache (released) / 24h (upcoming) + nightly pre-warm; over quota → stale cache → critic scores null',
  gnews: 'Nightly batch only (never per-request); over quota → last stored headlines (stale) → widget hidden',
  gemini: 'Content-hash LLM cache → Groq fallback → rule-based text',
  groq: 'Redundancy tier for Gemini; failure → rule-based text',
  hf: 'Embeddings/sentiment cached forever → Cloudflare Workers AI → null',
  cloudflare: 'Fallback tier below HF for embeddings/sentiment → null',
};

export function isTrackedProvider(name: string): name is ProviderName {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, name);
}

/** Daily quota for a provider, honouring an optional PROVIDER_QUOTA_<NAME> env override. */
export function dailyQuotaFor(name: string): number | null {
  if (!isTrackedProvider(name)) return null;
  const override = process.env[`PROVIDER_QUOTA_${name.toUpperCase()}`];
  if (override !== undefined && override !== '') {
    const n = Number(override);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return PROVIDERS[name].dailyQuota;
}

export function costPerCallFor(name: string): number {
  return isTrackedProvider(name) ? PROVIDERS[name].costPerCall : 1;
}

export function ttlMsFor(name: ProviderName): number {
  return PROVIDERS[name].ttlHours * 60 * 60 * 1000;
}

export function isProviderConfigured(name: ProviderName): boolean {
  return PROVIDER_ENV[name].every((k) => Boolean(process.env[k]));
}
