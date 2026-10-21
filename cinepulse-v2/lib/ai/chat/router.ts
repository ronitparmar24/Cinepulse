import { sanitizeReviewText } from '../layer';
import { streamChatCompletion } from './providers';
import { createThread, getThread, addMessage, updateThreadTitle, getContextWindow } from './memory';
import { db, now } from '../../db';
import { logEvent } from '../../analytics';
import { putLibrary } from '../../library';
import { putForecast } from '../../pulse';
import { titleById } from '../../catalog';
import type { User } from '../../types';
import type { ChatRequest, PendingAction, SSEEvent } from './types';

// ─── Abuse & Rate Limit Guards ───────────────────────────────────────────────

const DEFAULT_ANON_DAILY_CAP = 10;
const DEFAULT_USER_DAILY_CAP = 40;
const MAX_REQ_PER_MINUTE = 6;
const MAX_INPUT_CHARS = 1000;

export function checkChatRateLimit(
  ip: string,
  user?: User | null
): { allowed: boolean; remaining: number; reason?: string } {
  const d = db();
  const nowMs = Date.now();
  const currentMinute = Math.floor(nowMs / 60000);
  const today = new Date().toISOString().slice(0, 10);

  d.exec(`
    CREATE TABLE IF NOT EXISTS chat_daily_usage (
      key TEXT PRIMARY KEY,
      day TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS chat_minute_limits (
      ip TEXT PRIMARY KEY,
      minute INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 1
    );
  `);

  // 1. Per-IP minute rate limit (6 req/min)
  const minuteRow = d.prepare('SELECT minute, count FROM chat_minute_limits WHERE ip = ?').get(ip) as any;
  if (minuteRow && minuteRow.minute === currentMinute) {
    if (minuteRow.count >= MAX_REQ_PER_MINUTE) {
      return { allowed: false, remaining: 0, reason: 'Minute rate limit reached. Please wait a moment.' };
    }
    d.prepare('UPDATE chat_minute_limits SET count = count + 1 WHERE ip = ?').run(ip);
  } else {
    d.prepare(`
      INSERT INTO chat_minute_limits (ip, minute, count)
      VALUES (?, ?, 1)
      ON CONFLICT(ip) DO UPDATE SET minute = excluded.minute, count = 1
    `).run(ip, currentMinute);
  }

  // 2. Daily caps: anon 10/day, signed-in 40/day
  const isAnon = !user?.id;
  const anonCap = parseInt(process.env.CHAT_DAILY_CAP_ANON || String(DEFAULT_ANON_DAILY_CAP), 10);
  const userCap = parseInt(process.env.CHAT_DAILY_CAP_USER || String(DEFAULT_USER_DAILY_CAP), 10);
  const dailyCap = isAnon ? anonCap : userCap;

  const usageKey = isAnon ? `anon:${ip}` : `user:${user!.id}`;
  const dailyRow = d.prepare('SELECT day, count FROM chat_daily_usage WHERE key = ?').get(usageKey) as any;

  if (dailyRow && dailyRow.day === today) {
    if (dailyRow.count >= dailyCap) {
      return {
        allowed: false,
        remaining: 0,
        reason: isAnon
          ? "You've reached your 10 daily guest questions. Create a free account for 40 daily questions, or explore Predictions and Discover directly!"
          : "You've reached your 40 daily questions limit. Come back tomorrow or check forecasts on the Predictions desk!",
      };
    }
    d.prepare('UPDATE chat_daily_usage SET count = count + 1 WHERE key = ?').run(usageKey);
    return { allowed: true, remaining: dailyCap - (dailyRow.count + 1) };
  } else {
    d.prepare(`
      INSERT INTO chat_daily_usage (key, day, count)
      VALUES (?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET day = excluded.day, count = 1
    `).run(usageKey, today);
    return { allowed: true, remaining: dailyCap - 1 };
  }
}

// ─── Input Sanitization & Prompt Injection Neutralization ─────────────────────

export function sanitizeUserInput(raw: string): string {
  if (!raw) return '';
  // 1. Cap length at 1000 characters
  let clean = raw.trim().slice(0, MAX_INPUT_CHARS);

  // 2. Strip non-printable and null bytes
  clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 3. Strip fake tool-call JSON / fake delimiter breakout patterns
  clean = clean
    .replace(/<tool_output>[\s\S]*?<\/tool_output>/gi, '')
    .replace(/<\/?user_message>/gi, '')
    .replace(/<\/?system>/gi, '')
    .replace(/<\/?rules>/gi, '');

  // 4. Neutralize common prompt-override directives inside user text
  clean = clean.replace(/ignore (?:all )?(?:previous|prior) instructions/gi, '[ignored override attempt]');

  return clean;
}

// ─── Main Chat Request Handler ────────────────────────────────────────────────

