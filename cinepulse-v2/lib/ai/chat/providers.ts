import { SYSTEM_PROMPT } from './systemPrompt';
import { TOOL_DEFINITIONS, executeTool } from './tools';
import { catalog, titleById } from '../../catalog';
import type { User } from '../../types';
import type { SSEEvent, ToolResult } from './types';

export interface ProviderContext {
  user?: User | null;
  ip?: string;
  titleContext?: string;
  signal?: AbortSignal;
}

function combineSignals(parent?: AbortSignal, timeoutMs = 22000): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!parent) return timeoutSignal;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([parent, timeoutSignal]);
  }
  return parent;
}

async function resolveActiveTitleSystemNote(titleContext?: string): Promise<string> {
  if (!titleContext) return '';
  try {
    const t = await titleById(titleContext);
    const year = t.releaseDate ? t.releaseDate.slice(0, 4) : 'TBA';
    return [
      '<active_title_context>',
      `titleId: "${t.id}"`,
      `title: "${t.title}" (${year}, ${t.mediaType})`,
      t.genres.length > 0 ? `genres: ${t.genres.join(', ')}` : null,
      t.director ? `director: ${t.director}` : null,
      t.runtime ? `runtime: ${t.runtime} min` : null,
      `status: ${t.status}`,
      'Instruction: The user is currently viewing this title in CinePulse. Resolve pronouns like "this", "this movie", "it", or unqualified queries to this titleId unless the user specifies another title.',
      '</active_title_context>',
    ]
      .filter(Boolean)
      .join('\n');
  } catch {
    return [
      '<active_title_context>',
      `titleId: "${titleContext}"`,
      'Instruction: The user is viewing this title in CinePulse. Resolve "this film" or "it" to this titleId unless another film is named.',
      '</active_title_context>',
    ].join('\n');
  }
}

function cleanModelText(raw: string): string {
  // Strip any accidental reasoning tags leaked by open-weight models
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
}

function synthesizeFallbackSummary(cards: ToolResult[]): string {
  const bullets = cards
    .map((c) => c.summary)
    .filter((s): s is string => Boolean(s && s.trim()))
    .map((s) => `- ${s}`);
  if (bullets.length === 0) return '';
  return `Here is what CinePulse found from the live catalog and forecast ledger:\n\n${bullets.join('\n')}`;
}

// ─── Gemini Provider ──────────────────────────────────────────────────────────

async function* streamGemini(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: ProviderContext
): AsyncGenerator<SSEEvent, boolean, unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return false;

  const candidateModels = Array.from(
    new Set(
      [
        process.env.CHAT_MODEL,
        process.env.GEMINI_MODEL,
        'gemini-3-flash-preview',
        'gemini-3.6-flash',
      ].filter((m): m is string => Boolean(m && m.trim()))
    )
  );

  const activeTitleNote = await resolveActiveTitleSystemNote(context.titleContext);
  const fullSystemPrompt = activeTitleNote
    ? `${SYSTEM_PROMPT}\n\n${activeTitleNote}`
    : SYSTEM_PROMPT;

  const contents: any[] = [];
  for (const m of messages) {
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.role === 'user' ? `<user_message>\n${m.content}\n</user_message>` : m.content }],
    });
  }

  const geminiTools = [
    {
      functionDeclarations: TOOL_DEFINITIONS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];

  let activeModel = candidateModels[0];
  let toolCallCount = 0;
  const MAX_TOOL_CALLS = 6;
  let accumulatedText = '';
  const executedCards: ToolResult[] = [];

  while (toolCallCount <= MAX_TOOL_CALLS) {
    if (context.signal?.aborted) return true;

    const payload: any = {
      systemInstruction: { parts: [{ text: fullSystemPrompt }] },
      contents,
      tools: geminiTools,
      generationConfig: { temperature: 0.35, maxOutputTokens: 2000 },
    };

    let res: Response | null = null;
    if (toolCallCount === 0 && accumulatedText === '' && executedCards.length === 0) {
      // Probe configured & fallback Gemini models until one accepts the request cleanly
      for (const candidateModel of candidateModels) {
        if (context.signal?.aborted) return true;
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:streamGenerateContent?alt=sse&key=${apiKey}`;
        try {
          const attempt = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: combineSignals(context.signal, 20000),
          });
          if (attempt.ok) {
            res = attempt;
            activeModel = candidateModel;
            break;
          }
          // Try next model on 404/400/503; abort on auth errors like 401/403
          if (attempt.status === 401 || attempt.status === 403) return false;
        } catch {
          if (context.signal?.aborted) return true;
        }
      }
    } else {
      for (const fallbackModel of [activeModel, ...candidateModels.filter((m) => m !== activeModel)]) {
        if (context.signal?.aborted) return true;
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:streamGenerateContent?alt=sse&key=${apiKey}`;
        try {
          const attempt = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: combineSignals(context.signal, 20000),
          });
          if (attempt.ok) {
            res = attempt;
            activeModel = fallbackModel;
            break;
          }
          if (attempt.status === 401 || attempt.status === 403) return false;
        } catch {
          if (context.signal?.aborted) return true;
        }
      }
    }

    if (!res || !res.ok) {
      // Only silently fall back to Groq/rule-based if nothing visible was yielded yet
      if (accumulatedText === '' && executedCards.length === 0) return false;
      break;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      if (accumulatedText === '' && executedCards.length === 0) return false;
      break;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let hadToolCall = false;
    const rawModelParts: any[] = [];
    const pendingFunctionCalls: Array<{ id?: string; name: string; args: Record<string, unknown> }> = [];

    while (true) {
      if (context.signal?.aborted) {
        reader.cancel();
        return true;
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6).trim();
        if (!dataStr || dataStr === '[DONE]') continue;

        let chunk: any;
        try { chunk = JSON.parse(dataStr); } catch { continue; }

        const candidate = chunk?.candidates?.[0];
        if (!candidate) continue;

        const parts = candidate?.content?.parts || [];
        for (const part of parts) {
          if (part.functionCall) {
            hadToolCall = true;
            // Preserve exact raw part (including Gemini 3.x thoughtSignature and functionCall.id)
            rawModelParts.push(part);
            pendingFunctionCalls.push({
              id: part.functionCall.id,
              name: part.functionCall.name,
              args: part.functionCall.args || {},
            });
          } else if (part.thought) {
            // Preserve thought part for turn signature continuity, never stream reasoning tokens to UI
            rawModelParts.push(part);
          } else if (part.text) {
            rawModelParts.push(part);
            accumulatedText += part.text;
            yield { type: 'token', data: { text: part.text } };
          } else if (part.thoughtSignature) {
            rawModelParts.push(part);
          }
        }
      }
    }

    if (!hadToolCall || pendingFunctionCalls.length === 0) break;

    contents.push({
      role: 'model',
      parts: rawModelParts.length > 0
        ? rawModelParts
        : pendingFunctionCalls.map((fn) => ({
            functionCall: {
              ...(fn.id ? { id: fn.id } : {}),
              name: fn.name,
              args: fn.args,
            },
          })),
    });

    const functionResponseParts: any[] = [];
    for (const fn of pendingFunctionCalls) {
      toolCallCount++;
      yield { type: 'tool_start', data: { name: fn.name, args: fn.args } };

      const result = await executeTool(fn.name, fn.args, { user: context.user, ip: context.ip });
      executedCards.push(result);

      yield {
        type: 'tool_result',
        data: {
          name: fn.name,
          cardType: result.cardType,
          data: result.data,
          summary: result.summary,
          asOf: result.asOf,
          source: result.source,
        },
      };

      functionResponseParts.push({
        functionResponse: {
          ...(fn.id ? { id: fn.id } : {}),
          name: fn.name,
          response: { output: result.data },
        },
      });
    }

    contents.push({
      role: 'user',
      parts: functionResponseParts,
    });
  }

  if (accumulatedText.trim() === '' && executedCards.length === 0) {
    return false;
  }

  if (accumulatedText.trim() === '' && executedCards.length > 0) {
    const fallbackText = synthesizeFallbackSummary(executedCards);
    if (fallbackText) {
      accumulatedText = fallbackText;
      yield { type: 'token', data: { text: fallbackText } };
    }
  }

  if (executedCards.length > 0) {
    yield {
      type: 'evidence',
      data: {
        tools: executedCards.map((c) => ({
          name: c.name,
          source: c.source || c.name,
          asOf: c.asOf || null,
        })),
      },
    };
  }

  yield { type: 'suggestions', data: { items: generateSuggestions(executedCards, accumulatedText) } };
  yield { type: 'done', data: { provider: 'gemini', model: activeModel } };
  return true;
}

