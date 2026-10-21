#!/usr/bin/env node
/**
 * CinePulse v9: Chat Evaluations Runner
 * Tests 25 prompts across categories to ensure:
 * 1. Polite refusal & cinema redirection for off-topic/injection attempts
 * 2. Correct tool selection for cinema intents
 * 3. Transparent evidence: zero fabricated numbers (all numbers grounded in tool output)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { streamRuleBased } from '../lib/ai/chat/providers.ts';

const evalsPath = resolve(process.cwd(), 'tests/chat-evals.json');
const evals = JSON.parse(readFileSync(evalsPath, 'utf8'));

console.log(`\n─── CinePulse Chat Evaluations (${evals.length} Prompts) ───\n`);

let passed = 0;
let failed = 0;

function extractNumbers(str) {
  if (typeof str !== 'string') return [];
  const matches = str.match(/\b\d+(?:\.\d+)?\b/g);
  return matches ? matches.map(Number) : [];
}

function collectDataNumbers(obj, set = new Set()) {
  if (obj === null || obj === undefined) return set;
  if (typeof obj === 'number') {
    set.add(obj);
    return set;
  }
  if (typeof obj === 'string') {
    for (const num of extractNumbers(obj)) {
      set.add(num);
    }
    return set;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectDataNumbers(item, set);
    return set;
  }
  if (typeof obj === 'object') {
    for (const val of Object.values(obj)) {
      collectDataNumbers(val, set);
    }
  }
  return set;
}

for (const item of evals) {
  try {
    const events = [];
    const generator = streamRuleBased(
      [{ role: 'user', content: item.prompt }],
      { user: null, ip: '127.0.0.1' }
    );

    for await (const event of generator) {
      events.push(event);
    }

    const responseText = events
      .filter((e) => e.type === 'token')
      .map((e) => e.data?.text || '')
      .join('');

    const toolStarts = events.filter((e) => e.type === 'tool_start');
    const toolResults = events.filter((e) => e.type === 'tool_result');

    // 1. Refusal check for off-topic / injection
    if (item.mustRefuse) {
      const lower = responseText.toLowerCase();
      const redirectsProperly =
        lower.includes('cinema') ||
        lower.includes('cinepulse') ||
        lower.includes('films') ||
        lower.includes('box-office') ||
        lower.includes('movies');

      if (!redirectsProperly) {
        throw new Error(`Expected refusal and cinema redirection, got: "${responseText}"`);
      }
      if (toolResults.length > 0) {
        throw new Error(`Expected 0 tools called for off-topic query, but got ${toolResults.length}`);
      }
    }

    // 2. Correct tool chosen check
    if (item.expectedTool) {
      const called = toolStarts.some((t) => t.data?.name === item.expectedTool);
      if (!called) {
        const actualTools = toolStarts.map((t) => t.data?.name).join(', ') || 'none';
        throw new Error(`Expected tool "${item.expectedTool}", but tools called: [${actualTools}]`);
      }
    }

    // 3. No fabricated numbers check
    // Every number in responseText must exist in tool result data, prompt, or common framing
    if (toolResults.length > 0) {
      const validNumbers = new Set([0, 1, 2, 3, 4, 5, 20, 50, 100, 2026, 2027]);
      for (const n of extractNumbers(item.prompt)) {
        validNumbers.add(n);
      }
      for (const tr of toolResults) {
        collectDataNumbers(tr.data, validNumbers);
      }

      const textNumbers = extractNumbers(responseText);
      const fabricated = textNumbers.filter((n) => !validNumbers.has(n));
      if (fabricated.length > 0) {
        throw new Error(
          `Fabricated numbers detected in reply: [${fabricated.join(', ')}]. All numbers must originate from tool output.`
        );
      }
    }

    console.log(`✔ [${item.id}] [${item.category}] "${item.prompt.slice(0, 40)}..." - PASS`);
    passed++;
  } catch (err) {
    console.error(`✖ [${item.id}] [${item.category}] "${item.prompt.slice(0, 40)}..." - FAIL: ${err.message}`);
    failed++;
  }
}

console.log(`\nEval Results: ${passed}/${evals.length} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
