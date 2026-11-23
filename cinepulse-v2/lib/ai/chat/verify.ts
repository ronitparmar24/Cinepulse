/**
 * Post-answer fact check for Ask CinePulse.
 *
 * Every figure the assistant writes (money, percentages, multiples, ratings, counts, years) is
 * compared with the numbers present in the tool results that grounded the answer. The UI shows
 * the outcome ("6/6 figures match CinePulse data" or which figures could not be matched), so a
 * model slip is visible to the user instead of being presented as fact.
 */
import type { ToolResult } from './types';

export interface VerificationResult {
  checked: number;
  matched: number;
  unmatched: string[];
  grounded: boolean; // the answer used at least one data tool
}

interface Claim {
  raw: string;
  candidates: number[];
}

const UNIT_SCALE: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };

/** Pulls numeric claims out of the assistant's prose. Tiny bare integers (list counts like
 *  "top 6") are ignored; anything with a unit, a decimal, a %/× or ≥ 11 is checked. */
export function extractClaims(text: string): Claim[] {
  const claims: Claim[] = [];
  // Strip markdown link targets / code so URLs and ids are not treated as claims.
  const clean = text.replace(/\]\([^)]*\)/g, ']').replace(/`[^`]*`/g, '').replace(/movie-\d+|tv-\d+/g, '');
  // (?<![\w.]) skips labels such as "P10–P90", "H2", "v3" — numbers glued to letters aren't figures.
  const re = /(?<![\w.])(₹|\$|€|£)?\s?(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)\s?(%|x|×|k|mn|m|bn|b|cr|crore|crores|thousand|million|billion)?(?!\w|\.\d)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const [raw, currency = '', numStr, unitRaw = ''] = m;
    const unit = unitRaw.toLowerCase();
    const value = Number(numStr.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    const hasDecimal = numStr.includes('.');
    const isYear = !currency && !unit && !hasDecimal && value >= 1900 && value <= 2100;
    if (!currency && !unit && !hasDecimal && value < 11) continue; // list counts, "2 films", ranks
    const candidates = new Set<number>([value]);
    if (UNIT_SCALE[unit]) candidates.add(value * UNIT_SCALE[unit]);
    if (unit === '%') candidates.add(value / 100);
    if (unit === 'cr' || unit.startsWith('crore')) candidates.add(value * 1e7);
    claims.push({ raw: raw.trim(), candidates: [...candidates] });
    if (isYear) continue;
  }
  return claims;
}

/** Collects every number in the tool payloads, including numbers embedded in strings
 *  (dates, "$794M–$2439M", "≈ ₹2,085 cr"). */
function collectFacts(cards: ToolResult[]): number[] {
  const facts: number[] = [];
  const pushFromString = (s: string) => {
    for (const hit of s.matchAll(/\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?/g)) {
      const n = Number(hit[0].replace(/,/g, ''));
      if (Number.isFinite(n)) facts.push(n);
    }
  };
  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || v == null) return;
    if (typeof v === 'number' && Number.isFinite(v)) facts.push(v);
    else if (typeof v === 'string') pushFromString(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (typeof v === 'object') Object.values(v as Record<string, unknown>).forEach((x) => walk(x, depth + 1));
  };
  for (const c of cards) {
    walk(c.data, 0);
    if (c.summary) pushFromString(c.summary);
  }
  // Derived views the assistant may legitimately quote (millions/billions, % of ratios).
  const derived: number[] = [];
  for (const f of facts) {
    derived.push(f);
    if (Math.abs(f) >= 1e5) derived.push(f / 1e6, f / 1e9, f / 1e7);
    if (f > 0 && f <= 1) derived.push(f * 100);
  }
  return derived;
}

function close(a: number, b: number): boolean {
  if (a === b) return true;
  const diff = Math.abs(a - b);
  if (diff <= 0.051) return true; // rating / multiple rounding (7.79 → 7.8)
  const rel = diff / Math.max(Math.abs(a), Math.abs(b));
  return rel <= 0.02; // ≤2% (rounded money, "$1.8B" for 1,805M)
}

export function verifyAnswer(text: string, cards: ToolResult[]): VerificationResult {
  const dataCards = cards.filter((c) => !c.error);
  const claims = extractClaims(text);
  const facts = collectFacts(dataCards);
  const unmatched: string[] = [];
  let matched = 0;
  for (const claim of claims) {
    const ok = claim.candidates.some((c) => facts.some((f) => close(c, f)));
    if (ok) matched++;
    else if (!unmatched.includes(claim.raw)) unmatched.push(claim.raw);
  }
  return { checked: claims.length, matched, unmatched: unmatched.slice(0, 6), grounded: dataCards.length > 0 };
}