// ─── Groq Provider ───────────────────────────────────────────────────────────

async function* streamGroq(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: ProviderContext
): AsyncGenerator<SSEEvent, boolean, unknown> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return false;

  const candidateModels = Array.from(
    new Set(
      [
        process.env.GROQ_MODEL,
        'openai/gpt-oss-120b',
        'qwen/qwen3.8-27b',
        'openai/gpt-oss-20b',
      ].filter((m): m is string => Boolean(m && m.trim()))
    )
  );
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const groqTools = TOOL_DEFINITIONS.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: t.parameters.properties,
        required: t.parameters.required || [],
      },
    },
  }));

  const activeTitleNote = await resolveActiveTitleSystemNote(context.titleContext);
  const fullSystemPrompt = activeTitleNote
    ? `${SYSTEM_PROMPT}\n\n${activeTitleNote}`
    : SYSTEM_PROMPT;

  const groqMessages: any[] = [{ role: 'system', content: fullSystemPrompt }];
  for (const m of messages) {
    groqMessages.push({
      role: m.role,
      content: m.role === 'user' ? `<user_message>\n${m.content}\n</user_message>` : m.content,
    });
  }

  let activeModel = candidateModels[0];
  let toolCallCount = 0;
  const MAX_TOOL_CALLS = 6;
  let accumulatedText = '';
  const executedCards: ToolResult[] = [];

  while (toolCallCount <= MAX_TOOL_CALLS) {
    if (context.signal?.aborted) return true;

    let res: Response | null = null;
    if (toolCallCount === 0 && accumulatedText === '' && executedCards.length === 0) {
      for (const candidateModel of candidateModels) {
        if (context.signal?.aborted) return true;
        try {
          const attempt = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: candidateModel,
              messages: groqMessages,
              tools: groqTools,
              tool_choice: 'auto',
              max_tokens: 1800,
              temperature: 0.35,
              stream: true,
            }),
            signal: combineSignals(context.signal, 18000),
          });
          if (attempt.ok) {
            res = attempt;
            activeModel = candidateModel;
            break;
          }
          if (attempt.status === 401 || attempt.status === 403) return false;
        } catch {
          if (context.signal?.aborted) return true;
        }
      }
    } else {
      try {
        const attempt = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: activeModel,
            messages: groqMessages,
            tools: groqTools,
            tool_choice: 'auto',
            max_tokens: 1800,
            temperature: 0.35,
            stream: true,
          }),
          signal: combineSignals(context.signal, 18000),
        });
        if (attempt.ok) res = attempt;
      } catch {
        if (context.signal?.aborted) return true;
      }
    }

    if (!res || !res.ok) {
      if (accumulatedText === '' && executedCards.length === 0) return false;
      break;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      if (accumulatedText === '' && executedCards.length === 0) return false;
      break;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let hadToolCall = false;
    const pendingCalls: Record<number, { id: string; name: string; argsStr: string }> = {};
    let streamedText = '';

    while (true) {
      if (context.signal?.aborted) {
        reader.cancel();
        return true;
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6).trim();
        if (!dataStr || dataStr === '[DONE]') continue;

        let chunk: any;
        try { chunk = JSON.parse(dataStr); } catch { continue; }

        const delta = chunk?.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          const clean = cleanModelText(delta.content);
          if (clean) {
            streamedText += clean;
            accumulatedText += clean;
            yield { type: 'token', data: { text: clean } };
          }
        }

        if (delta.tool_calls) {
          hadToolCall = true;
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!pendingCalls[idx]) {
              pendingCalls[idx] = { id: tc.id || `call_${idx}`, name: tc.function?.name || '', argsStr: '' };
            }
            if (tc.function?.name) pendingCalls[idx].name = tc.function.name;
            if (tc.function?.arguments) pendingCalls[idx].argsStr += tc.function.arguments;
          }
        }
      }
    }

    if (!hadToolCall || Object.keys(pendingCalls).length === 0) break;

    const toolCallsMsg: any = {
      role: 'assistant',
      content: streamedText || null,
      tool_calls: Object.entries(pendingCalls).map(([, tc]) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.argsStr },
      })),
    };
    groqMessages.push(toolCallsMsg);

    for (const [, tc] of Object.entries(pendingCalls)) {
      toolCallCount++;
      let fnArgs: Record<string, unknown> = {};
      try { fnArgs = JSON.parse(tc.argsStr || '{}'); } catch {}

      yield { type: 'tool_start', data: { name: tc.name, args: fnArgs } };

      const result = await executeTool(tc.name, fnArgs, { user: context.user, ip: context.ip });
      executedCards.push(result);

      yield {
        type: 'tool_result',
        data: {
          name: tc.name,
          cardType: result.cardType,
          data: result.data,
          summary: result.summary,
          asOf: result.asOf,
          source: result.source,
        },
      };

      groqMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.name,
        content: JSON.stringify(result.data),
      });
    }
  }

  if (accumulatedText.trim() === '' && executedCards.length === 0) {
    return false;
  }

  if (accumulatedText.trim() === '' && executedCards.length > 0) {
    const fallbackText = synthesizeFallbackSummary(executedCards);
    if (fallbackText) {
      accumulatedText = fallbackText;
      yield { type: 'token', data: { text: fallbackText } };
    }
  }

  if (executedCards.length > 0) {
    yield {
      type: 'evidence',
      data: {
        tools: executedCards.map((c) => ({
          name: c.name,
          source: c.source || c.name,
          asOf: c.asOf || null,
        })),
      },
    };
  }

  yield { type: 'suggestions', data: { items: generateSuggestions(executedCards, accumulatedText) } };
  yield { type: 'done', data: { provider: 'groq', model: activeModel } };
  return true;
}