export async function handleChatRequest(
  requestData: ChatRequest,
  user: User | null,
  ip: string,
  signal?: AbortSignal
): Promise<Response> {
  const startTime = Date.now();
  const sanitizedMsg = sanitizeUserInput(requestData.message || '');

  if (!sanitizedMsg) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ message: 'Message content cannot be empty' })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } }
    );
  }

  // Check rate limits
  const rateLimit = checkChatRateLimit(ip, user);
  if (!rateLimit.allowed) {
    const errorSse = [
      `event: error\ndata: ${JSON.stringify({ message: rateLimit.reason, code: 'rate_limit_exceeded' })}\n\n`,
      `event: suggestions\ndata: ${JSON.stringify({ items: ['View Predictions', 'Browse Discover', 'Check Receipts'] })}\n\n`,
      `event: done\ndata: ${JSON.stringify({ provider: 'rate-limit' })}\n\n`,
    ].join('');
    return new Response(errorSse, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  // Manage Thread
  let threadId = requestData.threadId;
  let isNewThread = false;

  if (user?.id) {
    if (threadId) {
      const existing = getThread(threadId, user.id);
      if (!existing) {
        const created = createThread(user.id, sanitizedMsg.slice(0, 40) + '…');
        threadId = created.id;
        isNewThread = true;
      }
    } else {
      const created = createThread(user.id, sanitizedMsg.slice(0, 40) + '…');
      threadId = created.id;
      isNewThread = true;
    }
  }

  // Build Context History
  let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (user?.id && threadId) {
    // Save user message to persistent SQLite thread
    addMessage(threadId, 'user', sanitizedMsg);
    const context = getContextWindow(threadId, user.id);
    conversationHistory = context.messages;
    if (context.summary) {
      conversationHistory.unshift({ role: 'assistant', content: context.summary });
    }
  } else {
    // Anonymous session-only history passed from client
    if (Array.isArray(requestData.history)) {
      conversationHistory = requestData.history
        .filter((h) => h.role === 'user' || h.role === 'assistant')
        .slice(-10);
    }
    conversationHistory.push({ role: 'user', content: sanitizedMsg });
  }

  // Create SSE Transform Stream
  const encoder = new TextEncoder();
  let finalProvider = 'unknown';
  let accumulatedText = '';
  const executedCards: any[] = [];
  let toolCallCount = 0;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const generator = streamChatCompletion(conversationHistory, {
          user,
          ip,
          titleContext: requestData.titleContext,
          signal,
        });

        for await (const sseEvent of generator) {
          if (signal?.aborted) break;

          // Track telemetry stats
          if (sseEvent.type === 'token') {
            accumulatedText += (sseEvent.data as any)?.text || '';
          } else if (sseEvent.type === 'tool_result') {
            toolCallCount++;
            executedCards.push(sseEvent.data);
          } else if (sseEvent.type === 'done') {
            finalProvider = (sseEvent.data as any)?.provider || 'unknown';
            if (threadId) {
              (sseEvent.data as any).threadId = threadId;
            }
          }

          const chunk = `event: ${sseEvent.type}\ndata: ${JSON.stringify(sseEvent.data)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        }

        // Persist assistant message for authenticated user
        if (user?.id && threadId && accumulatedText.trim()) {
          addMessage(threadId, 'assistant', accumulatedText.trim(), { cards: executedCards });
        }

        // Non-blocking telemetry
        logEvent(
          'chat_query' as any,
          {
            provider: finalProvider,
            toolCallCount,
            latencyMs: Date.now() - startTime,
            isNewThread,
            hasTitleContext: Boolean(requestData.titleContext),
          },
          user?.id || null
        );

        controller.close();
      } catch (err: any) {
        const errorMsg = `event: error\ndata: ${JSON.stringify({ message: err?.message || 'Chat stream interrupted' })}\n\n`;
        controller.enqueue(encoder.encode(errorMsg));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ─── Pending Action Confirmation Execution ────────────────────────────────────

export async function executeConfirmedAction(
  action: PendingAction,
  user: User
): Promise<{ success: boolean; message: string }> {
  if (!user?.id) {
    throw new Error('Authentication required to execute actions');
  }

  const { toolName, args } = action;

  if (toolName === 'add_to_library') {
    const titleId = String(args.titleId || '');
    const list = (String(args.list || 'watchlist')) as 'watchlist' | 'watching' | 'watched';
    if (!titleId) throw new Error('titleId is required');

    const title = await titleById(titleId);
    await putLibrary(user, titleId, { status: list });
    logEvent('watchlist_added', { titleId, list }, user.id);

    return {
      success: true,
      message: `Added "${title.title}" to your ${list}!`,
    };
  }

  if (toolName === 'make_opening_call') {
    const titleId = String(args.titleId || '');
    const choice = (String(args.choice || 'hit').toLowerCase()) as 'hit' | 'flop';
    if (!titleId) throw new Error('titleId is required');

    const title = await titleById(titleId);
    await putForecast(user, titleId, {
      choice,
      confidence: 70,
      reason: 'Forecast submitted via CinePulse Chat',
    });
    logEvent('prediction_submitted', { titleId, choice }, user.id);

    return {
      success: true,
      message: `Your ${choice.toUpperCase()} call for "${title.title}" has been registered!`,
    };
  }

  throw new Error(`Unsupported action type: ${toolName}`);
}
