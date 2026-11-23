/**
 * /api/ai
 * Moved verbatim from the former catch-all route; returns null when no branch matches.
 */

import { deleteThread, getThreadMessages, listThreads, updateMessageFeedback } from '../../ai/chat/memory';
import { executeConfirmedAction, handleChatRequest } from '../../ai/chat/router';
import { getCriticalConsensus, getWhyThisMovieForMe, parseMoodSearch } from '../../ai/layer';
import { currentUser, requireUser } from '../../auth';
import { getClientIp } from '../../auth/rateLimit';
import { titleById } from '../../catalog';
import { bad } from '../../errors';
import { getGeminiReviewSummary } from '../../fetchers/gemini';
import { titleReviews } from '../../reviews';
import { computeTasteDna } from '../../tasteDna';
import { enforceLlmLimit } from '../../auth/writeLimit';
import type { ApiContext } from '../http';
import { body, json, param } from '../http';

export async function handleAi({ request, parts, method, query }: ApiContext): Promise<Response | null> {
  if (parts[0] === 'ai' && parts[1] === 'summary' && parts.length === 3 && method === 'POST') {
    await enforceLlmLimit(request);
    const id = param(parts, 2, 'id');
    const title = await titleById(id);
    const reviews = await titleReviews(id);
    const summary = await getGeminiReviewSummary(
      title.title,
      title.overview,
      reviews.map((r) => r.body),
    );
    return json(summary);
  }

  // Track P: Critical Consensus
  if (parts[0] === 'ai' && parts[1] === 'consensus' && parts.length === 3 && method === 'GET') {
    const id = param(parts, 2, 'id');
    const title = await titleById(id);
    const reviews = await titleReviews(id);
    const ip = getClientIp(request);
    const consensus = await getCriticalConsensus(title.title, reviews, ip);
    return json(consensus);
  }

  // Track P: "Why this movie for me"
  if (parts[0] === 'ai' && parts[1] === 'why' && parts.length === 3 && method === 'GET') {
    const id = param(parts, 2, 'id');
    const viewer = await currentUser(request);
    const title = await titleById(id);
    const dna = viewer?.username ? await computeTasteDna(viewer.username) : null;
    const ip = getClientIp(request);
    const result = await getWhyThisMovieForMe(dna, title, viewer?.id || ip);
    return json(result);
  }

  // Track P: Mood Search
  if (parts[0] === 'ai' && parts[1] === 'mood-search' && method === 'POST') {
    await enforceLlmLimit(request);
    const b = (await body(request)) as any;
    const ip = getClientIp(request);
    const filters = await parseMoodSearch(b.query || '', ip);
    return json(filters);
  }

  // ─── Track V9: Ask CinePulse Chatbot Endpoints ──────────────────────────────
  if (parts[0] === 'ai' && parts[1] === 'chat') {
    // 1. Streaming chat response
    if (parts.length === 2 && method === 'POST') {
      const viewer = await currentUser(request);
      const ip = getClientIp(request);
      const reqBody = (await body(request)) as any;
      return await handleChatRequest(reqBody, viewer, ip, request.signal);
    }

    // 2. Action confirmation
    if (parts.length === 3 && parts[2] === 'confirm-action' && method === 'POST') {
      const user = await requireUser(request);
      const reqBody = (await body(request)) as any;
      if (!reqBody.action) throw bad('Action payload is required');
      const result = await executeConfirmedAction(reqBody.action, user);
      return json(result);
    }

    // 3. Message feedback
    if (parts.length === 3 && parts[2] === 'feedback' && method === 'POST') {
      const user = await requireUser(request);
      const reqBody = (await body(request)) as any;
      const { messageId, feedback } = reqBody;
      if (!messageId || !feedback) throw bad('messageId and feedback are required');
      const ok = await updateMessageFeedback(String(messageId), user.id, feedback);
      return json({ ok });
    }

    // 4. Chat threads list
    if (parts.length === 3 && parts[2] === 'threads' && method === 'GET') {
      const user = await requireUser(request);
      const threads = await listThreads(user.id);
      return json({ threads });
    }

    // 5. Get thread messages
    if (parts.length === 4 && parts[2] === 'threads' && method === 'GET') {
      const user = await requireUser(request);
      const threadId = param(parts, 3, 'threadId');
      const messages = await getThreadMessages(threadId, user.id);
      return json({ messages });
    }

    // 6. Delete thread
    if (parts.length === 4 && parts[2] === 'threads' && method === 'DELETE') {
      const user = await requireUser(request);
      const threadId = param(parts, 3, 'threadId');
      const ok = await deleteThread(threadId, user.id);
      return json({ ok });
    }
  }

  // ─── Track W: Ask the Crew & AI Conversations ──────────────────────────────
  if (parts[0] === 'ai' && parts[1] === 'ask-the-crew' && parts.length === 2 && method === 'GET') {
    const { getAskTheCrewTakes } = await import('../../ai/askTheCrew');
    const url = new URL(request.url);
    const titleId = url.searchParams.get('titleId');
    if (!titleId) throw bad('titleId query parameter is required');
    const question = url.searchParams.get('question') || 'hit_or_flop';
    const data = await getAskTheCrewTakes(titleId, question, null);
    return json(data);
  }

  if (parts[0] === 'ai' && parts[1] === 'reply' && parts.length === 2 && method === 'POST') {
    const { checkHumanIdentityQuestion, canReplyToHuman } = await import('../../ai/askTheCrew');
    const user = await requireUser(request);
    const b = (await body(request)) as any;
    const personaId = b.personaId;
    const text = b.text || '';
    if (!personaId || !text) throw bad('personaId and text are required');

    const honestyAnswer = checkHumanIdentityQuestion(text);
    if (honestyAnswer) {
      return json({ reply: honestyAnswer, isAi: true, personaId });
    }

    const rateCheck = await canReplyToHuman(user.id, personaId);
    if (!rateCheck.allowed) {
      return json({ error: rateCheck.reason || 'Rate limit exceeded' }, 429);
    }

    return json({ reply: "I'm focusing my takes on release dynamics and directing choices for this film.", isAi: true, personaId });
  }
  return null;
}