// ─── Helper for resolving a movie title ID cleanly from natural queries ──────

async function findTitleIdFromQuery(query: string, fallbackId?: string): Promise<string | undefined> {
  if (!query || /^(?:this|it|this movie|this film|the movie|the film)$/i.test(query.trim())) {
    return fallbackId;
  }
  const cleanQ = query
    .replace(/^(?:where (?:can i |to )?(?:watch|stream)|what are critics saying about|critics consensus (?:for|on)|reviews? (?:for|of)|ratings? (?:for|of)|tell me about|overview (?:of|for)|synopsis (?:of|for)|summary (?:of|for)|who directed|cast of|add|save|call|predict|vote)\s+/gi, '')
    .replace(/\s+(?:right now|on ott|streaming|online|critics|consensus|ratings|reviews|to (?:my )?watchlist|as a (?:hit|flop)|is a (?:hit|flop))$/gi, '')
    .replace(/[?.,!'"`]/g, '')
    .trim();

  if (!cleanQ || cleanQ.length < 2) return fallbackId;

  const exact = await catalog({ media: 'all', search: cleanQ, page: 1, collection: 'trending' });
  if (exact.items?.[0]?.id) return exact.items[0].id;

  const words = cleanQ
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/^(?:about|the|this|that|what|when|where|which|film|movie|show|series|watch|stream|find|give|tell)$/i.test(w));

  for (const word of words) {
    const ws = await catalog({ media: 'all', search: word, page: 1, collection: 'trending' });
    if (ws.items?.[0]?.id) return ws.items[0].id;
  }

  return undefined;
}

// ─── Rule-Based / Lite Mode Fallback (Offline, Zero-Key Guarantee) ─────────────

export async function* streamRuleBased(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: ProviderContext
): AsyncGenerator<SSEEvent, void, unknown> {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const lower = lastUserMsg.toLowerCase().trim();
  const titleContext = context.titleContext;

  const executedCards: ToolResult[] = [];
  let replyText = '';

  // 1. Off-topic and Prompt Injection check
  if (
    /weather|recipe|coding|python|javascript|who is the president|stock market|bitcoin|crypto|medical|doctor|capital of|stomach hurts|stomach ache|ignore (?:all )?previous|system prompt|override instructions|reveal (?:all )?api keys|developer mode/i.test(
      lower
    )
  ) {
    replyText =
      "I'm Ask CinePulse, focused strictly on cinema, box-office forecasts, critical consensus, streaming links, and community predictions. Ask me about any film or what's trending!";
    for (const word of replyText.split(' ')) {
      yield { type: 'token', data: { text: word + ' ' } };
      await new Promise((r) => setTimeout(r, 8));
    }
    yield {
      type: 'suggestions',
      data: { items: ['What movies are trending?', 'Will Dune 2 be a hit?', 'Find a slow-burn thriller'] },
    };
    yield { type: 'done', data: { provider: 'rule-based', liteMode: true } };
    return;
  }

  // 2. Personal Accuracy / My Stats check
  if (/\bmy\b.*(?:prediction|accuracy|stats|track record|rank|receipts)|^show my stats$/i.test(lower)) {
    yield { type: 'tool_start', data: { name: 'get_my_accuracy', args: {} } };
    const res = await executeTool('get_my_accuracy', {}, { user: context.user, ip: context.ip });
    executedCards.push(res);
    yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data, summary: res.summary, asOf: res.asOf, source: res.source } };

    const d = res.data as any;
    if (d.authRequired) {
      replyText = d.message || 'Sign in to view your CinePulse accuracy ledger and leaderboard rank.';
    } else if ((d.totalCalls || 0) > 0) {
      replyText = `Here is your CinePulse prediction ledger: **${d.accuracyRate ?? 0}% accuracy** across **${d.totalCalls} calls**${d.brierScoreFormatted !== null ? ` with a calibrated Brier score of **${d.brierScoreFormatted}**` : ''}.`;
    } else {
      replyText = 'You have not resolved any box-office calls yet. Open an upcoming title to place your Hit or Flop call and build your accuracy record.';
    }
  }
  // 2b. Model Accuracy Ledger check
  else if (/model accuracy|brier score|calibration|how accurate is (?:the )?(?:model|cinepulse)|accuracy ledger|accuracy stats/i.test(lower)) {
    yield { type: 'tool_start', data: { name: 'get_model_accuracy', args: {} } };
    const res = await executeTool('get_model_accuracy', {}, { user: context.user, ip: context.ip });
    executedCards.push(res);
    yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data, summary: res.summary, asOf: res.asOf, source: res.source } };

    const d = res.data as any;
    if (d.overallBrierScore !== null && d.overallBrierScore !== undefined) {
      replyText = `The **${d.modelVersion}** forecast engine carries an overall Brier score of **${d.overallBrierScore}** (outperforming the ${d.baselineBrierScore} baseline) across **${d.totalResolved} evaluated titles**.\n\n- **90-day hit accuracy:** ${d.hitAccuracyRate}%\n- **Median percentage error (MAPE):** ${d.overallMape}%`;
    } else {
      replyText = 'Accuracy backtest metrics are not currently loaded.';
    }
  }
  // 3. Contrarian check
  else if (/contrarian|divergence|disagree|against the crowd|rebel/i.test(lower)) {
    yield { type: 'tool_start', data: { name: 'get_contrarian_picks', args: {} } };
    const res = await executeTool('get_contrarian_picks', {}, { user: context.user, ip: context.ip });
    executedCards.push(res);
    yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data, summary: res.summary, asOf: res.asOf, source: res.source } };

    const items = (res.data.items as any[]) || [];
    const lines = items.slice(0, 3).map(
      (c) => `- **${c.title}**: Model ${c.modelHitProbability}% vs Community ${c.communityHitProbability}% (${c.divergence}% gap)`
    );
    replyText = items.length > 0
      ? `Here ${items.length === 1 ? 'is **1 contrarian release**' : `are **${items.length} contrarian releases**`} where the model and community diverge sharply:\n\n${lines.join('\n')}`
      : 'No major model-vs-community contrarian divergences are flagged right now.';
  }
  // 4. Nearby Cinemas check
  else if (/nearby cinemas?|cinemas? near|theaters? near|showtimes?|book tickets?|pvr|inox|cinepolis/i.test(lower)) {
    const cityMatch = /\b(?:in|near|around)\s+([a-zA-Z\s]{3,30})/i.exec(lastUserMsg);
    const city = cityMatch?.[1]?.replace(/[?.,!]/g, '').trim() || 'Mumbai';
    yield { type: 'tool_start', data: { name: 'find_nearby_cinemas', args: { city } } };
    const res = await executeTool('find_nearby_cinemas', { city }, { user: context.user, ip: context.ip });
    executedCards.push(res);
    yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data, summary: res.summary, asOf: res.asOf, source: res.source } };

    const cinemas = (res.data.cinemas as any[]) || [];
    replyText = cinemas.length > 0
      ? `Found **${cinemas.length} cinemas** around **${(res.data as any).city || city}**, including ${cinemas.slice(0, 3).map((c) => c.name).join(', ')}. Direct booking links are attached below.`
      : `I couldn't find nearby cinema listings for ${city}.`;
  }
  // 5. Make Opening Call action check
  else if (/\b(?:call|predict|vote)\b.*\b(?:hit|flop)\b|\bmake (?:a |an )?(?:hit|flop|opening) call/i.test(lower) && !/will .* be a hit/i.test(lower)) {
    const choice = /\bflop\b/i.test(lower) ? 'flop' : 'hit';
    const targetId = titleContext || (await findTitleIdFromQuery(lastUserMsg));
    if (targetId) {
      yield { type: 'tool_start', data: { name: 'make_opening_call', args: { titleId: targetId, choice } } };
      const res = await executeTool('make_opening_call', { titleId: targetId, choice }, { user: context.user });
      executedCards.push(res);
      yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data, summary: res.summary, asOf: res.asOf, source: res.source } };
      replyText = `I've prepared a confirmation card to log your **${choice.toUpperCase()}** call on **${(res.data as any)?.titleName || 'this film'}**. Review and confirm below.`;
    } else {
      replyText = 'Which film would you like to call as Hit or Flop? Include the movie title or open one first.';
    }
  }
  // 6. Action: Add to watchlist
  else if (/add (?:.+?) to (?:my )?watchlist|add to (?:my )?watchlist|save (?:.+?) to (?:my )?watchlist|save (?:this|film|movie)|watchlist/i.test(lower)) {
    let targetId = titleContext;
    if (!targetId) {
      let cleanQ = lower
        .replace(/^add\s+/i, '')
        .replace(/\s+to\s+(?:my\s+)?watchlist.*$/i, '')
        .replace(/^save\s+/i, '')
        .replace(/watchlist/i, '')
        .trim();
      if (cleanQ) {
        let s = await catalog({ media: 'all', search: cleanQ, page: 1, collection: 'trending' });
        targetId = s.items?.[0]?.id;
        if (!targetId) {
          const words = cleanQ.split(/\s+/).filter((w) => w.length >= 3);
          for (const word of words) {
            const ws = await catalog({ media: 'all', search: word, page: 1, collection: 'trending' });
            if (ws.items?.[0]?.id) {
              targetId = ws.items[0].id;
              break;
            }
          }
        }
      }
    }

    if (targetId) {
      yield { type: 'tool_start', data: { name: 'add_to_library', args: { titleId: targetId, list: 'watchlist' } } };
      const res = await executeTool('add_to_library', { titleId: targetId, list: 'watchlist' }, { user: context.user });
      executedCards.push(res);
      yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data, summary: res.summary, asOf: res.asOf, source: res.source } };
      replyText = `Prepared a watchlist action for **${(res.data as any)?.titleName || 'the film'}**. Click Confirm below to save it to your library.`;
    } else {
      replyText = 'Which film would you like to add to your watchlist?';
    }
  }
  // 7. Where to Watch / Streaming check
  else if (/where (?:can i |to )?(?:watch|stream)|streaming|watch online|on ott|netflix|prime video|hotstar|apple tv/i.test(lower)) {
    const targetId = await findTitleIdFromQuery(lastUserMsg, titleContext);
    if (targetId) {
      yield { type: 'tool_start', data: { name: 'find_where_to_watch', args: { titleId: targetId } } };
      const res = await executeTool('find_where_to_watch', { titleId: targetId, region: 'IN' }, { user: context.user, ip: context.ip });
      executedCards.push(res);
      yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data, summary: res.summary, asOf: res.asOf, source: res.source } };
      const d = res.data as any;
      const providers = [
        ...(d.subscription || []),
        ...((d.directLinks || []).map((l: any) => l.name)),
      ];
      replyText = providers.length > 0
        ? `**${d.titleName}** currently has digital availability in **${d.region}** via ${Array.from(new Set(providers)).join(', ')}. Direct links and rental tiers are in the availability card below.`
        : `**${d.titleName}** doesn't show an active digital streaming offer in **${d.region}** right now${d.titleStatus === 'upcoming' ? ' — it may still be awaiting its theatrical or post-theatrical window.' : '.'}`;
    } else {
      replyText = 'Tell me which film you want to stream (or open a title first) and I will check verified platforms.';
    }
  }
  // 8. Critical Consensus / Ratings check
  else if (/critic|critics|critical consensus|rotten tomatoes|imdb|metascore|what are (?:critics|audiences) saying|reviews? for/i.test(lower)) {
    const targetId = await findTitleIdFromQuery(lastUserMsg, titleContext);
    if (targetId) {
      yield { type: 'tool_start', data: { name: 'get_critical_consensus', args: { titleId: targetId } } };
      const cRes = await executeTool('get_critical_consensus', { titleId: targetId }, { user: context.user, ip: context.ip });
      executedCards.push(cRes);
      yield { type: 'tool_result', data: { name: cRes.name, cardType: cRes.cardType, data: cRes.data, summary: cRes.summary, asOf: cRes.asOf, source: cRes.source } };

      yield { type: 'tool_start', data: { name: 'get_community_pulse', args: { titleId: targetId } } };
      const pRes = await executeTool('get_community_pulse', { titleId: targetId }, { user: context.user, ip: context.ip });
      executedCards.push(pRes);
      yield { type: 'tool_result', data: { name: pRes.name, cardType: pRes.cardType, data: pRes.data, summary: pRes.summary, asOf: pRes.asOf, source: pRes.source } };

      const cd = cRes.data as any;
      const pd = pRes.data as any;
      const scoreBits = [
        cd.rottenTomatoes ? `**Rotten Tomatoes:** ${cd.rottenTomatoes}` : null,
        cd.imdbRating ? `**IMDb:** ${cd.imdbRating}` : null,
        cd.metascore ? `**Metascore:** ${cd.metascore}` : null,
        cd.tmdbScore ? `**TMDB:** ${cd.tmdbScore}` : null,
      ].filter(Boolean);

      replyText = `Here is the critical and audience breakdown for **${cd.titleName}**:\n\n${
        scoreBits.length > 0 ? scoreBits.map((b) => `- ${b}`).join('\n') : '- External critic scores are still pending for this release.'
      }\n- **Community Pulse:** ${pd.count > 0 ? `${pd.hitShare ?? 0}% bullish across ${pd.count} calls` : 'No community calls recorded yet'}${cd.awards ? `\n- **Recognition:** ${cd.awards}` : ''}`;
    } else {
      replyText = 'Which film would you like the critic and audience consensus for?';
    }
  }
  // 9. Trending check
  else if (!/how will|will .* perform/i.test(lower) && /trending|what's popular|what is popular|\bin theaters\b|now playing|recommend something popular/i.test(lower)) {
    yield { type: 'tool_start', data: { name: 'get_trending', args: {} } };
    const res = await executeTool('get_trending', {}, { user: context.user, ip: context.ip });
    executedCards.push(res);
    yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data, summary: res.summary, asOf: res.asOf, source: res.source } };

    const items = (res.data.items as any[]) || [];
    const highlights = items.slice(0, 4).map((t) => {
      const bits = [
        t.genres?.slice(0, 2).join('/'),
        t.releaseDate ? t.releaseDate.slice(0, 4) : null,
        t.voteAverage ? `Rating ${t.voteAverage}` : null,
      ].filter(Boolean).join(' · ');
      return `- **${t.title}**${bits ? ` (${bits})` : ''}`;
    });
    replyText = items.length > 0
      ? `Here are the top trending titles on CinePulse right now:\n\n${highlights.join('\n')}\n\nSelect any title below to inspect its forecast breakdown or save it to your library.`
      : 'Here are the current trending titles in the catalog.';
  }
  // 10. Surprise Me / Hidden Gem check
  else if (/surprise me|hidden gem|random (?:movie|film)|something underrated/i.test(lower)) {
    yield { type: 'tool_start', data: { name: 'mood_search', args: { query: 'underrated standout slow-burn drama sci-fi' } } };
    const res = await executeTool('mood_search', { query: 'underrated standout slow-burn drama sci-fi' }, { user: context.user, ip: context.ip });
    executedCards.push(res);
    yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data, summary: res.summary, asOf: res.asOf, source: res.source } };

    const items = (res.data.items as any[]) || [];
    const pick = items[0];
    replyText = pick
      ? `Try **${pick.title}** (${pick.genres?.slice(0, 2).join(', ') || 'Cinema'}${pick.runtime ? `, ${pick.runtime} min` : ''}). ${pick.overview || 'Explore it alongside these curated standouts below.'}`
      : 'Here are a few curated picks worth discovering.';
  }
  // 11. Mood / Vibe search check
  else if (/mood|vibe|feel-good|dark|slow-burn|cyberpunk|mind-bending/i.test(lower) && !/will .* be a hit/i.test(lower)) {
    yield { type: 'tool_start', data: { name: 'mood_search', args: { query: lastUserMsg } } };
    const res = await executeTool('mood_search', { query: lastUserMsg }, { user: context.user, ip: context.ip });
    executedCards.push(res);
    yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data, summary: res.summary, asOf: res.asOf, source: res.source } };
    const items = (res.data.items as any[]) || [];
    const highlights = items.slice(0, 3).map((t) => `- **${t.title}** — ${t.genres?.slice(0, 2).join(', ') || 'Film'}${t.runtime ? ` (${t.runtime}m)` : ''}`);
    replyText = items.length > 0
      ? `Found **${items.length} titles** aligned with that mood and tone:\n\n${highlights.join('\n')}`
      : 'Found matching titles from the catalog.';
  }
  // 12. Personalized Recommendation check
  else if (/recommend for me|what should i watch|taste dna|my taste/i.test(lower)) {
    if (!context.user?.id) {
      replyText = 'Sign in to unlock recommendations calibrated to your personal Taste DNA. Meanwhile, here are top trending titles across CinePulse.';
      yield { type: 'tool_start', data: { name: 'get_trending', args: {} } };
      const res = await executeTool('get_trending', {}, { user: context.user, ip: context.ip });
      executedCards.push(res);
      yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data, summary: res.summary, asOf: res.asOf, source: res.source } };
    } else {
      yield { type: 'tool_start', data: { name: 'recommend_for_me', args: {} } };
      const res = await executeTool('recommend_for_me', {}, { user: context.user, ip: context.ip });
      executedCards.push(res);
      yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data, summary: res.summary, asOf: res.asOf, source: res.source } };
      replyText = 'Based on your Taste DNA profile and ratings history, here are calibrated matches to watch next.';
    }
  }
  // 13. Compare check
  else if (/compare| vs | versus |\bor\b|should i watch/i.test(lower) && !/will .* be a hit/i.test(lower)) {
    const parts = lower.split(/\s+(?:vs|versus|and|or)\s+/i);
    let titleA = titleContext;
    let titleB: string | undefined;

    if (parts.length >= 2) {
      const qA = parts[0].replace(/compare|should i watch/gi, '').trim();
      const qB = parts[1].replace(/[?.,!]/g, '').trim();
      const searchA = await catalog({ media: 'all', search: qA, page: 1, collection: 'trending' });
      const searchB = await catalog({ media: 'all', search: qB, page: 1, collection: 'trending' });
      titleA = searchA.items?.[0]?.id || titleA;
      titleB = searchB.items?.[0]?.id;

      if (!titleA) {
        const wordsA = qA.split(/\s+/).filter((w) => w.length >= 3);
        for (const w of wordsA) {
          const ws = await catalog({ media: 'all', search: w, page: 1, collection: 'trending' });
          if (ws.items?.[0]?.id) {
            titleA = ws.items[0].id;
            break;
          }
        }
      }

      if (!titleB) {
        const wordsB = qB.split(/\s+/).filter((w) => w.length >= 3);
        for (const w of wordsB) {
          const ws = await catalog({ media: 'all', search: w, page: 1, collection: 'trending' });
          if (ws.items?.[0]?.id) {
            titleB = ws.items[0].id;
            break;
          }
        }
      }
    }

    if (titleA && titleB) {
      yield { type: 'tool_start', data: { name: 'compare_titles', args: { idA: titleA, idB: titleB } } };
      const res = await executeTool('compare_titles', { idA: titleA, idB: titleB }, { user: context.user });
      executedCards.push(res);
      yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data, summary: res.summary, asOf: res.asOf, source: res.source } };
      const cd = res.data as any;
      const fmtCompare = (item: any) => {
        if (!item) return '';
        const meta = `${item.genres?.join(', ') || 'Film'}${item.director ? ` · Dir. ${item.director}` : ''}`;
        if (item.abstained || (item.hitProbability === 0 && item.flopProbability === 0)) {
          return `- **${item.title}** (${meta}): Forecast withheld`;
        }
        return `- **${item.title}** (${meta}): ${item.hitProbability}% Hit prob.${item.p50Millions ? `, $${item.p50Millions}M est.` : ''}`;
      };
      replyText = `${cd.verdict}\n\n${fmtCompare(cd.titleA)}\n${fmtCompare(cd.titleB)}`;
    } else {
      replyText = "I couldn't quite identify both titles to compare. Please specify two movie names, like 'Compare Beyond the Dunes vs Neon District'.";
    }
  }
  // 14. Hit / Flop forecast OR Title details / active context inquiry
  else if (/hit|flop|box office|forecast|probability|will .* be a hit|how will|perform|tell me about|overview|synopsis|summary|plot|who directed|director|cast|runtime/i.test(lower) || titleContext) {
    let targetId = titleContext;
    let queryMovie = lower
      .replace(/will|be a hit|be a flop|how will|do at the box office|what is the forecast for|what's the forecast for|forecast for|forecast|is it|going to|perform|in theaters|tell me about|overview of|synopsis of|summary of|who directed|runtime of|cast of|what about|explain/gi, '')
      .replace(/[?.,!]/g, '')
      .trim();

    if ((!targetId || (queryMovie.length > 2 && !/^(?:this|it|this movie|this film|the film)$/i.test(queryMovie))) && queryMovie.length > 1) {
      let searchRes = await catalog({ media: 'all', search: queryMovie, page: 1, collection: 'trending' });
      if (searchRes.items?.[0]?.id) {
        targetId = searchRes.items[0].id;
      } else {
        const words = queryMovie.split(/\s+/).filter((w) => w.length >= 3);
        let foundByWord: string | undefined;
        for (const word of words) {
          const ws = await catalog({ media: 'all', search: word, page: 1, collection: 'trending' });
          if (ws.items?.[0]?.id) {
            foundByWord = ws.items[0].id;
            break;
          }
        }
        // Only fall back to active titleContext when the user did NOT name an explicit unknown title
        if (foundByWord) {
          targetId = foundByWord;
        } else if (!targetId) {
          targetId = undefined;
        }
      }
    }

    if (targetId) {
      yield { type: 'tool_start', data: { name: 'get_forecast', args: { titleId: targetId } } };
      const fRes = await executeTool('get_forecast', { titleId: targetId }, { user: context.user });
      executedCards.push(fRes);
      yield { type: 'tool_result', data: { name: fRes.name, cardType: fRes.cardType, data: fRes.data, summary: fRes.summary, asOf: fRes.asOf, source: fRes.source } };

      yield { type: 'tool_start', data: { name: 'get_community_pulse', args: { titleId: targetId } } };
      const pRes = await executeTool('get_community_pulse', { titleId: targetId }, { user: context.user });
      executedCards.push(pRes);
      yield { type: 'tool_result', data: { name: pRes.name, cardType: pRes.cardType, data: pRes.data, summary: pRes.summary, asOf: pRes.asOf, source: pRes.source } };

      yield { type: 'tool_start', data: { name: 'get_title_details', args: { titleId: targetId } } };
      const tRes = await executeTool('get_title_details', { titleId: targetId }, { user: context.user });
      executedCards.push(tRes);
      yield { type: 'tool_result', data: { name: tRes.name, cardType: tRes.cardType, data: tRes.data, summary: tRes.summary, asOf: tRes.asOf, source: tRes.source } };

      const fData = fRes.data as any;
      const pData = pRes.data as any;
      const tData = tRes.data as any;

      const titleName = fData?.title || tData?.title || 'This film';
      const metaParts = [
        tData?.releaseDate ? tData.releaseDate.slice(0, 4) : null,
        Array.isArray(tData?.genres) && tData.genres.length > 0 ? tData.genres.slice(0, 3).join(', ') : null,
        tData?.director ? `Dir. ${tData.director}` : null,
        tData?.runtime ? `${tData.runtime}m` : null,
      ].filter(Boolean);

      const driversText = Array.isArray(fData?.topDrivers) && fData.topDrivers.length > 0
        ? fData.topDrivers.join('; ')
        : 'Signal baseline pending';

      const castNames = Array.isArray(tData?.cast) && tData.cast.length > 0
        ? tData.cast.slice(0, 3).map((c: any) => c.name).join(', ')
        : null;

      if (fData?.abstained) {
        const reasons = Array.isArray(fData.abstainReasons) && fData.abstainReasons.length > 0
          ? fData.abstainReasons.join(', ')
          : 'incomplete pre-release metadata';

        replyText = [
          `**${titleName}**${metaParts.length > 0 ? ` (${metaParts.join(' · ')})` : ''} — **Forecast withheld** (${reasons}).`,
          tData?.overview ? `\n**Premise:** ${tData.overview}` : '',
          castNames ? `\n- **Cast:** ${castNames}` : '',
          `- **Audience / TMDB:** ${tData?.voteAverage ? `${tData.voteAverage}/10 across ${tData.voteCount} votes` : 'Pre-release / rating pending'}`,
          `- **Community Pulse:** ${pData?.count > 0 ? `${pData.hitShare ?? 0}% bullish across ${pData.count} calls (${pData.stage} sample)` : `0 community calls recorded so far`}`,
        ].filter(Boolean).join('\n');
      } else {
        const revRange = fData?.revenueMillionsRange
          ? `$${fData.revenueMillionsRange[0]}M–$${fData.revenueMillionsRange[1]}M (P50 ~$${fData.p50Millions}M)`
          : 'an unbracketed range';

        replyText = [
          `**${titleName}**${metaParts.length > 0 ? ` (${metaParts.join(' · ')})` : ''} projects at **${fData.hitProbability}% hit probability** (${fData.confidence} confidence), tracking ${revRange}.`,
          tData?.overview ? `\n**Premise:** ${tData.overview}` : '',
          `\n- **Key Signal Drivers:** ${driversText}`,
          castNames ? `- **Key Cast:** ${castNames}` : '',
          `- **Community Pulse:** ${pData?.hitShare ?? 0}% bullish across ${pData?.count ?? 0} calls`,
        ].filter(Boolean).join('\n');
      }
    } else {
      replyText = "I couldn't locate that specific movie in our catalog. Try searching with the exact title name!";
    }
  }
  // 15. General title search / fallback
  else {
    const cleanedSearch = lower.replace(/[?.,!]/g, '').trim().slice(0, 50);
    const s = await catalog({ media: 'all', search: cleanedSearch, page: 1, collection: 'trending' });
    if (s.items && s.items.length > 0) {
      const topTitle = s.items[0];
      yield { type: 'tool_start', data: { name: 'get_forecast', args: { titleId: topTitle.id } } };
      const fRes = await executeTool('get_forecast', { titleId: topTitle.id }, { user: context.user });
      executedCards.push(fRes);
      yield { type: 'tool_result', data: { name: fRes.name, cardType: fRes.cardType, data: fRes.data, summary: fRes.summary, asOf: fRes.asOf, source: fRes.source } };

      yield { type: 'tool_start', data: { name: 'get_title_details', args: { titleId: topTitle.id } } };
      const tRes = await executeTool('get_title_details', { titleId: topTitle.id }, { user: context.user });
      executedCards.push(tRes);
      yield { type: 'tool_result', data: { name: tRes.name, cardType: tRes.cardType, data: tRes.data, summary: tRes.summary, asOf: tRes.asOf, source: tRes.source } };

      const fd = fRes.data as any;
      const td = tRes.data as any;
      replyText = `**${topTitle.title}** (${topTitle.releaseDate ? topTitle.releaseDate.slice(0, 4) : 'TBA'} · ${topTitle.genres.slice(0, 2).join(', ') || 'Cinema'})${td?.director ? ` directed by ${td.director}` : ''}.\n\n${td?.overview ? `${td.overview}\n\n` : ''}${fd?.abstained ? `Model forecast is withheld (${(fd.abstainReasons || []).join(', ')}), leaving open room for audience tracking.` : `Model outlook: **${fd.hitProbability}% hit probability** (${fd.confidence} confidence).`}`;
    } else {
      replyText = `I couldn't find catalog matches for "${lastUserMsg}". Try asking about a film title, "What's trending in theaters right now?", or "Where can I watch Inception?"!`;
    }
  }

  // Stream text smoothly word-by-word
  for (const word of replyText.split(' ')) {
    if (context.signal?.aborted) return;
    yield { type: 'token', data: { text: word + ' ' } };
    await new Promise((r) => setTimeout(r, 8));
  }

  if (executedCards.length > 0) {
    yield {
      type: 'evidence',
      data: {
        tools: executedCards.map((c) => ({
          name: c.name,
          source: c.source || c.name,
          asOf: c.asOf || null,
        })),
      },
    };
  }

  yield {
    type: 'suggestions',
    data: { items: generateSuggestions(executedCards, replyText) },
  };

  yield {
    type: 'done',
    data: { provider: 'rule-based', liteMode: true },
  };
}

