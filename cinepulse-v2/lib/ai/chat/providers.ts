import { SYSTEM_PROMPT } from './systemPrompt';
import { TOOL_DEFINITIONS, executeTool } from './tools';
import { runCloudflareAI } from '../../fetchers/cloudflare';
import { catalog, titleById } from '../../catalog';
import { getPrediction } from '../../prediction';
import { getPulse } from '../../pulse';
import { getContrarianReleases } from '../../contrarian';
import type { User, Title } from '../../types';
import type { SSEEvent, ToolResult } from './types';

export interface ProviderContext {
  user?: User | null;
  ip?: string;
  titleContext?: string;
  signal?: AbortSignal;
}

// ─── Gemini Provider ──────────────────────────────────────────────────────────

async function* streamGemini(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: ProviderContext
): AsyncGenerator<SSEEvent, boolean, unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return false;

  const model = process.env.CHAT_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Build contents history
  const contents: any[] = [];

  for (const m of messages) {
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.role === 'user' ? `<user_message>\n${m.content}\n</user_message>` : m.content }],
    });
  }

  // Gemini tool declarations mapping
  const geminiTools = [
    {
      functionDeclarations: TOOL_DEFINITIONS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];

  let toolCallCount = 0;
  const MAX_TOOL_CALLS = 4;
  let accumulatedText = '';
  const executedCards: ToolResult[] = [];

  while (toolCallCount <= MAX_TOOL_CALLS) {
    if (context.signal?.aborted) return true;

    const payload: any = {
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents,
      tools: geminiTools,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 800,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: context.signal,
    });

    if (!res.ok) {
      return false; // trigger fallback
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    if (!candidate) return false;

    const parts = candidate?.content?.parts || [];
    let hadToolCall = false;

    for (const part of parts) {
      if (part.functionCall) {
        hadToolCall = true;
        toolCallCount++;
        const fnName = part.functionCall.name;
        const fnArgs = part.functionCall.args || {};

        yield {
          type: 'tool_start',
          data: { name: fnName, args: fnArgs },
        };

        const result = await executeTool(fnName, fnArgs, { user: context.user, ip: context.ip });
        executedCards.push(result);

        yield {
          type: 'tool_result',
          data: {
            name: fnName,
            cardType: result.cardType,
            data: result.data,
            summary: result.summary,
          },
        };

        // Append model's tool call & function response back into contents
        contents.push({
          role: 'model',
          parts: [{ functionCall: part.functionCall }],
        });
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: fnName,
                response: { output: result.data },
              },
            },
          ],
        });
      } else if (part.text) {
        accumulatedText += part.text;
        yield {
          type: 'token',
          data: { text: part.text },
        };
      }
    }

    if (!hadToolCall) {
      break; // model finished outputting text
    }
  }

  // Yield follow-up suggestions
  yield {
    type: 'suggestions',
    data: { items: generateSuggestions(executedCards, accumulatedText) },
  };

  yield {
    type: 'done',
    data: { provider: 'gemini', model },
  };

  return true;
}

// ─── Groq Provider ───────────────────────────────────────────────────────────

async function* streamGroq(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: ProviderContext
): AsyncGenerator<SSEEvent, boolean, unknown> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return false;

  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
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

  const groqMessages: any[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  for (const m of messages) {
    groqMessages.push({
      role: m.role,
      content: m.role === 'user' ? `<user_message>\n${m.content}\n</user_message>` : m.content,
    });
  }

  let toolCallCount = 0;
  const MAX_TOOL_CALLS = 4;
  let accumulatedText = '';
  const executedCards: ToolResult[] = [];

  while (toolCallCount <= MAX_TOOL_CALLS) {
    if (context.signal?.aborted) return true;

    const payload = {
      model,
      messages: groqMessages,
      tools: groqTools,
      max_tokens: 800,
      temperature: 0.4,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: context.signal,
    });

    if (!res.ok) return false;

    const data = await res.json();
    const choice = data?.choices?.[0];
    if (!choice) return false;

    const msg = choice.message;
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      toolCallCount++;
      groqMessages.push(msg);

      for (const call of msg.tool_calls) {
        const fnName = call.function.name;
        let fnArgs: Record<string, unknown> = {};
        try {
          fnArgs = JSON.parse(call.function.arguments || '{}');
        } catch {}

        yield {
          type: 'tool_start',
          data: { name: fnName, args: fnArgs },
        };

        const result = await executeTool(fnName, fnArgs, { user: context.user, ip: context.ip });
        executedCards.push(result);

        yield {
          type: 'tool_result',
          data: {
            name: fnName,
            cardType: result.cardType,
            data: result.data,
            summary: result.summary,
          },
        };

        groqMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: fnName,
          content: JSON.stringify(result.data),
        });
      }
    } else if (msg.content) {
      accumulatedText += msg.content;
      yield {
        type: 'token',
        data: { text: msg.content },
      };
      break;
    } else {
      break;
    }
  }

  yield {
    type: 'suggestions',
    data: { items: generateSuggestions(executedCards, accumulatedText) },
  };

  yield {
    type: 'done',
    data: { provider: 'groq', model },
  };

  return true;
}

