import { db, now } from '../db';

export type MemoryKind = 'opinion' | 'relationship' | 'milestone' | 'grudge' | 'running_joke';

export interface PersonaMemory {
  id: number;
  personaId: string;
  kind: MemoryKind;
  subject: string;
  content: string;
  weight: number;
  score?: number;
  createdAt: string;
}

export interface RecallContext {
  titleId?: string;
  director?: string;
  genres?: string[];
  actor?: string;
  subject?: string;
  targetPersonaId?: string;
}

/**
 * Stores a persona memory in the durable SQLite store.
 */
export async function storeMemory(
  personaId: string,
  kind: MemoryKind,
  subject: string,
  content: string,
  weight = 1.0,
  createdAt?: string
): Promise<number> {
  const d = db();
  const created = createdAt || now();
  const cleanSubject = subject.toLowerCase().trim();

  const info = d.prepare(`
    INSERT INTO ai_persona_memory (persona_id, kind, subject, content, weight, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(personaId, kind, cleanSubject, content.trim(), weight, created);

  return Number(info.lastInsertRowid);
}

/**
 * Retrieves the most relevant memories for a persona, weighted with recency decay.
 * Formula: weight * relevance * exp(-0.04 * daysAgo)
 */
export async function recall(
  personaId: string,
  context: RecallContext,
  limit = 6
): Promise<PersonaMemory[]> {
  const d = db();
  const rows = d.prepare(`
    SELECT id, persona_id, kind, subject, content, weight, created_at
    FROM ai_persona_memory
    WHERE persona_id = ?
    ORDER BY created_at DESC
    LIMIT 60
  `).all(personaId) as any[];

  if (!rows || rows.length === 0) return [];

  const nowMs = Date.now();
  const searchTerms: string[] = [];
  if (context.director) searchTerms.push(context.director.toLowerCase().trim());
  if (context.subject) searchTerms.push(context.subject.toLowerCase().trim());
  if (context.actor) searchTerms.push(context.actor.toLowerCase().trim());
  if (context.targetPersonaId) searchTerms.push(context.targetPersonaId.toLowerCase().trim());
  if (context.genres) {
    for (const g of context.genres) searchTerms.push(g.toLowerCase().trim());
  }

  const scored: PersonaMemory[] = [];

  for (const r of rows) {
    const memoryDate = new Date(r.created_at).getTime();
    const daysAgo = Math.max(0, (nowMs - memoryDate) / (86400 * 1000));
    // Half-life ~18 days (decay ~0.038)
    const recencyDecay = Math.exp(-0.038 * daysAgo);

    let relevance = 0.2; // Baseline background memory
    const sub = String(r.subject || '').toLowerCase();
    const text = String(r.content || '').toLowerCase();

    for (const term of searchTerms) {
      if (!term) continue;
      if (sub === term || sub.includes(term)) {
        relevance = Math.max(relevance, 1.0);
      } else if (text.includes(term)) {
        relevance = Math.max(relevance, 0.6);
      }
    }

    const baseWeight = Number(r.weight || 1.0);
    const score = Number((baseWeight * relevance * recencyDecay).toFixed(4));

    scored.push({
      id: Number(r.id),
      personaId: r.persona_id,
      kind: r.kind as MemoryKind,
      subject: r.subject,
      content: r.content,
      weight: baseWeight,
      score,
      createdAt: r.created_at,
    });
  }

  // Sort descending by calculated relevance score
  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scored.slice(0, limit);
}

/**
 * Consistency Guard:
 * Checks whether a proposed opinion contradicts a recently expressed opinion
 * on the exact same subject (within 30 days).
 */
export function checkConsistency(
  personaId: string,
  subject: string,
  newPolarity: 'positive' | 'negative'
): { allowed: boolean; reason?: string; rewrittenHint?: string } {
  const d = db();
  const cleanSubject = subject.toLowerCase().trim();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString();

  const recent = d.prepare(`
    SELECT id, kind, subject, content, created_at
    FROM ai_persona_memory
    WHERE persona_id = ? AND kind = 'opinion' AND subject = ? AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(personaId, cleanSubject, thirtyDaysAgo) as any;

  if (!recent) {
    return { allowed: true };
  }

  const prevContent = String(recent.content).toLowerCase();
  const isPreviouslyPositive = prevContent.includes('love') || prevContent.includes('great') || prevContent.includes('master') || prevContent.includes('best') || prevContent.includes('standout');
  const isPreviouslyNegative = prevContent.includes('hate') || prevContent.includes('overrate') || prevContent.includes('terrible') || prevContent.includes('weak') || prevContent.includes('flaw');

  const prevPolarity = isPreviouslyPositive ? 'positive' : isPreviouslyNegative ? 'negative' : null;

  if (prevPolarity && prevPolarity !== newPolarity) {
    return {
      allowed: false,
      reason: `Direct contradiction with stored opinion from ${new Date(recent.created_at).toLocaleDateString()}: "${recent.content}"`,
      rewrittenHint: `Changed my mind about ${subject}: previously thought "${recent.content}"`,
    };
  }

  return { allowed: true };
}