// ─── Main Provider Fallback Router ────────────────────────────────────────────

export async function* streamChatCompletion(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: ProviderContext
): AsyncGenerator<SSEEvent, void, unknown> {
  // Immediate status event for < 300ms feedback
  yield { type: 'status', data: { step: 'routing' } };
  // If AI is disabled via environment, use rule-based immediately
  if (process.env.AI_ENABLED === 'false') {
    yield* streamRuleBased(messages, context);
    return;
  }

  // 1. Gemini Flash
  try {
    let geminiSucceeded = false;
    for await (const event of streamGemini(messages, context)) {
      geminiSucceeded = true;
      yield event;
    }
    if (geminiSucceeded) return;
  } catch (err: any) {
    console.warn('[CHAT] Gemini provider failed, falling back:', err?.message);
  }

  // 2. Groq
  try {
    let groqSucceeded = false;
    for await (const event of streamGroq(messages, context)) {
      groqSucceeded = true;
      yield event;
    }
    if (groqSucceeded) return;
  } catch (err: any) {
    console.warn('[CHAT] Groq provider failed, falling back:', err?.message);
  }

  // 3. Tool-Grounded Rule-Based Fallback (never hallucinates ungrounded facts)
  yield* streamRuleBased(messages, context);
}

// ─── Contextual Follow-up Chips Generator ─────────────────────────────────────

