import { unifiedFetch } from './base';

export interface ExchangeRates {
  base: string;
  rates: {
    INR: number;
    EUR: number;
    GBP: number;
  };
  date: string;
}

const FALLBACK_RATES: ExchangeRates = {
  base: 'USD',
  rates: {
    INR: 86.5,
    EUR: 0.92,
    GBP: 0.78,
  },
  date: new Date().toISOString().slice(0, 10),
};

export async function getExchangeRates(): Promise<ExchangeRates> {
  const endpoint = 'https://api.frankfurter.app/latest';
  const res = await unifiedFetch<{
    base: string;
    date: string;
    rates: { INR?: number; EUR?: number; GBP?: number };
  }>({
    provider: 'frankfurter',
    endpoint,
    params: {
      from: 'USD',
      to: 'INR,EUR,GBP',
    },
    ttlMs: 24 * 60 * 60 * 1000, // 24h cache
  });

  if (res.data?.rates) {
    return {
      base: 'USD',
      rates: {
        INR: res.data.rates.INR || FALLBACK_RATES.rates.INR,
        EUR: res.data.rates.EUR || FALLBACK_RATES.rates.EUR,
        GBP: res.data.rates.GBP || FALLBACK_RATES.rates.GBP,
      },
      date: res.data.date || FALLBACK_RATES.date,
    };
  }

  return FALLBACK_RATES;
}