// ─── Cloudflare Workers AI Fallback ──────────────────────────────────────────

async function* streamCloudflare(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: ProviderContext
): AsyncGenerator<SSEEvent, boolean, unknown> {
  const prompt = `${SYSTEM_PROMPT}\n\n${messages.map((m) => `${m.role}: ${m.content}`).join('\n')}`;
  try {
    const text = await runCloudflareAI(prompt);
    if (!text || !text.trim()) return false;

    yield {
      type: 'token',
      data: { text: text.trim() },
    };

    yield {
      type: 'suggestions',
      data: { items: ['Tell me more', 'Trending films', 'Will it be a hit?'] },
    };

    yield {
      type: 'done',
      data: { provider: 'cloudflare', model: '@cf/meta/llama-3.1-8b-instruct' },
    };

    return true;
  } catch {
    return false;
  }
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
      "I'm CinePulse, your cinema and box-office companion! I focus strictly on films, theatrical forecasts, and community predictions. Ask me about any movie or what's trending!";
    for (const word of replyText.split(' ')) {
      yield { type: 'token', data: { text: word + ' ' } };
      await new Promise((r) => setTimeout(r, 10));
    }
    yield {
      type: 'suggestions',
      data: { items: ['What movies are trending?', 'Will Dune 2 be a hit?', 'Find a slow-burn thriller'] },
    };
    yield { type: 'done', data: { provider: 'rule-based', liteMode: true } };
    return;
  }

  // 2. Contrarian check
  if (/contrarian|divergence|disagree|against the crowd|rebel/i.test(lower)) {
    yield { type: 'tool_start', data: { name: 'get_contrarian_picks', args: {} } };
    const res = await executeTool('get_contrarian_picks', {}, { user: context.user, ip: context.ip });
    executedCards.push(res);
    yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data } };

    const count = (res.data.items as any[])?.length || 0;
    replyText = `Here are ${count} titles where our statistical model and the community crowd wisdom have divergent expectations by 20% or more.`;
  }
  // 3. Trending check
  else if (!/how will|will .* perform/i.test(lower) && /trending|what's popular|\bin theaters\b|now playing|recommend something popular/i.test(lower)) {
    yield { type: 'tool_start', data: { name: 'get_trending', args: {} } };
    const res = await executeTool('get_trending', {}, { user: context.user, ip: context.ip });
    executedCards.push(res);
    yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data } };

    replyText = "Here are the top trending titles right now based on audience velocity and catalog interest.";
  }
  // 3b. Mood / Vibe search check
  else if (/mood|vibe|feel-good|dark|slow-burn|cyberpunk|mind-bending/i.test(lower) && !/will .* be a hit/i.test(lower)) {
    yield { type: 'tool_start', data: { name: 'mood_search', args: { query: lastUserMsg } } };
    const res = await executeTool('mood_search', { query: lastUserMsg }, { user: context.user, ip: context.ip });
    executedCards.push(res);
    yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data } };
    const count = (res.data.items as any[])?.length || 0;
    replyText = `Found ${count} titles matching that mood and tone from our catalog.`;
  }
  // 4. Personalized Recommendation check
  else if (/recommend for me|what should i watch|taste dna|my taste/i.test(lower)) {
    if (!context.user?.id) {
      replyText = "Sign in to see recommendations customized to your Taste DNA! In the meantime, here is what is trending.";
      yield { type: 'tool_start', data: { name: 'get_trending', args: {} } };
      const res = await executeTool('get_trending', {}, { user: context.user, ip: context.ip });
      executedCards.push(res);
      yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data } };
    } else {
      yield { type: 'tool_start', data: { name: 'recommend_for_me', args: {} } };
      const res = await executeTool('recommend_for_me', {}, { user: context.user, ip: context.ip });
      executedCards.push(res);
      yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data } };
      replyText = "Based on your Taste DNA profile and ratings history, here are films calibrated for your palate.";
    }
  }
  // 5. Compare check
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
      yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data } };
      replyText = res.summary || 'Here is the head-to-head comparison of both releases.';
    } else {
      replyText = "I couldn't quite identify both titles to compare. Please specify two movie names, like 'Compare Beyond the Dunes vs Neon District'.";
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
      yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data } };
      replyText = `I've prepared an action to add "${(res.data as any)?.titleName || 'the film'}" to your watchlist. Confirm below!`;
    } else {
      replyText = "Which film would you like to add to your watchlist?";
    }
  }
  // 7. Hit / Flop forecast inquiry
  else if (/hit|flop|box office|forecast|probability|will .* be a hit|how will|perform/i.test(lower) || titleContext) {
    let targetId = titleContext;
    let queryMovie = lower
      .replace(/will|be a hit|be a flop|how will|do at the box office|what is the forecast for|forecast|is|going to|perform|in theaters/gi, '')
      .replace(/[?.,!]/g, '')
      .trim();

    if (!targetId && queryMovie.length > 1) {
      let searchRes = await catalog({ media: 'all', search: queryMovie, page: 1, collection: 'trending' });
      targetId = searchRes.items?.[0]?.id;
      if (!targetId) {
        const words = queryMovie.split(/\s+/).filter((w) => w.length >= 3);
        for (const word of words) {
          const ws = await catalog({ media: 'all', search: word, page: 1, collection: 'trending' });
          if (ws.items?.[0]?.id) {
            targetId = ws.items[0].id;
            break;
          }
        }
      }
    }

    if (targetId) {
      // Execute forecast & pulse
      yield { type: 'tool_start', data: { name: 'get_forecast', args: { titleId: targetId } } };
      const fRes = await executeTool('get_forecast', { titleId: targetId }, { user: context.user });
      executedCards.push(fRes);
      yield { type: 'tool_result', data: { name: fRes.name, cardType: fRes.cardType, data: fRes.data } };

      yield { type: 'tool_start', data: { name: 'get_community_pulse', args: { titleId: targetId } } };
      const pRes = await executeTool('get_community_pulse', { titleId: targetId }, { user: context.user });
      executedCards.push(pRes);
      yield { type: 'tool_result', data: { name: pRes.name, cardType: pRes.cardType, data: pRes.data } };

      const fData = fRes.data as any;
      const pData = pRes.data as any;
      const titleName = fData?.title || 'This film';
      const hitPct = fData?.hitProbability ?? 50;
      const callCount = pData?.count ?? 0;
      const revRange = fData?.revenueRange ? `$${Math.round(fData.revenueRange[0] / 1e6)}M–$${Math.round(fData.revenueRange[1] / 1e6)}M` : 'an unbracketed range';

      replyText = `Based on our predictive model, **${titleName}** is projected at **${hitPct}% hit probability**, tracking an estimated ${revRange} theatrical gross. The community sentiment reflects ${pData?.hitShare ?? 0}% bullish calls across ${callCount} votes.`;
    } else {
      replyText = "I couldn't locate that specific movie in our catalog. Try searching with the exact title name!";
    }
  }
  // 8. General title search / fallback
  else {
    const s = await catalog({ media: 'all', search: lower.slice(0, 40), page: 1, collection: 'trending' });
    if (s.items && s.items.length > 0) {
      const topTitle = s.items[0];
      yield { type: 'tool_start', data: { name: 'get_forecast', args: { titleId: topTitle.id } } };
      const fRes = await executeTool('get_forecast', { titleId: topTitle.id }, { user: context.user });
      executedCards.push(fRes);
      yield { type: 'tool_result', data: { name: fRes.name, cardType: fRes.cardType, data: fRes.data } };

      replyText = `Here's what our box-office intelligence says about **${topTitle.title}** (${topTitle.releaseDate ? topTitle.releaseDate.slice(0, 4) : 'TBA'}).`;
    } else {
      replyText = `I couldn't find matches for "${lastUserMsg}". Ask me about any upcoming movie, or ask "What's trending?"!`;
    }
  }

  // Stream text smoothly word-by-word
  for (const word of replyText.split(' ')) {
    if (context.signal?.aborted) return;
    yield { type: 'token', data: { text: word + ' ' } };
    await new Promise((r) => setTimeout(r, 12));
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

  // 3. Cloudflare
  try {
    let cfSucceeded = false;
    for await (const event of streamCloudflare(messages, context)) {
      cfSucceeded = true;
      yield event;
    }
    if (cfSucceeded) return;
  } catch (err: any) {
    console.warn('[CHAT] Cloudflare provider failed, falling back:', err?.message);
  }

  // 4. Rule-Based / Lite Mode
  yield* streamRuleBased(messages, context);
}

// ─── Contextual Follow-up Chips Generator ─────────────────────────────────────

function generateSuggestions(cards: ToolResult[], replyText: string): string[] {
  const hasForecast = cards.some((c) => c.cardType === 'forecast');
  const hasPulse = cards.some((c) => c.cardType === 'pulse');
  const hasTrending = cards.some((c) => c.name === 'get_trending');
  const hasAction = cards.some((c) => c.cardType === 'action');

  if (hasAction) {
    return ['Show trending movies', 'Compare with another film'];
  }
  if (hasForecast || hasPulse) {
    return ['Why is the forecast confident?', 'Add to my watchlist', 'Which calls are contrarian?'];
  }
  if (hasTrending) {
    return ['Will the top film be a hit?', 'Find a slow-burn thriller', 'Contrarian picks'];
  }

  return ['Will this be a hit?', 'What is trending now?', 'Recommend something for me'];
}