function generateSuggestions(cards: ToolResult[], _replyText: string): string[] {
  const hasModelAccuracy = cards.some((c) => c.cardType === 'model_accuracy');
  const hasForecast = cards.some((c) => c.cardType === 'forecast');
  const hasPulse = cards.some((c) => c.cardType === 'pulse');
  const hasTrending = cards.some((c) => c.name === 'get_trending');
  const hasCompare = cards.some((c) => c.cardType === 'compare');
  const hasAction = cards.some((c) => c.cardType === 'action');
  const hasStreaming = cards.some((c) => c.name === 'find_where_to_watch');
  const hasCritics = cards.some((c) => c.name === 'get_critical_consensus');

  const forecastCard = cards.find((c) => c.cardType === 'forecast' || c.name === 'get_title_details');
  const activeTitle = (forecastCard?.data as any)?.title || (forecastCard?.data as any)?.titleName;

  if (hasAction) {
    return ['Show trending movies', 'Compare two films', 'Show model accuracy stats'];
  }
  if (hasModelAccuracy) {
    return ['Check my own accuracy', 'Which calls are contrarian?', "What's trending right now?"];
  }
  if (hasCompare) {
    return ['Show critical consensus', 'Which calls are contrarian?', "What's trending right now?"];
  }
  if ((hasForecast || hasPulse) && activeTitle) {
    return [
      `Where can I watch ${activeTitle}?`,
      `What are critics saying about ${activeTitle}?`,
      `Add ${activeTitle} to my watchlist`,
    ];
  }
  if (hasStreaming && activeTitle) {
    return [
      `What is the forecast for ${activeTitle}?`,
      `What are critics saying about ${activeTitle}?`,
      'Find nearby cinemas',
    ];
  }
  if (hasCritics && activeTitle) {
    return [
      `Will ${activeTitle} be a hit?`,
      `Where can I watch ${activeTitle}?`,
      `Add ${activeTitle} to my watchlist`,
    ];
  }
  if (hasTrending) {
    return ['Will the top trending film be a hit?', 'Find a slow-burn thriller', 'Contrarian picks'];
  }

  return ['What is trending right now?', 'Which call is most contrarian?', 'Show model accuracy stats'];
}
