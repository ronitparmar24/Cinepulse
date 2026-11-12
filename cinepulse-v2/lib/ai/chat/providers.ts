import { SYSTEM_PROMPT } from './systemPrompt';
import { TOOL_DEFINITIONS, executeTool } from './tools';
import { catalog, titleById } from '../../catalog';
import type { User } from '../../types';
import type { SSEEvent, ToolResult } from './types';

export interface ProviderContext {
  user?: User | null;
  ip?: string;
  titleContext?: string;
  region?: string;
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

async function resolveActiveTitleSystemNote(titleContext?: string, region?: string): Promise<string> {
  const parts: string[] = [];

  const cleanRegion = region?.trim().toUpperCase();
  if (cleanRegion === 'IN' || cleanRegion === 'US') {
    parts.push(
      [
        '<user_region>',
        `region: "${cleanRegion}"`,
        cleanRegion === 'IN'
          ? 'Instruction: The user has selected India (IN) as their active region. Default streaming/theater checks to IN and include INR Crores (p50InrCrores / actualInrCrores) alongside USD when available in tool output.'
          : 'Instruction: The user has selected United States (US) as their active region. Default streaming/theater checks to US and USD.',
        '</user_region>',
      ].join('\n')
    );
  }

  if (titleContext) {
    try {
      const t = await titleById(titleContext);
      const year = t.releaseDate ? t.releaseDate.slice(0, 4) : 'TBA';
      parts.push(
        [
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
          .join('\n')
      );
    } catch {
      parts.push(
        [
          '<active_title_context>',
          `titleId: "${titleContext}"`,
          'Instruction: The user is viewing this title in CinePulse. Resolve "this film" or "it" to this titleId unless another film is named.',
          '</active_title_context>',
        ].join('\n')
      );
    }
  }

  return parts.join('\n\n');
}

function cleanModelText(raw: string): string {
  // Strip any accidental reasoning tags leaked by open-weight models
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
}

function synthesizeFallbackSummary(cards: ToolResult[]): string {
  const sections: string[] = [];

  for (const card of cards) {
    const d = (card.data || {}) as Record<string, any>;
    if (card.error || d.error) continue;

    if (card.name === 'get_forecast') {
      if (d.abstained) {
        const reasons = Array.isArray(d.abstainReasons) && d.abstainReasons.length > 0
          ? d.abstainReasons.join(', ')
          : 'insufficient pre-release metadata';
        sections.push(
          `**${d.title || 'Forecast'}:** Forecast withheld (${reasons}).`
        );
      } else if (d.isReleased && d.actualRevenueMillions) {
        const roi = d.roiMultiple ? ` (${d.roiMultiple}x budget)` : '';
        const inr = d.actualInrCrores ? ` · ${d.actualInrCrores}` : '';
        const range = Array.isArray(d.revenueMillionsRange)
          ? ` (Model P10–P90 benchmark: $${d.revenueMillionsRange[0]}M–$${d.revenueMillionsRange[1]}M, P50 ~$${d.p50Millions}M)`
          : '';
        sections.push(
          `**${d.title} (Released):** Reported Worldwide Gross **$${d.actualRevenueMillions}M**${roi}${inr}. Model calibration benchmark: **${d.hitProbability}% Hit Probability** (${d.confidence} confidence)${range}.`
        );
      } else {
        const range = Array.isArray(d.revenueMillionsRange)
          ? `$${d.revenueMillionsRange[0]}M–$${d.revenueMillionsRange[1]}M (P50 ~$${d.p50Millions}M)`
          : d.p50Millions
          ? `~$${d.p50Millions}M P50`
          : 'range pending';
        const inr = d.p50InrCrores ? ` · ${d.p50InrCrores}` : '';
        const drivers = Array.isArray(d.topDrivers) && d.topDrivers.length > 0
          ? `\n  - Key drivers: ${d.topDrivers.slice(0, 3).join('; ')}`
          : '';
        const hype = d.hypeMomentum?.score
          ? `\n  - Hype Momentum: ${d.hypeMomentum.level} (${d.hypeMomentum.score}/100)`
          : '';
        sections.push(
          `**${d.title || 'Box-Office Forecast'}:** **${d.hitProbability}% Hit Probability** (${d.confidence} confidence), tracking ${range}${inr}.${drivers}${hype}`
        );
      }
      continue;
    }

    if (card.name === 'get_community_pulse') {
      if ((d.count || 0) > 0) {
        const caveat = d.sampleSizeWarning ? ' — small sample (<10 calls)' : '';
        sections.push(
          `- **Community Pulse (${d.title}):** **${d.hitShare ?? 0}% Hit** across **${d.count} calls** (${d.stage}${caveat})`
        );
      } else {
        sections.push(`- **Community Pulse (${d.title}):** No community calls recorded yet.`);
      }
      continue;
    }

    if (card.name === 'get_critical_consensus') {
      const scores = [
        d.rottenTomatoes ? `Rotten Tomatoes ${d.rottenTomatoes}` : null,
        d.imdbRating ? `IMDb ${d.imdbRating}` : null,
        d.metascore ? `Metascore ${d.metascore}` : null,
        d.tmdbScore ? `TMDB ${d.tmdbScore}` : null,
      ].filter(Boolean);
      sections.push(
        `- **Quad-Consensus (${d.titleName}):** ${scores.join(' · ') || 'Scores pending'}${d.awards ? ` · ${d.awards}` : ''}`
      );
      continue;
    }

    if (card.name === 'get_model_accuracy' && d.overallBrierScore != null) {
      const misses = Array.isArray(d.biggestMisses) && d.biggestMisses.length > 0
        ? `\n  - Notable miss receipt: **${d.biggestMisses[0].titleName}** (${d.biggestMisses[0].errorReason})`
        : '';
      sections.push(
        `- **Model Accuracy (${d.modelVersion}):** Brier **${Number(d.overallBrierScore).toFixed(3)}** vs ${d.baselineBrierScore} baseline · **${d.hitAccuracyRate}%** 90-day hit rate · ${d.overallMape}% MAPE across ${d.totalResolved} titles.${misses}`
      );
      continue;
    }

    if (card.name === 'get_my_accuracy') {
      if (d.authRequired) {
        sections.push(d.message || 'Sign in to view your CinePulse accuracy ledger and prediction rank.');
      } else if ((d.totalCalls || 0) > 0) {
        sections.push(
          `**Your Accuracy Ledger:** **${d.accuracyRate ?? 0}% accuracy** across **${d.totalCalls} calls**${d.brierScoreFormatted !== null ? ` (Brier ${d.brierScoreFormatted})` : ''}.`
        );
      } else {
        sections.push('You have not resolved any box-office prediction calls yet.');
      }
      continue;
    }

    if (card.name === 'compare_titles' && d.titleA && d.titleB) {
      const fmtItem = (item: any) => {
        if (item.isReleased && item.actualRevenueMillions) {
          return `- **${item.title}** (${item.genres?.slice(0, 2).join(', ') || 'Film'}): Reported Worldwide Gross **$${item.actualRevenueMillions}M** · ${item.hitProbability}% model hit prob.`;
        }
        if (item.abstained) {
          return `- **${item.title}** (${item.genres?.slice(0, 2).join(', ') || 'Film'}): Forecast withheld`;
        }
        return `- **${item.title}** (${item.genres?.slice(0, 2).join(', ') || 'Film'}): **${item.hitProbability}% Hit**${item.p50Millions ? ` (~$${item.p50Millions}M P50)` : ''}`;
      };
      sections.push(`${d.verdict}\n\n${fmtItem(d.titleA)}\n${fmtItem(d.titleB)}`);
      continue;
    }

    if (card.name === 'get_trending' || card.name === 'mood_search' || card.name === 'search_titles' || card.name === 'recommend_for_me') {
      if (d.authRequired) {
        sections.push(d.message || 'Sign in to unlock Taste DNA personalized recommendations.');
        continue;
      }
      const list = Array.isArray(d.items) ? d.items : [];
      if (list.length > 0) {
        const heading =
          card.name === 'get_trending'
            ? `Here are the top ${list.length} trending titles on CinePulse right now:`
            : card.name === 'mood_search'
            ? `Found **${list.length} titles** matching that mood:`
            : card.name === 'recommend_for_me'
            ? `Here are **${list.length} personalized picks** calibrated to your Taste DNA:`
            : `Found **${list.length} matching titles**:`;
        const bullets = list.slice(0, 4).map((t: any) => {
          const bits = [
            t.releaseDate ? String(t.releaseDate).slice(0, 4) : null,
            Array.isArray(t.genres) && t.genres.length > 0 ? t.genres.slice(0, 2).join('/') : null,
            t.voteAverage ? `★ ${Number(t.voteAverage).toFixed(1)}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return `- **${t.title}**${bits ? ` (${bits})` : ''}`;
        });
        sections.push(`${heading}\n\n${bullets.join('\n')}`);
        continue;
      }
    }

    if (card.name === 'get_contrarian_picks') {
      const list = Array.isArray(d.items) ? d.items : [];
      if (list.length > 0) {
        const bullets = list.slice(0, 4).map(
          (c: any) => `- **${c.title}**: Model ${c.modelHitProbability}% vs Community ${c.communityHitProbability}% (${c.divergence}% gap)`
        );
        sections.push(`Found **${list.length} contrarian releases** with sharp model-vs-community divergence:\n\n${bullets.join('\n')}`);
        continue;
      }
    }

    if (card.name === 'find_where_to_watch') {
      const providers = Array.from(
        new Set([...(d.subscription || []), ...((d.directLinks || []).map((l: any) => l.name))])
      );
      sections.push(
        providers.length > 0
          ? `**${d.titleName}** (${d.region}) is available on ${providers.join(', ')}. Rental/purchase tiers and direct links are shown below.`
          : `**${d.titleName}** shows no active digital streaming links in **${d.region}** right now.`
      );
      continue;
    }

    if (card.name === 'find_nearby_cinemas') {
      const cinemas = Array.isArray(d.cinemas) ? d.cinemas : [];
      sections.push(
        cinemas.length > 0
          ? `Found **${cinemas.length} cinemas** near **${d.city}**, including ${cinemas.slice(0, 3).map((c: any) => c.name).join(', ')}.`
          : `No nearby cinema listings found for ${d.city || 'this area'}.`
      );
      continue;
    }

    if (card.name === 'get_title_details' && d.title) {
      const meta = [
        d.releaseDate ? String(d.releaseDate).slice(0, 4) : null,
        Array.isArray(d.genres) ? d.genres.slice(0, 3).join(', ') : null,
        d.director ? `Dir. ${d.director}` : null,
        d.runtime ? `${d.runtime}m` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      sections.push(`**${d.title}**${meta ? ` (${meta})` : ''}${d.overview ? `\n\n${d.overview}` : ''}`);
      continue;
    }

    if ((card.name === 'add_to_library' || card.name === 'make_opening_call') && d.action?.description) {
      sections.push(`Prepared confirmation card: **${d.action.description}**. Click Confirm below to execute.`);
      continue;
    }

    if (card.summary && card.summary.trim()) {
      sections.push(`- ${card.summary}`);
    }
  }

  if (sections.length === 0) return '';
  if (sections.length === 1 && !sections[0].startsWith('- ')) {
    return sections[0];
  }
  return `Here is the grounded breakdown from CinePulse:\n\n${sections.join('\n')}`;
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

  const activeTitleNote = await resolveActiveTitleSystemNote(context.titleContext, context.region);
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
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
      } else if (done) {
        buffer += decoder.decode();
      }

      const lines = buffer.split('\n');
      buffer = done ? '' : lines.pop() || '';

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

      if (done) break;
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

      const result = await executeTool(fn.name, fn.args, {
        user: context.user,
        ip: context.ip,
        titleContext: context.titleContext,
        region: context.region,
      });
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

  yield {
    type: 'suggestions',
    data: {
      items: generateSuggestions(executedCards, accumulatedText, {
        isAuthenticated: Boolean(context.user?.id),
      }),
    },
  };
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

  const activeTitleNote = await resolveActiveTitleSystemNote(context.titleContext, context.region);
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
      for (const fallbackModel of [activeModel, ...candidateModels.filter((m) => m !== activeModel)]) {
        if (context.signal?.aborted) return true;
        try {
          const attempt = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: fallbackModel,
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
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
      } else if (done) {
        buffer += decoder.decode();
      }

      const lines = buffer.split('\n');
      buffer = done ? '' : lines.pop() || '';

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

      if (done) break;
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

      const result = await executeTool(tc.name, fnArgs, {
        user: context.user,
        ip: context.ip,
        titleContext: context.titleContext,
        region: context.region,
      });
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

  yield {
    type: 'suggestions',
    data: {
      items: generateSuggestions(executedCards, accumulatedText, {
        isAuthenticated: Boolean(context.user?.id),
      }),
    },
  };
  yield { type: 'done', data: { provider: 'groq', model: activeModel } };
  return true;
}

// ─── Helper for resolving a movie title ID cleanly from natural queries ──────

async function findTitleIdFromQuery(query: string, fallbackId?: string): Promise<string | undefined> {
  if (!query || /^(?:this|it|that|this movie|this film|that movie|that film|the movie|the film)$/i.test(query.trim())) {
    return fallbackId;
  }
  const cleanQ = query
    .replace(/^(?:where (?:can i |to )?(?:watch|stream)|what are critics saying about|what did critics say about|critics consensus (?:for|on)|reviews? (?:for|of)|ratings? (?:for|of)|tell me about|overview (?:of|for)|synopsis (?:of|for)|summary (?:of|for)|who directed|cast of|budget of|what is the budget of|add|save|call|predict|vote)\s+/gi, '')
    .replace(/\s+(?:right now|on ott|streaming|online|critics|consensus|ratings|reviews|to (?:my )?watchlist|as a (?:hit|flop)|is a (?:hit|flop))$/gi, '')
    .replace(/[?.,!'"`]/g, '')
    .trim();

  if (!cleanQ || cleanQ.length < 2) return fallbackId;
  if (/^(?:this|it|that|this one|this film|this movie)$/i.test(cleanQ)) return fallbackId;

  const exact = await catalog({ media: 'all', search: cleanQ, page: 1, collection: 'trending' });
  if (exact.items?.[0]?.id) return exact.items[0].id;

  const words = cleanQ
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/^(?:about|the|this|that|what|when|where|which|film|movie|show|series|watch|stream|find|give|tell|did|are|was|its|for)$/i.test(w));

  for (const word of words) {
    const ws = await catalog({ media: 'all', search: word, page: 1, collection: 'trending' });
    if (ws.items?.[0]?.id) return ws.items[0].id;
  }

  return undefined;
}

async function inferRecentTitleFromHistory(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string | undefined> {
  // Look backwards over prior turns (excluding the current last user message) for a clear title mention
  const prior = messages.slice(0, -1).reverse();
  for (const msg of prior.slice(0, 6)) {
    // 1. Check bolded title headings in assistant responses (e.g. **Dune: Part Two**)
    if (msg.role === 'assistant') {
      const boldMatches = [...msg.content.matchAll(/\*\*([^*\n]{2,55})\*\*/g)];
      for (const m of boldMatches) {
        const candidate = m[1].trim();
        if (/^(?:Premise|Key Signals|Key Signal Drivers|Key Cast|Community Pulse|Recognition|Reported Worldwide Gross|Forecast withheld|Model Benchmark)/i.test(candidate)) {
          continue;
        }
        const resolved = await findTitleIdFromQuery(candidate);
        if (resolved) return resolved;
      }
    } else {
      const resolved = await findTitleIdFromQuery(msg.content);
      if (resolved) return resolved;
    }
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
  const region = (context.region || 'IN').toUpperCase();
  const titleContext = context.titleContext || (await inferRecentTitleFromHistory(messages));
  const toolCtx = { user: context.user, ip: context.ip, titleContext, region };

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
    const res = await executeTool('get_my_accuracy', {}, toolCtx);
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
  // 2b. Model Accuracy Ledger & Receipts check
  else if (/model accuracy|brier score|calibration|how accurate is (?:the )?(?:model|cinepulse)|accuracy ledger|accuracy stats|forecast receipts|biggest miss(?:es)?/i.test(lower)) {
    yield { type: 'tool_start', data: { name: 'get_model_accuracy', args: {} } };
    const res = await executeTool('get_model_accuracy', {}, toolCtx);
    executedCards.push(res);
    yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data, summary: res.summary, asOf: res.asOf, source: res.source } };

    const d = res.data as any;
    if (d.overallBrierScore !== null && d.overallBrierScore !== undefined) {
      const miss = Array.isArray(d.biggestMisses) && d.biggestMisses.length > 0 ? d.biggestMisses[0] : null;
      const crowd = d.communityTrack;
      replyText = [
        `The **${d.modelVersion}** forecast engine carries an overall Brier score of **${d.overallBrierScore}** (outperforming the ${d.baselineBrierScore} baseline) across **${d.totalResolved} evaluated titles**.`,
        '',
        `- **90-day hit accuracy:** ${d.hitAccuracyRate}%`,
        `- **Median percentage error (MAPE):** ${d.overallMape}%`,
        crowd ? `- **Community Crowd benchmark:** ${crowd.hitRate}% hit rate (Brier ${crowd.brierScore})` : '',
        miss ? `- **Notable miss receipt:** **${miss.titleName}** (${miss.predictedProbability}% model call) — ${miss.errorReason}` : '',
      ].filter(Boolean).join('\n');
    } else {
      replyText = 'Accuracy backtest metrics are not currently loaded.';
    }
  }
  // 3. Contrarian check
  else if (/contrarian|divergence|disagree|against the crowd|rebel/i.test(lower)) {
    yield { type: 'tool_start', data: { name: 'get_contrarian_picks', args: {} } };
    const res = await executeTool('get_contrarian_picks', {}, toolCtx);
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
    const defaultCity = region === 'US' ? 'New York' : 'Mumbai';
    const city = cityMatch?.[1]?.replace(/[?.,!]/g, '').trim() || defaultCity;
    yield { type: 'tool_start', data: { name: 'find_nearby_cinemas', args: { city, region } } };
    const res = await executeTool('find_nearby_cinemas', { city, region }, toolCtx);
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
      const res = await executeTool('make_opening_call', { titleId: targetId, choice }, toolCtx);
      executedCards.push(res);
      yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data, summary: res.summary, asOf: res.asOf, source: res.source } };
      replyText = `I've prepared a confirmation card to log your **${choice.toUpperCase()}** call on **${(res.data as any)?.titleName || 'this film'}**. Review and confirm below.`;
    } else {
      replyText = 'Which film would you like to call as Hit or Flop? Include the movie title or open one first.';
    }
  }
  // 6. Action: Add to watchlist
  else if (/add (?:.+?) to (?:my )?watchlist|add to (?:my )?watchlist|save (?:.+?) to (?:my )?watchlist|save (?:this|it|film|movie)|watchlist/i.test(lower)) {
    const cleanQ = lower
      .replace(/^add\s+/i, '')
      .replace(/\s+to\s+(?:my\s+)?watchlist.*$/i, '')
      .replace(/^save\s+/i, '')
      .replace(/watchlist/i, '')
      .replace(/[?.,!]/g, '')
      .trim();
    let targetId = await findTitleIdFromQuery(cleanQ, titleContext);
    if (!targetId && titleContext) targetId = titleContext;

    if (targetId) {
      yield { type: 'tool_start', data: { name: 'add_to_library', args: { titleId: targetId, list: 'watchlist' } } };
      const res = await executeTool('add_to_library', { titleId: targetId, list: 'watchlist' }, toolCtx);
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
      yield { type: 'tool_start', data: { name: 'find_where_to_watch', args: { titleId: targetId, region } } };
      const res = await executeTool('find_where_to_watch', { titleId: targetId, region }, toolCtx);
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
  else if (/critic|critics|critical consensus|rotten tomatoes|imdb|metascore|what are (?:critics|audiences) saying|what did critics|reviews? for/i.test(lower)) {
    const targetId = await findTitleIdFromQuery(lastUserMsg, titleContext);
    if (targetId) {
      yield { type: 'tool_start', data: { name: 'get_critical_consensus', args: { titleId: targetId } } };
      const cRes = await executeTool('get_critical_consensus', { titleId: targetId }, toolCtx);
      executedCards.push(cRes);
      yield { type: 'tool_result', data: { name: cRes.name, cardType: cRes.cardType, data: cRes.data, summary: cRes.summary, asOf: cRes.asOf, source: cRes.source } };

      yield { type: 'tool_start', data: { name: 'get_community_pulse', args: { titleId: targetId } } };
      const pRes = await executeTool('get_community_pulse', { titleId: targetId }, toolCtx);
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
    const wantsMovies = /\b(?:movies?|films?|in theaters|theatrical|box office|cinemas?)\b/i.test(lower);
    const wantsTv = /\b(?:series|tv|shows?|episodes?)\b/i.test(lower) && !wantsMovies;
    const trendType = wantsMovies ? 'movie' : wantsTv ? 'tv' : 'all';
    yield { type: 'tool_start', data: { name: 'get_trending', args: { region, type: trendType } } };
    const res = await executeTool('get_trending', { region, type: trendType }, toolCtx);
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
      ? `Here are the top trending ${trendType === 'movie' ? 'movies' : trendType === 'tv' ? 'series' : 'titles'} on CinePulse right now:\n\n${highlights.join('\n')}\n\nSelect any title below to inspect its forecast breakdown or save it to your library.`
      : 'Here are the current trending titles in the catalog.';
  }
  // 10. Surprise Me / Hidden Gem check
  else if (/surprise me|hidden gem|random (?:movie|film)|something underrated/i.test(lower)) {
    yield { type: 'tool_start', data: { name: 'mood_search', args: { query: 'underrated standout slow-burn drama sci-fi' } } };
    const res = await executeTool('mood_search', { query: 'underrated standout slow-burn drama sci-fi' }, toolCtx);
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
    const res = await executeTool('mood_search', { query: lastUserMsg }, toolCtx);
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
      yield { type: 'tool_start', data: { name: 'get_trending', args: { region } } };
      const res = await executeTool('get_trending', { region }, toolCtx);
      executedCards.push(res);
      yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data, summary: res.summary, asOf: res.asOf, source: res.source } };
    } else {
      yield { type: 'tool_start', data: { name: 'recommend_for_me', args: {} } };
      const res = await executeTool('recommend_for_me', {}, toolCtx);
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
    } else if (/compare\s+(?:two|top|trending|popular|2)?\s*(?:movies?|films?|titles?|releases?)/i.test(lower)) {
      const trendingMovies = await catalog({ media: 'movie', collection: 'trending', page: 1 });
      const pool = (trendingMovies.items || []).filter(Boolean);
      if (pool.length >= 2) {
        if (titleA && pool[0].id !== titleA) {
          titleB = pool[0].id;
        } else {
          titleA = pool[0].id;
          titleB = pool[1].id;
        }
      }
    }

    if (titleA && titleB && titleA !== titleB) {
      yield { type: 'tool_start', data: { name: 'compare_titles', args: { idA: titleA, idB: titleB } } };
      const res = await executeTool('compare_titles', { idA: titleA, idB: titleB }, toolCtx);
      executedCards.push(res);
      yield { type: 'tool_result', data: { name: res.name, cardType: res.cardType, data: res.data, summary: res.summary, asOf: res.asOf, source: res.source } };
      const cd = res.data as any;
      const fmtCompare = (item: any) => {
        if (!item) return '';
        const meta = `${item.genres?.join(', ') || 'Film'}${item.director ? ` · Dir. ${item.director}` : ''}`;
        if (item.isReleased && item.actualRevenueMillions) {
          return `- **${item.title}** (${meta}): Reported Gross **$${item.actualRevenueMillions}M** · ${item.hitProbability}% model benchmark`;
        }
        if (item.abstained || (item.hitProbability === 0 && item.flopProbability === 0)) {
          return `- **${item.title}** (${meta}): Forecast withheld`;
        }
        return `- **${item.title}** (${meta}): ${item.hitProbability}% Hit prob.${item.p50Millions ? `, $${item.p50Millions}M est.` : ''}`;
      };
      replyText = `${cd.verdict}\n\n${fmtCompare(cd.titleA)}\n${fmtCompare(cd.titleB)}`;
    } else {
      replyText = "Tell me which two movies you'd like to compare — for example: 'Compare Dune: Part Two vs Oppenheimer'.";
    }
  }
  // 14. Hit / Flop forecast OR Title details / budget / hype / actual gross / active context inquiry
  else if (/hit|flop|box office|forecast|probability|will .* be a hit|how will|perform|tell me about|overview|synopsis|summary|plot|who directed|director|cast|runtime|budget|hype|momentum|gross|revenue|earnings/i.test(lower) || titleContext) {
    let targetId = titleContext;
    const queryMovie = lower
      .replace(/will|be a hit|be a flop|how will|do at the box office|what is the forecast for|what's the forecast for|what is the budget of|what's the budget of|forecast for|forecast|is it|going to|perform|in theaters|tell me about|overview of|synopsis of|summary of|who directed|runtime of|cast of|budget of|hype for|what about|explain/gi, '')
      .replace(/[?.,!]/g, '')
      .trim();

    if ((!targetId || (queryMovie.length > 2 && !/^(?:this|it|that|this movie|this film|that movie|that film|the film)$/i.test(queryMovie))) && queryMovie.length > 1) {
      const searchRes = await catalog({ media: 'all', search: queryMovie, page: 1, collection: 'trending' });
      if (searchRes.items?.[0]?.id) {
        targetId = searchRes.items[0].id;
      } else {
        const words = queryMovie
          .split(/\s+/)
          .filter((w) => w.length >= 3 && !/^(?:the|its|was|did|and|for|with)$/i.test(w));
        let foundByWord: string | undefined;
        for (const word of words) {
          const ws = await catalog({ media: 'all', search: word, page: 1, collection: 'trending' });
          if (ws.items?.[0]?.id) {
            foundByWord = ws.items[0].id;
            break;
          }
        }
        if (foundByWord) {
          targetId = foundByWord;
        } else if (!targetId) {
          targetId = undefined;
        }
      }
    }

    if (targetId) {
      yield { type: 'tool_start', data: { name: 'get_forecast', args: { titleId: targetId, region } } };
      const fRes = await executeTool('get_forecast', { titleId: targetId, region }, toolCtx);
      executedCards.push(fRes);
      yield { type: 'tool_result', data: { name: fRes.name, cardType: fRes.cardType, data: fRes.data, summary: fRes.summary, asOf: fRes.asOf, source: fRes.source } };

      yield { type: 'tool_start', data: { name: 'get_community_pulse', args: { titleId: targetId } } };
      const pRes = await executeTool('get_community_pulse', { titleId: targetId }, toolCtx);
      executedCards.push(pRes);
      yield { type: 'tool_result', data: { name: pRes.name, cardType: pRes.cardType, data: pRes.data, summary: pRes.summary, asOf: pRes.asOf, source: pRes.source } };

      yield { type: 'tool_start', data: { name: 'get_title_details', args: { titleId: targetId } } };
      const tRes = await executeTool('get_title_details', { titleId: targetId }, toolCtx);
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

      const budgetLine = tData?.budgetMillions ? `$${tData.budgetMillions}M` : null;
      const pulseNote = pData?.count > 0
        ? `${pData.hitShare ?? 0}% bullish across ${pData.count} calls (${pData.stage} sample${pData.sampleSizeWarning ? '; small-sample caution' : ''})`
        : '0 community calls recorded so far';
      const hypeLine = fData?.hypeMomentum?.score
        ? `- **Hype Momentum:** ${fData.hypeMomentum.level} (${fData.hypeMomentum.score}/100)`
        : '';

      if (fData?.abstained) {
        const reasons = Array.isArray(fData.abstainReasons) && fData.abstainReasons.length > 0
          ? fData.abstainReasons.join(', ')
          : 'incomplete pre-release metadata';

        replyText = [
          `**${titleName}**${metaParts.length > 0 ? ` (${metaParts.join(' · ')})` : ''} — **Forecast withheld** (${reasons}).`,
          tData?.overview ? `\n**Premise:** ${tData.overview}` : '',
          budgetLine ? `- **Reported Budget:** ${budgetLine}` : '',
          castNames ? `\n- **Cast:** ${castNames}` : '',
          `- **Audience / TMDB:** ${tData?.voteAverage ? `${tData.voteAverage}/10 across ${tData.voteCount} votes` : 'Pre-release / rating pending'}`,
          hypeLine,
          `- **Community Pulse:** ${pulseNote}`,
        ].filter(Boolean).join('\n');
      } else if (fData?.isReleased && fData?.actualRevenueMillions) {
        const roiBit = fData.roiMultiple ? ` (${fData.roiMultiple}x budget)` : '';
        const inrActual = fData.actualInrCrores ? ` · ${fData.actualInrCrores}` : '';
        const revRange = fData?.revenueMillionsRange
          ? `$${fData.revenueMillionsRange[0]}M–$${fData.revenueMillionsRange[1]}M (P50 ~$${fData.p50Millions}M)`
          : 'an unbracketed range';

        replyText = [
          `**${titleName}**${metaParts.length > 0 ? ` (${metaParts.join(' · ')})` : ''} has **${fData.hitProbability}% Hit Probability** in the model benchmark (${fData.confidence} confidence), with **Reported Worldwide Gross of $${fData.actualRevenueMillions}M**${roiBit}${inrActual}.`,
          tData?.overview ? `\n**Premise:** ${tData.overview}` : '',
          `\n- **Model P10–P90 Calibration Range:** ${revRange}${budgetLine ? ` on a ${budgetLine} budget` : ''}`,
          `- **Key Signal Drivers:** ${driversText}`,
          castNames ? `- **Key Cast:** ${castNames}` : '',
          `- **Community Pulse:** ${pulseNote}`,
        ].filter(Boolean).join('\n');
      } else {
        const revRange = fData?.revenueMillionsRange
          ? `$${fData.revenueMillionsRange[0]}M–$${fData.revenueMillionsRange[1]}M (P50 ~$${fData.p50Millions}M)`
          : 'an unbracketed range';
        const inrPred = fData?.p50InrCrores ? ` · ${fData.p50InrCrores}` : '';

        replyText = [
          `**${titleName}**${metaParts.length > 0 ? ` (${metaParts.join(' · ')})` : ''} projects at **${fData.hitProbability}% hit probability** (${fData.confidence} confidence), tracking ${revRange}${inrPred}.`,
          tData?.overview ? `\n**Premise:** ${tData.overview}` : '',
          budgetLine ? `\n- **Production Budget:** ${budgetLine}` : '',
          `\n- **Key Signal Drivers:** ${driversText}`,
          hypeLine,
          castNames ? `- **Key Cast:** ${castNames}` : '',
          `- **Community Pulse:** ${pulseNote}`,
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
      yield { type: 'tool_start', data: { name: 'get_forecast', args: { titleId: topTitle.id, region } } };
      const fRes = await executeTool('get_forecast', { titleId: topTitle.id, region }, toolCtx);
      executedCards.push(fRes);
      yield { type: 'tool_result', data: { name: fRes.name, cardType: fRes.cardType, data: fRes.data, summary: fRes.summary, asOf: fRes.asOf, source: fRes.source } };

      yield { type: 'tool_start', data: { name: 'get_title_details', args: { titleId: topTitle.id } } };
      const tRes = await executeTool('get_title_details', { titleId: topTitle.id }, toolCtx);
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
    data: {
      items: generateSuggestions(executedCards, replyText, {
        isAuthenticated: Boolean(context.user?.id),
      }),
    },
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

function generateSuggestions(
  cards: ToolResult[],
  _replyText: string,
  opts?: { isAuthenticated?: boolean }
): string[] {
  const hasModelAccuracy = cards.some((c) => c.cardType === 'model_accuracy');
  const hasForecast = cards.some((c) => c.cardType === 'forecast');
  const hasPulse = cards.some((c) => c.cardType === 'pulse');
  const hasTrending = cards.some((c) => c.name === 'get_trending');
  const hasCompare = cards.some((c) => c.cardType === 'compare');
  const hasAction = cards.some((c) => c.cardType === 'action');
  const hasStreaming = cards.some((c) => c.name === 'find_where_to_watch');
  const hasCritics = cards.some((c) => c.name === 'get_critical_consensus');
  const hasContrarian = cards.some((c) => c.name === 'get_contrarian_picks');

  const forecastCard = cards.find((c) => c.cardType === 'forecast' || c.name === 'get_title_details');
  const actionCard = cards.find((c) => c.cardType === 'action');
  const listCard = cards.find(
    (c) =>
      c.name === 'get_trending' ||
      c.name === 'mood_search' ||
      c.name === 'search_titles' ||
      c.name === 'recommend_for_me'
  );
  const compareCard = cards.find((c) => c.cardType === 'compare');
  const contrarianCard = cards.find((c) => c.name === 'get_contrarian_picks');

  const activeTitle =
    (forecastCard?.data as any)?.title ||
    (forecastCard?.data as any)?.titleName ||
    (actionCard?.data as any)?.titleName;

  if (hasAction) {
    return activeTitle
      ? [
          `What are critics saying about ${activeTitle}?`,
          'What movies are trending right now?',
          'Show model accuracy stats',
        ]
      : [
          'What movies are trending right now?',
          'Compare top trending movies',
          'Show model accuracy stats',
        ];
  }

  if (hasModelAccuracy) {
    return [
      opts?.isAuthenticated ? 'Show my prediction accuracy stats' : 'Compare top trending movies',
      'Which upcoming call shows the sharpest contrarian gap?',
      'What movies are trending right now?',
    ];
  }

  if (hasCompare && (compareCard?.data as any)?.titleA && (compareCard?.data as any)?.titleB) {
    const tA = (compareCard!.data as any).titleA.title;
    const tB = (compareCard!.data as any).titleB.title;
    return [
      `What are critics saying about ${tA}?`,
      `Where can I watch ${tB}?`,
      'Show model accuracy stats',
    ];
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

  if (hasContrarian && Array.isArray((contrarianCard?.data as any)?.items) && (contrarianCard!.data as any).items.length > 0) {
    const topC = (contrarianCard!.data as any).items[0].title;
    return [
      `What is the forecast for ${topC}?`,
      `What are critics saying about ${topC}?`,
      'Show model accuracy stats',
    ];
  }

  if (hasTrending || listCard) {
    const items = Array.isArray((listCard?.data as any)?.items) ? (listCard!.data as any).items : [];
    const movies = items.filter((i: any) => i.mediaType === 'movie');
    const pool = movies.length >= 2 ? movies : items;
    if (pool.length >= 2) {
      return [
        `Will ${pool[0].title} be a hit?`,
        `Compare ${pool[0].title} vs ${pool[1].title}`,
        'Which upcoming call shows the sharpest contrarian gap?',
      ];
    }
    if (pool.length === 1) {
      return [
        `Will ${pool[0].title} be a hit?`,
        `What are critics saying about ${pool[0].title}?`,
        'Show model accuracy stats',
      ];
    }
  }

  return [
    'What movies are trending right now?',
    'Which upcoming call shows the sharpest contrarian gap?',
    'Show model accuracy stats',
  ];
}
