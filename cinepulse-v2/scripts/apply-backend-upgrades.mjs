import fs from 'fs';
import path from 'path';

const root = process.cwd();

// ============================================================================
// 1. UPDATE lib/ai/chat/tools.ts
// ============================================================================
{
  const filePath = path.join(root, 'lib/ai/chat/tools.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // Add executeGetModelAccuracy function if not present
  if (!content.includes('executeGetModelAccuracy')) {
    const modelAccFunction = `
export async function executeGetModelAccuracy(): Promise<ToolResult> {
  try {
    const { getAccuracyMetrics } = await import('../../accuracy/backtest');
    const metrics = getAccuracyMetrics();
    const summary = metrics?.summary;
    const brier = summary?.brierScore ?? null;
    const hitRate = summary?.rolling90dAccuracy ?? null;
    const total = summary?.totalEvaluatedTitles ?? 0;
    const mape = summary?.overallMape ?? null;

    const data = truncateJson({
      overallBrierScore: brier,
      baselineBrierScore: 0.245,
      hitAccuracyRate: hitRate,
      totalResolved: total,
      overallMape: mape,
      modelVersion: 'v3-calibrated',
      asOf: new Date().toISOString(),
    });

    return {
      name: 'get_model_accuracy',
      cardType: 'model_accuracy',
      data,
      asOf: new Date().toISOString(),
      source: 'accuracy_backtest',
      summary: brier !== null
        ? \`Model Brier score: \${Number(brier).toFixed(3)} vs baseline 0.245. 90-day accuracy: \${hitRate ?? 'N/A'}% across \${total} evaluated releases.\`
        : 'Accuracy metrics not yet available.',
    };
  } catch (err: any) {
    return {
      name: 'get_model_accuracy',
      cardType: 'model_accuracy',
      data: { error: err?.message || 'Accuracy metrics unavailable' },
      asOf: new Date().toISOString(),
      source: 'accuracy_backtest',
      summary: 'Accuracy metrics not yet available.',
    };
  }
}
`;

    // Insert before executeTool dispatcher
    content = content.replace(
      '// ─── Dispatcher ──────────────────────────────────────────────────────────────',
      `${modelAccFunction}\n// ─── Dispatcher ──────────────────────────────────────────────────────────────`
    );

    // Add case in executeTool switch
    content = content.replace(
      "case 'get_contrarian_picks':\n        return await executeGetContrarianPicks();",
      "case 'get_contrarian_picks':\n        return await executeGetContrarianPicks();\n      case 'get_model_accuracy':\n        return await executeGetModelAccuracy();"
    );

    // Add tool definition in TOOL_DEFINITIONS
    const newToolDef = `  {
    name: 'get_model_accuracy',
    description: "Get the CinePulse algorithmic model's own accuracy track record: overall Brier score, baseline comparison, 90-day hit accuracy rate, and total resolved predictions from the accuracy ledger.",
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
];`;
    content = content.replace(/\s*\];\s*export const TOOL_SCHEMAS/, `,\n${newToolDef}\n\nexport const TOOL_SCHEMAS`);
  }

  // Add asOf and source to tool returns if missing
  // executeSearchTitles
  content = content.replace(
    /name: 'search_titles',\s*cardType: 'list',\s*data,/,
    "name: 'search_titles',\n    cardType: 'list',\n    data,\n    asOf: new Date().toISOString(),\n    source: 'tmdb_catalog',"
  );

  // executeGetTitleDetails
  content = content.replace(
    /name: 'get_title_details',\s*cardType: 'title',\s*data,/,
    "name: 'get_title_details',\n    cardType: 'title',\n    data,\n    asOf: new Date().toISOString(),\n    source: 'tmdb_catalog',"
  );

  // executeGetForecast
  content = content.replace(
    /name: 'get_forecast',\s*cardType: 'forecast',\s*data,/,
    "name: 'get_forecast',\n    cardType: 'forecast',\n    data,\n    asOf: new Date().toISOString(),\n    source: 'predictions_log',"
  );

  // executeGetCommunityPulse
  content = content.replace(
    /name: 'get_community_pulse',\s*cardType: 'pulse',\s*data,/,
    "name: 'get_community_pulse',\n    cardType: 'pulse',\n    data,\n    asOf: new Date().toISOString(),\n    source: 'community_pulse',"
  );

  // executeGetTrending
  content = content.replace(
    /name: 'get_trending',\s*cardType: 'list',\s*data,/,
    "name: 'get_trending',\n    cardType: 'list',\n    data,\n    asOf: new Date().toISOString(),\n    source: 'tmdb_catalog',"
  );

  // executeRecommendForMe
  content = content.replace(
    /name: 'recommend_for_me',\s*cardType: 'list',\s*data,/,
    "name: 'recommend_for_me',\n    cardType: 'list',\n    data,\n    asOf: new Date().toISOString(),\n    source: 'taste_dna_cache',"
  );

  // executeMoodSearch
  content = content.replace(
    /name: 'mood_search',\s*cardType: 'list',\s*data,/,
    "name: 'mood_search',\n    cardType: 'list',\n    data,\n    asOf: new Date().toISOString(),\n    source: 'tmdb_catalog',"
  );

  // executeCompareTitles
  content = content.replace(
    /name: 'compare_titles',\s*cardType: 'compare',\s*data,/,
    "name: 'compare_titles',\n    cardType: 'compare',\n    data,\n    asOf: new Date().toISOString(),\n    source: 'predictions_log',"
  );

  // executeGetMyAccuracy
  content = content.replace(
    /name: 'get_my_accuracy',\s*cardType: 'accuracy',\s*data: stats,/,
    "name: 'get_my_accuracy',\n      cardType: 'accuracy',\n      data: stats,\n      asOf: new Date().toISOString(),\n      source: 'brier_scores',"
  );

  // executeGetContrarianPicks
  content = content.replace(
    /name: 'get_contrarian_picks',\s*cardType: 'contrarian',\s*data,/,
    "name: 'get_contrarian_picks',\n    cardType: 'contrarian',\n    data,\n    asOf: new Date().toISOString(),\n    source: 'contrarian_ledger',"
  );

  // executeFindWhereToWatch
  content = content.replace(
    /name: 'find_where_to_watch',\s*cardType: 'details',\s*data,/,
    "name: 'find_where_to_watch',\n    cardType: 'details',\n    data,\n    asOf: new Date().toISOString(),\n    source: 'tmdb_providers',"
  );

  // executeGetCriticalConsensus
  content = content.replace(
    /name: 'get_critical_consensus',\s*cardType: 'details',\s*data,/,
    "name: 'get_critical_consensus',\n    cardType: 'details',\n    data,\n    asOf: new Date().toISOString(),\n    source: 'omdb_cache_7d',"
  );

  // executeFindNearbyCinemas
  content = content.replace(
    /name: 'find_nearby_cinemas',\s*cardType: 'list',\s*data,/,
    "name: 'find_nearby_cinemas',\n    cardType: 'list',\n    data,\n    asOf: new Date().toISOString(),\n    source: 'openstreetmap_cache',"
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✓ Updated tools.ts');
}

// ============================================================================
// 2. UPDATE lib/ai/chat/providers.ts
// ============================================================================
{
  const filePath = path.join(root, 'lib/ai/chat/providers.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace streamGemini with real SSE streaming using streamGenerateContent
  const oldGeminiRegex = /async function\* streamGemini\([\s\S]*?return true;\s*\}/;
  const newGemini = `async function* streamGemini(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: ProviderContext
): AsyncGenerator<SSEEvent, boolean, unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return false;

  const model = process.env.CHAT_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = \`https://generativelanguage.googleapis.com/v1beta/models/\${model}:streamGenerateContent?alt=sse&key=\${apiKey}\`;

  const contents: any[] = [];
  for (const m of messages) {
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.role === 'user' ? \`<user_message>\\n\${m.content}\\n</user_message>\` : m.content }],
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

  let toolCallCount = 0;
  const MAX_TOOL_CALLS = 4;
  let accumulatedText = '';
  const executedCards: ToolResult[] = [];

  while (toolCallCount <= MAX_TOOL_CALLS) {
    if (context.signal?.aborted) return true;

    const payload: any = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      tools: geminiTools,
      generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: context.signal,
      });
    } catch {
      return false;
    }

    if (!res.ok) return false;

    const reader = res.body?.getReader();
    if (!reader) return false;

    const decoder = new TextDecoder();
    let buffer = '';
    let hadToolCall = false;
    const pendingFunctionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

    while (true) {
      if (context.signal?.aborted) { reader.cancel(); return true; }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\\n');
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
            pendingFunctionCalls.push({
              name: part.functionCall.name,
              args: part.functionCall.args || {},
            });
          } else if (part.text) {
            accumulatedText += part.text;
            yield { type: 'token', data: { text: part.text } };
          }
        }
      }
    }

    if (!hadToolCall || pendingFunctionCalls.length === 0) break;

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

      contents.push({
        role: 'model',
        parts: [{ functionCall: { name: fn.name, args: fn.args } }],
      });
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: fn.name,
            response: { output: result.data },
          },
        }],
      });
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
  yield { type: 'done', data: { provider: 'gemini', model } };
  return true;
}`;

  content = content.replace(oldGeminiRegex, newGemini);

  // Replace streamGroq with real streaming using stream: true
  const oldGroqRegex = /async function\* streamGroq\([\s\S]*?return true;\s*\}/;
  const newGroq = `async function* streamGroq(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: ProviderContext
): AsyncGenerator<SSEEvent, boolean, unknown> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return false;

  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
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
      content: m.role === 'user' ? \`<user_message>\\n\${m.content}\\n</user_message>\` : m.content,
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
      stream: true,
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: \`Bearer \${apiKey}\`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: context.signal,
      });
    } catch {
      return false;
    }

    if (!res.ok) return false;

    const reader = res.body?.getReader();
    if (!reader) return false;

    const decoder = new TextDecoder();
    let buffer = '';
    let hadToolCall = false;
    const pendingCalls: Record<number, { id: string; name: string; argsStr: string }> = {};
    let streamedText = '';

    while (true) {
      if (context.signal?.aborted) { reader.cancel(); return true; }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\\n');
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
          streamedText += delta.content;
          accumulatedText += delta.content;
          yield { type: 'token', data: { text: delta.content } };
        }

        if (delta.tool_calls) {
          hadToolCall = true;
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!pendingCalls[idx]) {
              pendingCalls[idx] = { id: tc.id || \`call_\${idx}\`, name: tc.function?.name || '', argsStr: '' };
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
  yield { type: 'done', data: { provider: 'groq', model } };
  return true;
}`;

  content = content.replace(oldGroqRegex, newGroq);

  // Fix honesty rule violation in streamRuleBased (no default 50% hit probability invention)
  content = content.replace(
    /const titleName = fData\?\.title \|\| 'This film';\s*const hitPct = fData\?\.hitProbability \?\? 50;\s*const callCount = pData\?\.count \?\? 0;\s*const revRange = fData\?\.revenueRange \? `\$\$\{Math\.round\(fData\.revenueRange\[0\] \/ 1e6\)\}M–\$\$\{Math\.round\(fData\.revenueRange\[1\] \/ 1e6\)\}M` : 'an unbracketed range';\s*replyText = `Based on our predictive model, \*\*.*?\*\*;/,
    `const titleName = fData?.title || 'This film';
      const hitPct = fData?.hitProbability;
      const callCount = pData?.count ?? 0;

      if (hitPct === null || hitPct === undefined) {
        replyText = \`**\${titleName}** is in our catalog, but there is not enough historical box-office data for a grounded forecast yet. Check back closer to its release!\`;
      } else {
        const revRange = fData?.revenueRange ? \`$\${Math.round(fData.revenueRange[0] / 1e6)}M–$\${Math.round(fData.revenueRange[1] / 1e6)}M\` : null;
        const revStr = revRange ? \`, tracking an estimated \${revRange} theatrical gross\` : '';
        const hitShare = pData?.hitShare;
        const communityStr = callCount > 0 && hitShare !== null && hitShare !== undefined
          ? \` Community sentiment: \${hitShare}% bullish across \${callCount} calls.\`
          : ' No community calls yet.';
        replyText = \`Based on our predictive model, **\${titleName}** is projected at **\${hitPct}% hit probability**\${revStr}.\${communityStr}\`;
      }`
  );

  // Emit immediate status event (< 300ms feedback) in streamChatCompletion
  if (!content.includes("{ step: 'routing' }")) {
    content = content.replace(
      'export async function* streamChatCompletion(',
      `export async function* streamChatCompletion(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: ProviderContext
): AsyncGenerator<SSEEvent, void, unknown> {
  // Immediate status event for < 300ms feedback
  yield { type: 'status', data: { step: 'routing' } };
`
    );
    // Remove the old signature lines that follow
    content = content.replace(
      /yield \{ type: 'status', data: \{ step: 'routing' \} \};\s*messages: Array<[\s\S]*?\): AsyncGenerator<SSEEvent, void, unknown> \{/,
      "yield { type: 'status', data: { step: 'routing' } };"
    );
  }

  // Update generateSuggestions to handle model_accuracy
  if (!content.includes('hasModelAccuracy')) {
    content = content.replace(
      'const hasForecast = cards.some((c) => c.cardType === \'forecast\');',
      `const hasModelAccuracy = cards.some((c) => c.cardType === 'model_accuracy');
  const hasForecast = cards.some((c) => c.cardType === 'forecast');`
    );
    content = content.replace(
      'if (hasForecast || hasPulse) {',
      `if (hasModelAccuracy) {
    return ['Check my own accuracy', 'Which calls are contrarian?', "What's trending now?"];
  }
  if (hasForecast || hasPulse) {`
    );
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✓ Updated providers.ts');
}

// ============================================================================
// 3. UPDATE lib/ai/chat/router.ts
// ============================================================================
{
  const filePath = path.join(root, 'lib/ai/chat/router.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // Add classifyIntent and generateThreadTitle if not present
  if (!content.includes('classifyIntent')) {
    const intentHelpers = `
// ─── Intent Router (Groq, cheap & fast) ──────────────────────────────────────
async function classifyIntent(message: string): Promise<'smalltalk' | 'offtopic' | 'needs_tools'> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return 'needs_tools';

  const prompt = \`Classify this message in one word. Reply ONLY with one of: smalltalk, offtopic, needs_tools.
- smalltalk: greetings, thanks, casual chat ("hi", "thanks", "how are you")
- offtopic: unrelated to cinema/movies/TV/box-office ("stock tips", "write code", "recipe")
- needs_tools: any cinema question needing data (forecasts, film info, streaming, reviews, predictions)
Message: "\${message.slice(0, 200)}"
Reply with exactly one word:\`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: \`Bearer \${apiKey}\`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 5,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return 'needs_tools';
    const data = await res.json();
    const word = (data?.choices?.[0]?.message?.content || '').trim().toLowerCase();
    if (word === 'smalltalk') return 'smalltalk';
    if (word === 'offtopic') return 'offtopic';
    return 'needs_tools';
  } catch {
    return 'needs_tools';
  }
}

// ─── Groq Thread Title Generator ─────────────────────────────────────────────
async function generateThreadTitle(firstUserMessage: string): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: \`Bearer \${apiKey}\`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'user',
            content: \`Write a concise 3-6 word title for a cinema chat that started with: "\${firstUserMessage.slice(0, 150)}". Reply with only the title, no quotes.\`,
          },
        ],
        max_tokens: 20,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const title = (data?.choices?.[0]?.message?.content || '').trim().slice(0, 80);
    return title || null;
  } catch {
    return null;
  }
}
`;

    content = content.replace(
      '// ─── Main Chat Request Handler ────────────────────────────────────────────────',
      `${intentHelpers}\n// ─── Main Chat Request Handler ────────────────────────────────────────────────`
    );

    // Add intent check inside handleChatRequest
    content = content.replace(
      '// Manage Thread\n  let threadId = requestData.threadId;',
      `// Intent classification — route small-talk cheaply without hitting Gemini
  let intent: 'smalltalk' | 'offtopic' | 'needs_tools' = 'needs_tools';
  try {
    intent = await classifyIntent(sanitizedMsg);
  } catch {}

  // Manage Thread
  let threadId = requestData.threadId;`
    );

    // Fast return inside ReadableStream start() for smalltalk / offtopic
    content = content.replace(
      'const stream = new ReadableStream({\n    async start(controller) {\n      try {',
      `const stream = new ReadableStream({
    async start(controller) {
      try {
        if (intent === 'smalltalk') {
          const replies: Record<string, string> = {
            hi: "Hey! Ready to dive into some box-office intelligence? Ask me about any film, forecast, or what's trending.",
            hello: "Hey there! What film are we exploring today?",
            thanks: "Happy to help! Anything else you want to check — forecasts, streaming, or contrarian picks?",
            thankyou: "Anytime! Let me know if you want to dig into more cinema data.",
          };
          const lower = sanitizedMsg.toLowerCase().replace(/[^a-z]/g, '');
          const reply = replies[lower] || "Always here for cinema chat! Ask me about forecasts, what's trending, or which calls are most contrarian.";
          controller.enqueue(encoder.encode(\`event: status\\ndata: \${JSON.stringify({ step: 'answering' })}\\n\\n\`));
          controller.enqueue(encoder.encode(\`event: token\\ndata: \${JSON.stringify({ text: reply })}\\n\\n\`));
          controller.enqueue(encoder.encode(\`event: suggestions\\ndata: \${JSON.stringify({ items: ["What's trending?", "Which call is most contrarian?", "Compare two films"] })}\\n\\n\`));
          controller.enqueue(encoder.encode(\`event: done\\ndata: \${JSON.stringify({ provider: 'router', intent: 'smalltalk' })}\\n\\n\`));
          controller.close();
          return;
        }

        if (intent === 'offtopic') {
          const reply = "I'm CinePulse — strictly cinema and box-office! I can look up forecasts, streaming options, community predictions, or recommend films based on your mood. What shall we watch?";
          controller.enqueue(encoder.encode(\`event: status\\ndata: \${JSON.stringify({ step: 'answering' })}\\n\\n\`));
          controller.enqueue(encoder.encode(\`event: token\\ndata: \${JSON.stringify({ text: reply })}\\n\\n\`));
          controller.enqueue(encoder.encode(\`event: suggestions\\ndata: \${JSON.stringify({ items: ["What's trending?", "Forecast for a film", "Feel-good films under 2 hours"] })}\\n\\n\`));
          controller.enqueue(encoder.encode(\`event: done\\ndata: \${JSON.stringify({ provider: 'router', intent: 'offtopic' })}\\n\\n\`));
          controller.close();
          return;
        }`
    );

    // Add thread title generator call
    content = content.replace(
      'logEvent(',
      `if (isNewThread && threadId && user?.id) {
          generateThreadTitle(sanitizedMsg).then((t) => {
            if (t) { try { updateThreadTitle(threadId!, t); } catch {} }
          }).catch(() => {});
        }

        logEvent(`
    );
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✓ Updated router.ts');
}
