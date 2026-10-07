/**
 * Shared AI completion engine with content-hash caching and multi-tier fallback.
 *
 * Hierarchy:
 *   1. Content-hash cache (llm_cache table) — identical prompts NEVER call out twice.
 *   2. Google Gemini (primary).
 *   3. Groq (instant fallback if Gemini is rate-limited, over quota, down, or missing key).
 *   4. Cloudflare Workers AI (optional 3rd-tier redundancy if configured).
 *   5. Graceful fallback (heuristic/rule-based, caller handled).
 */

import { createHash } from 'node:crypto';
import { db } from '../db';
import { unifiedFetch, logMissingKeyOnce } from '../fetchers/base';
import { runCloudflareAI } from '../fetchers/cloudflare';

export interface CompletionOptions {
  systemPrompt?: string;
  cacheKey?: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  userIdOrIp?: string;
}

export interface CompletionResult {
  text: string;
  provider: 'gemini' | 'groq' | 'cloudflare' | 'cache' | 'fallback';
  model?: string;
  fromCache: boolean;
}

/** Check content-hash cache in llm_cache */
function getCached(key: string): { output: string; provider: string } | null {
  try {
    const row = db().prepare('SELECT output, provider FROM llm_cache WHERE cache_key = ?').get(key) as { output: string; provider: string } | undefined;
    if (row?.output) {
      db().prepare('UPDATE llm_cache SET hits = hits + 1 WHERE cache_key = ?').run(key);
      return row;
    }
  } catch { /* best-effort */ }
  return null;
}

/** Persist completion to llm_cache */
function setCached(key: string, provider: string, output: string): void {
  try {
    db().prepare(`
      INSERT INTO llm_cache(cache_key, provider, output, hits)
      VALUES(?,?,?,0)
      ON CONFLICT(cache_key) DO UPDATE SET output = excluded.output
    `).run(key, provider, output);
  } catch { /* best-effort */ }
}

/** Generates deterministic content hash from prompt inputs */
export function hashPrompt(prompt: string, systemPrompt?: string): string {
  return createHash('sha256')
    .update((systemPrompt || '') + ':::' + prompt)
    .digest('hex');
}

function isRecoverableAiError(status: number, err?: string): boolean {
  if (status === 429 || status === 503 || status === 500 || status === 502 || status === 504 || status === 408) return true;
  if (err && /quota|rate|limit|overloaded|unavailable|timeout|abort/i.test(err)) return true;
  return false;
}

/** Call Google Gemini */
async function callGemini(
  prompt: string,
  opts?: CompletionOptions
): Promise<{ text: string; model: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logMissingKeyOnce('gemini', 'GEMINI_API_KEY');
    return null;
  }

  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const contents: any[] = [];
  if (opts?.systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: `[System Instruction: ${opts.systemPrompt}]` }] });
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  const body: any = {
    contents,
    generationConfig: {
      temperature: opts?.temperature ?? 0.4,
      maxOutputTokens: opts?.maxTokens ?? 500,
    },
  };
  if (opts?.json) {
    body.generationConfig.responseMimeType = 'application/json';
  }

  const res = await unifiedFetch<{
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  }>({
    provider: 'gemini',
    endpoint,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ttlMs: 7 * 24 * 60 * 60 * 1000,
  });

  if (res.quotaExceeded || !res.data || res.status !== 200) {
    if (isRecoverableAiError(res.status, res.error)) {
      return null; // trigger fallback
    }
  }

  const candidateText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (candidateText && candidateText.trim()) {
    return { text: candidateText.trim(), model: modelName };
  }

  return null;
}

/** Call Groq API */
async function callGroq(
  prompt: string,
  opts?: CompletionOptions
): Promise<{ text: string; model: string } | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    logMissingKeyOnce('groq', 'GROQ_API_KEY');
    return null;
  }

  const modelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

  const messages: any[] = [];
  if (opts?.systemPrompt) {
    messages.push({ role: 'system', content: opts.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const body: any = {
    model: modelName,
    messages,
    max_tokens: opts?.maxTokens ?? 500,
    temperature: opts?.temperature ?? 0.4,
  };
  if (opts?.json) {
    body.response_format = { type: 'json_object' };
  }

  const res = await unifiedFetch<{
    choices?: Array<{ message?: { content?: string } }>;
  }>({
    provider: 'groq',
    endpoint,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    ttlMs: 7 * 24 * 60 * 60 * 1000,
  });

  const content = res.data?.choices?.[0]?.message?.content;
  if (content && content.trim()) {
    return { text: content.trim(), model: modelName };
  }

  return null;
}

/**
 * Single shared entry point for LLM inference across CinePulse.
 * Implements content-hash caching and Gemini -> Groq -> Cloudflare fallback.
 */
export async function complete(
  prompt: string,
  opts?: CompletionOptions
): Promise<CompletionResult> {
  const cacheKey = opts?.cacheKey || hashPrompt(prompt, opts?.systemPrompt);

  // 1. Content-hash Cache Check
  const cached = getCached(cacheKey);
  if (cached) {
    return {
      text: cached.output,
      provider: 'cache',
      model: `${cached.provider}-cached`,
      fromCache: true,
    };
  }

  // 2. Primary Tier: Google Gemini
  try {
    const geminiRes = await callGemini(prompt, opts);
    if (geminiRes) {
      setCached(cacheKey, 'gemini', geminiRes.text);
      return {
        text: geminiRes.text,
        provider: 'gemini',
        model: geminiRes.model,
        fromCache: false,
      };
    }
  } catch (err: any) {
    // If rate limited or down, gracefully continue to Groq
    if (!isRecoverableAiError(500, err?.message)) {
      console.warn('[AI COMPLETE] Gemini failed, attempting Groq fallback:', err?.message);
    }
  }

  // 3. Fallback Tier: Groq
  try {
    const groqRes = await callGroq(prompt, opts);
    if (groqRes) {
      setCached(cacheKey, 'groq', groqRes.text);
      return {
        text: groqRes.text,
        provider: 'groq',
        model: groqRes.model,
        fromCache: false,
      };
    }
  } catch (err: any) {
    console.warn('[AI COMPLETE] Groq failed, attempting Cloudflare fallback:', err?.message);
  }

  // 4. Third Tier: Cloudflare Workers AI (if prompt is suitable)
  try {
    const fullPrompt = opts?.systemPrompt ? `${opts.systemPrompt}\n\n${prompt}` : prompt;
    const cfText = await runCloudflareAI(fullPrompt);
    if (cfText && cfText.trim()) {
      setCached(cacheKey, 'cloudflare', cfText.trim());
      return {
        text: cfText.trim(),
        provider: 'cloudflare',
        model: '@cf/meta/llama-3-8b-instruct',
        fromCache: false,
      };
    }
  } catch { /* best-effort */ }

  return {
    text: '',
    provider: 'fallback',
    fromCache: false,
  };
}

/**
 * Shared helper for completing and parsing JSON responses.
 */
export async function completeJson<T>(
  prompt: string,
  opts?: CompletionOptions
): Promise<{ data: T | null; provider: CompletionResult['provider']; fromCache: boolean }> {
  const result = await complete(prompt, { ...opts, json: true });
  if (!result.text) {
    return { data: null, provider: result.provider, fromCache: false };
  }

  try {
    // Remove markdown code fence if LLM wrapped it in ```json ... ```
    let clean = result.text.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    }
    const data = JSON.parse(clean) as T;
    return { data, provider: result.provider, fromCache: result.fromCache };
  } catch {
    return { data: null, provider: 'fallback', fromCache: false };
  }
}
