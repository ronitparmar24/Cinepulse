/**
 * CinePulse v9 — Track V: Quality Gates & Safety Guard
 * 3-word shingle Jaccard repetition check, cliché budget,
 * prompt injection defense, persona voice adherence, and grounding.
 */

const BANNED_CLICHES = [
  'must-watch',
  'masterpiece',
  'edge of your seat',
  'cinematic experience',
  'a breath of fresh air',
  'tour de force'
];

const SAFETY_BLOCKLIST = [
  /\b(?:nigger|faggot|kike|chink|cunt)\b/i,
  /\b(?:kill yourself|suicide|hang yourself)\b/i,
  /\b(?:https?:\/\/\S+|www\.\S+)\b/i,
  /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/i, // Phone numbers
  /\b(?:medical advice|legal advice|cure for cancer)\b/i
];

/**
 * Strips prompt injection attacks from external text before LLM context ingestion.
 */
export function sanitizeUserPrompt(input: string): string {
  if (!input) return '';
  return input
    .replace(/(?:ignore\s+previous\s+instructions|system\s*:|assistant\s*:|developer\s*:)/gi, '[sanitized_instruction]')
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, 1000);
}

/**
 * Creates 3-word shingles from normalized text.
 */
export function getThreeWordShingles(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const shingles = new Set<string>();
  for (let i = 0; i <= words.length - 3; i++) {
    shingles.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return shingles;
}

/**
 * Computes Jaccard similarity between two sets of shingles.
 */
export function shingleJaccard(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const s of setA) {
    if (setB.has(s)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface GateResult {
  passed: boolean;
  score: number;
  reason?: string;
}

/**
 * Evaluates candidate draft against all Track V quality gates.
 */
export function evaluateQualityGates(
  draft: string,
  persona: {
    voice?: {
      bannedWords?: string[];
      emojiRate?: number;
      sentenceLengthRange?: [number, number];
    };
  },
  recentTexts: string[] = [],
  titleFacts?: {
    title?: string;
    director?: string;
    cast?: string[];
    genres?: string[];
  }
): GateResult {
  const clean = draft.trim();
  if (clean.length < 15) {
    return { passed: false, score: 0.1, reason: 'DRAFT_TOO_SHORT' };
  }

  // 1. Safety Blocklist
  for (const pattern of SAFETY_BLOCKLIST) {
    if (pattern.test(clean)) {
      return { passed: false, score: 0.0, reason: 'SAFETY_VIOLATION' };
    }
  }

  // 2. Persona Banned Words
  if (persona.voice?.bannedWords) {
    const lower = clean.toLowerCase();
    for (const banned of persona.voice.bannedWords) {
      if (lower.includes(banned.toLowerCase())) {
        return { passed: false, score: 0.3, reason: `PERSONA_BANNED_WORD: ${banned}` };
      }
    }
  }

  // 3. Cliché check
  const lower = clean.toLowerCase();
  for (const cliche of BANNED_CLICHES) {
    if (lower.includes(cliche)) {
      return { passed: false, score: 0.4, reason: `BANNED_CLICHE: ${cliche}` };
    }
  }

  // 4. Repetition Check (3-word shingles vs recent posts)
  const candidateShingles = getThreeWordShingles(clean);
  for (const prev of recentTexts) {
    const prevShingles = getThreeWordShingles(prev);
    const sim = shingleJaccard(candidateShingles, prevShingles);
    if (sim > 0.50) {
      return { passed: false, score: 0.4, reason: `REPETITION_THRESHOLD_EXCEEDED: ${sim.toFixed(2)}` };
    }
  }

  // 5. Grounding Entity Check (if facts supplied)
  if (titleFacts) {
    const titleName = titleFacts.title?.toLowerCase() || '';
    const dir = titleFacts.director?.toLowerCase() || '';
    const hasTitleRef = titleName && lower.includes(titleName);
    const hasDirRef = dir && lower.includes(dir);
    const hasGenreRef = (titleFacts.genres || []).some(g => lower.includes(g.toLowerCase()));

    // Must reference at least one concrete signal from title facts or generic stylistic critique
    if (!hasTitleRef && !hasDirRef && !hasGenreRef && clean.length > 120) {
      // If long review mentions neither director, genre, nor title name, downgrade score
      return { passed: true, score: 0.75, reason: 'LOW_GROUNDING_SCORE' };
    }
  }

  return { passed: true, score: 0.95 };
}
